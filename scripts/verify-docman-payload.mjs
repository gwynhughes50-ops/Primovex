import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DOCMAN_EXTENSIONS, buildDocmanPayload, clinicalCodesFrom, nhsNumberValid, readinessSummary } from "../src/modules/clinflow/docmanPayload.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const now = new Date("2026-10-26T10:00:00Z");

const candidate = (extra = {}) => ({ sourceValue: "Atrial fibrillation", conceptId: "49436004", preferredTerm: "Atrial fibrillation", descriptionId: "80004015", scheme: 2, acceptedByUid: "gp-1", ...extra });
const draft = (extra = {}) => ({
  captureSource: 2,
  sender: { odsCode: "W98001", organisation: "Glan Clwyd Hospital", department: "Cardiology", person: "Dr B Consultant", group: "" },
  recipientOdsCode: "W91001",
  patient: { identifier: "943 476 5919", familyName: "Smith", givenNames: "John", gender: 10, birthDate: "1954-06-12" },
  document: { description: "Cardiology clinic letter", eventDate: "2026-05-14", folder: "Outpatient correspondence", filingSectionFolder: "", fileExtension: "pdf", externalSystemId: "an-1" },
  actionRequired: true, medicationChanged: true, urgent: false,
  clinicalCodes: [candidate()],
  notes: "Reviewed by a clinician.",
  ...extra,
});
const fields = (result) => result.blocking.map((p) => p.field);

t("an NHS number must be ten digits with the right check digit", () => {
  assert.equal(nhsNumberValid("943 476 5919"), true, "a published example number");
  assert.equal(nhsNumberValid("9434765919"), true);
  assert.equal(nhsNumberValid("9434765918"), false, "wrong check digit");
  assert.equal(nhsNumberValid("987 654 3210"), true, "the demo letters' number");
  assert.equal(nhsNumberValid("123456789"), false, "nine digits");
  assert.equal(nhsNumberValid("12345678901"), false, "eleven digits");
  assert.equal(nhsNumberValid("94347659AB"), false);
  assert.equal(nhsNumberValid(""), false);
  assert.equal(nhsNumberValid("9990000000"), false, "a check digit of 10 is never valid");
});

t("a complete letter becomes Docman's own fields and nothing blocks it", () => {
  const result = buildDocmanPayload(draft(), { fileReady: true, now });
  assert.equal(result.ready, true, JSON.stringify(result.blocking));
  const p = result.payload;
  assert.equal(p.CaptureSource, 2);
  assert.deepEqual(p.Sender, { OdsCode: "W98001", Organisation: "Glan Clwyd Hospital", Department: "Cardiology", Person: "Dr B Consultant" });
  assert.equal(p.RecipientOdsCode, "W91001");
  assert.deepEqual(p.Patient, { Identifier: "9434765919", FamilyName: "Smith", GivenNames: "John", Gender: 10, BirthDate: "1954-06-12" });
  assert.deepEqual(p.Document, { Description: "Cardiology clinic letter", EventDate: "2026-05-14", FileExtension: "pdf", Folder: "Outpatient correspondence", ExternalSystemId: "an-1" });
  assert.deepEqual([p.ActionRequired, p.MedicationChanged, p.Urgent], [true, true, false]);
  assert.deepEqual(p.ClinicalCodes, [{ Scheme: 2, Code: "49436004", Description: "Atrial fibrillation", DescriptionId: "80004015" }]);
  assert.equal(p.Notes, "Reviewed by a clinician.");
  assert.match(readinessSummary(result), /^Everything Docman needs is there\.$/);
});

t("a letter as ClinFlow produces it today is not ready, and says exactly what is missing", () => {
  const today = draft({ sender: { odsCode: "", organisation: "", department: "", person: "", group: "" }, recipientOdsCode: "", patient: { identifier: "", familyName: "Smith", givenNames: "John", gender: 0, birthDate: "" }, document: { description: "Cardiology clinic letter", eventDate: "", folder: "Outpatient correspondence", filingSectionFolder: "", fileExtension: "pdf", externalSystemId: "an-1" }, clinicalCodes: [candidate({ descriptionId: null, acceptedByUid: null })] });
  const result = buildDocmanPayload(today, { fileReady: true, now });
  assert.equal(result.ready, false);
  assert.deepEqual(fields(result), ["Sender.OdsCode", "Sender.Organisation", "Sender.Department", "Sender.Person", "RecipientOdsCode", "Patient.Identifier", "Patient.BirthDate", "Document.EventDate"]);
  assert.match(readinessSummary(result), /^8 things stop it being sent to Docman, and 2 notes\.$/);
  assert.ok(!("ClinicalCodes" in result.payload), "a code nobody has accepted is not sent");
});

