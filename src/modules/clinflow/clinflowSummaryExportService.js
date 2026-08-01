import { jsPDF } from "jspdf";

const cleanFileName = (value) => String(value || "clinflow-summary").replace(/[^a-z0-9._-]+/gi, "-").replace(/-+/g, "-").slice(0, 90);

export function downloadClinFlowSummaryPdf(document) {
  const analysis = document?.clinflowAnalysis;
  const ocr = document?.syntheticOcr;
  if (!analysis || !ocr) throw new Error("No ClinFlow analysis is available for this document.");

  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 16;
  const width = 210 - margin * 2;
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
  pdf.text("PRIMOVEX CLINFLOW REVIEW SUMMARY", margin, 13);
  pdf.setFontSize(8);
  pdf.text("SYNTHETIC TEST · NOT FOR CLINICAL USE · TRAINED CLINICIAN VERIFICATION REQUIRED", margin, 21);
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
  analysis.structuredObservations?.forEach((item) => {
    if (item.type === "blood_pressure") {
      line(`${item.preferredTerm}: ${item.systolic.value}/${item.diastolic.value} ${item.unit.display}`, { bold: true, after: 1 });
      line(`Candidate concepts - blood pressure ${item.conceptId}; systolic ${item.systolic.conceptId}; diastolic ${item.diastolic.conceptId}; UCUM ${item.unit.ucumCode}. CURRENT UK EDITION VALIDATION AND CLINICIAN ACCEPTANCE REQUIRED.`);
    } else {
      line(`${item.preferredTerm}: ${item.value} ${item.unit.display}`, { bold: true, after: 1 });
      line(`Candidate concept ${item.conceptId}; UCUM ${item.unit.ucumCode}. CURRENT UK EDITION VALIDATION AND CLINICIAN ACCEPTANCE REQUIRED.`);
    }
  });
  if (!analysis.terminologyCandidates.length) line("No SNOMED candidate terms generated from the controlled extraction.");
  analysis.terminologyCandidates.forEach((item) => {
    const code = item.conceptId
      ? `${item.preferredTerm || item.searchTerm} · Concept ${item.conceptId} · ${item.acceptedByUid ? "CLINICIAN ACCEPTED" : "CANDIDATE - CLINICIAN ACCEPTANCE REQUIRED"}`
      : `${item.searchTerm} · CODE NOT VERIFIED`;
    line(code);
  });

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
  pdf.text("Generated locally by Primovex. Drag this reviewed summary and the original letter into Docman as separate documents.", margin, 292);
  pdf.save(`${cleanFileName(ocr.fileName?.replace(/\.pdf$/i, ""))}-primovex-clinflow-summary.pdf`);
}
