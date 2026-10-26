import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DMD_TAGS, buildDmdIndex, chooseDescriptionIds, medicineLookup, medicineName, medicineParts, parseAmps, parseVmps, parseVtms } from "../src/modules/clinflow/dmdIndex.js";
import { describeIndex, indexIsOld, indexProblem } from "../src/modules/clinflow/snomedIndex.js";
import { createSearch } from "../src/modules/clinflow/snomedSearch.js";
import { buildDocmanPayload } from "../src/modules/clinflow/docmanPayload.js";
import { codesAfterReview, decide, isMedicine, medicineOptions, reviewCandidates, reviewRows } from "../src/modules/clinflow/clinflowCodeReview.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// a small piece of the real dm+d files
const VTM = `<?xml version="1.0"?><VIRTUAL_THERAPEUTIC_MOIETIES><VTM><VTMID>372635003</VTMID><NM>Bisoprolol</NM></VTM><VTM><VTMID>777067000</VTMID><NM>Paracetamol</NM></VTM><VTM><VTMID>111</VTMID><NM>Withdrawn thing</NM><INVALID>1</INVALID></VTM><VTM><VTMID>222</VTMID><NM>Salbutamol</NM></VTM><VTM><VTMID>333</VTMID><NM>Amoxicillin</NM></VTM><VTM><VTMID>444</VTMID><NM>Doxycycline</NM></VTM></VIRTUAL_THERAPEUTIC_MOIETIES>`;
const VMP = `<VIRTUAL_MED_PRODUCTS><VMPS><VMP><VPID>42371511000001109</VPID><VTMID>372635003</VTMID><NM>Bisoprolol 5mg tablets</NM></VMP><VMP><VPID>42371311000001103</VPID><VTMID>372635003</VTMID><NM>Bisoprolol 2.5mg tablets</NM></VMP><VMP><VPID>8304911000001103</VPID><VTMID>372635003</VTMID><NM>Bisoprolol 5mg/5ml oral solution</NM></VMP><VMP><VPID>35936511000001108</VPID><VTMID>222</VTMID><NM>Salbutamol 100micrograms/dose inhaler</NM></VMP><VMP><VPID>555</VPID><VTMID>333</VTMID><NM>Amoxicillin 500mg capsules</NM></VMP><VMP><VPID>666</VPID><VTMID>444</VTMID><NM>Doxycycline 100mg capsules</NM></VMP><VMP><VPID>777</VPID><VTMID>777067000</VTMID><NM>Paracetamol 500mg tablets &amp; caplets</NM></VMP><VMP><VPID>888</VPID><VTMID>777067000</VTMID><NM>Old paracetamol</NM><INVALID>1</INVALID></VMP></VMPS></VIRTUAL_MED_PRODUCTS>`;
const AMP = `<ACTUAL_MEDICINAL_PRODUCTS><AMPS><AMP><APID>19711000001106</APID><VPID>42371511000001109</VPID><NM>Cardicor 5mg tablets</NM><DESC>Cardicor 5mg tablets (Merck Serono Ltd)</DESC></AMP><AMP><APID>9001</APID><VPID>42371511000001109</VPID><NM>Bisoprolol 5mg tablets</NM><DESC>Bisoprolol 5mg tablets (Accord-UK Ltd)</DESC></AMP><AMP><APID>9002</APID><VPID>42371511000001109</VPID><NM>BISOPROLOL 5mg tablets</NM><DESC>Bisoprolol 5mg tablets (Teva UK Ltd)</DESC></AMP><AMP><APID>9003</APID><VPID>1</VPID><NM>Cardioace tablets</NM></AMP><AMP><APID>9004</APID><VPID>1</VPID><NM>Retired brand</NM><INVALID>1</INVALID></AMP></AMPS></ACTUAL_MEDICINAL_PRODUCTS>`;

const vtms = parseVtms(VTM);
const vmps = parseVmps(VMP);
const amps = parseAmps(AMP);
const index = buildDmdIndex({ vtms, vmps, amps, release: "20261005", now: new Date("2026-10-26T10:00:00Z") });
const find = createSearch(index);

