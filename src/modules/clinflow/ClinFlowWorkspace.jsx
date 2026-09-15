import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Download,
  Eye,
  FileSearch,
  FileText,
  Filter,
  FolderCheck,
  GraduationCap,
  MoreHorizontal,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Tag,
  Trash,
  Trash2,
  UploadCloud,
  UserCheck,
  UserRound,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { writeAuditEvent } from "@/core/identity/auditService";
import { applyClinFlowAction, createClinFlowContext, recordClinFlowNoteMarker, saveSyntheticWorkflowQueue, subscribeClinFlowWorkflow } from "./clinflowService";
import SyntheticDocumentBatchPanel from "./SyntheticDocumentBatchPanel";
import { analyseClinFlowOcr, buildReviewerBrief } from "./clinflowAnalysisService";
import { AI_OUTPUT_FOOTER, HIGH_RISK_BANNER } from "./clinflowDisclaimers";
import { cacheClinFlowDocuments, loadCachedClinFlowDocuments, loadClinFlowSourceFile, loadFinishedClinFlowPacks, removeCachedClinFlowDocument, saveClinFlowTeachingFeedback, saveFinishedClinFlowPack } from "./clinflowDocumentCache";
import { triageLabel } from "./clinflowTriageService";
import { createClinFlowDemoPdfBlob, createClinFlowSummaryPdfBlob, downloadClinFlowDemoPdf, downloadClinFlowSummaryPdf } from "./clinflowSummaryExportService";
import { createDocmanPackZip, downloadBlob, safePackName } from "./clinflowZipService";
import { analyzeSyntheticDocument } from "./azureDocumentIntelligenceClient";
import { normaliseClinFlowPages } from "./clinflowPageService";
import "./clinflow-workspace.css";
import "./clinflow-azure-button.css";

const SAMPLE_DOCUMENTS = [
  { id: "cf-001", title: "Cardiology Outpatient Letter", patient: "Mr John Smith", nhs: "987 654 3210", dob: "12/06/1954", source: "Glan Clwyd Hospital", received: "14 May 2026 · 10:24", priority: "high", destination: "GP", specialty: "Cardiology", icon: "heart" },
  { id: "cf-002", title: "Biochemistry Results", patient: "Mrs Mary Jones", nhs: "456 771 2390", dob: "04/02/1968", source: "Countess of Chester", received: "14 May 2026 · 09:15", priority: "routine", destination: "GP", specialty: "Pathology", icon: "results" },
  { id: "cf-003", title: "Orthopaedics Letter", patient: "Mr Robert Williams", nhs: "221 673 9901", dob: "21/08/1961", source: "Wrexham Maelor Hospital", received: "14 May 2026 · 08:42", priority: "high", destination: "GP", specialty: "Orthopaedics", icon: "bone" },
  { id: "cf-004", title: "Discharge Summary", patient: "Mrs Susan Brown", nhs: "778 564 1123", dob: "19/03/1949", source: "Ysbyty Gwynedd", received: "13 May 2026 · 16:30", priority: "routine", destination: "Workflow", specialty: "General Medicine", icon: "discharge" },
  { id: "cf-005", title: "Respiratory Clinic Letter", patient: "Mr David Evans", nhs: "609 221 7845", dob: "30/11/1957", source: "Glan Clwyd Hospital", received: "13 May 2026 · 14:05", priority: "routine", destination: "Nurse / HCA", specialty: "Respiratory", icon: "lungs" },
  { id: "cf-006", title: "Referral Letter", patient: "Miss Emily Wilson", nhs: "134 901 7255", dob: "08/09/1993", source: "GP Surgery", received: "13 May 2026 · 11:22", priority: "routine", destination: "Admin", specialty: "Referral", icon: "referral" },
  { id: "cf-007", title: "Neurology Letter", patient: "Mr Peter Thomas", nhs: "314 882 1097", dob: "17/01/1970", source: "Alder Hey Hospital", received: "13 May 2026 · 09:10", priority: "high", destination: "GP", specialty: "Neurology", icon: "neuro" },
  { id: "cf-008", title: "Haematology Results", patient: "Mr Alan Johnson", nhs: "902 448 1136", dob: "03/07/1955", source: "Countess of Chester", received: "12 May 2026 · 17:45", priority: "routine", destination: "NFWF", specialty: "Haematology", icon: "results" },
].map((item) => ({ ...item, dataMode: "synthetic", status: "awaiting_review" }));

// Used to tell "one of the built-in demo letters" apart from a real imported
// document when merging Firestore's workflow sync into local state (see the
// subscribeClinFlowWorkflow effect below) — explicit id membership, not an
// indirect field check, so a real document is never mistaken for a stale
// sample and dropped when the sync fires.
const SAMPLE_DOCUMENT_IDS = new Set(SAMPLE_DOCUMENTS.map((item) => item.id));

const CLINICAL_INSIGHTS = [
  { tone: "danger", title: "Medication change", detail: "Bisoprolol increased to 5 mg once daily." },
  { tone: "info", title: "Diagnosis", detail: "Atrial fibrillation with mild LV dysfunction." },
  { tone: "warning", title: "Follow-up required", detail: "Repeat U&Es in 2 weeks and review in 3 months." },
];

const QAIF = [
  { label: "Atrial Fibrillation Register", impact: "High impact" },
  { label: "Heart Failure Register", impact: "Medium impact" },
];

const CODING = [
  { code: "49436004", label: "Atrial fibrillation", confidence: "High" },
  { code: "84114007", label: "Heart failure", confidence: "Medium" },
  { code: "182754009", label: "Anticoagulant therapy", confidence: "Low" },
];

function expectedValue(result, label) {
  return result?.groundTruth?.find((item) => item.label.toLowerCase() === label.toLowerCase())?.expected || "Not extracted";
}

function createAzureQueueDocument(response, index) {
  const result = response?.result || {};
  const syntheticOcr = { analysisId: response.analysisId, fileName: response.fileName, fileSha256: response.fileSha256, sourceFile: response.sourceFile, ...result };
  const documentId = result.document?.id || `document-${index + 1}`;
  const specialty = documentId.includes("cardiology") ? "Cardiology"
    : documentId.includes("respiratory") ? "Respiratory"
      : documentId.includes("discharge") ? "General Medicine"
        : documentId.includes("emergency") ? "Emergency Medicine"
          : "Clinical review";
  const clinflowAnalysis = analyseClinFlowOcr(syntheticOcr);
  return {
    id: `cf-azure-${response.analysisId}`,
    title: result.document?.title || response.fileName || "Azure analysed document",
    patient: expectedValue(result, "Patient"),
    nhs: "Synthetic · not matched",
    dob: "Verification required",
    source: "Azure Document Intelligence",
    received: new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }),
    priority: clinflowAnalysis.triage?.priority || "routine",
    destination: clinflowAnalysis.triage?.destination || "Workflow review",
    specialty,
    icon: specialty === "Cardiology" ? "heart" : specialty === "Respiratory" ? "lungs" : "results",
    status: "awaiting_review",
    syntheticOcr,
    clinflowAnalysis,
  };
}

function DocumentIcon({ type }) {
  const map = {
    results: ClipboardCheck,
    discharge: FileText,
    referral: FileSearch,
    neuro: BrainCircuit,
    bone: Activity,
    lungs: Stethoscope,
    heart: Activity,
  };
  const Icon = map[type] || FileText;
  return <Icon size={16} />;
}

function ActionButton({ children, tone = "default", wide = false, onClick, disabled = false, active = false, title }) {
  return (
    <button className={`cf-action cf-action--${tone}${wide ? " cf-action--wide" : ""}${active ? " is-active" : ""}`} onClick={onClick} type="button" disabled={disabled} aria-pressed={active || undefined} title={title}>
      {children}
    </button>
  );
}

const CLINFLOW_DESTINATIONS = ["GP", "Pharmacist", "Nurse / HCA", "Admin", "Workflow Team", "NFWF", "Child Protection", "Registration Forms", "Workflow review"];
const NFWF_CATEGORIES = ["Not NFWF", "Information only", "Follow-up arranged by hospital", "Patient informed directly", "DNA / appointment outcome", "Routine screening", "Action already completed", "No GP/practice action requested", "Other"];

function teachingFormFor(triage = {}) {
  return {
    confirmedDecision: triage.decision || "review_required",
    confirmedDestination: triage.destination || "Workflow review",
    nfwfCategory: triage.decision === "no_workflow" ? triage.nfwf?.category || "No GP/practice action requested" : "Not NFWF",
    correctionReason: "",
    correctedSummary: "",
    learningNotes: "",
    accuracyChecks: { identity: false, summary: false, medicines: false, actions: false, urgency: false, coding: false },
  };
}

