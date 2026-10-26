// What Docman 10X needs to receive a letter, and whether a ClinFlow letter has it yet. Pure (no screens, nothing is sent anywhere).
//
// The model is Docman Connect's "inbound document model" (Docman help centre, "Docman Connect Inbound Document Model" and "Docman10 API
// Codes"): the JSON posted with the Post Document method. ClinFlow keeps its own `docmanDraft` in the same shape (see
// clinflowAnalysisService.js); this turns that draft into the exact Docman fields and says, field by field, what is still missing or would be
// refused. Nothing here sends a letter: it is what a clinician checks today, and what would be posted if Docman's API is ever used.

export const DOCMAN_EXTENSIONS = ["html", "htm", "pdf", "rtf", "doc", "docx", "tif", "tiff", "txt", "jpeg", "jpg", "xps", "png"];
export const GENDER = { unspecified: 0, male: 10, female: 20 };
export const SCHEME = { read: 0, snomed: 2 };
const LIMITS = { odsCode: 10, organisation: 255, department: 255, person: 255, group: 100, name: 255, description: 255, folder: 50, notes: 255, mrn: 255, identifier: 10 };

const text = (v) => String(v ?? "").replace(/\s+/g, " ").trim();

// An NHS number (or a CHI number) is ten digits whose last digit is a MOD 11 check of the first nine; Docman refuses one that fails
export function nhsNumberValid(value) {
  const digits = String(value ?? "").replace(/\s+/g, "");
  if (!/^\d{10}$/.test(digits)) return false;
  const sum = digits.slice(0, 9).split("").reduce((total, d, i) => total + Number(d) * (10 - i), 0);
  let check = 11 - (sum % 11);
  if (check === 11) check = 0;
  if (check === 10) return false;
  return check === Number(digits[9]);
}

const isoDay = (value) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? "")); if (!m) return null; const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))); return d.getUTCMonth() === Number(m[2]) - 1 ? d : null; };

// "120 mmHg" -> { value: "120", unit: "mmHg" }
function valueAndUnit(sourceValue) {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*([^\s\d].*)$/.exec(String(sourceValue ?? ""));
  return m ? { value: m[1], unit: text(m[2]) } : null;
}

// ClinFlow's SNOMED candidates become Docman clinical codes only once a clinician has accepted them and they have everything Docman asks for:
// the concept ID, its description and the description ID. Everything else is listed with the reason it is not ready.
export function clinicalCodesFrom(candidates = []) {
  const codes = [];
  const notReady = [];
  for (const c of candidates) {
    const name = text(c.sourceValue || c.searchTerm || c.preferredTerm) || "a finding";
    if (!c.conceptId) { notReady.push({ source: name, reason: "no SNOMED code has been found for it yet" }); continue; }
    if (!c.acceptedByUid) { notReady.push({ source: name, reason: "a clinician has not accepted the suggested code yet" }); continue; }
    if (!c.preferredTerm) { notReady.push({ source: name, reason: "the code has no description" }); continue; }
    if (!c.descriptionId) { notReady.push({ source: name, reason: "the SNOMED description ID is missing (it comes from the UK SNOMED release)" }); continue; }
    const code = { Scheme: SCHEME.snomed, Code: String(c.conceptId), Description: text(c.preferredTerm), DescriptionId: String(c.descriptionId) };
    const measured = c.component ? valueAndUnit(c.sourceValue) : null;
    if (measured) { code.Value = measured.value; code.ValueUnit = measured.unit; }
    codes.push(code);
  }
  return { codes, notReady };
}

const gap = (field, label, message, severity = "blocks") => ({ field, label, message, severity });

