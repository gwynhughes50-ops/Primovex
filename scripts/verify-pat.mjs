import assert from "node:assert/strict";
import {
  PAT_CATEGORIES, addMonthsKey, assetPatchAfterTest, buildPatTest, byRoom, categoryOf, daysUntil, dueSummary, evaluateTest, findAppliance, intervalFor, patStatus, roundSummary, searchAppliances, ukDate,
} from "../src/modules/pat/pat.js";
import { TEMPLATE_TEXT as PAT_TEMPLATE, buildPatImportPlan, matchCategory } from "../src/modules/pat/patImport.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const NOW = new Date(2026, 9, 20, 10, 0); // Tuesday 20 October 2026
const actor = { uid: "u1", displayName: "Colin" };
const kettle = { id: "a1", tag: "R-12", name: "Kettle", location: "Staff kitchen", category: "handheld", siteId: "main_branch" };
const good = { visualOk: true, earth: "pass", insulation: "pass" };

t("every kind of appliance has a name and a sensible starting interval; the practice's own setting wins", () => {
  assert.ok(PAT_CATEGORIES.length >= 5);
  assert.ok(PAT_CATEGORIES.every((c) => c.key && c.label && c.months >= 1));
  assert.equal(intervalFor("it"), 24);
  assert.equal(intervalFor("handheld"), 12);
  assert.equal(intervalFor("handheld", { intervals: { handheld: 6 } }), 6, "the practice's own interval");
  assert.equal(intervalFor("it", { intervals: { it: "nonsense" } }), 24, "a bad setting is ignored");
  assert.equal(intervalFor("it", { intervals: { it: 0 } }), 24);
  assert.equal(intervalFor("nothing"), 12, "an unknown kind reads as Other");
  assert.equal(categoryOf("nothing").key, "other");
});