function effectiveTriageFor(document) {
  if (document?.clinflowAnalysis?.triage) return document.clinflowAnalysis.triage;
  const destination = document?.destination || "Workflow review";
  const decision = destination === "NFWF" ? "no_workflow" : document?.priority === "high" ? "urgent" : "workflow_required";
  return {
    decision,
    destination,
    confidence: 0,
    reasons: [],
    rulesetVersion: "synthetic-demo-human-review-v1",
    learningPolicy: "Human teaching evidence only; no automatic rules changes.",
  };
}

function AzureReviewView({ selected, activeTab, onDownloadSummary, onOpenOriginal, onTriageDecision, onOpenTeaching }) {
  const ocr = selected.syntheticOcr;
  const analysis = selected.clinflowAnalysis;
  const confidence = Math.round((ocr.averageConfidence || 0) * 100);
  const pageEvidence = normaliseClinFlowPages(ocr);
  if (activeTab === "document") return <>
    <div className="cf-viewer-toolbar"><FileText size={14} /><b>Azure OCR evidence</b><button type="button" className="cf-view-original" onClick={onOpenOriginal}><Eye size={14} /> Open original PDF</button><span>{ocr.pageCount} page{ocr.pageCount === 1 ? "" : "s"} · original retained in protected local cache</span></div>
    <div className="cf-viewer-body cf-viewer-body--pages">
      <aside className="cf-thumbnails" aria-label="Document pages">{pageEvidence.pages.map((page) => <a href={`#cf-page-${page.pageNumber}`} key={page.pageNumber}><div>Page {page.pageNumber}</div><small>{page.pageNumber}</small></a>)}</aside>
      <div className="cf-paper-stage cf-paper-stage--pages">
        {pageEvidence.reconstructed ? <div className="cf-page-warning">Page boundaries were reconstructed from an older cached OCR result. Reprocess OCR for exact Azure page boundaries.</div> : null}
        {pageEvidence.pages.map((page) => <article className="cf-paper cf-paper--ocr" id={`cf-page-${page.pageNumber}`} key={page.pageNumber}>
          <div className="cf-page-heading"><strong>Page {page.pageNumber}</strong><span>{page.truncated ? "Text limited for safe review" : "Azure OCR evidence"}</span></div>
          <div className="cf-letterhead"><strong>{selected.title}<br /><small>{ocr.fileName}</small></strong><strong>Human review required</strong></div>
          <pre>{page.content}</pre>
        </article>)}
      </div>
    </div>
  </>;
  if (activeTab === "summary") {
    const matchedConcepts = (analysis?.terminologyCandidates || []).filter((item) => item.conceptId);
    const totalConcepts = analysis?.terminologyCandidates?.length || 0;
    const aiConfidence = Math.round((analysis?.triage?.confidence || 0) * 100);
    const urgent = Boolean(analysis?.docmanDraft?.urgent);
    return <div className="cf-tab-content cf-glance">
      <section className="cf-glance-facts">
        <div><span>Patient</span><strong>{selected.patient}</strong></div>
        <div><span>Date of birth</span><strong>{selected.dob}</strong></div>
        <div><span>NHS number</span><strong>{selected.nhs}</strong></div>
        <div><span>Specialty</span><strong>{analysis?.specialty || analysis?.documentType || "Not stated"}</strong></div>
      </section>

      <section className="cf-summary-card"><Sparkles size={18} /><div><b>Clinical summary</b><p>{analysis?.clinicalConclusion || `Azure extracted ${ocr.wordCount} words across ${ocr.pageCount} page${ocr.pageCount === 1 ? "" : "s"}. No single overall conclusion sentence was found in the letter — review the diagnoses and actions below.`}</p></div></section>

      <div className="cf-info-grid">
        <section><h3>Diagnoses / problems</h3><p>{analysis?.diagnoses?.map((item) => item.value).join("; ") || "None extracted"}</p></section>
        <section><h3>Current / relevant medication</h3><p>{(analysis?.currentMedications?.length ? analysis.currentMedications : analysis?.medicines)?.map((item) => item.value).join("; ") || "None extracted"}</p></section>
      </div>

      <section className="cf-summary-card cf-summary-card--list"><ClipboardCheck size={18} /><div className="cf-glance-actions"><b>Recommended actions</b>{analysis?.actions?.length ? <ul>{analysis.actions.map((item, index) => <li key={index}>{item.value}</li>)}</ul> : <p>No actions extracted.</p>}</div></section>

      <div className="cf-info-grid">
        <section><h3>Temporary medication instructions</h3><p>{analysis?.medicationInstructions?.length ? analysis.medicationInstructions.map((item) => item.value).join("; ") : "None"}</p></section>
        <section><h3>Correspondence priority</h3><p><span className={`cf-priority-pill cf-priority-pill--${urgent ? "urgent" : "routine"}`}>{urgent ? "Urgent" : "Routine"}</span><br /><small>Suggested — verify</small></p></section>
      </div>

      <div className="cf-info-grid">
        <section><h3>Suggested workflow destination</h3><p><span className="cf-priority-pill cf-priority-pill--destination">{analysis?.triage?.destination || "Workflow review"}</span></p></section>
        <section><h3>Safety flags</h3><p>{urgent ? "Urgent — escalate immediately." : analysis?.safetyNettingAdvice ? `Safety-net advice: ${analysis.safetyNettingAdvice}` : "No safety concerns identified."}</p></section>
      </div>

      <section className="cf-summary-card"><Tag size={18} /><div><b>Suggested SNOMED concepts</b><p>Candidates only — current UK Edition validation and clinician acceptance required before filing.</p></div></section>
      {matchedConcepts.length > 0 && <div className="cf-snomed-checklist">{matchedConcepts.map((item, index) => <div className="cf-snomed-row" key={`${item.sourceLabel}-${item.conceptId}-${index}`}><CheckCircle2 size={14} /><span>{item.preferredTerm}</span><code>{item.conceptId}</code></div>)}</div>}

      <div className="cf-info-grid">
        <section><h3>SNOMED match count</h3><p>{matchedConcepts.length} of {totalConcepts} finding{totalConcepts === 1 ? "" : "s"} matched</p></section>
        <section><h3>Confidence</h3><p className="cf-confidence-value">{aiConfidence}%</p><div className="cf-confidence-bar"><div style={{ width: `${aiConfidence}%` }} /></div></section>
      </div>
    </div>;
  }
  if (activeTab === "triage") return <div className="cf-tab-content">
    <section className="cf-summary-card"><BrainCircuit size={18} /><div><b>Governed ClinFlow 4.3 intelligence</b><p>ClinFlow suggests urgency, workflow status and destination from explicit evidence. Staff must confirm or correct every decision. Teaching evidence cannot alter live rules automatically.</p></div></section>
    <div className="cf-info-grid">
      <section><h3>Suggested outcome</h3><p><b>{triageLabel(analysis?.triage?.decision)}</b><br />Confidence: {Math.round((analysis?.triage?.confidence || 0) * 100)}%<br />Destination: {analysis?.triage?.destination}<br />Status: {selected.triageReview?.status === "human_confirmed" ? `Confirmed as ${triageLabel(selected.triageReview.confirmedDecision)}` : "Human confirmation required"}</p></section>
      <section><h3>Workflow decision</h3><p><b>Still needs workflow: {analysis?.workflowDecision?.stillNeedsWorkflow || "Maybe"}</b><br />{analysis?.workflowDecision?.category}<br />Suggested team: {analysis?.workflowDecision?.suggestedDestination}</p></section>
      <section><h3>NFWF assessment</h3><p><b>{analysis?.nfwfAssessment?.score || 0}% · {analysis?.nfwfAssessment?.category}</b><br />{analysis?.nfwfAssessment?.reasons?.join("; ") || "No positive NFWF evidence."}<br />{analysis?.nfwfAssessment?.blockers?.length ? `Blockers: ${analysis.nfwfAssessment.blockers.join("; ")}` : "No NFWF blockers detected."}</p></section>
      <section><h3>Evidence and triggers</h3><p>{analysis?.triage?.reasons?.map((item) => `${item.label}: ${item.detail}`).join(" ") || "No reliable triage evidence was generated."}</p>{analysis?.clinicalTriggers?.length ? <ul>{analysis.clinicalTriggers.map((item, index) => <li key={`${item.type}-${item.evidence}-${index}`}>{item.label}: {item.evidence}</li>)}</ul> : null}</section>
      <section><h3>Confirm outcome</h3><div className="cf-triage-decisions"><button type="button" onClick={() => onTriageDecision("urgent")}>Urgent</button><button type="button" onClick={() => onTriageDecision("workflow_required")}>Workflow required</button><button type="button" onClick={() => onTriageDecision("no_workflow")}>NFWF</button><button type="button" onClick={() => onTriageDecision("review_required")}>Needs review</button></div><button type="button" className="cf-teach-link" onClick={onOpenTeaching}><GraduationCap size={14} /> Score and teach this case</button></section>
      <section><h3>Learning policy</h3><p>{analysis?.triage?.learningPolicy}<br /><br />Ruleset: {analysis?.triage?.rulesetVersion}</p></section>
    </div>
  </div>;
  if (activeTab === "data") {
    const extractedFields = [
      ...(analysis?.diagnoses || []).map((item) => ({ group: "Diagnosis", value: item.value, source: item.source })),
      ...(analysis?.medicines || []).map((item) => ({ group: "Medication", value: item.value, source: item.source })),
      ...(analysis?.actions || []).map((item) => ({ group: "Follow-up", value: item.value, source: item.source })),
      ...(analysis?.observations || []).map((item) => ({ group: "Observation", value: item.value, source: item.source })),
    ];
    return <div className="cf-tab-content">
      <section className="cf-summary-card"><FileText size={18} /><div><b>Extracted data</b><p>Every field below is a candidate extracted from the document — nothing is clinically accepted until a trained clinician verifies it against the original.</p></div></section>
      <div className="cf-info-grid">{extractedFields.length ? extractedFields.map((item, index) => <section key={`${item.group}-${item.value}-${index}`}><h3>{item.group}</h3><p>{item.value}<br /><b>{item.source === "llm_extraction" ? "AI-extracted · needs review" : "Extracted · needs review"}</b></p></section>) : <section><h3>No structured facts extracted</h3><p>ClinFlow did not extract any diagnoses, medicines, actions or observations from this document. Review the OCR text on the Document tab.</p></section>}</div>
      {ocr.groundTruth?.length ? <div className="cf-info-grid">{ocr.groundTruth.map((item) => <section key={`${item.label}-${item.expected}`}><h3>{item.label}</h3><p>{item.expected}<br /><b>{item.matched ? "Detected in OCR" : "Not detected · review required"}</b></p></section>)}</div> : null}
    </div>;
  }
  if (activeTab === "snomed") return <div className="cf-tab-content">
    <section className="cf-summary-card"><Tag size={18} /><div><b>SNOMED CT candidate review</b><p>Structured observations use governed baseline concepts where available. Every candidate still requires current UK Edition validation, patient matching and trained clinician acceptance before filing.</p></div></section>
    {analysis?.structuredObservations?.length ? <div className="cf-info-grid">{analysis.structuredObservations.map((item) => <section key={`${item.type}-${item.sourceValue}`}><h3>{item.preferredTerm}</h3>{item.type === "blood_pressure" ? <p><b>{item.systolic.value}/{item.diastolic.value} {item.unit.display}</b><br />Blood pressure: {item.conceptId}<br />Systolic: {item.systolic.conceptId}<br />Diastolic: {item.diastolic.conceptId}<br />Unit: {item.unit.ucumCode}<br />Status: clinician review required</p> : <p><b>{item.value} {item.unit.display}</b><br />Concept ID: {item.conceptId}<br />Unit: {item.unit.ucumCode}<br />Status: clinician review required</p>}</section>)}</div> : null}
    <div className="cf-info-grid">{analysis?.terminologyCandidates?.length ? analysis.terminologyCandidates.map((item) => <section key={`${item.sourceLabel}-${item.searchTerm}-${item.component || "term"}`}><h3>{item.sourceLabel}</h3><p><b>{item.preferredTerm || item.searchTerm}</b><br />{item.sourceValue && item.sourceValue !== item.searchTerm ? <>Value: {item.sourceValue}<br /></> : null}Concept ID: {item.conceptId || "not resolved"}<br />Description ID: {item.descriptionId || "not resolved"}<br />Status: {item.conceptId ? "governed candidate - clinician acceptance required" : "terminology lookup required"}</p></section>) : <section><h3>No candidates</h3><p>No coding candidate terms were generated from this controlled extraction.</p></section>}</div>
  </div>;
  if (activeTab === "quality") return <div className="cf-tab-content"><section className="cf-summary-card"><ShieldCheck size={18} /><div><b>Wales and England quality/register review</b><p>A hospital letter cannot establish a QAIF, Unified Contract or QOF opportunity by itself. ClinFlow therefore produces governed record-check prompts—not confirmed opportunities.</p></div></section><div className="cf-info-grid"><section><h3>Confirmed opportunities</h3><p><b>{analysis?.qaifOpportunities?.length || 0}</b><br />None are confirmed from this letter alone.<br />Awareness: {analysis?.qualityAwareness?.relevance || "Low"}</p></section>{analysis?.qualityPrompts?.map((item) => <section key={`${item.domain}-${item.title}`}><h3>{item.title}</h3><p><b>{item.domain}</b>{item.priority === "high" ? " · High-priority review" : ""}<br />{item.rationale}<br /><br />Next: {item.nextStep}<br /><small>{item.framework}</small></p></section>)}</div></div>;
  if (activeTab === "outflow") return <div className="cf-tab-content"><section className="cf-summary-card"><FileText size={18} /><div><b>Docman companion summary</b><p>Download this summary, have a trained clinician compare and sign it against the untouched original, then drag both PDFs into Docman. Primovex does not transmit or file either document automatically.</p></div></section><div className="cf-info-grid"><section><h3>Document</h3><p>{analysis?.documentType}<br />Source: {ocr.fileName}</p></section><section><h3>Patient identity</h3><p>{analysis?.patient?.givenNames} {analysis?.patient?.familyName}<br /><b>Unverified</b> · NHS number and DOB must be checked</p></section><section><h3>Review status</h3><p>{analysis?.missing?.length || 0} required verification item{analysis?.missing?.length === 1 ? "" : "s"}<br />Not ready for automated transfer</p></section><section><h3>Output</h3><p><button type="button" className="cf-top-button cf-top-button--primary" onClick={onDownloadSummary}><Download size={14} /> Download summary PDF</button></p></section></div></div>;
  return <div className="cf-timeline">{[["Document accepted", "Approved synthetic fingerprint verified"], ["OCR completed", `Azure Document Intelligence · ${confidence}% average word confidence`], ["Added to ClinFlow", "Session-only OCR evidence added to the review queue"], ["Awaiting human review", "No patient match, route or clinical action has been confirmed"]].map(([title, detail]) => <div key={title}><span /><strong>{title}</strong><p>{detail}</p></div>)}</div>;
}

