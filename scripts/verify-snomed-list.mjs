import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { REPLACE_AFTER_DAYS, SNOMED_NOTICE, buildIndex, describeIndex, indexAgeDays, indexIsOld, indexProblem, parseConceptLine, parseDescriptionLine, parseLanguageLine, parseMemberLine } from "../src/modules/clinflow/snomedIndex.js";
import { createSearch, tokens } from "../src/modules/clinflow/snomedSearch.js";
import { preferredFor } from "../src/modules/clinflow/preferredCodes.js";
import { choose, codesAfterReview, decide, diagnosticText, isMedicine, lookupText, matchQuality, matchSummary, optionsFor, reviewRows, shownAs, subjectOf, unmatchedText, withoutQualifiers } from "../src/modules/clinflow/clinflowCodeReview.js";
import { BUILT_IN_ABBREVIATIONS, abbreviationInfo, expandAbbreviations, parseAbbreviationCsv, setAbbreviationList, withMeaning } from "../src/modules/clinflow/clinicalAbbreviations.js";
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
  { id: "472775000", active: true }, { id: "252167001", active: true },
  { id: "431314004", active: true }, { id: "364075005", active: true }, { id: "386725007", active: true },
  { id: "55235003", active: true }, { id: "999651000000107", active: true },
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
  d("501000", "472775000", FSN, "Fetal left ventricular dysfunction (disorder)"), d("501001", "472775000", SYN, "Fetal left ventricular dysfunction"),
  d("502000", "252167001", FSN, "Urea and electrolytes (procedure)"), d("502001", "252167001", SYN, "Urea and electrolytes"),
  d("503000", "431314004", FSN, "Peripheral oxygen saturation (observable entity)"), d("503001", "431314004", SYN, "Peripheral oxygen saturation"),
  d("504000", "364075005", FSN, "Heart rate (observable entity)"), d("504001", "364075005", SYN, "Heart rate"),
  d("505000", "386725007", FSN, "Body temperature (observable entity)"), d("505001", "386725007", SYN, "Body temperature"),
  d("506000", "55235003", FSN, "C-reactive protein measurement (procedure)"), d("506001", "55235003", SYN, "C-reactive protein measurement"),
  d("507000", "999651000000107", FSN, "Plasma C reactive protein (observable entity)"), d("507001", "999651000000107", SYN, "Plasma C reactive protein"),
];
const GB = "900000000000508004";
const language = [
  { refsetId: GB, active: true, descriptionId: "80004015", acceptabilityId: PREF }, { refsetId: GB, active: true, descriptionId: "80005016", acceptabilityId: ACC },
  { refsetId: GB, active: true, descriptionId: "301001", acceptabilityId: PREF },
  { refsetId: GB, active: true, descriptionId: "302002", acceptabilityId: PREF }, { refsetId: GB, active: true, descriptionId: "302001", acceptabilityId: ACC },
  { refsetId: GB, active: true, descriptionId: "303002", acceptabilityId: PREF },
  { refsetId: GB, active: true, descriptionId: "304001", acceptabilityId: PREF }, { refsetId: GB, active: true, descriptionId: "305001", acceptabilityId: PREF },
  { refsetId: GB, active: true, descriptionId: "308001", acceptabilityId: PREF },
  { refsetId: GB, active: true, descriptionId: "501001", acceptabilityId: PREF }, { refsetId: GB, active: true, descriptionId: "502001", acceptabilityId: PREF },
  { refsetId: GB, active: true, descriptionId: "503001", acceptabilityId: PREF }, { refsetId: GB, active: true, descriptionId: "504001", acceptabilityId: PREF }, { refsetId: GB, active: true, descriptionId: "505001", acceptabilityId: PREF },
  { refsetId: GB, active: true, descriptionId: "506001", acceptabilityId: PREF }, { refsetId: GB, active: true, descriptionId: "507001", acceptabilityId: PREF },
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
  assert.equal(index.concepts.length, 14, "inactive and body-structure concepts are out");
  const af = index.concepts.find((c) => c[0] === "49436004");
  assert.deepEqual([af[1], af[2]], ["Atrial fibrillation", "80004015"], "the preferred synonym, with its own description ID");
  assert.deepEqual(af[4], [["AF - Atrial fibrillation", "80005016"], ["Auricular fibrillation", "80006017"]]);
  assert.equal(index.concepts.find((c) => c[0] === "267036007")[1], "Dyspnoea", "the British spelling is the preferred term in the language list");
  assert.ok(!index.concepts.some((c) => c[0] === "80891009"), "a body structure is not a code for a letter");
  assert.ok(!index.concepts.some((c) => c[0] === "999000001"), "a retired concept is not offered");
  assert.ok(!JSON.stringify(index).includes("Retired asthma term"), "nor a retired term");
  assert.deepEqual([...index.tags].sort(), ["disorder", "finding", "observable entity", "procedure"]);
  assert.equal(describeIndex(index), "UK Clinical Edition 14 Oct 2026: 14 codes");
  assert.equal(indexProblem(index), "");
  assert.match(indexProblem({ format: 2 }), /not a ClinFlow SNOMED list/);
  assert.match(indexProblem({ format: 1, tags: [], concepts: [] }), /no codes/);
});