// draft: ClinFlow's docmanDraft. options: fileReady (the letter's file is available to attach), now (for "not in the future").
// Returns { payload, problems, ready, codes: { sent, notReady } }: `payload` uses Docman's own field names; `ready` is true only when nothing blocks.
export function buildDocmanPayload(draft = {}, { fileReady = false, now = new Date() } = {}) {
  const problems = [];
  const sender = draft.sender || {};
  const patient = draft.patient || {};
  const doc = draft.document || {};
  const required = (value, field, label, max) => {
    const v = text(value);
    if (!v) problems.push(gap(field, label, `${label} is needed.`));
    else if (max && v.length > max) problems.push(gap(field, label, `${label} is too long (${v.length} letters; the most is ${max}).`));
    return v;
  };
  const optional = (value, field, label, max) => {
    const v = text(value);
    if (v && max && v.length > max) problems.push(gap(field, label, `${label} is too long (${v.length} letters; the most is ${max}).`));
    return v;
  };

  if (draft.captureSource !== 2) problems.push(gap("CaptureSource", "Capture source", "It must be 2 (Docman Connect)."));

  const senderOut = {
    OdsCode: required(sender.odsCode, "Sender.OdsCode", "The sending organisation's ODS code", LIMITS.odsCode),
    Organisation: required(sender.organisation, "Sender.Organisation", "The sending organisation", LIMITS.organisation),
    Department: required(sender.department, "Sender.Department", "The sending department", LIMITS.department),
    Person: required(sender.person, "Sender.Person", "The clinician responsible", LIMITS.person),
  };
  const group = optional(sender.group, "Sender.Group", "The sender group", LIMITS.group);
  if (group) senderOut.Group = group;

  const recipient = required(draft.recipientOdsCode, "RecipientOdsCode", "The practice's Docman Connect ODS code", LIMITS.odsCode);

  const identifier = text(patient.identifier).replace(/\s+/g, "");
  if (!identifier) problems.push(gap("Patient.Identifier", "NHS number", "The NHS number is needed."));
  else if (!nhsNumberValid(identifier)) problems.push(gap("Patient.Identifier", "NHS number", "That is not a valid NHS number (it fails the check digit), so Docman would refuse it."));
  const family = required(patient.familyName, "Patient.FamilyName", "The patient's family name", LIMITS.name);
  const given = required(patient.givenNames, "Patient.GivenNames", "The patient's given names", LIMITS.name);
  const gender = [0, 10, 20].includes(patient.gender) ? patient.gender : 0;
  if (![0, 10, 20].includes(patient.gender)) problems.push(gap("Patient.Gender", "Sex", "Sex should be 0 (not stated), 10 (male) or 20 (female); not stated will be sent.", "note"));
  else if (gender === 0) problems.push(gap("Patient.Gender", "Sex", "Sex is not stated on the letter. Docman accepts this, but it helps it find the patient.", "note"));
  const birth = isoDay(patient.birthDate);
  if (!text(patient.birthDate)) problems.push(gap("Patient.BirthDate", "Date of birth", "The date of birth is needed."));
  else if (!birth) problems.push(gap("Patient.BirthDate", "Date of birth", "The date of birth is not a real date."));
  else if (birth.getTime() > now.getTime()) problems.push(gap("Patient.BirthDate", "Date of birth", "The date of birth is in the future."));

  const description = required(doc.description, "Document.Description", "The description", LIMITS.description);
  const event = isoDay(doc.eventDate);
  if (!text(doc.eventDate)) problems.push(gap("Document.EventDate", "The letter's date", "The date of the letter is needed."));
  else if (!event) problems.push(gap("Document.EventDate", "The letter's date", "The date of the letter is not a real date."));
  else if (event.getTime() > now.getTime()) problems.push(gap("Document.EventDate", "The letter's date", "The date of the letter is in the future, which Docman refuses."));
  const folder = optional(doc.folder, "Document.Folder", "The folder", LIMITS.folder);
  const filing = optional(doc.filingSectionFolder, "Document.FilingSectionFolder", "The filing folder", LIMITS.folder);
  const extension = text(doc.fileExtension).replace(/^\./, "").toLowerCase();
  if (!extension) problems.push(gap("Document.FileExtension", "File type", "The file type is needed."));
  else if (!DOCMAN_EXTENSIONS.includes(extension)) problems.push(gap("Document.FileExtension", "File type", `Docman does not accept .${extension} files (it takes ${DOCMAN_EXTENSIONS.join(", ")}).`));
  if (!fileReady) problems.push(gap("Document.FileContent", "The letter's file", "The letter's file is not attached."));

  const notes = optional(draft.notes, "Notes", "The note", LIMITS.notes);

  const { codes, notReady } = clinicalCodesFrom(draft.clinicalCodes || []);
  for (const c of notReady) problems.push(gap("ClinicalCodes", `Code for ${c.source}`, `${c.source}: ${c.reason}. It is left out of what is sent.`, "note"));

  const payload = {
    CaptureSource: 2,
    Sender: senderOut,
    RecipientOdsCode: recipient,
    Patient: { Identifier: identifier, FamilyName: family, GivenNames: given, Gender: gender, BirthDate: text(patient.birthDate) },
    Document: { Description: description, EventDate: text(doc.eventDate), FileExtension: extension, ...(folder ? { Folder: folder } : {}), ...(filing ? { FilingSectionFolder: filing } : {}), ...(text(doc.externalSystemId) ? { ExternalSystemId: text(doc.externalSystemId) } : {}) },
    ActionRequired: Boolean(draft.actionRequired),
    MedicationChanged: Boolean(draft.medicationChanged),
    Urgent: Boolean(draft.urgent),
    ...(codes.length ? { ClinicalCodes: codes } : {}),
    ...(notes ? { Notes: notes } : {}),
  };
  const blocking = problems.filter((p) => p.severity === "blocks");
  return { payload, problems, blocking, ready: blocking.length === 0, codes: { sent: codes, notReady } };
}

// Plain counts for a heading: "6 things stop it being sent, 3 notes"
export function readinessSummary(result) {
  const blocking = result.blocking.length;
  const notes = result.problems.length - blocking;
  if (!blocking) return `Everything Docman needs is there${notes ? ` (${notes} note${notes === 1 ? "" : "s"} below)` : ""}.`;
  return `${blocking} thing${blocking === 1 ? " stops" : "s stop"} it being sent to Docman${notes ? `, and ${notes} note${notes === 1 ? "" : "s"}` : ""}.`;
}