export default function ClinFlowWorkspace() {
  const { user, displayName, profile, can } = useAuth();
  const [documents, setDocuments] = useState(SAMPLE_DOCUMENTS);
  const [selectedId, setSelectedId] = useState(SAMPLE_DOCUMENTS[0].id);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("document");
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [toast, setToast] = useState("");
  const [syncState, setSyncState] = useState("local");
  const [busy, setBusy] = useState(false);
  const [azureTestOpen, setAzureTestOpen] = useState(false);
  const [teachingOpen, setTeachingOpen] = useState(false);
  const [teachingForm, setTeachingForm] = useState(teachingFormFor());
  const [finishedPacks, setFinishedPacks] = useState([]);
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishChecks, setFinishChecks] = useState({ original: false, identity: false, review: false });

  const context = useMemo(() => createClinFlowContext({ user, profile }), [profile, user]);

  useEffect(() => {
    let active = true;
    loadCachedClinFlowDocuments().then((cached) => {
      if (!active || !cached.length) return;
      setDocuments((current) => {
        const cachedById = new Map(cached.map((item) => [item.id, item]));
        return [...cached.filter((item) => !current.some((existing) => existing.id === item.id)), ...current.map((item) => ({ ...item, ...cachedById.get(item.id) }))];
      });
      setSelectedId((current) => current || cached[0]?.id || "");
    }).catch((error) => console.error("ClinFlow cached documents could not be restored", error));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    loadFinishedClinFlowPacks().then((packs) => { if (active) setFinishedPacks(packs); })
      .catch((error) => console.error("Finished ClinFlow packs could not be restored", error));
    return () => { active = false; };
  }, []);

  useEffect(() => subscribeClinFlowWorkflow(context, (workflowRows) => {
    if (!workflowRows.length) return setSyncState("local");
    const byId = new Map(workflowRows.map((item) => [item.id, item]));
    const merged = SAMPLE_DOCUMENTS.filter((item) => !byId.get(item.id)?.archived).map((item) => ({ ...item, ...byId.get(item.id) }));
    setDocuments((current) => [...current.filter((item) => !SAMPLE_DOCUMENT_IDS.has(item.id)), ...merged]);
    setSelectedId((current) => current.startsWith("cf-azure-") || merged.some((item) => item.id === current) ? current : merged[0]?.id || "");
    setSyncState("synced");
  }, () => setSyncState("error")), [context]);

  const selected = documents.find((item) => item.id === selectedId) || documents[0];

  function replaceSelected(changes) {
    if (!selected?.id) return null;
    const updated = { ...selected, ...changes };
    setDocuments((items) => items.map((item) => item.id === selected.id ? updated : item));
    if (updated.dataMode === "synthetic") cacheClinFlowDocuments([updated]).catch((error) => console.error("ClinFlow document cache update failed", error));
    return updated;
  }

  const visibleDocuments = useMemo(() => {
    const q = query.trim().toLowerCase();
    return documents.filter((item) => {
      if (filter === "finished" && item.status !== "completed") return false;
      if (filter !== "finished" && item.status === "completed") return false;
      if (filter === "high" && item.priority !== "high") return false;
      if (filter === "gp" && item.destination !== "GP") return false;
      if (q && ![item.title, item.patient, item.source, item.specialty, item.nhs].join(" ").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [documents, filter, query]);

  const completedDocuments = useMemo(() => documents.filter((item) => item.status === "completed"), [documents]);

  function notify(message, durationMs = 2200) {
    setToast(message);
    window.clearTimeout(window.__clinflowToastTimer);
    window.__clinflowToastTimer = window.setTimeout(() => setToast(""), durationMs);
  }

  function importAzureResults(responses) {
    const imported = responses.map(createAzureQueueDocument);
    if (!imported.length) return;
    setDocuments((current) => [...imported.filter((item) => !current.some((existing) => existing.id === item.id)), ...current]);
    setSelectedId(imported[0].id);
    setActiveTab("synthetic-document");
    cacheClinFlowDocuments(imported).catch((error) => console.error("ClinFlow documents could not be cached", error));
    writeAuditEvent({
      action: "clinflow.analysis.import",
      module: "clinflow",
      targetType: "clinical_document_batch",
      targetId: imported[0]?.id || "synthetic-batch",
      summary: `${imported.length} synthetic Azure analysis result${imported.length === 1 ? "" : "s"} imported for review`,
      classification: "synthetic",
      metadata: { count: imported.length, provider: "azure-document-intelligence" },
    }).catch(() => {});
    notify(`${imported.length} analysed document${imported.length === 1 ? "" : "s"} added to ClinFlow review`);
  }

  async function record(action, summary, metadata = {}, targetId = selected?.id) {
    await writeAuditEvent({
      actor: { uid: user?.uid, displayName: displayName || user?.email },
      action,
      module: "clinflow",
      targetType: "clinical_document",
      targetId,
      summary,
      metadata,
      classification: selected?.dataMode === "live" ? "special_category" : "synthetic",
    });
  }

  async function routeDocument(destination) {
    if (!can("clinflow.workflow")) return notify("Your role cannot route ClinFlow documents");
    await runAction(async () => {
      if (context.cloudEnabled) await applyClinFlowAction(selected, { type: "route", destination, summary: `Document routed to ${destination}`, metadata: { destination } }, context);
      const updated = { ...selected, destination, persisted: context.cloudEnabled || selected.persisted };
      setDocuments((items) => items.map((item) => item.id === selected.id ? updated : item));
      if (selected.dataMode === "synthetic") await cacheClinFlowDocuments([updated]);
      await record("clinflow.route", `Document routed to ${destination}`, { destination });
      notify(`Route set to ${destination}`);
    });
  }

  function requestFinishDocument() {
    if (!can("clinflow.workflow")) return notify("Your role cannot finish ClinFlow documents");
    setFinishChecks({ original: false, identity: false, review: false });
    setFinishOpen(true);
  }

  async function resolveOriginalFile(document = selected) {
    const current = document?.syntheticOcr?.sourceFile;
    if (current instanceof Blob) return current;
    return loadClinFlowSourceFile(document?.id);
  }

  async function completeDocument() {
    if (!Object.values(finishChecks).every(Boolean)) return notify("Complete all three clinician verification checks first");
    await runAction(async () => {
      const completedAt = new Date().toISOString();
      let originalBlob;
      let summary;
      if (selected.syntheticOcr) {
        originalBlob = await resolveOriginalFile(selected);
        if (!(originalBlob instanceof Blob)) throw new Error("The untouched original PDF is unavailable. Re-import it before finishing this document.");
        summary = await createClinFlowSummaryPdfBlob(selected, originalBlob);
      } else {
        const synthetic = createClinFlowDemoPdfBlob(selected);
        originalBlob = synthetic.blob;
        summary = createClinFlowDemoPdfBlob({ ...selected, title: `${selected.title} - ClinFlow review summary` });
      }
      const updated = {
        ...selected,
        status: "completed",
        completedByUid: user?.uid || "synthetic-demo-user",
        completedAt,
        persisted: context.cloudEnabled || selected.persisted,
      };
      const manifest = {
        schemaVersion: 1,
        dataMode: updated.dataMode || "synthetic",
        documentId: updated.id,
        title: updated.title,
        destination: updated.destination,
        completedAt,
        completedByUid: updated.completedByUid,
        originalUnchanged: true,
        contains: ["untouched-original-pdf", "clinflow-clinician-review-summary-pdf"],
        transferMethod: "manual-docman-import",
        automatedTransmission: false,
      };
      const pack = await saveFinishedClinFlowPack({ document: updated, originalBlob, summaryBlob: summary.blob, manifest }).catch((error) => {
        throw new Error(`Saving the local finished pack failed: ${error?.message || error}`);
      });
      if (context.cloudEnabled) {
        // Pass the current `selected`, not `updated` — `updated.persisted` is
        // optimistically pre-set to true in anticipation of this write
        // succeeding, which made ensureWorkflowRecord() (clinflowService.js)
        // believe a Firestore record already existed for a document being
        // written for the first time, so it sent only the partial "changes"
        // payload instead of the full record — missing required fields like
        // dataMode, which the security rules reject with permission-denied.
        await applyClinFlowAction(selected, { type: "complete", summary: "Document clinically reviewed and moved to Finished", metadata: { destination: updated.destination, docmanPackPrepared: true } }, context).catch((error) => {
          throw new Error(`Cloud workflow sync failed${error?.code ? ` (${error.code})` : ""}: ${error?.message || error}`);
        });
      }
      setDocuments((items) => items.map((item) => item.id === updated.id ? updated : item));
      if (updated.dataMode === "synthetic") await cacheClinFlowDocuments([updated]);
      setFinishedPacks((packs) => [pack, ...packs.filter((item) => item.id !== pack.id)]);
      setFinishOpen(false);
      setFilter("finished");
      await record("clinflow.finished.pack_created", "ClinFlow reviewed document moved to Finished and Docman pack prepared", { destination: updated.destination, originalUnchanged: true, automatedTransmission: false });
      notify("Finished pack created with the original and ClinFlow summary");
    });
  }

  async function archiveDocument() {
    if (!can("clinflow.manage")) return notify("ClinFlow management permission is required");
    await runAction(async () => {
      if (context.cloudEnabled) await applyClinFlowAction(selected, { type: "archive", summary: "Synthetic workflow document archived" }, context);
      await removeCachedClinFlowDocument(selected.id);
    const remaining = documents.filter((item) => item.id !== selected.id);
    setDocuments(remaining);
    setSelectedId(remaining[0]?.id || "");
      await record("clinflow.archive", "Synthetic workflow document archived");
      notify("Document archived; its audit history was retained");
    });
  }

  function requestArchiveDocument() {
    if (!selected) return notify("No ClinFlow document is selected");
    if (!window.confirm(`Archive “${selected.title}”? Its governed audit history will be retained.`)) return;
    archiveDocument();
  }

  async function permanentlyDeleteDocument() {
    if (!can("clinflow.manage")) return notify("ClinFlow management permission is required");
    await runAction(async () => {
      if (context.cloudEnabled) await applyClinFlowAction(selected, { type: "delete", summary: "Synthetic workflow document permanently deleted from view" }, context);
      await removeCachedClinFlowDocument(selected.id);
      const remaining = documents.filter((item) => item.id !== selected.id);
      setDocuments(remaining);
      setFinishedPacks((packs) => packs.filter((pack) => pack.documentId !== selected.id));
      setSelectedId(remaining[0]?.id || "");
      await record("clinflow.permanent_delete", "Synthetic workflow document permanently deleted from view", { deleted: true, workflowRecordRetained: true });
      notify("Document deleted from your workflow and this device");
    });
  }

  function requestPermanentDeleteDocument() {
    if (!selected) return notify("No ClinFlow document is selected");
    if (!window.confirm(`Permanently delete “${selected.title}”?\n\nThis removes it from every queue (including Finished) and wipes the local copy on this device. Firestore itself never allows physically deleting workflow records (governed, append-only by design) — the underlying record is marked deleted and hidden everywhere instead, the same way Archive works, but this is treated as final and won't reappear anywhere in the app.`)) return;
    permanentlyDeleteDocument();
  }

  async function runAction(action) {
    if (busy) return;
    setBusy(true);
    try { await action(); setSyncState(context.cloudEnabled ? "synced" : "local"); }
    catch (error) {
      console.error("ClinFlow action failed", error);
      setSyncState("error");
      notify([error?.message, error?.code ? `[${error.code}]` : ""].filter(Boolean).join(" ") || "ClinFlow could not save that action", 8000);
    }
    finally { setBusy(false); }
  }

  async function saveDemoQueue() {
    if (!can("clinflow.capture")) return notify("ClinFlow capture permission is required");
    await runAction(async () => { await saveSyntheticWorkflowQueue(SAMPLE_DOCUMENTS, context); notify("Non-identifying demonstration workflow saved"); });
  }

  async function setPriority() {
    if (!can("clinflow.workflow")) return notify("Your role cannot change workflow priority");
    await runAction(async () => {
      if (context.cloudEnabled) await applyClinFlowAction(selected, { type: "priority", priority: "high", summary: "Document marked high priority" }, context);
      const updated = { ...selected, priority: "high", persisted: context.cloudEnabled || selected.persisted };
      setDocuments((items) => items.map((item) => item.id === selected.id ? updated : item));
      if (selected.dataMode === "synthetic") await cacheClinFlowDocuments([updated]);
      await record("clinflow.priority", "Document marked high priority", { priority: "high" });
      notify("Marked high priority");
    });
  }

  async function claimDocument() {
    if (!can("clinflow.workflow")) return notify("Your role cannot claim workflow documents");
    await runAction(async () => {
      if (context.cloudEnabled) await applyClinFlowAction(selected, { type: "claim", summary: "Document claimed for review" }, context);
      replaceSelected({ status: "in_review", claimedByUid: user?.uid || "synthetic-demo-user", claimedAt: new Date().toISOString(), persisted: context.cloudEnabled || selected.persisted });
      await record("clinflow.claim", "Document claimed for review");
      notify("Document claimed for review");
    });
  }

  async function saveNote() {
    if (!can("clinflow.workflow")) return notify("Your role cannot add workflow notes");
    const trimmedNote = note.trim();
    if (!trimmedNote) return notify("Enter a note before saving");
    await runAction(async () => {
      if (context.cloudEnabled) await recordClinFlowNoteMarker(selected, trimmedNote.length, context);
      replaceSelected({ noteCount: Number(selected.noteCount || 0) + 1, lastNoteAt: new Date().toISOString(), persisted: context.cloudEnabled || selected.persisted });
      await record("clinflow.note", "Workflow note marker saved", { noteLength: trimmedNote.length, contentStored: false });
      setNote(""); setNoteOpen(false);
      notify("Note recorded in the governed audit trail; note text was not uploaded");
    });
  }

  async function confirmTriageDecision(decision, feedback = {}) {
    if (!can("clinflow.workflow")) return notify("Your role cannot confirm ClinFlow triage");
    let saved = false;
    await runAction(async () => {
      const triage = effectiveTriageFor(selected);
      const destination = feedback.confirmedDestination || (decision === "no_workflow" ? "NFWF" : decision === "review_required" ? "Workflow review" : decision === triage.decision ? triage.destination : decision === "urgent" ? "GP" : "Workflow Team");
      await saveClinFlowTeachingFeedback({ document: selected, suggestedDecision: triage.decision, confirmedDecision: decision, actorUid: user?.uid, feedback: { ...feedback, confirmedDestination: destination } });
      if (context.cloudEnabled) await applyClinFlowAction(selected, { type: "triage", decision, rulesetVersion: triage.rulesetVersion, summary: `ClinFlow triage confirmed as ${triageLabel(decision)}`, metadata: { suggestedDecision: triage.decision, confirmedDecision: decision, confirmedDestination: destination, nfwfCategory: feedback.nfwfCategory || "", rulesetVersion: triage.rulesetVersion } }, context);
      const triageReview = { confirmedDecision: decision, suggestedDecision: triage.decision, confirmedDestination: destination, nfwfCategory: feedback.nfwfCategory || "", correctionReason: feedback.correctionReason || "", status: "human_confirmed", reviewedAt: new Date().toISOString(), rulesetVersion: triage.rulesetVersion };
      const updated = { ...selected, destination, priority: decision === "urgent" ? "high" : selected.priority, triageReview, persisted: context.cloudEnabled || selected.persisted };
      setDocuments((items) => items.map((item) => item.id === selected.id ? updated : item));
      await cacheClinFlowDocuments([updated]);
      await record("clinflow.triage_confirm", `ClinFlow triage confirmed as ${triageLabel(decision)}`, { suggestedDecision: triage.decision, confirmedDecision: decision, confirmedDestination: destination, nfwfCategory: feedback.nfwfCategory || "", rulesetVersion: triage.rulesetVersion });
      notify(`Triage confirmed: ${triageLabel(decision)}`);
      saved = true;
    });
    return saved;
  }

  function openTeaching() {
    if (!can("clinflow.workflow")) return notify("Your role cannot score or teach ClinFlow");
    if (selected?.dataMode === "live") return notify("Score and Teach is currently restricted to approved synthetic cases");
    setTeachingForm(teachingFormFor(effectiveTriageFor(selected)));
    setTeachingOpen(true);
  }

  async function saveTeaching() {
    if (!teachingForm.correctionReason.trim() && teachingForm.confirmedDecision !== effectiveTriageFor(selected).decision) {
      return notify("Add a short reason for the correction so it can be governed and reviewed");
    }
    const saved = await confirmTriageDecision(teachingForm.confirmedDecision, teachingForm);
    if (saved) setTeachingOpen(false);
  }

  async function downloadSummary() {
    try {
      const originalBlob = await resolveOriginalFile(selected).catch(() => null);
      const result = await downloadClinFlowSummaryPdf(selected, originalBlob);
      await record("clinflow.summary.download", "ClinFlow clinician-review summary downloaded", { format: "pdf", appendedOriginal: result.appendedOriginal });
      notify(result.appendedOriginal ? "ClinFlow review summary downloaded (original letter attached)" : "ClinFlow review summary downloaded");
    } catch (error) {
      console.error("ClinFlow summary export failed", error);
      notify(error?.message || "The review summary could not be generated");
    }
  }

  async function downloadOriginal() {
    const file = await resolveOriginalFile(selected);
    if (!(file instanceof Blob)) return notify("The original PDF is unavailable. Re-import it before finishing this document.");
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name || selected?.syntheticOcr?.fileName || "original.pdf";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    await record("clinflow.original.download", "Original source PDF downloaded", { format: "pdf", sourceUnchanged: true });
    notify("Original source PDF downloaded unchanged");
  }

  async function openOriginal() {
    if (globalThis.__TAURI_INTERNALS__) {
      const file = await resolveOriginalFile(selected);
      if (!(file instanceof Blob)) return notify("The original PDF is unavailable. Re-import it to restore the source document.");
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
        const fileName = file.name || selected?.syntheticOcr?.fileName || "original.pdf";
        await invoke("open_clinflow_pdf", { bytes, fileName });
        await record("clinflow.original.view", "Untouched original PDF opened in the system PDF viewer", { sourceUnchanged: true, viewer: "system-default" });
      } catch (error) {
        console.error("ClinFlow desktop PDF preview failed", error);
        notify(error?.message || "Could not open the original PDF in your system viewer. Use Original PDF to download it instead.");
      }
      return;
    }
    const opened = window.open("", "_blank", "noopener,noreferrer");
    const file = await resolveOriginalFile(selected);
    if (!(file instanceof Blob)) {
      opened?.close();
      return notify("The original PDF is unavailable. Re-import it to restore the source document.");
    }
    if (!opened) {
      return notify("Your browser blocked the original PDF window. Use Original PDF to download it instead.");
    }
    const url = URL.createObjectURL(file);
    opened.location.href = url;
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    await record("clinflow.original.view", "Untouched original PDF opened for comparison", { sourceUnchanged: true });
  }

  async function downloadDocument() {
    try {
      downloadClinFlowDemoPdf(selected);
      await record("clinflow.document.download", "Synthetic ClinFlow document exported", { format: "pdf", sourceOriginal: false });
      notify("Synthetic ClinFlow document downloaded");
    } catch (error) {
      console.error("ClinFlow document export failed", error);
      notify(error?.message || "The document could not be downloaded");
    }
  }

  async function reprocessOcr() {
    if (!can("clinflow.capture")) return notify("ClinFlow capture permission is required to reprocess OCR");
    const file = await resolveOriginalFile(selected);
    if (!(file instanceof Blob)) {
      setAzureTestOpen(true);
      notify("Choose the original approved synthetic PDF to reprocess it");
      return;
    }
    await runAction(async () => {
      const response = await analyzeSyntheticDocument(file, true);
      const refreshed = createAzureQueueDocument({ ...response, sourceFile: file }, 0);
      const updated = {
        ...refreshed,
        id: selected.id,
        destination: selected.destination,
        priority: selected.priority,
        status: selected.status,
        persisted: selected.persisted,
        reprocessedAt: new Date().toISOString(),
      };
      setDocuments((items) => items.map((item) => item.id === selected.id ? updated : item));
      await cacheClinFlowDocuments([updated]);
      await record("clinflow.ocr.reprocess", "Approved synthetic document reprocessed through Azure OCR", { provider: "azure-document-intelligence", analysisId: response.analysisId });
      notify("OCR reprocessing complete");
    });
  }

  async function downloadFinishedPacks(packs, scope = "all-finished", missingCount = 0) {
    if (!packs.length) {
      return notify(missingCount
        ? `${missingCount} finished pack${missingCount === 1 ? " isn't" : "s aren't"} stored on this device. Finished PDFs stay local to the device that completed them.`
        : "There are no completed ClinFlow packs to download");
    }
    try {
      const zip = await createDocmanPackZip(packs);
      const date = new Date().toISOString().slice(0, 10);
      downloadBlob(zip, `Primovex-ClinFlow-Docman-${scope}-${date}.zip`);
      await record("clinflow.finished.bulk_download", `${packs.length} finished ClinFlow pack${packs.length === 1 ? "" : "s"} downloaded for manual Docman transfer`, { count: packs.length, scope, format: "zip", automatedTransmission: false }, scope === "all-finished" ? "finished-queue" : packs[0].documentId);
      notify(missingCount
        ? `${packs.length} finished pack${packs.length === 1 ? "" : "s"} downloaded (${missingCount} not available on this device)`
        : `${packs.length} finished pack${packs.length === 1 ? "" : "s"} downloaded for Docman`);
    } catch (error) {
      console.error("ClinFlow finished pack export failed", error);
      notify(error?.message || "The Docman pack could not be created");
    }
  }

  function downloadAllFinishedPacks() {
    const available = finishedPacks.filter((pack) => completedDocuments.some((doc) => doc.id === pack.documentId));
    return downloadFinishedPacks(available, "all-finished", completedDocuments.length - available.length);
  }

  function downloadSelectedFinishedPack() {
    const pack = finishedPacks.find((item) => item.documentId === selected?.id);
    if (!pack) return notify("This document's finished pack isn't stored on this device. Finished PDFs stay local to the device that completed them.");
    // Docman ingestion expects one letter per upload. pack.summaryBlob is
    // already a single self-contained PDF — the ClinFlow review summary with
    // a genuine copy of the original letter's pages appended — so that one
    // file is what gets handed to Docman, not a zip of several files.
    downloadBlob(pack.summaryBlob, pack.summaryFileName);
    record("clinflow.finished.download", "Finished ClinFlow document (summary + original copy) downloaded for Docman upload", { format: "pdf", automatedTransmission: false }, pack.documentId).catch(() => {});
    notify("Docman-ready PDF downloaded (ClinFlow summary + copy of the original letter)");
  }

  async function refreshWorkflow() {
    try {
      const [cached, packs] = await Promise.all([loadCachedClinFlowDocuments(), loadFinishedClinFlowPacks()]);
      if (cached.length) {
        setDocuments((current) => [...cached, ...current.filter((item) => !cached.some((row) => row.id === item.id))]);
      }
      setFinishedPacks(packs);
      await record("clinflow.workflow.refresh", "ClinFlow workflow refreshed", { cachedDocuments: cached.length, finishedPacks: packs.length }, selected?.id || "queue");
      notify("Workflow refreshed");
    } catch (error) {
      console.error("ClinFlow refresh failed", error);
      notify(error?.message || "Workflow refresh failed");
    }
  }

  async function printDocument() {
    await record("clinflow.document.print", "ClinFlow document print or PDF export requested", { browserPrint: true });
    window.print();
  }

  async function verifyPatientRequest() {
    await record("clinflow.patient_verification.open", "Patient verification workflow opened", { dataMode: selected?.syntheticOcr ? "synthetic" : "unknown" });
    notify(selected.syntheticOcr ? "Patient matching requires human verification" : "Patient record link will open here");
  }

  function selectDocument(item) {
    setSelectedId(item.id);
    setActiveTab(item.syntheticOcr ? "synthetic-document" : "document");
    writeAuditEvent({
      action: "clinflow.document.view",
      module: "clinflow",
      targetType: "clinical_document",
      targetId: item.id,
      summary: "ClinFlow document opened for review",
      classification: item?.dataMode === "live" ? "special_category" : "synthetic",
      metadata: { source: item.source || "unknown", synthetic: Boolean(item.syntheticOcr) },
    }).catch(() => {});
  }

  const tabs = [
    ["document", "Document"],
    ["summary", "AI Summary"],
    ["data", "Extracted Data"],
    ...(selected?.syntheticOcr ? [["triage", "Triage"], ["snomed", "SNOMED Review"], ["quality", "Quality / QAIF"], ["outflow", "Docman Summary"]] : []),
    ["timeline", "Timeline"],
  ];

  return (
    <section className={`clinflow-shell${panelCollapsed ? " clinflow-shell--panel-collapsed" : ""}`}>
      <header className="cf-topbar">
        <div>
          <p className="cf-eyebrow">Primovex clinical intelligence</p>
          <div className="cf-title-row"><h1>ClinFlow</h1><span>{visibleDocuments.length} documents</span></div>
        </div>
        <div className="cf-topbar-actions">
          <label className="cf-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search documents..." /></label>
          <span className={`cf-data-state cf-data-state--${syncState}`}>Synthetic only · {syncState === "synced" ? "Workflow synced" : syncState === "error" ? "Sync unavailable" : "Local preview"}</span>
          {completedDocuments.length > 0 && <button className="cf-top-button cf-top-button--finished" type="button" onClick={downloadAllFinishedPacks} disabled={busy}><FolderCheck size={15} /> Download finished ({completedDocuments.length})</button>}
          {can("clinflow.capture") && <button className="cf-top-button cf-top-button--azure" type="button" onClick={() => setAzureTestOpen(true)}><UploadCloud size={15} /> Test Azure OCR</button>}
          {syncState === "local" && context.cloudEnabled && can("clinflow.capture") && <button className="cf-top-button cf-top-button--primary" type="button" onClick={saveDemoQueue} disabled={busy}>Save demo workflow</button>}
          <button className="cf-top-button" type="button" onClick={refreshWorkflow} disabled={busy}><RefreshCw size={15} /> Refresh</button>
          <span className="cf-user-chip"><UserRound size={16} /> {displayName || "Workflow user"}</span>
        </div>
      </header>

      <aside className="cf-queue">
        <div className="cf-queue-tabs">
          {[['all', `Active (${documents.filter((item) => item.status !== 'completed').length})`], ['high', `High (${documents.filter((item) => item.status !== 'completed' && item.priority === 'high').length})`], ['gp', `GP (${documents.filter((item) => item.status !== 'completed' && item.destination === 'GP').length})`], ['finished', `Finished (${documents.filter((item) => item.status === 'completed').length})`]].map(([key, label]) => (
            <button type="button" key={key} className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>{label}</button>
          ))}
        </div>
        <div className="cf-sort-row"><span>Sort by: Received (Newest)</span><Filter size={15} /></div>
        <div className="cf-document-list">
          {visibleDocuments.map((item) => (
            <button type="button" key={item.id} className={`cf-document-card${selected?.id === item.id ? " active" : ""}`} onClick={() => selectDocument(item)}>
              <span className={`cf-document-icon cf-document-icon--${item.icon}`}><DocumentIcon type={item.icon} /></span>
              <span className={`cf-priority-dot cf-priority-dot--${item.priority}`} />
              <strong>{item.title}</strong>
              <span>{item.patient}</span>
              <small>{item.source}</small>
              <small>{item.received}{item.priority === "high" && <em>High Priority</em>}</small>
            </button>
          ))}
        </div>
        <footer>Showing {visibleDocuments.length} of {documents.length} documents</footer>
      </aside>

      <main className="cf-workspace">
        {!selected ? <div className="cf-empty">No document selected.</div> : <>
          <div className="cf-document-heading">
            <div><h2>{selected.title}</h2>{selected.priority === "high" && <span>High Priority</span>}</div>
            <small>Received: {selected.received}</small>
          </div>
          <div className="cf-patient-banner">
            <UserCheck size={22} />
            <div><strong>{selected.patient}</strong><span>NHS: {selected.nhs} · DOB: {selected.dob}</span></div>
            <span className="cf-match">{selected.syntheticOcr ? "Synthetic · verify" : "Match 98%"}</span>
            <button type="button" onClick={verifyPatientRequest}>{selected.syntheticOcr ? "Verify patient" : "View patient"}</button>
          </div>
          {(selected.clinflowAnalysis?.docmanDraft?.urgent || selected.clinflowAnalysis?.docmanDraft?.medicationChanged) && (
            <div className="cf-high-risk-banner"><AlertTriangle size={16} />{HIGH_RISK_BANNER}</div>
          )}
          {selected.clinflowAnalysis && <section className="cf-reviewer-brief">
            <h3><ClipboardCheck size={16} />What's required next</h3>
            <div className="cf-brief-chips">{buildReviewerBrief(selected.clinflowAnalysis).map((step, index) => <span key={index} className={`cf-brief-chip cf-brief-${step.tone}`}>{step.text}</span>)}</div>
          </section>}
          <nav className="cf-tabs">{tabs.map(([key, label]) => { const tabKey = selected.syntheticOcr ? `synthetic-${key}` : key; return <button type="button" key={key} className={activeTab === tabKey ? "active" : ""} onClick={() => setActiveTab(tabKey)}>{label}</button>; })}</nav>
          <section className="cf-viewer">
            {selected.syntheticOcr && <AzureReviewView selected={selected} activeTab={activeTab.replace(/^synthetic-/, "")} onDownloadSummary={downloadSummary} onOpenOriginal={openOriginal} onTriageDecision={confirmTriageDecision} onOpenTeaching={openTeaching} />}
            {!selected.syntheticOcr && activeTab === "document" && <>
              <div className="cf-viewer-toolbar"><button type="button">−</button><b>100%</b><button type="button">+</button><button type="button"><Download size={14} /></button><span>Page 1 of 2</span></div>
              <div className="cf-viewer-body"><aside className="cf-thumbnails"><div className="active">Page 1</div><small>1</small><div>Page 2</div><small>2</small></aside><div className="cf-paper-stage"><article className="cf-paper"><div className="cf-letterhead"><strong>Glan Clwyd Hospital<br /><small>Cardiology Department</small></strong><strong>Date: 14 May 2026</strong></div><p>Dr A N Other<br />Greenfield Surgery<br />123 High Street<br />Mold<br />CH7 1AB</p><p>Dear Dr Other</p><p><b>Re: {selected.patient} · DOB: {selected.dob} · NHS: {selected.nhs}</b></p><p>Thank you for referring Mr Smith to the Cardiology Clinic.</p><h3>Assessment</h3><p>Mr Smith was reviewed today for atrial fibrillation. He remains symptomatic with exertional dyspnoea. Echocardiogram shows mild left ventricular dysfunction.</p><h3>Plan</h3><ul><li>Increase Bisoprolol to 5 mg once daily</li><li>Continue Apixaban 5 mg twice daily</li><li>Repeat U&Es in 2 weeks</li><li>Review in 3 months</li></ul><p>Yours sincerely</p><p><b>Dr B Consultant<br />Consultant Cardiologist</b></p></article></div></div>
            </>}
            {activeTab === "summary" && <div className="cf-tab-content"><section className="cf-summary-card"><Sparkles size={18} /><div><b>AI Summary</b><p>Cardiology review confirms symptomatic atrial fibrillation with mild LV dysfunction. Bisoprolol was increased, Apixaban continues, U&Es are due in two weeks and follow-up is planned in three months.</p></div></section><div className="cf-info-grid"><section><h3>Actions required</h3><ul><li>Update Bisoprolol dose</li><li>Arrange repeat U&Es</li><li>Add 3-month recall</li></ul></section><section><h3>Suggested route</h3><p><b>{selected.destination}</b><br />Routine review required</p></section><section><h3>Medication</h3><p>Bisoprolol increased<br />Apixaban continued</p></section><section><h3>Safety</h3><p>No immediate red-flag wording detected.</p></section></div></div>}
            {activeTab === "data" && <div className="cf-tab-content"><div className="cf-info-grid"><section><h3>Patient</h3><p>{selected.patient}<br />DOB {selected.dob}<br />NHS {selected.nhs}</p></section><section><h3>Clinical entities</h3><p>Atrial fibrillation<br />LV dysfunction<br />Bisoprolol<br />Apixaban</p></section><section><h3>Dates</h3><p>Letter 14/05/2026<br />Bloods 2 weeks<br />Review 3 months</p></section><section><h3>Confidence</h3><p>Patient 98%<br />Medication 94%<br />Actions 92%</p></section></div></div>}
            {activeTab === "timeline" && <div className="cf-timeline">{[["Document received", "Uploaded by Scanning Team"], ["OCR completed", "Mock provider result · 96%"], ["AI analysis completed", "Medication, coding and QAIF prompts generated"], ["Awaiting workflow review", "No final action recorded"]].map(([title, detail]) => <div key={title}><span /><strong>{title}</strong><p>{detail}</p></div>)}</div>}
          </section>
          {selected.clinflowAnalysis && <p className="cf-ai-output-footer">{AI_OUTPUT_FOOTER}</p>}
        </>}
      </main>

      <aside className="cf-insights">
        <button className="cf-panel-toggle" type="button" onClick={() => setPanelCollapsed((value) => !value)}>{panelCollapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}</button>
        {!panelCollapsed && <>
          <div className="cf-insight-scroll">
            <section className="cf-side-card">
              <h3><Stethoscope size={16} />Review checklist</h3>
              <div className="cf-list-row cf-list-row--action">
                <span>Clinical Insights</span>
                <small>{selected?.syntheticOcr ? [...(selected.clinflowAnalysis?.diagnoses || []), ...(selected.clinflowAnalysis?.medicines || []), ...(selected.clinflowAnalysis?.actions || [])].length : CLINICAL_INSIGHTS.length} item(s)</small>
                <button type="button" onClick={() => setActiveTab(selected?.syntheticOcr ? "synthetic-summary" : "summary")}>Review</button>
              </div>
              <div className="cf-list-row cf-list-row--action">
                <span>Quality / QAIF</span>
                <small>{selected?.syntheticOcr ? selected.clinflowAnalysis?.qualityPrompts?.length || 0 : QAIF.length} prompt(s)</small>
                <button type="button" onClick={() => selected?.syntheticOcr ? setActiveTab("synthetic-quality") : notify("QAIF review opened")}>Review</button>
              </div>
              <div className="cf-list-row cf-list-row--action">
                <span>SNOMED Candidates</span>
                <small>{selected?.syntheticOcr ? selected.clinflowAnalysis?.terminologyCandidates?.length || 0 : CODING.length} candidate(s)</small>
                <button type="button" onClick={() => selected?.syntheticOcr ? setActiveTab("synthetic-snomed") : notify("Coding review opened")}>Review</button>
              </div>
            </section>
            <section className="cf-side-card"><h3><FileSearch size={16} />Destination Suggestion</h3><div className="cf-destination"><b>{selected?.destination || "Workflow"}</b><span>Routine · Requires human review</span></div></section>
          </div>
          <section className="cf-actions-card">
            <h3>Workflow Actions</h3>
            <p>ROUTE DOCUMENT</p><div className="cf-action-grid">
              {[["GP", "primary"], ["Nurse / HCA", "teal"], ["Pharmacist", "default"], ["Admin", "default"], ["Workflow Team", "default"], ["NFWF", "purple"]].map(([destination, tone]) => <ActionButton key={destination} tone={tone} active={selected?.destination === destination} disabled={busy || !selected} onClick={() => routeDocument(destination)}>{destination}</ActionButton>)}
            </div>
            <hr /><p>DOCUMENT</p><div className="cf-action-grid">
              <ActionButton tone="danger" active={selected?.priority === "high"} disabled={busy || !selected || selected?.priority === "high"} onClick={setPriority}><AlertTriangle size={14} />{selected?.priority === "high" ? "High priority set" : "High priority"}</ActionButton>
              <ActionButton tone="purple" disabled={busy || !selected} onClick={() => setNoteOpen(true)}>Add note{selected?.noteCount ? ` (${selected.noteCount})` : ""}</ActionButton>
              {selected?.syntheticOcr ? <><ActionButton tone="primary" disabled={busy} onClick={downloadSummary}><Download size={14} />Summary PDF</ActionButton><ActionButton disabled={busy} onClick={downloadOriginal}><Download size={14} />Original PDF</ActionButton></> : <ActionButton disabled={busy || !selected} onClick={downloadDocument}><Download size={14} />Download</ActionButton>}
              {selected?.status === "completed" && <ActionButton tone="primary" wide disabled={busy} onClick={downloadSelectedFinishedPack}><FolderCheck size={14} />Download Docman PDF</ActionButton>}
              <ActionButton wide disabled={busy || !selected} onClick={() => setShowMoreActions((value) => !value)}><MoreHorizontal size={14} />{showMoreActions ? "Fewer actions" : "More actions"}</ActionButton>
              {showMoreActions && <>
                <ActionButton tone="warning" disabled={busy || !selected} onClick={reprocessOcr} title={selected?.syntheticOcr?.sourceFileAvailable || selected?.syntheticOcr?.sourceFile instanceof Blob ? "Reprocess the protected original synthetic PDF" : "Choose the original approved synthetic PDF"}><RefreshCw size={14} />Reprocess OCR</ActionButton>
                <ActionButton disabled={busy || !selected} onClick={printDocument}><Printer size={14} />Print / PDF</ActionButton>
                <ActionButton tone="danger" disabled={busy || !selected} onClick={requestArchiveDocument}><Trash2 size={14} />Archive</ActionButton>
                <ActionButton tone="danger" disabled={busy || !selected} onClick={requestPermanentDeleteDocument}><Trash size={14} />Delete permanently</ActionButton>
              </>}
            </div>
            <hr /><p>FINALISE</p><div className="cf-action-grid">
              <ActionButton active={selected?.status === "in_review" || Boolean(selected?.claimedByUid)} disabled={busy || !selected || selected?.status === "completed"} onClick={claimDocument}><UserCheck size={14} />{selected?.status === "in_review" || selected?.claimedByUid ? "Claimed" : "Claim"}</ActionButton>
              <ActionButton disabled={busy || !selected} onClick={openTeaching}><GraduationCap size={14} />Score / Teach</ActionButton>
              <ActionButton tone="success" wide active={selected?.status === "completed"} disabled={busy || !selected || selected?.status === "completed"} onClick={requestFinishDocument}><CheckCircle2 size={15} />{selected?.status === "completed" ? "Finished · ready for Docman" : "Confirm & Finish"}</ActionButton>
            </div>
          </section>
        </>}
      </aside>

      {finishOpen && <div className="cf-modal cf-finish-modal" role="dialog" aria-modal="true" aria-labelledby="cf-finish-title"><div>
        <div className="cf-finish-heading"><FolderCheck size={24} /><div><h2 id="cf-finish-title">Finish for Docman</h2><p>{selected?.title}</p></div></div>
        <p className="cf-modal-guidance">This creates one Docman-ready PDF — the ClinFlow clinician-review summary with a genuine copy of the original letter's pages appended — since Docman uploads one letter at a time. The untouched original PDF and a governance manifest are also kept on this device for your own records, but aren't part of the file you upload. Primovex will not send anything to Docman automatically.</p>
        <div className="cf-finish-checks">
          <label><input type="checkbox" checked={finishChecks.original} onChange={(event) => setFinishChecks((current) => ({ ...current, original: event.target.checked }))} /><span><b>Original compared</b>I have compared the extracted findings and summary with the complete original document.</span></label>
          <label><input type="checkbox" checked={finishChecks.identity} onChange={(event) => setFinishChecks((current) => ({ ...current, identity: event.target.checked }))} /><span><b>Identity verified</b>I have checked the patient identity details shown in the source document.</span></label>
          <label><input type="checkbox" checked={finishChecks.review} onChange={(event) => setFinishChecks((current) => ({ ...current, review: event.target.checked }))} /><span><b>Clinical workflow reviewed</b>I have reviewed urgency, destination, actions, medicines and any accepted coding.</span></label>
        </div>
        <div className="cf-pack-preview"><strong>Upload to Docman</strong><span>One PDF · ClinFlow summary + copy of original letter</span><strong>Also kept on this device</strong><span>Untouched original PDF (for your records)</span><span>Governance manifest (for your records)</span></div>
        <footer><button type="button" onClick={() => setFinishOpen(false)}>Cancel</button><button type="button" className="primary" onClick={completeDocument} disabled={busy || !Object.values(finishChecks).every(Boolean)}>Create finished pack</button></footer>
      </div></div>}
      {noteOpen && <div className="cf-modal" role="dialog" aria-modal="true"><div><h2>Add workflow note</h2><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Synthetic testing only — do not enter patient-identifiable information" /><footer><button type="button" onClick={() => setNoteOpen(false)}>Cancel</button><button type="button" className="primary" onClick={saveNote} disabled={busy}>Acknowledge note</button></footer></div></div>}
      {teachingOpen && <div className="cf-modal cf-teaching-modal" role="dialog" aria-modal="true"><div>
        <h2>Score and teach ClinFlow</h2>
        <p className="cf-modal-guidance">Approved synthetic evidence only. This correction enters a governed review queue and cannot change live rules automatically.</p>
        <div className="cf-teaching-grid">
          <label>Actual outcome<select value={teachingForm.confirmedDecision} onChange={(event) => setTeachingForm((current) => ({ ...current, confirmedDecision: event.target.value }))}><option value="urgent">Urgent</option><option value="workflow_required">Workflow required</option><option value="no_workflow">NFWF</option><option value="review_required">Human review required</option></select></label>
          <label>Actual destination<select value={teachingForm.confirmedDestination} onChange={(event) => setTeachingForm((current) => ({ ...current, confirmedDestination: event.target.value }))}>{CLINFLOW_DESTINATIONS.map((destination) => <option key={destination}>{destination}</option>)}</select></label>
          <label>NFWF reason/category<select value={teachingForm.nfwfCategory} onChange={(event) => setTeachingForm((current) => ({ ...current, nfwfCategory: event.target.value }))}>{NFWF_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
          <label>Correction reason<input value={teachingForm.correctionReason} onChange={(event) => setTeachingForm((current) => ({ ...current, correctionReason: event.target.value }))} placeholder="Why is the suggested decision right or wrong?" /></label>
          <label className="wide">Corrected short summary<textarea value={teachingForm.correctedSummary} onChange={(event) => setTeachingForm((current) => ({ ...current, correctedSummary: event.target.value }))} placeholder="What should ClinFlow have said?" /></label>
          <label className="wide">Learning notes<textarea value={teachingForm.learningNotes} onChange={(event) => setTeachingForm((current) => ({ ...current, learningNotes: event.target.value }))} placeholder="Which wording or context should an authorised rule reviewer consider?" /></label>
        </div>
        <fieldset className="cf-accuracy-checks"><legend>What was accurate?</legend>{Object.entries({ identity: "Patient identity", summary: "Summary", medicines: "Medicines", actions: "Actions", urgency: "Urgency", coding: "Coding prompts" }).map(([key, label]) => <label key={key}><input type="checkbox" checked={teachingForm.accuracyChecks[key]} onChange={(event) => setTeachingForm((current) => ({ ...current, accuracyChecks: { ...current.accuracyChecks, [key]: event.target.checked } }))} />{label}</label>)}</fieldset>
        <footer><button type="button" onClick={() => setTeachingOpen(false)}>Cancel</button><button type="button" className="primary" onClick={saveTeaching} disabled={busy}>Save governed evidence</button></footer>
      </div></div>}
      {azureTestOpen && <SyntheticDocumentBatchPanel onClose={() => setAzureTestOpen(false)} onImport={importAzureResults} />}
      {toast && <div className="cf-toast">{toast}</div>}
    </section>
  );
}
