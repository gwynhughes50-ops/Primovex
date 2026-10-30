import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { analyseClinFlowOcr } from "../src/modules/clinflow/clinflowAnalysisService.js";
import { decide, emptyReview, optionsFor, reviewCandidates } from "../src/modules/clinflow/clinflowCodeReview.js";
import { createClinFlowDocmanPdfBlob, docmanSummaryLines } from "../src/modules/clinflow/clinflowSummaryExportService.js";
import { DOCMAN_ACTION_NONE, DOCMAN_ACTION_PREFIX, DOCMAN_ACTION_YES, DOCMAN_AVOID, DOCMAN_HEADING, DOCMAN_INTELLISENSE } from "../src/modules/clinflow/clinflowDocmanTemplates.js";

let n = 0;
const t = async (name, fn) => { await fn(); n += 1; console.log(`ok  ${name}`); };
const E = (o = {}) => ({ patientName: "Idris Parry", diagnoses: ["Hyponatraemia", "Hypertension"], currentMedications: ["Ramipril 5mg"], medicationInstructions: [], actions: [], observations: ["C-reactive protein 24 mg/L"], clinicalConclusion: null, documentUrgent: false, medicationChangePresent: false, safetyNettingAdvice: null, ...o });
const CONTENT = "Mr Parry was seen today. C-reactive protein 24 mg/L. Hyponatraemia, sodium 129. Hypertension continues on ramipril 5mg. No action is required from the GP.";
const letter = (llm = E(), extra = {}) => {
  const ocr = { content: CONTENT, fileName: "NO-ACTION-test.pdf", document: { id: "x" }, llmExtraction: llm };
  const analysis = analyseClinFlowOcr(ocr);
  const candidates = reviewCandidates(analysis, CONTENT);
  return { document: { id: "d1", title: "Test letter", syntheticOcr: ocr, clinflowAnalysis: analysis, ...extra }, candidates };
};
const accept = (doc, candidates, pickFn) => {
  let review = emptyReview();
  candidates.forEach((c) => { const d = pickFn(c); if (d) review = decide(review, c, d, { uid: "u1", name: "Sam Jones", now: new Date("2026-10-27T10:00:00Z"), pick: d === "accepted" ? optionsFor(c, null)[0] || null : null }); });
  return { ...doc, codeReview: review };
};
const text = (blob) => blob.arrayBuffer().then((b) => Buffer.from(b).toString("latin1"));

await t("only the codes a person accepted are listed, one per line in the same shape; removed and unchecked suggestions never appear", () => {
  const { document, candidates } = letter();
  assert.ok(candidates.length >= 2, "the letter gives several suggested codes");
  const crp = candidates.find((c) => /C-reactive|crp/i.test(`${c.preferredTerm} ${c.searchTerm} ${c.sourceValue}`));
  const other = candidates.find((c) => c !== crp);
  assert.ok(crp && optionsFor(crp, null)[0]?.conceptId === "55235003", "CRP has the practice's code");
  const doc = accept(document, candidates, (c) => (c === crp ? "accepted" : c === other ? "removed" : null));
  const lines = docmanSummaryLines(doc);
  assert.equal(lines.codes.length, 1);
  assert.match(lines.codes[0], /^SNOMED 55235003 - .+/);
  assert.ok(!lines.codes.join(" ").includes(String(other.preferredTerm || other.searchTerm)), "a removed code is not listed");
  assert.equal(lines.codesNote, "");
});

await t("no codes checked says so, and a coder who removed everything says there are none to add", () => {
  const { document, candidates } = letter();
  assert.equal(docmanSummaryLines(document).codesNote, "Codes have not been checked.");
  const all = accept(document, candidates, () => "removed");
  assert.equal(docmanSummaryLines(all).codesNote, "No codes to add.");
});

await t("a letter a person confirmed as no action says so; urgent and a medicine change are shown; the patient's details are only those on the letter", () => {
  const { document } = letter();
  const nfw = docmanSummaryLines({ ...document, triageReview: { status: "human_confirmed", confirmedDecision: "no_workflow" } });
  assert.deepEqual(nfw.actions, ["No action needed from the practice."]);
  const action = docmanSummaryLines(letter(E({ actions: ["Repeat sodium in two weeks"] })).document);
  assert.deepEqual(action.actions, ["Repeat sodium in two weeks"]);
  const urgent = docmanSummaryLines(letter(E({ documentUrgent: true })).document);
  assert.equal(urgent.urgent, true);
  const meds = docmanSummaryLines(letter(E({ medicationChangePresent: true, medicationInstructions: ["Stop ramipril"] })).document);
  assert.deepEqual(meds.medicineChange, ["Stop ramipril"]);
  assert.ok(nfw.facts.some(([label, value]) => label === "Patient" && value === "Idris Parry"));
  assert.ok(!nfw.facts.some(([label]) => /NHS number|Date of birth/.test(label)), "nothing is shown that is not known");
});

