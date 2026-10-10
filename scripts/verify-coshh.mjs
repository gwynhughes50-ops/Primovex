import assert from "node:assert/strict";
import {
  addMonths, daysUntilReview, emptySubstance, firstAidLabel, hazardLabel, isHazardous, locationKey, normaliseSubstance, nextReviewFrom,
  parseLocationKey, reviewStatus, reviewSummary, reviewText, searchSubstances, shortLabel, sortSubstances, storagePlaces, substancesAt,
  toRecord, validateSubstance,
} from "../src/modules/coshh/coshh.js";
import { coshhLabelsHtml, coshhRegisterHtml } from "../src/modules/coshh/coshhLabels.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const NOW = new Date(2026, 9, 10); // 10 Oct 2026

const good = {
  id: "s1", name: "Domestos", supplier: "Bunzl", hazards: ["corrosive", "environmental"], ppe: ["gloves", "eye-protection"],
  firstAid: ["skin", "eyes"], site: "Main Surgery", location: "Cleaners cupboard", reviewDate: "2027-01-15",
  sdsUrl: "https://example/sds.pdf", sdsPath: "coshh_sds/s1/a.pdf", sdsFileName: "domestos.pdf", active: true,
};

t("a complete entry has nothing to fix, and each gap is named in plain words", () => {
  assert.deepEqual(validateSubstance(good), []);
  assert.match(validateSubstance({ ...good, name: " " })[0], /product name/);
  assert.match(validateSubstance({ ...good, supplier: "" })[0], /supplier/);
  assert.match(validateSubstance({ ...good, hazards: [] })[0], /hazard/);
  assert.match(validateSubstance({ ...good, ppe: [] })[0], /protective equipment/);
  assert.match(validateSubstance({ ...good, firstAid: [] })[0], /first-aid/);
  assert.match(validateSubstance({ ...good, location: "" })[0], /stored/);
  assert.match(validateSubstance({ ...good, reviewDate: "" })[0], /review date/);
  assert.match(validateSubstance({ ...good, sdsUrl: "" })[0], /safety data sheet/);
  assert.equal(validateSubstance({ ...good, hazards: ["none"], ppe: ["none"], firstAid: [] }).length, 0, "a non-hazardous product doesn't need first aid steps");
});

t("only the known options are kept and 'none' never sits next to a real choice", () => {
  const clean = normaliseSubstance("x", { ...good, hazards: ["corrosive", "made-up", "none"], ppe: ["none", "gloves", "gloves"], firstAid: ["bogus", "skin"], reviewDate: "not a date" });
  assert.deepEqual(clean.hazards, ["corrosive"]);
  assert.deepEqual(clean.ppe, ["gloves"]);
  assert.deepEqual(clean.firstAid, ["skin"]);
  assert.equal(clean.reviewDate, "");
  assert.equal(normaliseSubstance("x", {}).active, true);
  assert.equal(normaliseSubstance("x", { active: false }).active, false);
  assert.deepEqual(emptySubstance().hazards, []);
});

t("the saved document holds only the known fields", () => {
  const record = toRecord({ ...good, evil: "x", id: "ignored" });
  assert.equal("evil" in record, false);
  assert.equal("id" in record, false);
  assert.equal(record.name, "Domestos");
  assert.equal(record.sdsPath, "coshh_sds/s1/a.pdf");
});

t("labels read well, and a short label is just the first part", () => {
  assert.equal(hazardLabel("corrosive"), "Corrosive (burns skin, damages eyes)");
  assert.equal(shortLabel(hazardLabel("corrosive")), "Corrosive");
  assert.equal(shortLabel(firstAidLabel("skin")), "Skin contact");
  assert.equal(hazardLabel("unknown"), "unknown");
  assert.equal(isHazardous(good), true);
  assert.equal(isHazardous({ hazards: ["none"] }), false);
});

t("a review is a year from the last, clamped for short months", () => {
  assert.equal(nextReviewFrom("2026-10-10"), "2027-10-10");
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2024-01-31", 1), "2024-02-29");
  assert.equal(addMonths("2026-12-15", 1), "2027-01-15");
  assert.equal(addMonths("garbage", 1), "");
});

