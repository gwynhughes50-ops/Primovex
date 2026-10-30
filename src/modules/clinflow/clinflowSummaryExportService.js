import { jsPDF } from "jspdf";
import { PDFDocument } from "pdf-lib";
import { SNOMED_NOTICE } from "./snomedIndex";
import { reviewCandidates, reviewOutcome } from "./clinflowCodeReview";
import { DOCMAN_ACTION_PREFIX, DOCMAN_HEADING } from "./clinflowDocmanTemplates";
import { AI_OUTPUT_FOOTER, CLINICAL_DECISION_SUPPORT_BANNER, HIGH_RISK_BANNER, SYNTHETIC_TEST_BANNER, isRealAnalysedDocument } from "./clinflowDisclaimers";

const cleanFileName = (value) => String(value || "clinflow-summary").replace(/[^a-z0-9._-]+/gi, "-").replace(/-+/g, "-").slice(0, 90);

// What the coder did with the suggested codes, one line each: the accepted codes with who accepted them, then what was removed and what is still waiting
const shortDay = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB"); };
function codingLines(coding) {
  const out = coding.accepted.map((c) => `${c.term}${c.value ? ` ${c.value}` : ""}${c.calculated ? " (calculated by ClinFlow)" : ""} — SNOMED ${c.conceptId || "no code"}${c.descriptionId ? ` (description ${c.descriptionId})` : ""} — ${c.added ? "added" : "accepted"} by ${c.by || "a clinician"}${c.at ? ` on ${shortDay(c.at)}` : ""}`);
  if (coding.removed.length) out.push(`Removed by the coder: ${coding.removed.join("; ")}`);
  if (coding.waiting.length) out.push(`NOT YET CHECKED (${coding.waiting.length}): ${coding.waiting.join("; ")}`);
  return out;
}

