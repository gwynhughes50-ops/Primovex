import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildIndex, describeIndex, indexProblem, parseConceptLine, parseDescriptionLine, parseLanguageLine, parseMemberLine } from "../src/modules/clinflow/snomedIndex.js";
import { createSearch, tokens } from "../src/modules/clinflow/snomedSearch.js";
import { choose, codesAfterReview, decide, optionsFor, reviewRows } from "../src/modules/clinflow/clinflowCodeReview.js";
import { buildDocmanPayload } from "../src/modules/clinflow/docmanPayload.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// a small release, in the shape of the real RF2 files
const FSN = "900000000000003001";
const SYN = "900000000000013009";
const PREF = "900000000000548007";
const ACC = "900000000000549004";
const concepts = [
  { id: "49436004", active: true }, { id: "195967001", active: true }, { id: "267036007", active: true }, { id: "134401001", active: true },
  { id: "60621009", active: true }, { id: "271649006", active: true }, { id: "80891009", active: true }, { id: "999000001", active: false }, { id: "60845006", active: true },
];
const d = (id, conceptId, typeId, term, active = true) => ({ id, active, conceptId, typeId, term });
const descriptions = [
  d("754371013", "49436004", FSN, "Atrial fibrillation (disorder)"), d("80004015", "49436004", SYN, "Atrial fibrillation"), d("80005016", "49436004", SYN, "AF - Atrial fibrillation"), d("80006017", "49436004", SYN, "Auricular fibrillation"),
  d("301000", "195967001", FSN, "Asthma (disorder)"), d("301001", "195967001", SYN, "Asthma"),
  d("302000", "267036007", FSN, "Dyspnea (finding)"), d("302001", "267036007", SYN, "Dyspnea"), d("302002", "267036007", SYN, "Dyspnoea"), d("302003", "267036007", SYN, "Breathlessness"), d("302004", "267036007", SYN, "Shortness of breath"),
  d("303000", "134401001", FSN, "Left ventricular systolic dysfunction (disorder)"), d("303001", "134401001", SYN, "Left ventricular systolic dysfunction"), d("303002", "134401001", SYN, "Left ventricular dysfunction"),
  d("304000", "60621009", FSN, "Body mass index (observable entity)"), d("304001", "60621009", SYN, "Body mass index"), d("304002", "60621009", SYN, "BMI - Body mass index"),
  d("305000", "271649006", FSN, "Systolic blood pressure (observable entity)"), d("305001", "271649006", SYN, "Systolic blood pressure"),
  d("306000", "80891009", FSN, "Heart structure (body structure)"), d("306001", "80891009", SYN, "Heart structure"),
  d("307000", "999000001", FSN, "Old thing (disorder)"), d("307001", "999000001", SYN, "Old thing"),
  d("308000", "60845006", FSN, "Dyspnea on exertion (finding)"), d("308001", "60845006", SYN, "Dyspnoea on exertion"), d("308002", "60845006", SYN, "Exertional dyspnoea"),
  d("309999", "195967001", SYN, "Retired asthma term", false),
];
const GB = "900000000000508004";
const language = [
  { refsetId: GB, active: true, descriptionId: "80004015", acceptabilityId: PREF }, { refsetId: GB, active: true, descriptionId: "80005016", acceptabilityId: ACC },
  { refsetId: GB, active: true, descriptionId: "301001", acceptabilityId: PREF },
  { refsetId: GB, active: true, descriptionId: "302002", acceptabilityId: PREF }, { refsetId: GB, active: true, descriptionId: "302001", acceptabilityId: ACC },
  { refsetId: GB, active: true, descriptionId: "303002", acceptabilityId: PREF },
  { refsetId: GB, active: true, descriptionId: "304001", acceptabilityId: PREF }, { refsetId: GB, active: true, descriptionId: "305001", acceptabilityId: PREF },
  { refsetId: GB, active: true, descriptionId: "308001", acceptabilityId: PREF },
];
const index = buildIndex({ concepts, descriptions, language, release: "20261014", now: new Date("2026-10-26T10:00:00Z") });
const find = createSearch(index);

t("the release's own files are read: concepts, descriptions and the language list, from tab-separated lines", () => {
  assert.deepEqual(parseConceptLine("49436004\t20020131\t1\t900000000000207008\t900000000000073002"), { id: "49436004", active: true });
  assert.deepEqual(parseConceptLine("999\t20020131\t0\t900000000000207008\t900000000000073002"), { id: "999", active: false });
  assert.equal(parseConceptLine("id\teffectiveTime\tactive\tmoduleId\tdefinitionStatusId"), null, "the header row is skipped");
  assert.deepEqual(parseDescriptionLine("80004015\t20020131\t1\t900000000000207008\t49436004\ten\t900000000000013009\tAtrial fibrillation\t900000000000020002"), { id: "80004015", active: true, conceptId: "49436004", typeId: SYN, term: "Atrial fibrillation" });
  assert.deepEqual(parseLanguageLine("0a1b2c3d-1111-2222-3333-444455556666\t20150401\t1\t999000011000000103\t900000000000508004\t80004015\t900000000000548007"), { refsetId: GB, active: true, descriptionId: "80004015", acceptabilityId: PREF });
  assert.equal(parseMemberLine("0a1b2c3d-1111-2222-3333-444455556666\t20150401\t1\t999000011000000103\t999000561000000100\t49436004"), "49436004");
  assert.equal(parseMemberLine("0a1b2c3d-1111-2222-3333-444455556666\t20150401\t0\t999000011000000103\t999000561000000100\t49436004"), null, "a retired member");
});