t("the dm+d files are read: medicines, generic products and brands, with the invalid ones left out and the text decoded", () => {
  assert.deepEqual(vtms.map((v) => v.name), ["Bisoprolol", "Paracetamol", "Salbutamol", "Amoxicillin", "Doxycycline"], "an invalid one is not read");
  assert.equal(vmps.length, 7);
  assert.ok(!vmps.some((v) => v.name === "Old paracetamol"));
  assert.equal(vmps.find((v) => v.id === "777").name, "Paracetamol 500mg tablets & caplets", "&amp; is decoded");
  assert.deepEqual(amps.map((a) => a.id), ["19711000001106", "9001", "9002", "9003"]);
  assert.equal(amps[0].desc, "Cardicor 5mg tablets (Merck Serono Ltd)");
});

t("the list holds each medicine once, brands only when they have their own name, and says it is the medicines list", () => {
  assert.equal(index.kind, "dmd");
  assert.equal(index.edition, "NHS dm+d");
  assert.deepEqual(index.tags, DMD_TAGS);
  const names = index.concepts.map((c) => c[1]);
  assert.ok(names.includes("Cardicor 5mg tablets") && names.includes("Cardioace tablets"), "brands with their own names are kept");
  assert.equal(names.filter((x) => /^bisoprolol 5mg tablets$/i.test(x)).length, 1, "a generic-named product from each supplier adds nothing: only the generic product is kept");
  assert.equal(index.concepts.find((c) => c[0] === "42371511000001109")[3], 1);
  assert.equal(index.concepts.find((c) => c[0] === "372635003")[3], 0);
  assert.equal(index.concepts.find((c) => c[0] === "19711000001106")[3], 2);
  assert.equal(describeIndex(index), "NHS dm+d 5 Oct 2026: 14 medicines");
  assert.equal(indexIsOld(index, new Date("2026-10-26")), false);
});

t("the two lists cannot be loaded into each other's place by mistake", () => {
  assert.equal(indexProblem(index, "dmd"), "");
  assert.match(indexProblem(index, "snomed"), /medicines \(dm\+d\) list/);
  const snomed = { format: 1, kind: "snomed", tags: ["disorder"], concepts: [["49436004", "Atrial fibrillation", "80004015", 0, []]] };
  assert.equal(indexProblem(snomed, "snomed"), "");
  assert.match(indexProblem(snomed, "dmd"), /SNOMED clinical list/);
  const old = { format: 1, tags: ["disorder"], concepts: [["49436004", "Atrial fibrillation", "80004015", 0, []]] };
  assert.equal(indexProblem(old, "snomed"), "", "a list built before lists had a kind is a SNOMED one");
  assert.match(indexProblem(null, "dmd"), /not a ClinFlow medicines list/);
});

t("what a letter says about a medicine is turned into how dm+d writes it", () => {
  assert.equal(medicineLookup("Bisoprolol 5 mg once daily"), "bisoprolol 5mg");
  assert.equal(medicineLookup("Increase Bisoprolol to 5 mg once daily"), "bisoprolol 5mg");
  assert.equal(medicineLookup("salbutamol inhaler 100 micrograms"), "salbutamol inhaler 100micrograms");
  assert.equal(medicineLookup("Ramipril 2.5 mg nocte"), "ramipril 2.5mg");
  assert.equal(medicineLookup("Aspirin 300 mg at 21:31"), "aspirin 300mg");
  assert.equal(medicineLookup("Atorvastatin 40mg at night"), "atorvastatin 40mg");
  assert.deepEqual(medicineParts("amoxicillin 500 mg, doxycycline 100 mg"), ["amoxicillin 500mg", "doxycycline 100mg"]);
  assert.deepEqual(medicineParts("Aspirin + Paracetamol"), ["aspirin", "paracetamol"]);
  assert.equal(medicineName("bisoprolol 5mg"), "bisoprolol");
  assert.equal(medicineName("co-amoxiclav 500mg"), "co-amoxiclav");
});

