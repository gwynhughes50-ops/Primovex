// The hand-over of a coded letter to Docman 10X, as the person doing it sees it: the steps, in order, with what is done and what is left, and the
// details Docman asks for as separate fields that can each be copied. Pure (no screens). Nothing here sends anything to Docman.

const text = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const GENDER_WORDS = { 0: "Not stated", 10: "Male", 20: "Female" };
const yesNo = (v) => (v ? "Yes" : "No");
const spaced = (nhs) => { const d = text(nhs).replace(/\s+/g, ""); return /^\d{10}$/.test(d) ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : text(nhs); };
const ukDate = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? "")); return m ? `${m[3]}/${m[2]}/${m[1]}` : text(iso); };

// The fields of the Docman form, in the order they are filled in: [{ label, value, copy }]. `copy` is what a Copy button puts on the clipboard
// (an NHS number without spaces, a date the way Docman wants it).
export function handoverFields(result) {
  const p = result?.payload || {};
  const patient = p.Patient || {};
  const doc = p.Document || {};
  const rows = [
    { label: "NHS number", value: spaced(patient.Identifier), copy: text(patient.Identifier) },
    { label: "Family name", value: text(patient.FamilyName) },
    { label: "Given names", value: text(patient.GivenNames) },
    { label: "Date of birth", value: ukDate(patient.BirthDate), copy: ukDate(patient.BirthDate) },
    { label: "Sex", value: GENDER_WORDS[patient.Gender] ?? "Not stated" },
    { label: "Date of the letter", value: ukDate(doc.EventDate), copy: ukDate(doc.EventDate) },
    { label: "Description", value: text(doc.Description) },
    { label: "Folder", value: text(doc.FilingSectionFolder || doc.Folder) },
    { label: "Urgent", value: yesNo(p.Urgent) },
    { label: "Action required", value: yesNo(p.ActionRequired) },
    { label: "Medication changed", value: yesNo(p.MedicationChanged) },
    ...(p.Notes ? [{ label: "Note", value: text(p.Notes) }] : []),
  ];
  return rows.map((r) => ({ ...r, copy: r.copy ?? r.value, missing: !r.value }));
}

// The codes the coder accepted, as lines for Docman's clinical-codes box
export function handoverCodes(result) {
  return (result?.codes?.sent || []).map((c) => ({
    code: c.Code, description: c.Description, descriptionId: c.DescriptionId,
    line: `${c.Description} — SNOMED ${c.Code} (description ${c.DescriptionId})${c.Value ? ` — ${c.Value} ${c.ValueUnit || ""}`.trimEnd() : ""}`,
  }));
}

// Everything above as one block of plain text, for "Copy everything"
export function handoverText(result) {
  const lines = ["DOCMAN 10X — details for this letter", ""];
  for (const f of handoverFields(result)) lines.push(`${f.label}: ${f.value || "(not available)"}`);
  const codes = handoverCodes(result);
  lines.push("", `SNOMED codes accepted by the coder (${codes.length}):`);
  if (codes.length) codes.forEach((c) => lines.push(`- ${c.line}`)); else lines.push("- none yet");
  const left = (result?.codes?.notReady || []);
  if (left.length) { lines.push("", "Left out of the codes:"); left.forEach((c) => lines.push(`- ${c.source}: ${c.reason}`)); }
  return lines.join("\n");
}

// The steps, in the order a person does them: [{ id, done, text, detail }]
// outcome: reviewOutcome(...) from clinflowCodeReview; result: buildDocmanPayload(...)
export function handoverSteps(result, outcome) {
  const blockers = result?.blocking || [];
  const waiting = outcome?.waiting?.length || 0;
  const accepted = outcome?.accepted?.length || 0;
  return [
    { id: "details", done: blockers.length === 0, text: "Check the letter's details", detail: blockers.length ? `${blockers.length} thing${blockers.length === 1 ? "" : "s"} to put right first: ${blockers.slice(0, 3).map((b) => b.label).join(", ")}${blockers.length > 3 ? "…" : ""}.` : "Everything Docman asks for is there." },
    { id: "codes", done: waiting === 0 && accepted > 0, text: "Check the SNOMED codes", detail: waiting ? `${waiting} suggestion${waiting === 1 ? " is" : "s are"} not checked yet.` : accepted ? `${accepted} code${accepted === 1 ? "" : "s"} accepted by the coder.` : "No codes accepted yet." },
    { id: "download", done: false, text: "Download the Docman PDF", detail: "The summary with a copy of the original letter attached: one file, ready to drag in." },
    { id: "file", done: false, text: "Drag it into Docman and fill in the details below", detail: "Primovex does not send anything to Docman itself." },
  ];
}