t("the list keeps what a letter's codes are made of, with the preferred term and its description ID, and leaves the rest out", () => {
  assert.equal(index.concepts.length, 7, "inactive and body-structure concepts are out");
  const af = index.concepts.find((c) => c[0] === "49436004");
  assert.deepEqual([af[1], af[2]], ["Atrial fibrillation", "80004015"], "the preferred synonym, with its own description ID");
  assert.deepEqual(af[4], [["AF - Atrial fibrillation", "80005016"], ["Auricular fibrillation", "80006017"]]);
  assert.equal(index.concepts.find((c) => c[0] === "267036007")[1], "Dyspnoea", "the British spelling is the preferred term in the language list");
  assert.ok(!index.concepts.some((c) => c[0] === "80891009"), "a body structure is not a code for a letter");
  assert.ok(!index.concepts.some((c) => c[0] === "999000001"), "a retired concept is not offered");
  assert.ok(!JSON.stringify(index).includes("Retired asthma term"), "nor a retired term");
  assert.deepEqual([...index.tags].sort(), ["disorder", "finding", "observable entity"]);
  assert.equal(describeIndex(index), "UK Clinical Edition 14 Oct 2026: 7 codes");
  assert.equal(indexProblem(index), "");
  assert.match(indexProblem({ format: 2 }), /not a ClinFlow SNOMED list/);
  assert.match(indexProblem({ format: 1, tags: [], concepts: [] }), /no codes/);
});

t("a reference set can limit the list to the codes a practice actually uses", () => {
  const small = buildIndex({ concepts, descriptions, language, only: new Set(["49436004", "195967001"]) });
  assert.deepEqual(small.concepts.map((c) => c[0]).sort(), ["195967001", "49436004"]);
});

t("the search finds a code from the words in a letter, by its name or a synonym", () => {
  assert.equal(find.size, 7);
  const af = find.search("atrial fibrillation");
  assert.equal(af[0].conceptId, "49436004");
  assert.equal(af[0].term, "Atrial fibrillation");
  assert.equal(af[0].descriptionId, "80004015");
  assert.equal(af[0].tag, "disorder");
  assert.equal(find.search("breathlessness")[0].conceptId, "267036007", "a synonym finds the code");
  assert.equal(find.search("breathlessness")[0].term, "Dyspnoea", "and shows the preferred term");
  assert.equal(find.search("AF")[0].conceptId, "49436004", "an abbreviation the release lists");
  assert.equal(find.search("fibrillation atrial")[0].conceptId, "49436004", "word order does not matter");
  assert.equal(find.search("fibrillating atrium")[0]?.conceptId ?? null, null, "a different word is not guessed at");
  assert.equal(find.search("Left ventricular dysfunction")[0].conceptId, "134401001");
  assert.equal(find.search("body mass index")[0].conceptId, "60621009");
  assert.equal(find.search("asthma")[0].conceptId, "195967001");
});

t("a closer match comes first, and a word with a different ending still finds the code", () => {
  const dys = find.search("dyspnoea");
  assert.equal(dys[0].conceptId, "267036007", "the exact term beats the longer one");
  assert.ok(dys.some((r) => r.conceptId === "60845006"), "the longer one is offered too");
  assert.equal(find.search("exertional dyspnoea")[0].conceptId, "60845006");
  assert.equal(find.search("fibrillation")[0].conceptId, "49436004");
  assert.equal(find.search("atrial fibrillate")[0].conceptId, "49436004", "a different ending finds it, because the word starts the same");
});

t("it never invents a code: nothing in the list means nothing offered", () => {
  assert.deepEqual(find.search("quantum flux"), []);
  assert.deepEqual(find.search(""), []);
  assert.deepEqual(find.search("the of and"), []);
  assert.deepEqual(find.search("heart structure"), [], "a body structure is not in the list");
  for (const r of [...find.search("dyspnoea"), ...find.search("fibrillation")]) assert.ok(index.concepts.some((c) => c[0] === r.conceptId), "every answer is a code in the list");
  assert.deepEqual(find.search("dyspnoea", { limit: 1 }).length, 1);
  assert.deepEqual(find.search("dyspnoea", { tags: ["disorder"] }), []);
  assert.deepEqual(tokens("The patient has Atrial Fibrillation."), ["patient", "atrial", "fibrillation"]);
});