t("a medicine in a letter finds the generic product at the strength written, and a brand finds the brand", () => {
  const top = (v) => medicineOptions({ sourceLabel: "Current medication", sourceValue: v }, find).map((o) => o.term);
  assert.equal(top("Bisoprolol 5 mg once daily")[0], "Bisoprolol 5mg tablets");
  assert.equal(top("Bisoprolol 2.5 mg")[0], "Bisoprolol 2.5mg tablets");
  assert.equal(top("Bisoprolol")[0], "Bisoprolol", "no strength: the medicine itself");
  assert.equal(top("salbutamol inhaler 100 micrograms")[0], "Salbutamol 100micrograms/dose inhaler");
  assert.equal(top("Cardicor")[0], "Cardicor 5mg tablets", "a brand name finds the brand, not one that starts the same");
  assert.ok(!top("Cardicor").includes("Cardioace tablets"), "'cardioace' is not 'cardicor'");
  assert.deepEqual(top("quantum flux 5 mg"), [], "nothing in the list: nothing offered");
  assert.deepEqual(medicineOptions({ sourceValue: "Bisoprolol 5 mg" }, null), [], "no list loaded: nothing offered");
});

t("when the strength finds nothing close the medicine's name alone is tried, and two medicines in one line each get a place", () => {
  const top = (v) => medicineOptions({ sourceLabel: "Current medication", sourceValue: v }, find);
  assert.equal(top("Bisoprolol 12 mg")[0].term, "Bisoprolol", "no 12 mg product: the medicine itself is offered");
  const both = top("amoxicillin 500 mg, doxycycline 100 mg").map((o) => o.term);
  assert.deepEqual(both.slice(0, 2), ["Amoxicillin 500mg capsules", "Doxycycline 100mg capsules"]);
});

t("a medicine row uses the medicines list, is accepted like any code, and carries its dm+d code to the record", () => {
  const drug = { sourceLabel: "Current medication", sourceValue: "Bisoprolol 5 mg once daily", searchTerm: "Bisoprolol 5 mg once daily", conceptId: "429503008", preferredTerm: "Bisoprolol therapy" };
  assert.equal(isMedicine(drug), true);
  const [row] = reviewRows([drug], "Increase Bisoprolol to 5 mg once daily", null, null, find);
  assert.equal(row.medicine, true);
  assert.equal(row.medicineListMissing, false);
  assert.equal(row.conceptId, "42371511000001109");
  assert.equal(row.term, "Bisoprolol 5mg tablets");
  assert.equal(row.evidence.found, true);
  const [missing] = reviewRows([drug], "", null, null, null);
  assert.equal(missing.medicineListMissing, true);
  assert.equal(missing.pick, null, "no medicines list loaded: the old guess ('Bisoprolol therapy') is not offered");
  const review = decide(null, drug, "accepted", { uid: "gp-1", name: "Dr Example", pick: row.pick });
  const [code] = codesAfterReview([drug], review);
  assert.equal(code.conceptId, "42371511000001109");
  assert.equal(code.preferredTerm, "Bisoprolol 5mg tablets");
  assert.equal(code.acceptedByUid, "gp-1");
  assert.equal(code.descriptionId, null, "dm+d does not carry the SNOMED description ID: Docman will say it is still needed");
});

t("every medicine in a letter gets a row, once, with two medicines in one line as two rows; the reader's old guesses at medicines are not used", () => {
  const analysis = {
    terminologyCandidates: [
      { sourceLabel: "Diagnosis", sourceValue: "atrial fibrillation", conceptId: "49436004", preferredTerm: "Atrial fibrillation" },
      { sourceLabel: "Current medication", sourceValue: "Apixaban 5 mg twice daily", conceptId: "182754009", preferredTerm: "Anticoagulant therapy" },
    ],
    medicationCandidates: [
      { sourceValue: "Bisoprolol 5 mg once daily", codeSystem: "dm+d" }, { sourceValue: "Increase Bisoprolol to 5 mg once daily", codeSystem: "dm+d" },
      { sourceValue: "Apixaban 5 mg twice daily", codeSystem: "dm+d" }, { sourceValue: "Cardicor", codeSystem: "dm+d" }, { sourceValue: "amoxicillin 500 mg, doxycycline 100 mg", codeSystem: "dm+d" },
    ],
  };
  const list = reviewCandidates(analysis);
  assert.deepEqual(list.map((c) => c.sourceValue), ["atrial fibrillation", "Bisoprolol 5 mg once daily", "Apixaban 5 mg twice daily", "Cardicor", "amoxicillin 500 mg", "doxycycline 100 mg"]);
  assert.ok(!list.some((c) => c.preferredTerm === "Anticoagulant therapy"), "the reader's guess for a medicine is gone");
  assert.ok(list.filter((c) => c.codeSystem === "dm+d").every((c) => c.sourceLabel === "Medication" && c.conceptId === null));
  assert.deepEqual(reviewCandidates(null), []);
  const rows = reviewRows(list, "", null, null, find);
  assert.equal(rows.filter((r) => r.medicine).length, 5);
  assert.equal(rows.find((r) => r.candidate.sourceValue === "Cardicor").conceptId, "19711000001106");
  assert.equal(rows.find((r) => r.candidate.sourceValue === "amoxicillin 500 mg").conceptId, "555");
  assert.equal(rows.find((r) => r.candidate.sourceValue === "doxycycline 100 mg").conceptId, "666");
  assert.match(read("src/modules/clinflow/ClinFlowWorkspace.jsx"), /candidates=\{reviewCandidates\(analysis, ocr\?\.content\)\}/);
});