await t("the filed PDF is one clean page then the original: headings are fixed, and none of ClinFlow's working or caveats are in it", async () => {
  const { document, candidates } = letter();
  const doc = accept({ ...document, triageReview: { status: "human_confirmed", confirmedDecision: "no_workflow" } }, candidates, (c) => (/C-reactive|crp/i.test(`${c.preferredTerm} ${c.searchTerm} ${c.sourceValue}`) ? "accepted" : "removed"));
  const original = await PDFDocument.create(); original.addPage([595, 842]); original.addPage([595, 842]);
  const result = await createClinFlowDocmanPdfBlob(doc, new Blob([await original.save()], { type: "application/pdf" }));
  assert.equal(result.appendedOriginal, true);
  const merged = await PDFDocument.load(await result.blob.arrayBuffer());
  assert.equal(merged.getPageCount(), 3, "one summary page, then the two pages of the letter");
  const body = await text(result.blob);
  for (const heading of ["LETTER SUMMARY", "ACTION NEEDED", "MEDICINES", "CODES TO ADD"]) assert.ok(body.includes(heading), heading);
  assert.ok(body.includes("SNOMED 55235003"), "the accepted code is on the page");
  for (const noise of ["CODE NOT VERIFIED", "NFWF", "confidence", "unverified", "must be verified", "CLINICIAN ACCEPTANCE", "Blocker", "ClinFlow reasoning"]) assert.ok(!body.includes(noise), `${noise} must not be in the filed PDF`);
  assert.match(result.fileName, /-clinflow-docman\.pdf$/);
});

await t("filing and finishing use the clean PDF, and the full evidence PDF is still a separate download", () => {
  const ws = readFileSync(new URL("../src/modules/clinflow/ClinFlowWorkspace.jsx", import.meta.url), "utf8");
  assert.match(ws, /const built = await createClinFlowDocmanPdfBlob\(selected, originalBlob\);\s+const result = await deliverDocmanPdf/);
  assert.match(ws, /summary = await createClinFlowDocmanPdfBlob\(selected, originalBlob\);/, "the finished pack holds the clean PDF");
  assert.match(ws, /downloadClinFlowSummaryPdf\(selected, originalBlob\)/, "Summary PDF is still the full evidence version");
  const ready = readFileSync(new URL("../src/modules/clinflow/DocmanReadiness.jsx", import.meta.url), "utf8");
  assert.match(ready, /Download the full evidence PDF instead/);
});

await t("the summary page carries the fixed lines Docman's Intellisense templates look for, and only when they are true", async () => {
  const { document } = letter();
  const nfw = { ...document, triageReview: { status: "human_confirmed", confirmedDecision: "no_workflow" } };
  const yes = { ...document, triageReview: { status: "human_confirmed", confirmedDecision: "workflow_required" } };
  assert.equal(docmanSummaryLines(nfw).practiceAction, "NONE");
  assert.equal(docmanSummaryLines(yes).practiceAction, "YES");
  assert.equal(docmanSummaryLines(letter(E({ actions: ["Repeat sodium in two weeks"] })).document).practiceAction, "YES", "an action on the letter, not yet confirmed");
  assert.equal(docmanSummaryLines({ ...yes, triageReview: { status: "human_confirmed", confirmedDecision: "no_workflow" } }).practiceAction, "NONE", "the person's confirmation wins over an action the reader listed");
  assert.equal(docmanSummaryLines(document).practiceAction, "", "not decided: no line, so no template fires on a guess");
  const original = await PDFDocument.create(); original.addPage([595, 842]);
  const bytes = new Uint8Array(await original.save());
  const lineOf = async (doc) => (await text((await createClinFlowDocmanPdfBlob(doc, new Blob([bytes], { type: "application/pdf" }))).blob));
  const nfwPdf = await lineOf(nfw); const yesPdf = await lineOf(yes); const noneYet = await lineOf(document);
  assert.ok(nfwPdf.includes(DOCMAN_HEADING) && yesPdf.includes(DOCMAN_HEADING) && noneYet.includes(DOCMAN_HEADING), "every summary has the heading");
  assert.ok(nfwPdf.includes(DOCMAN_ACTION_NONE) && !nfwPdf.includes(DOCMAN_ACTION_YES));
  assert.ok(yesPdf.includes(DOCMAN_ACTION_YES) && !yesPdf.includes(DOCMAN_ACTION_NONE));
  assert.ok(!noneYet.includes(DOCMAN_ACTION_PREFIX), "undecided: neither line");
});

await t("the Intellisense keywords can never fire on the wrong summary", () => {
  const keywords = DOCMAN_INTELLISENSE.flatMap((tpl) => tpl.keywords.map((k) => k.toLowerCase()));
  assert.equal(new Set(keywords).size, keywords.length, "no two templates share a keyword");
  for (const a of keywords) for (const b of keywords) if (a !== b) assert.ok(!a.includes(b), `"${b}" is inside "${a}": one template would fire on both`);
  for (const avoided of DOCMAN_AVOID) for (const k of keywords) assert.notEqual(k, avoided.toLowerCase(), "a word that is on every summary is never a keyword");
  assert.ok(!DOCMAN_ACTION_NONE.toLowerCase().includes(DOCMAN_ACTION_YES.toLowerCase()) && !DOCMAN_ACTION_YES.toLowerCase().includes(DOCMAN_ACTION_NONE.toLowerCase()));
  for (const tpl of DOCMAN_INTELLISENSE) for (const k of tpl.keywords) assert.ok(k.length <= 60 && !/\n/.test(k), "one short line");
  assert.ok(DOCMAN_INTELLISENSE.every((tpl) => tpl.match === "Any" && tpl.name.startsWith("ClinFlow: ")), "named so they can be found and checked for duplicates in Docman");
});

console.log(`\n${n} passed`);