t("dates add whole months, cutting back to the end of a short month", () => {
  assert.equal(addMonthsKey("2026-10-20", 12), "2027-10-20");
  assert.equal(addMonthsKey("2026-10-20", 24), "2028-10-20");
  assert.equal(addMonthsKey("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonthsKey("2024-01-31", 1), "2024-02-29", "a leap year");
  assert.equal(addMonthsKey("2026-12-15", 3), "2027-03-15", "across the year end");
  assert.equal(addMonthsKey("nonsense", 12), "");
  assert.equal(daysUntil("2026-10-25", NOW), 5);
  assert.equal(daysUntil("2026-10-19", NOW), -1);
  assert.equal(daysUntil("", NOW), null);
  assert.equal(ukDate("2026-10-20"), "20/10/2026");
  assert.equal(ukDate("x"), "");
});

t("an appliance is out of use, never tested, overdue, due soon or fine", () => {
  assert.equal(patStatus({ outOfUse: true, nextDueOn: "2030-01-01" }, NOW).state, "out-of-use");
  assert.equal(patStatus({}, NOW).state, "never");
  assert.equal(patStatus({ nextDueOn: "" }, NOW).state, "never");
  assert.deepEqual(patStatus({ nextDueOn: "2026-10-19" }, NOW), { state: "overdue", days: -1 });
  assert.deepEqual(patStatus({ nextDueOn: "2026-10-20" }, NOW), { state: "due-soon", days: 0 }, "due today is not overdue yet");
  assert.equal(patStatus({ nextDueOn: "2026-11-19" }, NOW).state, "due-soon", "30 days away");
  assert.equal(patStatus({ nextDueOn: "2026-11-20" }, NOW).state, "ok", "31 days away");
});

t("the summary puts the most urgent first, leaves out retired items, and counts each state", () => {
  const assets = [
    { id: "1", tag: "R-1", nextDueOn: "2027-06-01" },
    { id: "2", tag: "R-2", nextDueOn: "2026-09-01" },
    { id: "3", tag: "R-3" },
    { id: "4", tag: "R-4", nextDueOn: "2026-11-01" },
    { id: "5", tag: "R-5", outOfUse: true },
    { id: "6", tag: "R-6", active: false, nextDueOn: "2020-01-01" },
    { id: "7", tag: "R-10", nextDueOn: "2026-08-01" },
  ];
  const s = dueSummary(assets, NOW);
  assert.deepEqual(s.rows.map((r) => `${r.asset.tag}:${r.state}`), ["R-5:out-of-use", "R-10:overdue", "R-2:overdue", "R-3:never", "R-4:due-soon", "R-1:ok"]);
  assert.deepEqual(s.counts, { total: 6, overdue: 2, never: 1, dueSoon: 1, outOfUse: 1, ok: 1 });
  assert.equal(s.needsAttention, 5);
});

t("a test passes only when the visual check is good and the earth and insulation tests pass", () => {
  assert.deepEqual(evaluateTest(good), { result: "pass", reasons: [], missing: [] });
  assert.equal(evaluateTest({ ...good, visualOk: false }).result, "fail");
  assert.deepEqual(evaluateTest({ ...good, visualOk: false }).reasons, ["visual"]);
  assert.deepEqual(evaluateTest({ ...good, earth: "fail", insulation: "fail" }).reasons, ["earth", "insulation"]);
  assert.deepEqual(evaluateTest({ visualOk: true, insulation: "pass" }).missing, ["the earth continuity result"], "something not answered is not a pass");
  assert.deepEqual(evaluateTest({}).missing, ["the visual inspection", "the earth continuity result", "the insulation result"]);
  assert.equal(evaluateTest({ ...good, earth: "na" }).result, "", "a Class I item has to be earth tested");
  // Class II items are not earth tested
  assert.equal(evaluateTest({ cls: "II", visualOk: true, insulation: "pass" }).result, "pass");
  assert.equal(evaluateTest({ cls: "II", visualOk: true, earth: "fail", insulation: "pass" }).result, "pass", "an earth result is ignored for Class II");
  assert.equal(evaluateTest({ ...good, insulation: "na" }).result, "");
});

t("a passed test records who, when, the readings and the date it is next due from the kind of appliance", () => {
  const test = buildPatTest({ asset: kettle, answers: { ...good, earthOhms: "0,12", insulationMohms: "> 20", fuseRating: "13A" }, final: "pass", actor, now: NOW });
  assert.equal(test.result, "pass");
  assert.equal(test.testedOn, "2026-10-20");
  assert.equal(test.nextDueOn, "2027-10-20", "hand-held: 12 months");
  assert.equal(test.intervalMonths, 12);
  assert.equal(test.earthOhms, 0.12, "a comma decimal reads as a number");
  assert.equal(test.insulationMohms, null, "a reading that is not a number is not kept as one");
  assert.deepEqual([test.tag, test.name, test.location, test.testerName, test.testerUid], ["R-12", "Kettle", "Staff kitchen", "Colin", "u1"]);
  assert.deepEqual(test.failReasons, []);
  const it = buildPatTest({ asset: { ...kettle, category: "it" }, answers: good, final: "pass", actor, now: NOW });
  assert.equal(it.nextDueOn, "2028-10-20", "IT equipment: 24 months");
  const own = buildPatTest({ asset: kettle, answers: good, final: "pass", actor, now: NOW, settings: { intervals: { handheld: 6 } } });
  assert.equal(own.nextDueOn, "2027-04-20", "the practice's own interval");
});

t("a test cannot be passed when it failed or something is missing, and a fail has to say why", () => {
  assert.throws(() => buildPatTest({ asset: kettle, answers: { ...good, earth: "fail" }, final: "pass", actor, now: NOW }), /cannot pass/);
  assert.throws(() => buildPatTest({ asset: kettle, answers: { visualOk: true, insulation: "pass" }, final: "pass", actor, now: NOW }), /earth continuity result first/);
  assert.throws(() => buildPatTest({ asset: kettle, answers: good, final: "maybe", actor, now: NOW }), /pass or fail/);
  assert.throws(() => buildPatTest({ answers: good, final: "pass", actor, now: NOW }), /Choose the appliance/);
  assert.throws(() => buildPatTest({ asset: kettle, answers: good, final: "fail", actor, now: NOW }), /why it failed/, "failing by choice needs a reason");
  assert.throws(() => buildPatTest({ asset: kettle, answers: { ...good, failReasons: ["other"] }, final: "fail", actor, now: NOW }), /Add a note/);
  const failed = buildPatTest({ asset: kettle, answers: { ...good, visualOk: false, notes: "  Flex frayed   at the plug " }, final: "fail", actor, now: NOW });
  assert.equal(failed.result, "fail");
  assert.deepEqual(failed.failReasons, ["visual"]);
  assert.equal(failed.nextDueOn, "", "a failed item has no next date");
  assert.equal(failed.notes, "Flex frayed at the plug");
  const chosen = buildPatTest({ asset: kettle, answers: { ...good, failReasons: ["fuse", "bogus"], notes: "" }, final: "fail", actor, now: NOW });
  assert.deepEqual(chosen.failReasons, ["fuse"], "only known reasons are kept");
});

t("a Class II item records no earth test", () => {
  const test = buildPatTest({ asset: kettle, answers: { cls: "II", visualOk: true, insulation: "pass", earth: "fail", earthOhms: "5" }, final: "pass", actor, now: NOW });
  assert.deepEqual([test.cls, test.earth, test.earthOhms], ["II", "na", null]);
});

t("a pass puts the item back in date; a fail takes it out of use", () => {
  const pass = buildPatTest({ asset: kettle, answers: { ...good, fuseRating: "3A" }, final: "pass", actor, now: NOW });
  assert.deepEqual(assetPatchAfterTest(pass), { lastTestedOn: "2026-10-20", lastResult: "pass", lastTestedByName: "Colin", nextDueOn: "2027-10-20", outOfUse: false, cls: "I", fuseRating: "3A" });
  const fail = buildPatTest({ asset: kettle, answers: { ...good, insulation: "fail" }, final: "fail", actor, now: NOW });
  const patch = assetPatchAfterTest(fail);
  assert.deepEqual([patch.outOfUse, patch.lastResult, patch.nextDueOn], [true, "fail", ""]);
  assert.equal(patStatus({ ...kettle, ...patch }, NOW).state, "out-of-use");
  assert.equal(patStatus({ ...kettle, ...assetPatchAfterTest(pass) }, NOW).state, "ok");
});

t("an appliance is found by its tag however it is typed, its id, or a link; retired ones are not", () => {
  const list = [{ id: "a1", tag: "R-12", name: "Kettle" }, { id: "a2", tag: "IT 7", name: "Monitor" }, { id: "a3", tag: "R-99", name: "Old", active: false }];
  assert.equal(findAppliance(list, "R-12").id, "a1");
  assert.equal(findAppliance(list, " r12 ").id, "a1");
  assert.equal(findAppliance(list, "it-7").id, "a2");
  assert.equal(findAppliance(list, "a2").id, "a2");
  assert.equal(findAppliance(list, "https://app.primovex.co.uk/sense/open/pat/a1?m=qr").id, "a1");
  assert.equal(findAppliance(list, "R-99"), null);
  assert.equal(findAppliance(list, ""), null);
  assert.deepEqual(searchAppliances(list, "kett").map((a) => a.id), ["a1"], "by name");
  assert.deepEqual(searchAppliances(list, "r9").map((a) => a.id), [], "retired items are not offered");
  assert.deepEqual(searchAppliances(list, "r1").map((a) => a.id), ["a1"], "by tag, however it is typed");
  assert.deepEqual(searchAppliances(list, ""), []);
});

t("appliances are grouped by room with the rooms that need attention first", () => {
  const assets = [
    { id: "1", tag: "A", location: "Reception", nextDueOn: "2027-09-01" },
    { id: "2", tag: "B", location: "Staff kitchen", nextDueOn: "2026-09-01" },
    { id: "3", tag: "C", location: "Staff kitchen", nextDueOn: "2027-09-01" },
    { id: "4", tag: "D" },
  ];
  const rooms = byRoom(assets, NOW);
  assert.deepEqual(rooms.map((r) => [r.room, r.attention]), [["Staff kitchen", 1], ["No room given", 1], ["Reception", 0]]);
  assert.deepEqual(rooms[0].rows.map((r) => r.asset.tag), ["B", "C"], "the overdue one first");
});

t("a round is summed up", () => {
  assert.deepEqual(roundSummary([{ result: "pass" }, { result: "pass" }, { result: "fail" }]), { tested: 3, passed: 2, failed: 1 });
  assert.deepEqual(roundSummary([]), { tested: 0, passed: 0, failed: 0 });
});

const ROOMS = ["Staff kitchen", "Reception", "Plant room"];
const HEAD = "Tag\tName\tLocation\tCategory\tClass\tMake/model\tSerial";

t("a kind of appliance is found from what is written, or from its name when the column is blank", () => {
  for (const [written, key] of [["Hand-held and portable", "handheld"], ["it", "it"], ["IT equipment", "it"], ["Extension lead", "extension"], ["fridge", "fixed"], ["clinical", "clinical"], ["Kettle", "handheld"], ["Four-way extension lead", "extension"], ["Desktop PC and lead", "it"]]) assert.equal(matchCategory(written), key, written);
  assert.equal(matchCategory(""), "");
  assert.equal(matchCategory("spaceship"), null);
});

t("the example list makes a good plan, and the headings are found in any order", () => {
  const plan = buildPatImportPlan({ text: PAT_TEMPLATE, rooms: ROOMS });
  assert.deepEqual(plan.counts, { ok: 3, exists: 0, problem: 0 });
  assert.deepEqual(plan.rows.map((r) => [r.tag, r.category, r.cls, r.location]), [["R-1", "handheld", "I", "Staff kitchen"], ["R-2", "it", "I", "Reception"], ["R-3", "extension", "I", "Reception"]]);
  const swapped = buildPatImportPlan({ text: "Name,Tag,Room\nKettle,R-9,Reception", rooms: ROOMS });
  assert.deepEqual([swapped.rows[0].tag, swapped.rows[0].name, swapped.rows[0].location, swapped.rows[0].category], ["R-9", "Kettle", "Reception", "handheld"]);
});

t("a tag already on the register, or repeated in the list, is not added twice", () => {
  const existing = [{ tag: "R-1", active: true }, { tag: "R-7", active: false }];
  const text = [HEAD, "r1\tKettle\tReception\t\t\t\t", "R-2\tFan\tReception\t\t\t\t", "R 2\tFan again\tReception\t\t\t\t", "R-7\tOld item\tReception\t\t\t\t"].join("\n");
  const plan = buildPatImportPlan({ text, existing, rooms: ROOMS });
  assert.deepEqual(plan.rows.map((r) => r.status), ["exists", "ok", "exists", "ok"], "a retired tag can be used again");
});

t("a room that is not in the site's list is chosen from it; a bad class or kind says why", () => {
  const text = [HEAD, "R-1\tKettle\tGround floor kitchen\t\t\t\t", "R-2\tFan\tReception\tSpaceship\t\t\t", "R-3\tLamp\tReception\t\tIII\t\t", "R-4\tHeater\tReception\t\tII\t\t", "\tNo tag\tReception\t\t\t\t"].join("\n");
  let plan = buildPatImportPlan({ text, rooms: ROOMS });
  assert.deepEqual(plan.rows.map((r) => r.status), ["problem", "problem", "problem", "ok", "problem"]);
  assert.match(plan.rows[0].problems[0], /not one of the site's rooms/);
  assert.match(plan.rows[1].problems[0], /not a kind Primovex knows/);
  assert.match(plan.rows[2].problems[0], /not a class/);
  assert.equal(plan.rows[3].cls, "II");
  assert.match(plan.rows[4].problems[0], /tag number/);
  plan = buildPatImportPlan({ text, rooms: ROOMS, overrides: { 2: "Staff kitchen" } });
  assert.deepEqual([plan.rows[0].status, plan.rows[0].location], ["ok", "Staff kitchen"]);
  assert.match(buildPatImportPlan({ text: "Name\nKettle" }).problems[0], /Tag column and a Name column/);
  assert.match(buildPatImportPlan({ text: "" }).problems[0], /Paste the list/);
});

console.log(`\n${n} passed`);