t("a medicine is given its SNOMED description ID from the Drug Extension, only where the term is the dm+d name, so name and ID belong together", () => {
  const SYN = "900000000000013009";
  const FSN = "900000000000003001";
  const wanted = new Map([["42371511000001109", "Bisoprolol 5mg tablets"], ["35936511000001108", "Salbutamol 100micrograms/dose inhaler"], ["372635003", "Bisoprolol"], ["19711000001106", "Cardicor 5mg tablets"]]);
  const rows = [
    { id: "9001", active: true, conceptId: "42371511000001109", typeId: FSN, term: "Bisoprolol 5mg tablets (product)" },
    { id: "9002", active: true, conceptId: "42371511000001109", typeId: SYN, term: "Bisoprolol  5mg  tablets" },
    { id: "9003", active: false, conceptId: "35936511000001108", typeId: SYN, term: "Salbutamol 100micrograms/dose inhaler" },
    { id: "9004", active: true, conceptId: "35936511000001108", typeId: SYN, term: "Salbutamol 100micrograms/dose pressurised inhalation" },
    { id: "9005", active: true, conceptId: "372635003", typeId: SYN, term: "BISOPROLOL" },
    { id: "9006", active: true, conceptId: "999", typeId: SYN, term: "Not wanted" },
  ];
  const { ids, missing } = chooseDescriptionIds(wanted, rows);
  assert.equal(ids.get("42371511000001109"), "9002", "the synonym with the dm+d name, spacing and capitals aside (not the full name with its tag)");
  assert.equal(ids.get("372635003"), "9005");
  assert.ok(!ids.has("35936511000001108"), "a retired description, or one with a different name, is not used");
  assert.deepEqual(missing.sort(), ["19711000001106", "35936511000001108"]);

  const withIds = buildDmdIndex({ vtms, vmps, amps, descriptionIds: new Map([["42371511000001109", "9002"]]), release: "20261005" });
  assert.equal(withIds.withDescriptionIds, true);
  assert.equal(withIds.concepts.find((c) => c[0] === "42371511000001109")[2], "9002");
  assert.equal(withIds.concepts.find((c) => c[0] === "372635003")[2], "", "a medicine with no ID found has none");
  assert.equal(index.withDescriptionIds, false);

  // it reaches the record: the medicine accepted from this list is complete for Docman
  const drug = { sourceLabel: "Medication", sourceValue: "Bisoprolol 5 mg once daily", searchTerm: "Bisoprolol 5 mg once daily", conceptId: null, preferredTerm: null, descriptionId: null, codeSystem: "dm+d" };
  const [row] = reviewRows([drug], "", null, null, createSearch(withIds));
  assert.equal(row.descriptionId, "9002");
  const review = decide(null, drug, "accepted", { uid: "gp-1", name: "Dr Example", pick: row.pick });
  const result = buildDocmanPayload({
    captureSource: 2, sender: { odsCode: "W98001", organisation: "H", department: "D", person: "P" }, recipientOdsCode: "W91001",
    patient: { identifier: "9434765919", familyName: "S", givenNames: "J", gender: 10, birthDate: "1954-06-12" }, document: { description: "Letter", eventDate: "2026-05-14", fileExtension: "pdf" },
    clinicalCodes: codesAfterReview([drug], review),
  }, { fileReady: true, now: new Date("2026-10-26T10:00:00Z") });
  assert.deepEqual(result.payload.ClinicalCodes, [{ Scheme: 2, Code: "42371511000001109", Description: "Bisoprolol 5mg tablets", DescriptionId: "9002" }]);
  assert.ok(result.ready, JSON.stringify(result.blocking));
});