t("the rules Docman checks are checked here first: lengths, dates, file type, NHS number", () => {
  const bad = (extra, field) => assert.ok(fields(buildDocmanPayload(draft(extra), { fileReady: true, now })).includes(field), field);
  bad({ patient: { identifier: "9434765918", familyName: "S", givenNames: "J", gender: 10, birthDate: "1954-06-12" } }, "Patient.Identifier");
  bad({ patient: { identifier: "9434765919", familyName: "S", givenNames: "J", gender: 10, birthDate: "2027-01-01" } }, "Patient.BirthDate");
  bad({ patient: { identifier: "9434765919", familyName: "S", givenNames: "J", gender: 10, birthDate: "1954-02-31" } }, "Patient.BirthDate");
  bad({ document: { ...draft().document, eventDate: "2026-12-01" } }, "Document.EventDate");
  bad({ document: { ...draft().document, description: "x".repeat(256) } }, "Document.Description");
  bad({ document: { ...draft().document, folder: "f".repeat(51) } }, "Document.Folder");
  bad({ document: { ...draft().document, fileExtension: "exe" } }, "Document.FileExtension");
  bad({ notes: "n".repeat(256) }, "Notes");
  bad({ sender: { ...draft().sender, odsCode: "W9800100000" } }, "Sender.OdsCode");
  bad({ sender: { ...draft().sender, group: "g".repeat(101) } }, "Sender.Group");
  bad({ captureSource: 1 }, "CaptureSource");
  assert.ok(!fields(buildDocmanPayload(draft({ document: { ...draft().document, fileExtension: ".PDF" } }), { fileReady: true, now })).includes("Document.FileExtension"), "a leading dot and capitals are tidied, as Docman does");
  assert.ok(fields(buildDocmanPayload(draft(), { fileReady: false, now })).includes("Document.FileContent"), "no file attached");
  assert.deepEqual(DOCMAN_EXTENSIONS, ["html", "htm", "pdf", "rtf", "doc", "docx", "tif", "tiff", "txt", "jpeg", "jpg", "xps", "png"]);
});

t("only accepted, complete SNOMED codes are sent; the rest are listed with the reason", () => {
  const { codes, notReady } = clinicalCodesFrom([
    candidate(),
    candidate({ sourceValue: "Heart failure", acceptedByUid: null }),
    candidate({ sourceValue: "Asthma", conceptId: null }),
    candidate({ sourceValue: "Gout", descriptionId: null }),
    candidate({ sourceValue: "Cough", preferredTerm: null }),
  ]);
  assert.equal(codes.length, 1);
  assert.deepEqual(notReady.map((c) => c.source), ["Heart failure", "Asthma", "Gout", "Cough"]);
  assert.match(notReady[0].reason, /clinician has not accepted/);
  assert.match(notReady[1].reason, /no SNOMED code/);
  assert.match(notReady[2].reason, /description ID/);
});

t("a measurement is sent with its value and unit together, only for the parts of an observation", () => {
  const { codes } = clinicalCodesFrom([
    candidate({ sourceValue: "132 mmHg", conceptId: "271649006", preferredTerm: "Systolic blood pressure", descriptionId: "1", component: "systolic" }),
    candidate({ sourceValue: "Atrial fibrillation", component: undefined }),
  ]);
  assert.deepEqual(codes[0], { Scheme: 2, Code: "271649006", Description: "Systolic blood pressure", DescriptionId: "1", Value: "132", ValueUnit: "mmHg" });
  assert.ok(!("Value" in codes[1]) && !("ValueUnit" in codes[1]));
});

t("the screen shows it: a readiness check on the Docman tab, and ClinFlow still sends nothing itself", () => {
  const panel = read("src/modules/clinflow/DocmanReadiness.jsx");
  assert.match(panel, /buildDocmanPayload\(/);
  assert.match(panel, /Nothing is sent to Docman from here/);
  assert.match(read("src/modules/clinflow/ClinFlowWorkspace.jsx"), /<DocmanReadiness /);
  assert.ok(!/fetch\(|axios|XMLHttpRequest/.test(read("src/modules/clinflow/docmanPayload.js")), "the module cannot send anything");
});

console.log(`\n${n} passed`);