t("review status: overdue, due in the next 30 days, in date, or never set", () => {
  assert.equal(reviewStatus({ reviewDate: "2026-10-09" }, NOW), "overdue");
  assert.equal(reviewStatus({ reviewDate: "2026-10-10" }, NOW), "due-soon");
  assert.equal(reviewStatus({ reviewDate: "2026-11-09" }, NOW), "due-soon");
  assert.equal(reviewStatus({ reviewDate: "2026-11-10" }, NOW), "ok");
  assert.equal(reviewStatus({ reviewDate: "" }, NOW), "missing");
  assert.equal(daysUntilReview("2026-10-13", NOW), 3);
  assert.equal(reviewText({ reviewDate: "2026-10-07" }, NOW), "Review was due 3 days ago");
  assert.equal(reviewText({ reviewDate: "2026-10-09" }, NOW), "Review was due 1 day ago");
  assert.equal(reviewText({ reviewDate: "2026-10-10" }, NOW), "Review due today");
  assert.equal(reviewText({ reviewDate: "2026-10-20" }, NOW), "Review due in 10 days");
  assert.equal(reviewText({}, NOW), "No review date set");
});

const list = [
  { ...good, id: "a", name: "Zoflora", reviewDate: "2027-06-01" },
  { ...good, id: "b", name: "Bleach", reviewDate: "2026-09-01" },
  { ...good, id: "c", name: "Descaler", reviewDate: "2026-10-20" },
  { ...good, id: "d", name: "Gel", reviewDate: "" },
  { ...good, id: "e", name: "Old stuff", reviewDate: "2026-01-01", active: false },
];

t("lists put the most urgent review first, and archived products don't count", () => {
  assert.deepEqual(sortSubstances(list, NOW).map((s) => s.id), ["e", "b", "d", "c", "a"]);
  assert.deepEqual(reviewSummary(list, NOW), { total: 4, overdue: 2, dueSoon: 1, needsAttention: 3 });
});

t("search finds by name, supplier or place", () => {
  assert.deepEqual(searchSubstances(list, "bleach").map((s) => s.id), ["b"]);
  assert.equal(searchSubstances(list, "cleaners bunzl").length, 5);
  assert.equal(searchSubstances(list, "").length, 5);
  assert.equal(searchSubstances(list, "nothing like it").length, 0);
});

t("a cupboard's code lists what is stored there", () => {
  const key = locationKey("Main Surgery", "Cleaners cupboard");
  assert.equal(key, "Main Surgery|Cleaners cupboard");
  assert.deepEqual(parseLocationKey(key), { site: "Main Surgery", location: "Cleaners cupboard" });
  assert.deepEqual(parseLocationKey("Just a room"), { site: "", location: "Just a room" });
  const stock = [
    { ...good, id: "1" },
    { ...good, id: "2", location: "Store room" },
    { ...good, id: "3", site: "Branch Surgery" },
    { ...good, id: "4", active: false },
    { ...good, id: "5", location: "cleaners cupboard " },
  ];
  assert.deepEqual(substancesAt(stock, key).map((s) => s.id), ["1", "5"]);
  assert.deepEqual(substancesAt(stock, "Cleaners cupboard").map((s) => s.id), ["1", "3", "5"], "a code with no site matches the room name anywhere");
  assert.deepEqual(storagePlaces(stock).map((p) => [p.key, p.count]), [["Branch Surgery|Cleaners cupboard", 1], ["Main Surgery|Cleaners cupboard", 2], ["Main Surgery|Store room", 1]]);
});

t("a cupboard label carries its link, and nothing typed can break the page", () => {
  const html = coshhLabelsHtml([{ key: "Main Surgery|Cleaners <b>cupboard", site: "Main", location: "Cleaners <b>cupboard", count: 1 }], { urlFor: (p) => "https://x/sense/open/coshh/" + encodeURIComponent(p.key), qrFor: (l) => "qr:" + l });
  assert.match(html, /sense\/open\/coshh\/Main%20Surgery%7CCleaners/);
  assert.ok(!html.includes("<b>cupboard"), "the name is escaped");
  assert.match(html, /1 product listed/);
  assert.match(coshhLabelsHtml([{ key: "k", site: "", location: "A", count: 3 }], { urlFor: () => "u", qrFor: () => "q" }), /3 products listed/);
  const reg = coshhRegisterHtml([{ name: "Bleach <x>", supplier: "S", hazards: "Corrosive", ppe: "Gloves", firstAid: "Rinse", place: "Cupboard", review: "01/01/2027" }], { generatedOn: "10 Oct 2026" });
  assert.ok(reg.includes("Bleach &lt;x&gt;") && reg.includes("10 Oct 2026"));
});

console.log(`\n${n} passed`);