t("a brand is written with its supplier in SNOMED, so it is matched on that name, shown with it, and the short name still finds it", () => {
  const SYN = "900000000000013009";
  const wanted = new Map([["19711000001106", ["Cardicor 5mg tablets", "Cardicor 5mg tablets (Merck Serono Ltd)"]], ["37358811000001102", ["Cardicor 5mg tablets", "Cardicor 5mg tablets (Mawdsley-Brooks & Company Ltd)"]]]);
  const rows = [
    { id: "a1", active: true, conceptId: "19711000001106", typeId: SYN, term: "Cardicor 5mg tablets (Merck Pharmaceuticals)" },
    { id: "a2", active: true, conceptId: "19711000001106", typeId: SYN, term: "Cardicor 5mg tablets (Merck Serono Ltd)" },
    { id: "b1", active: true, conceptId: "37358811000001102", typeId: SYN, term: "Cardicor 5mg tablets (Mawdsley-Brooks & Company Ltd)" },
  ];
  const { ids, terms } = chooseDescriptionIds(wanted, rows);
  assert.equal(ids.get("19711000001106"), "a2", "the term that is one of the names, not another supplier's");
  assert.equal(terms.get("19711000001106"), "Cardicor 5mg tablets (Merck Serono Ltd)");
  const brands = buildDmdIndex({ vtms: [], vmps: [], amps: [{ id: "19711000001106", vpid: "1", name: "Cardicor 5mg tablets", desc: "Cardicor 5mg tablets (Merck Serono Ltd)" }, { id: "37358811000001102", vpid: "1", name: "Cardicor 5mg tablets", desc: "" }], descriptionIds: ids, descriptionTerms: terms });
  const merck = brands.concepts.find((c) => c[0] === "19711000001106");
  assert.deepEqual([merck[1], merck[2]], ["Cardicor 5mg tablets (Merck Serono Ltd)", "a2"], "shown with its supplier, and the ID is the one for that exact name");
  assert.deepEqual(merck[4], [["Cardicor 5mg tablets", ""]], "the short name is kept to search by");
  const [first] = medicineOptions({ sourceValue: "Cardicor 5 mg" }, createSearch(brands));
  assert.equal(first.descriptionId, "a2");
  assert.equal(first.term, "Cardicor 5mg tablets (Merck Serono Ltd)");
});

t("the same medicine written twice in a letter is one row, with the wording the letter used for the more complete one", () => {
  assert.equal(medicineLookup("Trial salbutamol inhaler 100 micrograms, puffs when required"), "salbutamol inhaler 100micrograms");
  const analysis = { medicationCandidates: [{ sourceValue: "salbutamol 100 micrograms", codeSystem: "dm+d" }, { sourceValue: "Trial salbutamol inhaler 100 micrograms", codeSystem: "dm+d" }, { sourceValue: "Bisoprolol 5 mg", codeSystem: "dm+d" }, { sourceValue: "Bisoprolol 2.5 mg", codeSystem: "dm+d" }] };
  assert.deepEqual(reviewCandidates(analysis).map((c) => c.sourceValue), ["Trial salbutamol inhaler 100 micrograms", "Bisoprolol 5 mg", "Bisoprolol 2.5 mg"], "a different strength is a different medicine; the same one written shorter is not");
});

t("the screen and the builder: a second list to load, the builder says what to do, and the licence notice is kept", () => {
  const panel = read("src/modules/clinflow/CodeReview.jsx");
  for (const text of ["NHS dm+d medicines list", "Choose the medicines list file", "medList"]) assert.ok(panel.includes(text), text);
  const workspace = read("src/modules/clinflow/ClinFlowWorkspace.jsx");
  assert.match(workspace, /useSnomedList\("dmd"\)/);
  assert.match(workspace, /medList=\{medicinesList\}/);
  const script = read("scripts/build-dmd-index.mjs");
  assert.match(script, /npm run dmd:index/);
  assert.match(script, /never commit or publish/);
  assert.match(script, /--drug/);
  assert.match(script, /uk_sct2dr_/);
  assert.ok(JSON.parse(read("package.json")).scripts["dmd:index"]);
  assert.match(read("src/modules/clinflow/snomedListStore.js"), /KEYS = \{ snomed: "uk", dmd: "dmd" \}/);
});

console.log(`\n${n} passed`);