t("one code can be looked up by its ID", () => {
  assert.deepEqual(find.byConcept("49436004"), { conceptId: "49436004", term: "Atrial fibrillation", descriptionId: "80004015", tag: "disorder" });
  assert.equal(find.byConcept("123"), null);
});

const finding = (value, extra = {}) => ({ sourceLabel: "Diagnosis", sourceValue: value, searchTerm: value, conceptId: null, preferredTerm: null, descriptionId: null, ...extra });

t("each finding in a letter gets the codes the list offers, and the first is what accepting will use", () => {
  const rows = reviewRows([finding("atrial fibrillation"), finding("left ventricular dysfunction"), finding("exertional dyspnoea"), finding("quantum flux")], "", null, find);
  assert.deepEqual(rows.map((r) => r.conceptId), ["49436004", "134401001", "60845006", ""]);
  assert.equal(rows[0].descriptionId, "80004015");
  assert.equal(rows[3].pick, null, "nothing in the list: nothing to accept");
  assert.ok(rows[2].options.length >= 1);
  const known = optionsFor(finding("heart rate", { conceptId: "60621009", preferredTerm: "Body mass index" }), find);
  assert.equal(known[0].conceptId, "60621009", "a code the reader already knew comes first, with its description ID");
  assert.equal(known[0].descriptionId, "304001");
  assert.deepEqual(optionsFor(finding("atrial fibrillation"), null), [], "no list loaded: nothing offered");
});

t("the coder can pick another match, and accepting keeps the code they chose with its description ID", () => {
  const c = finding("dyspnoea");
  const rows0 = reviewRows([c], "", null, find);
  assert.equal(rows0[0].conceptId, "267036007");
  const other = rows0[0].options.find((o) => o.conceptId === "60845006");
  let review = choose(null, c, other, { uid: "gp-1", name: "Dr Example", now: new Date("2026-10-26T10:00:00Z") });
  const rows1 = reviewRows([c], "", review, find);
  assert.equal(rows1[0].conceptId, "60845006", "the choice is used");
  review = decide(review, c, "accepted", { uid: "gp-1", name: "Dr Example", pick: rows1[0].pick });
  assert.equal(review.decisions[Object.keys(review.decisions)[0]].chosen.conceptId, "60845006");
  const codes = codesAfterReview([c], review);
  assert.equal(codes[0].conceptId, "60845006");
  assert.equal(codes[0].descriptionId, "308001");
  assert.equal(codes[0].acceptedByUid, "gp-1");
  assert.deepEqual(review.log.map((l) => l.action), ["chose a different code", "accepted"]);
  assert.throws(() => decide(null, c, "accepted", { pick: { conceptId: "60845007", term: "x", descriptionId: "1" } }), /check digit/, "a code with a wrong check digit is refused");
  assert.equal(choose(review, c, null).choices[Object.keys(review.decisions)[0]], undefined);
});

t("with the list loaded, an accepted code is complete enough for Docman: concept, description and description ID", () => {
  const c = finding("atrial fibrillation");
  const [row] = reviewRows([c], "", null, find);
  const review = decide(null, c, "accepted", { uid: "gp-1", name: "Dr Example", pick: row.pick });
  const result = buildDocmanPayload({
    captureSource: 2, sender: { odsCode: "W98001", organisation: "H", department: "D", person: "P" }, recipientOdsCode: "W91001",
    patient: { identifier: "9434765919", familyName: "S", givenNames: "J", gender: 10, birthDate: "1954-06-12" }, document: { description: "Letter", eventDate: "2026-05-14", fileExtension: "pdf" },
    clinicalCodes: codesAfterReview([c], review),
  }, { fileReady: true, now: new Date("2026-10-26T10:00:00Z") });
  assert.deepEqual(result.payload.ClinicalCodes, [{ Scheme: 2, Code: "49436004", Description: "Atrial fibrillation", DescriptionId: "80004015" }]);
  assert.equal(result.ready, true, JSON.stringify(result.blocking));
});

t("the builder and the loader exist and say what to do", () => {
  const script = read("scripts/build-snomed-index.mjs");
  assert.match(script, /npm run snomed:index/);
  assert.match(script, /Snapshot/i);
  assert.match(script, /gzipSync/);
  const pkg = JSON.parse(read("package.json"));
  assert.ok(pkg.scripts["snomed:index"] && pkg.scripts["test:snomed-list"]);
  const panel = read("src/modules/clinflow/CodeReview.jsx");
  for (const text of ["UK SNOMED list", "Choose the SNOMED list file", "Other matches", "Use this"]) assert.ok(panel.includes(text), text);
  assert.match(read("src/modules/clinflow/snomedListStore.js"), /indexedDB/);
});

console.log(`\n${n} passed`);