// A short, scannable cover sheet — key facts as a two-column grid, then each
// question answered in one line, mirroring how a human reviewer actually
// wants to triage a letter at a glance. The exhaustive evidence trail
// (every extracted field, every terminology candidate) still follows on the
// pages after it for anyone who needs to check the working.
function drawCoverSheet(pdf, analysis, ocr, margin, width, coding) {
  const colWidth = width / 2;
  let y = 16;

  const realDocument = isRealAnalysedDocument(ocr);

  pdf.setFillColor(0, 94, 184);
  pdf.rect(0, 0, 210, 29, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(17);
  pdf.text("ClinFlow Summary Cover Sheet", margin, 13);
  pdf.setFontSize(8);
  pdf.text(realDocument ? CLINICAL_DECISION_SUPPORT_BANNER : SYNTHETIC_TEST_BANNER, margin, 21);
  y = 37;

  const urgent = Boolean(analysis.docmanDraft?.urgent);
  const medicationChanged = Boolean(analysis.docmanDraft?.medicationChanged);
  if (urgent || medicationChanged) {
    pdf.setFillColor(255, 235, 230);
    pdf.setDrawColor(217, 45, 32);
    pdf.rect(margin, y, width, 9, "FD");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(159, 38, 29);
    pdf.text(HIGH_RISK_BANNER, margin + 3, y + 6.2);
    y += 14;
  }

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(90, 105, 125);
  pdf.text(`Generated: ${new Date().toLocaleString("en-GB")}`, margin, y);
  y += 5;
  pdf.text(`Source file: ${ocr.fileName || "Unknown"}`, margin, y);
  y += 10;

  const patientName = [analysis.patient?.givenNames, analysis.patient?.familyName].filter(Boolean).join(" ");
  const destination = analysis.triage?.destination || analysis.workflowDecision?.suggestedDestination || "Workflow review";
  const confidence = `${Math.round((analysis.triage?.confidence || 0) * 100)}%`;

  const keyFactRow = (leftLabel, leftValue, rightLabel, rightValue) => {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.5);
    pdf.setTextColor(90, 105, 125);
    pdf.text(leftLabel.toUpperCase(), margin, y);
    pdf.text(rightLabel.toUpperCase(), margin + colWidth, y);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10.5);
    pdf.setTextColor(20, 39, 63);
    const leftRows = pdf.splitTextToSize(leftValue || "—", colWidth - 8);
    const rightRows = pdf.splitTextToSize(rightValue || "—", colWidth - 8);
    pdf.text(leftRows, margin, y + 5);
    pdf.text(rightRows, margin + colWidth, y + 5);
    y += 5 + Math.max(leftRows.length, rightRows.length) * 4.3 + 5.5;
  };

  keyFactRow("Patient", patientName ? `${patientName} (unverified OCR extraction)` : "Unknown patient", "Date of birth", "Not available / must be verified");
  keyFactRow("NHS number", "Not available / must be verified", "Specialty", analysis.specialty || "Not stated");
  keyFactRow("Letter type", analysis.documentType || "Correspondence", "Suggested destination", destination);
  keyFactRow("Correspondence priority (suggested — verify)", urgent ? "Urgent" : "Routine", "AI confidence", confidence);

  y += 3;
  pdf.setDrawColor(226, 221, 208);
  pdf.line(margin, y, margin + width, y);
  y += 8;

  const section = (title, body) => {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.setTextColor(0, 94, 184);
    pdf.text(title, margin, y);
    y += 5.5;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.5);
    pdf.setTextColor(20, 39, 63);
    const rows = pdf.splitTextToSize(String(body || "—"), width);
    pdf.text(rows, margin, y);
    y += rows.length * 4.3 + 7;
  };

  const bulletSection = (title, items, emptyText) => {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.setTextColor(0, 94, 184);
    pdf.text(title, margin, y);
    y += 5.5;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.5);
    pdf.setTextColor(20, 39, 63);
    if (!items.length) {
      const rows = pdf.splitTextToSize(emptyText, width);
      pdf.text(rows, margin, y);
      y += rows.length * 4.3 + 7;
      return;
    }
    items.forEach((item) => {
      const rows = pdf.splitTextToSize(item, width - 6);
      pdf.text("•", margin, y);
      pdf.text(rows, margin + 5, y);
      y += rows.length * 4.3 + 2;
    });
    y += 5;
  };

  if (analysis.clinicalConclusion) {
    section("Consultant's / author's conclusion", analysis.clinicalConclusion);
  } else {
    const keyFindings = [...analysis.diagnoses, ...analysis.observations].slice(0, 3).map((item) => item.value);
    section("Summary", keyFindings.length ? `${keyFindings.join("; ")}.` : "No clinical findings were extracted with confidence — review the original document.");
  }

  const safetyNetActions = (analysis.actions || []).filter((item) => item.kind === "safety-net");
  const safetyNetText = analysis.safetyNettingAdvice || (safetyNetActions.length ? safetyNetActions.map((item) => item.value).join("; ") : "");
  section("Safety flag", urgent
    ? "Urgent wording detected in this letter — verify immediately before filing."
    : safetyNetText
      ? `Not flagged as document-urgent. Conditional safety-net advice present: ${safetyNetText} — verify this is actioned if it applies.`
      : "No urgent or safety-net wording detected. Human review is still required.");

  section("Actions required", analysis.actions?.length ? analysis.actions.map((item) => item.value).join("; ") : "No action listed.");

  const currentMeds = analysis.currentMedications?.length ? analysis.currentMedications : analysis.medicines;
  section("Current / relevant medication", currentMeds?.length ? currentMeds.map((item) => item.value).join("; ") : "None extracted.");

  section("Medication changes", analysis.docmanDraft?.medicationChanged
    ? `Lasting change identified: ${(analysis.medicationInstructions?.length ? analysis.medicationInstructions : analysis.medicines)?.map((item) => item.value).join("; ")}`
    : analysis.medicationInstructions?.length
      ? `No lasting medication change identified. Temporary/test-preparation instructions only: ${analysis.medicationInstructions.map((item) => item.value).join("; ")}`
      : "No medication changes identified.");

  if (coding?.touched) bulletSection("SNOMED codes checked by the coder", codingLines(coding), "No codes accepted.");
  else bulletSection("SNOMED suggestions", (analysis.terminologyCandidates || []).slice(0, 10).map((item) => item.conceptId
    ? `${item.preferredTerm || item.searchTerm} — candidate concept ${item.conceptId} (clinician acceptance required)`
    : `${item.searchTerm} — code not verified`), "No SNOMED suggestions.");

  const nfwf = analysis.nfwfAssessment || {};
  section("NFWF assessment", `Score: ${nfwf.score || 0}% · Category: ${nfwf.category || "Human review required"}${nfwf.reasons?.length ? ` · Reasons: ${nfwf.reasons.join("; ")}` : ""}${nfwf.blockers?.length ? ` · Blockers: ${nfwf.blockers.join("; ")}` : " · Blockers: None"}`);

  const workflow = analysis.workflowDecision || {};
  section("ClinFlow reasoning", `Likely ${(workflow.category || "requires human review").toLowerCase()}${workflow.stillNeedsWorkflow ? ` — still needs workflow: ${workflow.stillNeedsWorkflow}` : ""}.`);

  pdf.setFont("helvetica", "italic");
  pdf.setFontSize(7.5);
  pdf.setTextColor(90, 105, 125);
  const footerRows = pdf.splitTextToSize(`${AI_OUTPUT_FOOTER} Full evidence trail follows on subsequent pages.`, width);
  pdf.text(footerRows, margin, 292 - (footerRows.length - 1) * 3.5);
}