t("a reference set can limit the list to the codes a practice actually uses", () => {
  const small = buildIndex({ concepts, descriptions, language, only: new Set(["49436004", "195967001"]) });
  assert.deepEqual(small.concepts.map((c) => c[0]).sort(), ["195967001", "49436004"]);
});

t("the search finds a code from the words in a letter, by its name or a synonym", () => {
  assert.equal(find.size, 14);
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
  const known = optionsFor(finding("quantum flux", { conceptId: "60621009", preferredTerm: "Body mass index" }), find);
  assert.equal(known[0].conceptId, "60621009", "a code the reader already knew, and that is in the list, is kept, with its description ID");
  assert.equal(known[0].descriptionId, "304001");
  const better = optionsFor(finding("heart rate", { conceptId: "60621009", preferredTerm: "Body mass index" }), find).map((o) => o.conceptId);
  assert.equal(better[0], "364075005", "when the search finds a better one it comes first");
  assert.ok(better.includes("60621009"), "and the reader's own is still offered");
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

t("what a letter says around a finding is taken off before it is looked up: doses, numbers, timings, abbreviations", () => {
  assert.equal(lookupText("Bisoprolol 5 mg once daily"), "Bisoprolol");
  assert.equal(lookupText("Apixaban 5 mg twice daily"), "Apixaban");
  assert.equal(lookupText("Blood pressure 132/84 mmHg"), "Blood pressure");
  assert.equal(lookupText("Repeat U&Es in 2 weeks"), "urea and electrolytes");
  assert.equal(lookupText("SOB on exertion"), "shortness of breath on exertion");
  assert.equal(lookupText("known CKD, T2DM"), "known chronic kidney disease type 2 diabetes mellitus");
  assert.equal(lookupText("Type 2 diabetes mellitus"), "Type 2 diabetes mellitus", "a number that is part of a name stays");
  assert.equal(lookupText("CKD stage 3"), "chronic kidney disease stage 3", "a stage stays");
  assert.equal(lookupText("oxygen saturation 97%"), "peripheral oxygen saturation", "pulse oximetry is what a letter means");
  assert.equal(withoutQualifiers("mild left ventricular dysfunction"), "left ventricular dysfunction");
  assert.equal(withoutQualifiers("suspected atrial fibrillation"), "atrial fibrillation");
  assert.equal(withoutQualifiers("persistent atrial fibrillation"), "persistent atrial fibrillation", "a word that is part of a name stays");
});

t("a finding with doses or severity words still finds its code, and the qualifier-free search is only used when the first finds nothing close", () => {
  const top = (value) => optionsFor({ sourceValue: value }, find).map((o) => o.conceptId);
  assert.equal(top("mild left ventricular dysfunction")[0], "134401001", "'mild' is not in the code's name, so it is left off");
  assert.equal(top("Repeat U&Es in 2 weeks")[0], "252167001");
  assert.ok(!top("Blood pressure 132/84 mmHg").includes("75367002"), "blood pressure itself is not in this small list: it is not invented");
  assert.equal(top("quantum flux 5 mg twice daily").length, 0, "nothing matches: nothing offered");
  assert.equal(top("atrial fibrillation")[0], "49436004");
  assert.equal(top("AF")[0], "49436004", "an abbreviation in a letter");
  assert.equal(top("exertional dyspnoea")[0], "60845006");
});

t("a measurement whose name is in its label, with only the number as its value, is looked up by the label", () => {
  const m = (label, value) => ({ sourceLabel: label, sourceValue: value, searchTerm: value, conceptId: null, preferredTerm: null, descriptionId: null });
  assert.equal(subjectOf(m("Oxygen saturation", "97%")), "Oxygen saturation");
  assert.equal(subjectOf(m("Heart rate", "96")), "Heart rate");
  assert.equal(subjectOf(m("Temperature", "36.8")), "Temperature");
  assert.equal(subjectOf(m("CRP", "4 mg/L")), "CRP");
  assert.equal(subjectOf(m("Observation", "CRP 4 mg/L")), "CRP 4 mg/L", "a value with a name in it is used as it is");
  assert.equal(subjectOf(m("Diagnosis", "atrial fibrillation")), "atrial fibrillation");
  assert.equal(subjectOf({ sourceLabel: "Systolic blood pressure", sourceValue: "132 mmHg", component: "systolic", preferredTerm: "Systolic blood pressure" }), "Systolic blood pressure");
  assert.equal(shownAs(m("Oxygen saturation", "97%")), "Oxygen saturation 97%", "and it is shown with both, not as '97%' alone");
  assert.equal(shownAs(m("Diagnosis", "atrial fibrillation")), "atrial fibrillation");
  const top = (label, value) => optionsFor(m(label, value), find).map((o) => o.conceptId)[0];
  assert.equal(top("Oxygen saturation", "97%"), "431314004", "oxygen saturation by pulse oximeter: the peripheral one");
  assert.equal(top("Heart rate", "96"), "364075005");
  assert.equal(top("Temperature", "36.8"), "386725007", "temperature means body temperature");
  assert.equal(top("Observation", "sats 94% on room air"), "431314004");
  assert.equal(top("Observation", "SpO2 97%"), "431314004");
  assert.equal(lookupText("CRP 4 mg/L"), "c-reactive protein", "a unit like mg/L goes whole, not just its first letters");
  assert.equal(lookupText("eGFR 45 mmol/L"), "estimated glomerular filtration rate", "mmol/L too, and eGFR is written out");
  assert.equal(lookupText("MI"), "MI", "an abbreviation with more than one meaning is left alone");
});

t("every row can show how it was looked up, and all of it can be copied to send when something is not found", () => {
  const rows = reviewRows([{ sourceLabel: "Oxygen saturation", sourceValue: "97%", searchTerm: "97%" }, { sourceLabel: "Diagnosis", sourceValue: "quantum flux", searchTerm: "quantum flux" }, { sourceLabel: "Medication", sourceValue: "Bisoprolol 5 mg", codeSystem: "dm+d" }], "", null, find, null);
  assert.equal(rows[0].lookedUp, "peripheral oxygen saturation", "what was searched for, after the label is used and abbreviations are written out");
  assert.equal(rows[2].lookedUp, "bisoprolol 5mg");
  const text = diagnosticText(rows, { version: "0.15.77", snomedInfo: describeIndex(index), medicinesInfo: "" });
  assert.match(text, /ClinFlow code lookup details \(app 0\.15\.77\)/);
  assert.match(text, /SNOMED list: UK Clinical Edition 14 Oct 2026: 14 codes/);
  assert.match(text, /Medicines list: not loaded/);
  assert.match(text, /1\. label="Oxygen saturation" value="97%"\n   looked up as: "peripheral oxygen saturation"\n   used: Peripheral oxygen saturation \(431314004\) - The practice's preferred code for this/);
  assert.match(text, /2\. label="Diagnosis" value="quantum flux"\n   looked up as: "quantum flux"\n   used: NOTHING\n   no options/);
  assert.match(text, /3\. \[medicine\]/);
  const screen = read("src/modules/clinflow/CodeReview.jsx");
  for (const words of ["How this was looked up", "Copy the lookup details", "Looked up as"]) assert.ok(screen.includes(words), words);
});

t("where the practice has chosen a code for a finding, that code comes first, marked as preferred, and the others are still offered", () => {
  const m = (label, value) => ({ sourceLabel: label, sourceValue: value, searchTerm: value, conceptId: null, preferredTerm: null });
  for (const [label, value] of [["Observation", "CRP 4 mg/L"], ["CRP", "4 mg/L"], ["Observation", "C-reactive protein 4"], ["Observation", "crp was 4 mg/L"], ["Investigation", "CRP"], ["Observation", "C reactive protein"]]) {
    const options = optionsFor(m(label, value), find);
    assert.equal(options[0].conceptId, "55235003", `${label} / ${value}`);
    assert.equal(options[0].preferred, true);
    assert.equal(options[0].descriptionId, "506001", "with its description ID");
    assert.ok(options.some((o) => o.conceptId === "999651000000107"), "the other code is still offered");
  }
  const [row] = reviewRows([m("Observation", "CRP 4 mg/L")], "", null, find);
  assert.equal(row.conceptId, "55235003");
  assert.equal(row.quality.label, "The practice's preferred code for this");
  for (const value of ["raised CRP", "CRP raised", "inflammatory markers: CRP 4, WCC 7.2"]) assert.equal(optionsFor(m("Investigation", value), find)[0]?.conceptId, "55235003", `${value}: CRP anywhere in the finding`);
  // oxygen saturation: the practice's code for it, however it is written, but "on room air" can still find its own code
  for (const [label, value] of [["Observation", "Oxygen saturation"], ["Observation", "SpO2 97%"], ["Observation", "O2 sats 97%"], ["Observation", "Sats 94% RA"], ["Oxygen saturation", "normal on room air"], ["Oxygen saturation", "97%"], ["Observation", "oxygen saturations were 97%"]]) assert.equal(optionsFor(m(label, value), find)[0]?.conceptId, "431314004", `${label} / ${value}`);
  assert.equal(subjectOf(m("CRP", "raised")), "CRP", "a value that only says how it was (raised, normal) has no name: the label is looked up");
  assert.equal(subjectOf(m("Observation", "Sats 94% RA")), "Sats 94% room air", "RA after a percentage is room air, not rheumatoid arthritis");
  assert.ok(!optionsFor(m("Diagnosis", "atrial fibrillation"), find).some((o) => o.preferred), "other findings are not affected");
  assert.equal(preferredFor("CRP")?.conceptId, "55235003");
  assert.equal(preferredFor("crp 4")?.conceptId, "55235003");
  assert.equal(preferredFor("crpx"), null, "a different word is not the same word");
  assert.equal(preferredFor(""), null);
  const reduced = createSearch({ ...index, concepts: index.concepts.filter((c) => c[0] !== "55235003") });
  assert.ok(!optionsFor(m("Observation", "CRP 4 mg/L"), reduced).some((o) => o.preferred), "a preferred code that is not in the loaded list is not offered");
});

t("a misspelt word is read as the nearest word in the list, it is reported, and the user is told to check it", () => {
  const typo = find.search("atrial fibrilation");
  assert.equal(typo[0].conceptId, "49436004");
  assert.deepEqual(typo[0].corrected, [{ from: "fibrilation", to: "fibrillation" }]);
  assert.ok(typo[0].score < find.search("atrial fibrillation")[0].score, "a corrected match is rated below an exact one");
  assert.equal(find.search("asthama")[0].conceptId, "195967001", "two letters swapped");
  assert.equal(find.search("ventricluar dysfunction")[0].conceptId, "134401001");
  assert.equal(find.search("dispnoea")[0].conceptId, "267036007", "a letter wrong in the middle");
  assert.equal(find.search("atrial fibrillation")[0].corrected, undefined, "nothing is corrected when nothing was wrong");
  assert.deepEqual(find.search("qzxvwk"), [], "a word like nothing in the list stays nothing");
  assert.deepEqual(find.search("5mg"), [], "a strength is never 'corrected'");
  assert.deepEqual(find.search("afx"), [], "a very short word is never 'corrected'");
});

t("every suggestion says how sure it is: exact, close, spelling corrected, possible, or chosen by the person", () => {
  const q = (o, chosen) => matchQuality(o, chosen)?.level;
  assert.equal(q({ score: 103 }), "exact");
  assert.equal(q({ score: 80 }), "close");
  assert.equal(q({ score: 50 }), "possible");
  assert.equal(q({ score: 98, corrected: [{ from: "asthama", to: "asthma" }] }), "corrected");
  assert.match(matchQuality({ score: 98, corrected: [{ from: "asthama", to: "asthma" }] }).label, /“asthama” read as “asthma”/);
  assert.equal(q({ score: 10 }, true), "chosen");
  assert.equal(matchQuality(null), null);
  const exact = reviewRows([finding("atrial fibrillation")], "", null, find)[0];
  assert.equal(exact.quality.level, "exact");
  const wrong = reviewRows([finding("atrial fibrilation")], "", null, find)[0];
  assert.equal(wrong.quality.level, "corrected");
  assert.equal(wrong.conceptId, "49436004", "still offered, so the person can accept it or choose another");
  const picked = choose(null, finding("atrial fibrilation"), wrong.options[0], { uid: "gp-1", name: "Dr Example" });
  assert.equal(reviewRows([finding("atrial fibrilation")], "", picked, find)[0].quality.level, "chosen");
  const screen = read("src/modules/clinflow/CodeReview.jsx");
  for (const text of ["Search for a different code", "row.quality", "Try one word, or a different spelling"]) assert.ok(screen.includes(text), text);
});

t("a long phrase that is not a code's name still finds the code for a shorter stretch of it, and nonsense still finds nothing", () => {
  const top = (value) => optionsFor({ sourceValue: value }, find).map((o) => o.conceptId);
  assert.equal(top("symptomatic paroxysmal atrial fibrillation with rapid response")[0], "49436004", "'atrial fibrillation' is inside it");
  assert.equal(top("echocardiogram shows significant asthma exacerbation overnight")[0], "195967001");
  assert.deepEqual(top("completely unrelated words about nothing medical"), []);
  assert.deepEqual(top("quantum flux capacitor realignment"), []);
  assert.ok(top("atrial fibrillation")[0] === "49436004", "a name that matches closely is not disturbed");
});

t("the review says how many findings found a code, and which words found none", () => {
  const rows = reviewRows([finding("atrial fibrillation"), finding("quantum flux"), finding("asthma")], "", null, find);
  const summary = matchSummary(rows);
  assert.deepEqual([summary.total, summary.matched], [3, 2]);
  assert.deepEqual(summary.unmatched, [{ label: "Diagnosis", words: "quantum flux" }]);
  assert.equal(unmatchedText(summary), "Diagnosis: quantum flux");
  const noList = matchSummary(reviewRows([{ sourceLabel: "Medication", sourceValue: "Bisoprolol", codeSystem: "dm+d" }], "", null, null, null));
  assert.equal(noList.unmatched.length, 0, "a medicine whose list is not loaded is not called unmatched");
  assert.match(read("src/modules/clinflow/CodeReview.jsx"), /found a code in the lists/);
  assert.match(read("src/modules/clinflow/CodeReview.jsx"), /Copy these words/);
});

t("a baby's or unborn code does not outrank the ordinary one unless the letter says so", () => {
  const ids = find.search("left ventricular dysfunction").map((r) => r.conceptId);
  assert.ok(ids.indexOf("134401001") < ids.indexOf("472775000"), "the ordinary code comes before the fetal one");
  assert.equal(find.search("fetal left ventricular dysfunction")[0].conceptId, "472775000", "asked for by name it comes first");
});

t("with the list loaded, a code the reader guessed at is only offered if it is really in the list, and medicines are left for the dm+d list", () => {
  const guess = { sourceLabel: "Diagnosis", sourceValue: "atrial fibrillation", searchTerm: "atrial fibrillation", conceptId: "99999999999", preferredTerm: "Some old guess", descriptionId: null };
  const [row] = reviewRows([guess], "", null, find);
  assert.equal(row.conceptId, "49436004", "the list's own best match is used, not the guess that is not in it");
  assert.ok(!row.options.some((o) => o.conceptId === "99999999999"));
  const [unmatched] = reviewRows([{ sourceLabel: "Diagnosis", sourceValue: "quantum flux", searchTerm: "quantum flux", conceptId: "88888888888", preferredTerm: "Old guess" }], "", null, find);
  assert.equal(unmatched.pick, null, "nothing in the list, and the old guess is not in it: nothing to accept");
  const [before] = reviewRows([guess], "", null, null);
  assert.equal(before.conceptId, "99999999999", "with no list loaded the reader's own guess is still shown, as before");
  const drug = { sourceLabel: "Current medication", sourceValue: "Bisoprolol 5 mg once daily", searchTerm: "Bisoprolol 5 mg once daily", conceptId: "429503008", preferredTerm: "Bisoprolol therapy" };
  assert.equal(isMedicine(drug), true);
  assert.equal(isMedicine({ sourceLabel: "Diagnosis" }), false);
  const [medicine] = reviewRows([drug], "", null, find);
  assert.equal(medicine.medicine, true);
  assert.equal(medicine.pick, null);
  assert.deepEqual(medicine.options, []);
  assert.match(read("src/modules/clinflow/CodeReview.jsx"), /NHS dm\+d list/);
});

t("the licence's conditions are kept: the required notice is shown wherever codes are, and an old list is flagged for replacing", () => {
  assert.equal(SNOMED_NOTICE, "This material includes SNOMED Clinical Terms® (SNOMED CT®) which is used by permission of the International Health Terminology Standards Development Organisation (IHTSDO). All rights reserved. SNOMED CT®, was originally created by The College of American Pathologists. \"SNOMED\" and \"SNOMED CT\" are registered trademarks of the IHTSDO.", "word for word, as clause 8.3.1 gives it");
  assert.match(describeIndex(index), /14 Oct 2026/, "the version and date of the release in use (clause 8.3.2)");
  assert.equal(indexAgeDays(index, new Date("2026-10-26T00:00:00Z")), 12);
  assert.equal(indexIsOld(index, new Date("2026-10-26T00:00:00Z")), false);
  assert.equal(indexIsOld(index, new Date("2027-02-20T00:00:00Z")), true, "over four months old");
  assert.equal(indexIsOld(index, new Date(Date.UTC(2026, 9, 14) + REPLACE_AFTER_DAYS * 86400000)), false, "exactly at the limit is not yet old");
  assert.ok(REPLACE_AFTER_DAYS < 180, "flagged well before the 180 days the licence allows");
  assert.equal(indexAgeDays({ release: "" }), null);
  assert.equal(indexIsOld({ release: "" }), false, "no date: no false alarm");
  assert.match(read("src/modules/clinflow/CodeReview.jsx"), /SNOMED_NOTICE/);
  assert.match(read("src/modules/clinflow/clinflowSummaryExportService.js"), /line\(SNOMED_NOTICE/);
  assert.match(read("src/modules/clinflow/CodeReview.jsx"), /within 180 days/);
});

t("abbreviations: one meaning is written out, several meanings are never guessed, and a practice's own file replaces the built-in list", () => {
  assert.equal(expandAbbreviations("CKD stage 3").text, "chronic kidney disease stage 3");
  assert.equal(expandAbbreviations("U&Es normal").text, "urea and electrolytes normal");
  assert.equal(expandAbbreviations("ckdish").text, "ckdish", "only whole abbreviations");
  const ra = expandAbbreviations("RA");
  assert.deepEqual(ra.ambiguous.map((a) => a.abbr), ["RA"]);
  assert.ok(ra.ambiguous[0].meanings.includes("rheumatoid arthritis") && ra.ambiguous[0].meanings.length >= 2);
  assert.equal(expandAbbreviations("ra").ambiguous.length, 0, "a several-meaning abbreviation is only read in capitals");
  assert.equal(withMeaning("RA", "RA", "rheumatoid arthritis"), "rheumatoid arthritis");
  assert.ok(BUILT_IN_ABBREVIATIONS.length > 100);
  assert.equal(abbreviationInfo().builtIn, true);

  const parsed = parseAbbreviationCsv('Abbreviation,Meaning\n"CKD","chronic kidney disease"\nXX\tasthma\nXX\tatrial fibrillation\nbroken\n,no abbreviation\nQQ,\n');
  assert.equal(parsed.entries.length, 2, "the heading row is skipped; repeats are one entry");
  assert.equal(parsed.ambiguous, 1);
  assert.equal(parsed.problems.length, 3, "lines that cannot be used are reported, not dropped");
  assert.equal(parsed.problems[0].line, 5);
  assert.equal(parseAbbreviationCsv("").entries.length, 0);
  assert.equal(parseAbbreviationCsv("ab,x\nab,x\n").entries[0].meanings.length, 1, "the same meaning twice is one meaning");
  assert.equal(parseAbbreviationCsv("MS,multiple sclerosis\n").entries[0].upper, true, "two letters: capitals only");

  setAbbreviationList(parsed.entries, "test.csv");
  try {
    assert.equal(abbreviationInfo().builtIn, false);
    assert.equal(abbreviationInfo().label, "test.csv");
    assert.equal(expandAbbreviations("CKD").text, "chronic kidney disease");
    assert.equal(expandAbbreviations("COPD").text, "COPD", "the loaded list replaces the built-in one");
    const [row] = reviewRows([finding("XX")], "", null, find);
    assert.equal(row.ambiguity.abbr, "XX");
    assert.equal(row.pick, null, "nothing is picked until the person chooses a meaning");
    assert.equal(row.options.length, 2, "a code for each meaning");
    assert.deepEqual(row.options.map((o) => o.viaAbbreviation).sort(), ["XX = asthma", "XX = atrial fibrillation"]);
    const review = choose(null, finding("XX"), row.options[0]);
    assert.equal(reviewRows([finding("XX")], "", review, find)[0].pick.conceptId, row.options[0].conceptId, "a meaning can be chosen");
  } finally { setAbbreviationList(null); }
  assert.equal(abbreviationInfo().builtIn, true, "going back restores the built-in list");
  assert.equal(expandAbbreviations("COPD").text, "chronic obstructive pulmonary disease");
  assert.match(read("src/modules/clinflow/CodeReview.jsx"), /Load an abbreviations file/);
  assert.match(read("src/modules/clinflow/snomedListStore.js"), /export function useAbbreviations/);
});

console.log(`\n${n} passed`);