function buildClinFlowSummaryPdf(document) {
  const analysis = document?.clinflowAnalysis;
  const ocr = document?.syntheticOcr;
  if (!analysis || !ocr) throw new Error("No ClinFlow analysis is available for this document.");

  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 16;
  const width = 210 - margin * 2;

  const coding = reviewOutcome(reviewCandidates(analysis, ocr?.content), document.codeReview);
  drawCoverSheet(pdf, analysis, ocr, margin, width, coding);
  pdf.addPage();

  let y = 16;
  const line = (text, options = {}) => {
    const size = options.size || 9;
    pdf.setFont("helvetica", options.bold ? "bold" : "normal");
    pdf.setFontSize(size);
    pdf.setTextColor(...(options.colour || [20, 39, 63]));
    const rows = pdf.splitTextToSize(String(text || "—"), width);
    if (y + rows.length * (size * 0.42 + 1.5) > 280) { pdf.addPage(); y = 16; }
    pdf.text(rows, margin, y);
    y += rows.length * (size * 0.42 + 1.5) + (options.after ?? 2);
  };
  const heading = (text) => { y += 2; line(text.toUpperCase(), { size: 9, bold: true, colour: [0, 94, 184], after: 2 }); };

  pdf.setFillColor(0, 94, 184);
  pdf.rect(0, 0, 210, 29, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(17);
  pdf.text("PRIMOVEX CLINFLOW — FULL EVIDENCE TRAIL", margin, 13);
  pdf.setFontSize(8);
  pdf.text(isRealAnalysedDocument(ocr) ? CLINICAL_DECISION_SUPPORT_BANNER : SYNTHETIC_TEST_BANNER, margin, 21);
  y = 37;

  line(`Source document: ${document.title}`, { bold: true, size: 12 });
  line(`Source file: ${ocr.fileName}`);
  line(`Azure analysis ID: ${ocr.analysisId}`);
  line(`Document type: ${analysis.documentType}`);
  line(`OCR evidence: ${ocr.pageCount} page(s), ${ocr.wordCount} words, ${Math.round((ocr.averageConfidence || 0) * 100)}% average word confidence`);

  heading("Patient identity — unverified");
  line(`Extracted name: ${analysis.patient.givenNames} ${analysis.patient.familyName}`);
  line("NHS number: Not available / must be verified");
  line("Date of birth: Not available / must be verified");

  if (analysis.clinicalConclusion || analysis.safetyNettingAdvice) {
    heading("Consultant's / author's conclusion and safety-netting");
    if (analysis.clinicalConclusion) line(`Conclusion: ${analysis.clinicalConclusion}`);
    if (analysis.safetyNettingAdvice) line(`Conditional safety-net advice (does not by itself make this document urgent): ${analysis.safetyNettingAdvice}`);
  }

  heading("Key extracted information");
  [...analysis.diagnoses, ...analysis.observations, ...analysis.medicines, ...analysis.actions].forEach((item) => {
    line(`${item.detected ? "[DETECTED]" : "[REVIEW]"} ${item.label}: ${item.value}`);
  });

  heading("Workflow flags — suggestions only");
  line(`Urgent: ${analysis.docmanDraft.urgent ? "Yes — verify" : "No urgent trigger detected — verify"}`);
  line(`Action required: ${analysis.docmanDraft.actionRequired ? "Yes — verify" : "Not detected — verify"}`);
  line(`Medication changed: ${analysis.docmanDraft.medicationChanged ? "Possible change — verify" : "No change trigger detected — verify"}`);
  line(`ClinFlow triage suggestion: ${analysis.triage?.label || "Human review required"} · ${Math.round((analysis.triage?.confidence || 0) * 100)}% confidence · HUMAN CONFIRMATION REQUIRED`);
  line(`Suggested destination: ${analysis.triage?.destination || "Workflow review"}`);
  line(`Still needs workflow: ${analysis.workflowDecision?.stillNeedsWorkflow || "Maybe"} · ${analysis.workflowDecision?.category || "Human review required"}`);
  analysis.triage?.reasons?.forEach((item) => line(`${item.label}: ${item.detail}`));

  heading("NFWF assessment — suggestion only");
  line(`Score: ${analysis.nfwfAssessment?.score || 0}% · ${analysis.nfwfAssessment?.category || "Human review required"}`);
  analysis.nfwfAssessment?.reasons?.forEach((item) => line(`Reason: ${item}`));
  analysis.nfwfAssessment?.blockers?.forEach((item) => line(`Blocker: ${item}`));

  heading("SNOMED CT review");
  if (coding.touched) {
    line("Codes checked by the coder (these are the codes for Docman):", { bold: true, after: 1 });
    codingLines(coding).forEach((entry) => line(`• ${entry}`));
    line("The reader's own suggestions, before checking:", { bold: true, after: 1 });
  }
  analysis.structuredObservations?.forEach((item) => {
    if (item.type === "blood_pressure") {
      line(`• ${item.preferredTerm}: ${item.systolic.value}/${item.diastolic.value} ${item.unit.display}`, { bold: true, after: 1 });
      line(`    Candidate concepts - blood pressure ${item.conceptId}; systolic ${item.systolic.conceptId}; diastolic ${item.diastolic.conceptId}; UCUM ${item.unit.ucumCode}. CURRENT UK EDITION VALIDATION AND CLINICIAN ACCEPTANCE REQUIRED.`);
    } else {
      line(`• ${item.preferredTerm}: ${item.value} ${item.unit.display}`, { bold: true, after: 1 });
      line(`    Candidate concept ${item.conceptId}; UCUM ${item.unit.ucumCode}. CURRENT UK EDITION VALIDATION AND CLINICIAN ACCEPTANCE REQUIRED.`);
    }
  });
  if (!analysis.terminologyCandidates.length) line("No SNOMED candidate terms generated from the controlled extraction.");
  analysis.terminologyCandidates.forEach((item) => {
    const code = item.conceptId
      ? `${item.preferredTerm || item.searchTerm} · Concept ${item.conceptId} · ${item.acceptedByUid ? "CLINICIAN ACCEPTED" : "CANDIDATE - CLINICIAN ACCEPTANCE REQUIRED"}`
      : `${item.searchTerm} · CODE NOT VERIFIED`;
    line(`• ${code}`);
  });
  line(SNOMED_NOTICE, { size: 6.5, colour: [90, 105, 125] });

  heading("Medicines terminology review");
  if (!analysis.medicationCandidates?.length) line("No medicine terminology candidates were generated.");
  analysis.medicationCandidates?.forEach((item) => line(`${item.searchTerm} · dm+d CODE NOT VERIFIED`));

  heading("Wales and England quality / register review");
  line(`Confirmed opportunities from this letter alone: ${analysis.qaifOpportunities?.length || 0}`);
  line(`Prompt relevance: ${analysis.qualityAwareness?.relevance || "Low"}. These are record-check prompts, not confirmed QAIF/QOF opportunities.`);
  if (!analysis.qualityPrompts?.length) line("No governed quality review prompts were generated.");
  analysis.qualityPrompts?.forEach((item) => {
    line(`${item.title} (${item.domain})`, { bold: true, after: 1 });
    line(`${item.rationale} Next: ${item.nextStep}`);
  });

  heading("Clinician verification");
  line("I have compared this summary with the original document and verified the patient identity, clinical meaning, urgency, actions, medicines and any accepted SNOMED CT codes.");
  y += 5;
  line("Clinician name: ________________________________________");
  line("Role / registration: ____________________________________");
  line("Signature: _____________________________________________");
  line("Date and time: __________________________________________");

  pdf.setFontSize(7);
  pdf.setTextColor(90, 105, 125);
  const evidenceFooterRows = pdf.splitTextToSize(`${AI_OUTPUT_FOOTER} A copy of the original letter follows this summary where available.`, width);
  pdf.text(evidenceFooterRows, margin, 292 - (evidenceFooterRows.length - 1) * 3.5);

  pdf.addPage();
  pdf.setFillColor(0, 94, 184);
  pdf.rect(0, 0, 210, 29, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(17);
  pdf.text("APPENDIX — COPY OF ORIGINAL LETTER", margin, 13);
  pdf.setFontSize(8);
  pdf.text("UNALTERED SOURCE DOCUMENT FOLLOWS", margin, 21);
  pdf.setTextColor(20, 39, 63);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text(pdf.splitTextToSize("The page(s) below are an unaltered copy of the original document this summary was generated from.", width), margin, 42);

  return {
    bytes: pdf.output("arraybuffer"),
    fileName: `${cleanFileName(ocr.fileName?.replace(/\.pdf$/i, ""))}-primovex-clinflow-summary.pdf`,
  };
}

// Appends the real, unaltered pages of the original letter (not another OCR
// pass) after the summary using pdf-lib, since jsPDF can only draw new
// content and can't import an existing PDF's pages. Falls back to the
// summary alone if the original can't be read, so a merge failure never
// blocks a clinician from getting the summary itself.
async function mergeOriginalCopy(summaryArrayBuffer, originalBlob) {
  if (!(originalBlob instanceof Blob)) return { blob: new Blob([summaryArrayBuffer], { type: "application/pdf" }), appended: false };
  try {
    const summaryDoc = await PDFDocument.load(summaryArrayBuffer);
    const originalBytes = new Uint8Array(await originalBlob.arrayBuffer());
    const originalDoc = await PDFDocument.load(originalBytes);
    const copiedPages = await summaryDoc.copyPages(originalDoc, originalDoc.getPageIndices());
    copiedPages.forEach((page) => summaryDoc.addPage(page));
    const mergedBytes = await summaryDoc.save();
    return { blob: new Blob([mergedBytes], { type: "application/pdf" }), appended: true };
  } catch (error) {
    console.error("ClinFlow summary: could not append a copy of the original letter", error);
    return { blob: new Blob([summaryArrayBuffer], { type: "application/pdf" }), appended: false };
  }
}

function buildClinFlowDemoPdf(document) {
  if (!document?.id) throw new Error("No ClinFlow document is selected.");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 16;
  const width = 210 - margin * 2;
  let y = 38;
  const line = (value, options = {}) => {
    pdf.setFont("helvetica", options.bold ? "bold" : "normal");
    pdf.setFontSize(options.size || 10);
    pdf.setTextColor(...(options.colour || [20, 39, 63]));
    const rows = pdf.splitTextToSize(String(value || "—"), width);
    pdf.text(rows, margin, y);
    y += rows.length * 5 + (options.after ?? 3);
  };

  pdf.setFillColor(0, 94, 184);
  pdf.rect(0, 0, 210, 29, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(17);
  pdf.text("PRIMOVEX CLINFLOW DOCUMENT", margin, 13);
  pdf.setFontSize(8);
  pdf.text("SYNTHETIC DEMONSTRATION · NOT FOR CLINICAL USE", margin, 21);

  line(document.title, { bold: true, size: 14 });
  line(`Patient: ${document.patient || "Not supplied"}`);
  line(`NHS number: ${document.nhs || "Not supplied"}`);
  line(`Date of birth: ${document.dob || "Not supplied"}`);
  line(`Source: ${document.source || "Not supplied"}`);
  line(`Received: ${document.received || "Not supplied"}`);
  line(`Priority: ${document.priority || "routine"}`);
  line(`Workflow destination: ${document.destination || "Workflow review"}`);
  line(`Workflow status: ${document.status || "awaiting review"}`);
  y += 4;
  line("This export represents the synthetic ClinFlow demonstration record. It is not the original clinical document and must not be used for patient care.", { colour: [160, 45, 35] });
  return {
    blob: pdf.output("blob"),
    fileName: `${cleanFileName(document.title)}-synthetic-clinflow-document.pdf`,
  };
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = globalThis.document.createElement("a");
  link.href = url;
  link.download = fileName;
  globalThis.document.body.appendChild(link);
  link.click();
  link.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// The clean version of the summary that is filed in Docman with the letter. It is written to be read by a person or by Docman's own reader: plain facts under fixed
// headings, the codes a person accepted one per line in the same shape every time, and none of ClinFlow's working, scores, caveats or codes that were not accepted.
// The full evidence version (every candidate, the reasoning, the checks) is a separate download and stays out of the patient's record.
const oneLine = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
// How Docman reads UK paperwork: dates as 27/10/2026 and an NHS number as 485 777 3456 (the page used 2026-10-27 and ten digits run together)
export const ukDateText = (value) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? "")); return m ? `${m[3]}/${m[2]}/${m[1]}` : oneLine(value); };
export const nhsNumberText = (value) => { const d = String(value ?? "").replace(/\s+/g, ""); return /^\d{10}$/.test(d) ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : oneLine(value); };

export function docmanSummaryLines(document) {
  const analysis = document?.clinflowAnalysis;
  const ocr = document?.syntheticOcr;
  if (!analysis || !ocr) throw new Error("No ClinFlow analysis is available for this document.");
  const coding = reviewOutcome(reviewCandidates(analysis, ocr?.content), document.codeReview);
  const patient = analysis.patient || {};
  const confirmed = document.triageReview?.status === "human_confirmed" ? document.triageReview.confirmedDecision : null;
  const urgent = Boolean(analysis.docmanDraft?.urgent) || confirmed === "urgent";
  const findings = [...(analysis.diagnoses || []), ...(analysis.observations || [])].slice(0, 3).map((item) => oneLine(item.value)).filter(Boolean);
  const actions = (analysis.actions || []).filter((item) => item.kind !== "safety-net").map((item) => oneLine(item.value)).filter(Boolean);
  const meds = (analysis.currentMedications?.length ? analysis.currentMedications : analysis.medicines || []).map((item) => oneLine(item.value)).filter(Boolean);
  const instructions = (analysis.medicationInstructions?.length ? analysis.medicationInstructions : analysis.medicines || []).map((item) => oneLine(item.value)).filter(Boolean);
  const draftPatient = analysis.docmanDraft?.patient || {};
  const facts = [
    ["Patient", [patient.givenNames, patient.familyName].filter(Boolean).join(" ") || "Not stated on the letter"],
    ...(draftPatient.birthDate ? [["Date of birth", ukDateText(draftPatient.birthDate)]] : []),
    ...(draftPatient.identifier ? [["NHS number", nhsNumberText(draftPatient.identifier)]] : []),
    ["Letter type", analysis.documentType || "Correspondence"],
    ...(analysis.specialty && analysis.specialty !== analysis.documentType ? [["Specialty", analysis.specialty]] : []),
    ...(analysis.docmanDraft?.document?.eventDate ? [["Letter date", ukDateText(analysis.docmanDraft.document.eventDate)]] : []),
  ];
  const actionText = confirmed === "no_workflow" ? ["No action needed from the practice."]
    : actions.length ? actions
      : confirmed === "workflow_required" || analysis.docmanDraft?.actionRequired ? ["Action is needed: see the letter."]
        : ["No action listed."];
  const codes = coding.accepted.map((c) => `SNOMED ${c.conceptId || "no code"} - ${oneLine(c.term)}${c.value ? ` - ${oneLine(c.value)}` : ""}`);
  // One fixed line Docman's Intellisense templates can recognise (see DOCMAN_INTELLISENSE in clinflowDocmanTemplates.js): YES when the practice has something to do, NONE when the person confirmed it has not,
  // and nothing at all when that has not been decided, so a template never fires on a guess
  const practiceAction = confirmed === "no_workflow" ? "NONE" : confirmed === "workflow_required" || confirmed === "urgent" || actions.length || analysis.docmanDraft?.actionRequired ? "YES" : "";
  return {
    urgent,
    practiceAction,
    facts,
    summary: analysis.clinicalConclusion ? oneLine(analysis.clinicalConclusion) : findings.length ? `${findings.join("; ")}.` : "See the letter.",
    actions: actionText,
    medicineChange: analysis.docmanDraft?.medicationChanged ? instructions : [],
    medicines: meds,
    safetyNet: oneLine(analysis.safetyNettingAdvice || ""),
    codes,
    codesNote: codes.length ? "" : coding.touched ? "No codes to add." : "Codes have not been checked.",
  };
}

function buildClinFlowDocmanPdf(document) {
  const content = docmanSummaryLines(document);
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 18;
  const width = 210 - margin * 2;
  let y = 20;
  const write = (text, { size = 10.5, bold = false, after = 1.5 } = {}) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(size);
    pdf.setTextColor(0, 0, 0);
    const rows = pdf.splitTextToSize(String(text || ""), width);
    if (y + rows.length * (size * 0.42 + 1.4) > 276) { pdf.addPage(); y = 20; }
    pdf.text(rows, margin, y);
    y += rows.length * (size * 0.42 + 1.4) + after;
  };
  const heading = (text) => { y += 3; write(text, { size: 11, bold: true, after: 2 }); };
  const list = (items) => items.forEach((item) => write(`- ${item}`));

  write(DOCMAN_HEADING, { size: 16, bold: true, after: 4 });
  if (content.practiceAction) write(`${DOCMAN_ACTION_PREFIX}${content.practiceAction}`, { size: 11, bold: true, after: 3 });
  if (content.urgent) write("MARKED URGENT", { size: 12, bold: true, after: 3 });
  content.facts.forEach(([label, value]) => write(`${label}: ${value}`));
  heading("SUMMARY");
  write(content.summary);
  heading("ACTION NEEDED");
  list(content.actions);
  heading("MEDICINES");
  if (content.medicineChange.length) { write("Medicine change:", { bold: true }); list(content.medicineChange); } else write("No medicine change.");
  if (content.medicines.length) { write("Current medicines:", { bold: true }); list(content.medicines); }
  if (content.safetyNet) { heading("SAFETY-NET ADVICE"); write(content.safetyNet); }
  heading("CODES TO ADD");
  if (content.codes.length) list(content.codes); else write(content.codesNote);
  y += 6;
  write(`Prepared with ClinFlow and checked by a person on ${new Date().toLocaleDateString("en-GB")}. The original letter follows.`, { size: 8.5 });
  return {
    bytes: pdf.output("arraybuffer"),
    fileName: `${cleanFileName(ocrNameOf(document))}-clinflow-docman.pdf`,
  };
}

const ocrNameOf = (document) => String(document?.syntheticOcr?.fileName || document?.title || "letter").replace(/\.pdf$/i, "");

export async function createClinFlowDocmanPdfBlob(document, originalBlob) {
  const built = buildClinFlowDocmanPdf(document);
  const merged = await mergeOriginalCopy(built.bytes, originalBlob);
  return { blob: merged.blob, fileName: built.fileName, appendedOriginal: merged.appended };
}

export async function createClinFlowSummaryPdfBlob(document, originalBlob) {
  const built = buildClinFlowSummaryPdf(document);
  const merged = await mergeOriginalCopy(built.bytes, originalBlob);
  return { blob: merged.blob, fileName: built.fileName, appendedOriginal: merged.appended };
}

export function createClinFlowDemoPdfBlob(document) {
  return buildClinFlowDemoPdf(document);
}

export async function downloadClinFlowSummaryPdf(document, originalBlob) {
  const result = await createClinFlowSummaryPdfBlob(document, originalBlob);
  downloadBlob(result.blob, result.fileName);
  return result;
}

export function downloadClinFlowDemoPdf(document) {
  const result = buildClinFlowDemoPdf(document);
  downloadBlob(result.blob, result.fileName);
  return result;
}
