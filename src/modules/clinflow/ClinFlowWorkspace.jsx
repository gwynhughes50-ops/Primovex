import { useEffect, useMemo, useRef, useState } from "react";
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
  BarChart3,
  X,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
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
import { applyClinFlowAction, createClinFlowContext, recordClinFlowNoteMarker, subscribeClinFlowWorkflow } from "./clinflowService";
import SyntheticDocumentBatchPanel from "./SyntheticDocumentBatchPanel";
import { analyseClinFlowOcr, buildReviewerBrief } from "./clinflowAnalysisService";
import { AI_OUTPUT_FOOTER, HIGH_RISK_BANNER } from "./clinflowDisclaimers";
import { cacheClinFlowDocuments, loadCachedClinFlowDocuments, loadClinFlowSourceFile, loadFinishedClinFlowPacks, removeCachedClinFlowDocument, saveClinFlowTeachingFeedback, saveFinishedClinFlowPack } from "./clinflowDocumentCache";
import { triageLabel } from "./clinflowTriageService";
import { createClinFlowDemoPdfBlob, createClinFlowSummaryPdfBlob, downloadClinFlowDemoPdf, downloadClinFlowSummaryPdf } from "./clinflowSummaryExportService";
import { createDocmanPackZip, downloadBlob, safePackName } from "./clinflowZipService";
import DocmanReadiness from "./DocmanReadiness";
import { canSpotCheck, folderKindFor, needsSpotCheck } from "./clinflowNfwf";
import { LANES, LANE_WORDS, inLane, lanesFor } from "./clinflowLanes";
import { chooseFolder, deliverDocmanPdf, desktopFoldersAvailable, loadFolders } from "./docmanFolders";
import NextSteps from "./NextSteps";
import { buildNextSteps } from "./clinflowNextSteps";
import { CHOICES, applyDecision, decisionCounts, makeDecision, stepKey } from "./clinflowStepDecisions";
import Scorecard from "./Scorecard";
import QualityReview from "./QualityReview";
import TriageReview from "./TriageReview";
import { identityChecks } from "./clinflowSignals";
import { codingAuditMeta, termVersions, terminologyEvent } from "./clinflowAuditMeta";
import CodeReview from "./CodeReview";
import { addCode, candidateKey, choose, codesAfterReview, decide, removeAdded, reviewCandidates, reviewOutcome } from "./clinflowCodeReview";
import { useAbbreviations, useSnomedList } from "./snomedListStore";
import { analyzeSyntheticDocument } from "./azureDocumentIntelligenceClient";
import { normaliseClinFlowPages } from "./clinflowPageService";
import "./clinflow-workspace.css";
import "./clinflow-azure-button.css";

// ClinFlow starts empty: the eight made-up demonstration letters it used to open with are gone. Only their ids are kept, so a copy that an earlier version saved
// on this computer is cleared away rather than coming back.
const SAMPLE_DOCUMENTS = [];
const RETIRED_SAMPLE_IDS = ["cf-001", "cf-002", "cf-003", "cf-004", "cf-005", "cf-006", "cf-007", "cf-008"];

// Used to tell "one of the built-in demo letters" apart from a real imported
// document when merging Firestore's workflow sync into local state (see the
// subscribeClinFlowWorkflow effect below) — explicit id membership, not an
// indirect field check, so a real document is never mistaken for a stale
// sample and dropped when the sync fires.
const SAMPLE_DOCUMENT_IDS = new Set(RETIRED_SAMPLE_IDS);

// the letters saved on this computer, without any of the retired demonstration ones (which are removed as they are found)
async function loadCachedWithoutSamples() {
  const cached = await loadCachedClinFlowDocuments();
  const retired = cached.filter((item) => SAMPLE_DOCUMENT_IDS.has(item.id));
  retired.forEach((item) => removeCachedClinFlowDocument(item.id).catch(() => {}));
  return cached.filter((item) => !SAMPLE_DOCUMENT_IDS.has(item.id));
}

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
    // an uploaded letter that is not one of the known test documents has no title of its own, so the file name tells the letters apart; the patient is the name the AI read
    title: (result.document?.id === "attested-upload" ? String(response.fileName || "").replace(/\.pdf$/i, "") : "") || result.document?.title || response.fileName || "Azure analysed document",
    patient: result.llmExtraction?.patientName || expectedValue(result, "Patient"),
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

function AzureReviewView({ folders, onChooseFolder, onFileToDocman, selected, activeTab, onOpenTab, onStepDecide, onDocmanCopy, onCodeCopy, onQualityOpen, onQualitySent, onTriageOpen, onTriageSent, onDownloadSummary, onOpenOriginal, onTriageDecision, onOpenTeaching, canReviewCodes, snomedList, medicinesList, abbreviations, onCodeDecision, onCodeChoose, onCodeAdd, onCodeRemoveAdded }) {
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
    const calculatedValues = reviewCandidates(analysis, ocr?.content).filter((c) => c.calculated).map((candidate) => ({ key: candidateKey(candidate), candidate }));
    const codingState = reviewOutcome(reviewCandidates(analysis, ocr?.content), selected.codeReview);
    return <div className="cf-tab-content cf-glance">
      <NextSteps analysis={analysis} letter={ocr?.content || ""} letterRef={selected.id} decisions={selected.nextStepDecisions || {}} canDecide={canReviewCodes} onDecide={onStepDecide} coding={{ waiting: codingState.waiting.length, accepted: codingState.accepted.length }} />
      <section className="cf-glance-facts">
        <div><span>Patient</span><strong>{selected.patient}</strong></div>
        <div><span>Date of birth</span><strong>{selected.dob}</strong></div>
        <div><span>NHS number</span><strong>{selected.nhs}</strong></div>
        <div><span>Specialty</span><strong>{analysis?.specialty || analysis?.documentType || "Not stated"}</strong></div>
      </section>

      <section className="cf-summary-card"><Sparkles size={18} /><div><b>Clinical summary</b><p>{analysis?.clinicalConclusion || `Azure extracted ${ocr.wordCount} words across ${ocr.pageCount} page${ocr.pageCount === 1 ? "" : "s"}. No single overall conclusion sentence was found in the letter — review the diagnoses and actions below.`}</p></div></section>

      {calculatedValues.length > 0 && <div className="cf-info-grid">{calculatedValues.map((item) => <section key={item.key} className="cf-tone cf-tone--calculated"><h3>Calculated by ClinFlow</h3><p><b>{item.candidate.preferredTerm}: {item.candidate.sourceValue}</b><br /><small>{item.candidate.calculated.working}</small></p></section>)}</div>}

      <div className="cf-info-grid">
        <section className="cf-tone cf-tone--diagnosis"><h3>Diagnoses / problems</h3><p>{analysis?.diagnoses?.map((item) => item.value).join("; ") || "None extracted"}</p></section>
        <section className="cf-tone cf-tone--medicine"><h3>Current / relevant medication</h3><p>{(analysis?.currentMedications?.length ? analysis.currentMedications : analysis?.medicines)?.map((item) => item.value).join("; ") || "None extracted"}</p></section>
      </div>

      <section className="cf-summary-card cf-summary-card--list"><ClipboardCheck size={18} /><div className="cf-glance-actions"><b>Recommended actions</b>{analysis?.actions?.length ? <ul>{analysis.actions.map((item, index) => <li key={index}>{item.value}</li>)}</ul> : <p>No actions extracted.</p>}</div></section>

      <div className="cf-info-grid">
        <section className="cf-tone cf-tone--medicine"><h3>Temporary medication instructions</h3><p>{analysis?.medicationInstructions?.length ? analysis.medicationInstructions.map((item) => item.value).join("; ") : "None"}</p></section>
        <section className="cf-tone cf-tone--alert"><h3>Correspondence priority</h3><p><span className={`cf-priority-pill cf-priority-pill--${urgent ? "urgent" : "routine"}`}>{urgent ? "Urgent" : "Routine"}</span><br /><small>Suggested — verify</small></p></section>
      </div>

      <div className="cf-info-grid">
        <section className="cf-tone cf-tone--info"><h3>Suggested workflow destination</h3><p><span className="cf-priority-pill cf-priority-pill--destination">{analysis?.triage?.destination || "Workflow review"}</span></p></section>
        <section className="cf-tone cf-tone--alert"><h3>Safety flags</h3><p>{urgent ? "Urgent — escalate immediately." : analysis?.safetyNettingAdvice ? `Safety-net advice: ${analysis.safetyNettingAdvice}` : "No safety concerns identified."}</p></section>
      </div>

      <section className="cf-summary-card"><Tag size={18} /><div><b>Suggested SNOMED concepts</b><p>Candidates only — current UK Edition validation and clinician acceptance required before filing.</p></div></section>
      {matchedConcepts.length > 0 && <div className="cf-snomed-checklist">{matchedConcepts.map((item, index) => <div className="cf-snomed-row" key={`${item.sourceLabel}-${item.conceptId}-${index}`}><CheckCircle2 size={14} /><span>{item.preferredTerm}</span><code>{item.conceptId}</code></div>)}</div>}

      <div className="cf-info-grid">
        <section className="cf-tone cf-tone--test"><h3>SNOMED match count</h3><p>{matchedConcepts.length} of {totalConcepts} finding{totalConcepts === 1 ? "" : "s"} matched</p></section>
        <section><h3>Confidence</h3><p className="cf-confidence-value">{aiConfidence}%</p><div className="cf-confidence-bar"><div style={{ width: `${aiConfidence}%` }} /></div></section>
      </div>
    </div>;
  }
  if (activeTab === "triage") return <TriageReview analysis={analysis} review={selected.triageReview} letterRef={selected.id} canSend={canReviewCodes} canConfirm={canReviewCodes} onDecision={onTriageDecision} onOpenTeaching={onOpenTeaching} onOpenSend={onTriageOpen} onSent={onTriageSent} letterText={ocr?.content} destinations={CLINFLOW_DESTINATIONS} />;
  if (activeTab === "data") {
    const extractedFields = [
      ...(analysis?.diagnoses || []).map((item) => ({ group: "Diagnosis", value: item.value, source: item.source })),
      ...(analysis?.medicines || []).map((item) => ({ group: "Medication", value: item.value, source: item.source })),
      ...(analysis?.actions || []).map((item) => ({ group: "Follow-up", value: item.value, source: item.source })),
      ...(analysis?.observations || []).map((item) => ({ group: "Observation", value: item.value, source: item.source })),
    ];
    return <div className="cf-tab-content">
      <section className="cf-summary-card"><FileText size={18} /><div><b>Extracted data</b><p>Every field below is a candidate extracted from the document — nothing is clinically accepted until a trained clinician verifies it against the original.</p></div></section>
      <div className="cf-info-grid">{extractedFields.length ? extractedFields.map((item, index) => <section key={`${item.group}-${item.value}-${index}`} className={`cf-tone cf-tone--${{ Diagnosis: "diagnosis", Medication: "medicine", "Follow-up": "action", Observation: "test" }[item.group] || "info"}`}><h3>{item.group}</h3><p>{item.value}<br /><b>{item.source === "llm_extraction" ? "AI-extracted · needs review" : "Extracted · needs review"}</b></p></section>) : <section><h3>No structured facts extracted</h3><p>ClinFlow did not extract any diagnoses, medicines, actions or observations from this document. Review the OCR text on the Document tab.</p></section>}</div>
      {ocr.groundTruth?.length ? <div className="cf-info-grid">{ocr.groundTruth.map((item) => <section key={`${item.label}-${item.expected}`}><h3>{item.label}</h3><p>{item.expected}<br /><b>{item.matched ? "Detected in OCR" : "Not detected · review required"}</b></p></section>)}</div> : null}
    </div>;
  }
  if (activeTab === "snomed") return <div className="cf-tab-content">
    <section className="cf-summary-card"><Tag size={18} /><div><b>SNOMED CT candidate review</b><p>Structured observations use governed baseline concepts where available. Every candidate still requires current UK Edition validation, patient matching and trained clinician acceptance before filing.</p></div></section>
    {analysis?.structuredObservations?.length ? <div className="cf-info-grid">{analysis.structuredObservations.map((item) => <section key={`${item.type}-${item.sourceValue}`}><h3>{item.preferredTerm}</h3>{item.type === "blood_pressure" ? <p><b>{item.systolic.value}/{item.diastolic.value} {item.unit.display}</b><br />Blood pressure: {item.conceptId}<br />Systolic: {item.systolic.conceptId}<br />Diastolic: {item.diastolic.conceptId}<br />Unit: {item.unit.ucumCode}<br />Status: clinician review required</p> : <p><b>{item.value} {item.unit.display}</b><br />Concept ID: {item.conceptId}<br />Unit: {item.unit.ucumCode}<br />Status: clinician review required</p>}</section>)}</div> : null}
    <CodeReview onCopy={onCodeCopy} candidates={reviewCandidates(analysis, ocr?.content)} letter={ocr?.content || ""} review={selected.codeReview} canEdit={canReviewCodes} list={snomedList} medList={medicinesList} abbreviations={abbreviations} onDecide={onCodeDecision} onChoose={onCodeChoose} onAdd={onCodeAdd} onRemoveAdded={onCodeRemoveAdded} />
  </div>;
  if (activeTab === "quality") return <QualityReview analysis={analysis} letterRef={selected.id} canSend={canReviewCodes} onOpenSend={onQualityOpen} onSent={onQualitySent} />;
  if (activeTab === "outflow") return <div className="cf-tab-content"><DocmanReadiness analysis={analysis} fileReady={Boolean(ocr?.fileName)} outcome={reviewOutcome(reviewCandidates(analysis, ocr?.content), selected.codeReview)} onDownload={onFileToDocman} folderKind={folderKindFor(selected.triageReview)} folders={folders} canChooseFolders={desktopFoldersAvailable()} onChooseFolder={onChooseFolder} savedFolder={selected.triageReview?.savedFolder || ""} onCopy={onDocmanCopy} onOpenCodes={() => onOpenTab?.("snomed")} /></div>;
  return <div className="cf-timeline">{[["Document accepted", "Approved synthetic fingerprint verified"], ["OCR completed", `Azure Document Intelligence · ${confidence}% average word confidence`], ["Added to ClinFlow", "Session-only OCR evidence added to the review queue"], ["Awaiting human review", "No patient match, route or clinical action has been confirmed"]].map(([title, detail]) => <div key={title}><span /><strong>{title}</strong><p>{detail}</p></div>)}</div>;
}

export default function ClinFlowWorkspace() {
  const { user, displayName, profile, can } = useAuth();
  const snomedList = useSnomedList("snomed");
  const medicinesList = useSnomedList("dmd");
  const abbreviations = useAbbreviations();
  // Loading or removing a terminology list changes what codes are suggested, so each is written to the audit trail with the release that is in use
  const pendingLoad = useRef({ snomed: "", dmd: "", abbreviations: "" });
  const auditedList = (list, kind) => ({
    ...list,
    load: async (file) => { pendingLoad.current[kind] = file?.name || "file"; await list.load(file); },
    remove: async () => { await list.remove(); pendingLoad.current[kind] = ""; recordTerminology(terminologyEvent(kind, "remove")); },
  });
  const auditedAbbreviations = {
    ...abbreviations,
    load: async (file) => { pendingLoad.current.abbreviations = file?.name || "file"; await abbreviations.load(file); },
    remove: async () => { await abbreviations.remove(); pendingLoad.current.abbreviations = ""; recordTerminology(terminologyEvent("abbreviations", "remove")); },
  };
  function recordTerminology(event) {
    return writeAuditEvent({ actor: { uid: user?.uid, displayName: displayName || user?.email }, action: event.action, module: "clinflow", targetType: "clinflow_terminology", targetId: event.metadata.kind, summary: event.summary, metadata: event.metadata, classification: "operational" }).catch(() => {});
  }
  useEffect(() => { if (pendingLoad.current.snomed && snomedList.search) { recordTerminology(terminologyEvent("snomed", "load", { info: snomedList.info, fileLabel: pendingLoad.current.snomed })); pendingLoad.current.snomed = ""; } }, [snomedList.search]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (pendingLoad.current.dmd && medicinesList.search) { recordTerminology(terminologyEvent("dmd", "load", { info: medicinesList.info, fileLabel: pendingLoad.current.dmd })); pendingLoad.current.dmd = ""; } }, [medicinesList.search]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (pendingLoad.current.abbreviations && abbreviations.version) { recordTerminology(terminologyEvent("abbreviations", "load", { info: `${abbreviations.info.label}: ${abbreviations.info.count} abbreviations`, fileLabel: pendingLoad.current.abbreviations })); pendingLoad.current.abbreviations = ""; } }, [abbreviations.version]); // eslint-disable-line react-hooks/exhaustive-deps
  // Each next step on a letter is the person's own decision: they do it, send it to a colleague, or say no action is needed (with a reason). The choice is kept on the
  // letter and written to the audit trail with who made it; the suggested owner (GP, nurse...) is only a suggestion.
  async function decideStep(step, choice, extra = {}) {
    if (!can("clinflow.workflow")) return denied("clinflow.workflow", "Your role cannot decide the next steps on a ClinFlow letter");
    const decision = choice ? makeDecision(choice, { byUid: user?.uid, byName: displayName || user?.email, to: extra.to, reason: extra.reason }) : null;
    if (choice && !decision) return notify("Choose a reason first");
    const updated = { ...selected, nextStepDecisions: applyDecision(selected.nextStepDecisions, stepKey(step), decision) };
    setDocuments((items) => items.map((item) => item.id === selected.id ? updated : item));
    if (selected.dataMode === "synthetic") await cacheClinFlowDocuments([updated]).catch(() => {});
    track("clinflow.step.decide", choice ? `A next step was marked: ${CHOICES[choice]}` : "A next-step decision was put back to undecided", { kind: step.kind || "step", choice: choice || "reopened", suggestedFor: step.owner, reason: extra.reason || "", sentTo: extra.to || "", withDetails: Boolean(extra.withDetails), recipients: extra.sent || 0 });
  }
  const stepsOf = (doc) => {
    if (!doc?.clinflowAnalysis) return {};
    const c = decisionCounts(buildNextSteps(doc.clinflowAnalysis, {}, doc.syntheticOcr?.content).steps, doc.nextStepDecisions || {});
    return { stepsTotal: c.steps, stepsUndecided: c.undecided, stepsSelf: c.self, stepsDone: c.done, stepsSent: c.sent, stepsNoAction: c.none };
  };
  const versionsInUse = () => termVersions({ snomed: snomedList.search ? snomedList.info : "", medicines: medicinesList.search ? medicinesList.info : "", abbreviations: abbreviations.info.builtIn ? "built-in list" : abbreviations.info.label });
  const codingOf = (doc) => (doc?.clinflowAnalysis ? codingAuditMeta(reviewCandidates(doc.clinflowAnalysis, doc.syntheticOcr?.content), doc.codeReview) : {});
  const [documents, setDocuments] = useState(SAMPLE_DOCUMENTS);
  const [selectedId, setSelectedId] = useState(SAMPLE_DOCUMENTS[0]?.id || "");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("document");
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  // The two side panels fold away so the letter gets the whole screen; each remembers how it was left on this computer
  const remembered = (key) => { try { return globalThis.localStorage?.getItem(key) === "true"; } catch { return false; } };
  const [panelCollapsed, setPanelCollapsed] = useState(() => remembered("primovex.clinflow.panelCollapsed"));
  const [sampleZoom, setSampleZoom] = useState(100);
  const [queueCollapsed, setQueueCollapsed] = useState(() => remembered("primovex.clinflow.queueCollapsed"));
  // Notices above the letter (double-check the patient, human review, what's required next) can be put away once they have been seen, to give the letter more room.
  // They come back for the next letter, and can be shown again; each is on the audit trail.
  const [putAway, setPutAway] = useState({});
  const noticesFor = (id) => putAway[id] || [];
  const dismissNotice = (notice) => {
    if (!selected?.id) return;
    setPutAway((current) => ({ ...current, [selected.id]: [...(current[selected.id] || []).filter((n) => n !== notice), notice] }));
    track("clinflow.notice.dismiss", "A notice above the letter was put away", { notice });
  };
  const showNotices = () => { setPutAway((current) => ({ ...current, [selected.id]: [] })); track("clinflow.notice.show", "Notices above the letter were shown again", {}); };
  const setLayout = (queue, panel) => {
    setQueueCollapsed(queue); setPanelCollapsed(panel);
    try { globalThis.localStorage?.setItem("primovex.clinflow.queueCollapsed", String(queue)); globalThis.localStorage?.setItem("primovex.clinflow.panelCollapsed", String(panel)); } catch { /* the layout is only a convenience */ }
    track("clinflow.layout.change", "ClinFlow screen layout changed", { queue: queue ? "folded" : "open", actions: panel ? "folded" : "open" });
  };
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [toast, setToast] = useState("");
  const [syncState, setSyncState] = useState("local");
  const [busy, setBusy] = useState(false);
  const [azureTestOpen, setAzureTestOpen] = useState(false);
  const [teachingOpen, setTeachingOpen] = useState(false);
  const [scorecardOpen, setScorecardOpen] = useState(false);
  const [docmanFolders, setDocmanFolders] = useState({ nfw: "", action: "" });
  useEffect(() => { let live = true; loadFolders().then((folders) => { if (live) setDocmanFolders(folders); }); return () => { live = false; }; }, []);
  const [teachingForm, setTeachingForm] = useState(teachingFormFor());
  const [finishedPacks, setFinishedPacks] = useState([]);
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishChecks, setFinishChecks] = useState({ original: false, identity: false, review: false });

  const context = useMemo(() => createClinFlowContext({ user, profile }), [profile, user]);

  useEffect(() => {
    let active = true;
    loadCachedWithoutSamples().then((cached) => {
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
  const identityNote = useMemo(() => {
    const analysis = selected?.clinflowAnalysis;
    if (!analysis || !selected?.syntheticOcr) return null;
    const checks = identityChecks({ givenNames: analysis.patient?.givenNames, familyName: analysis.patient?.familyName, nhsNumber: analysis.docmanDraft?.patient?.identifier, birthDate: analysis.docmanDraft?.patient?.birthDate, letterDate: analysis.docmanDraft?.document?.eventDate }, selected.syntheticOcr.content);
    return checks.level === "high" || checks.commonName ? checks : null;
  }, [selected]);
  // who opened which letter: once per letter per session, so reading a letter is on the record without a line for every click
  const viewedLetters = useRef(new Set());
  useEffect(() => {
    if (!selected?.id || viewedLetters.current.has(selected.id)) return;
    viewedLetters.current.add(selected.id);
    record("clinflow.document.view", "ClinFlow letter opened for review", { dataMode: selected.dataMode || "synthetic" }).catch(() => {});
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // which tab of a letter was opened, which queue was looked at, and that a search was made (how long, never what for)
  const trackedTab = useRef(activeTab);
  useEffect(() => { if (trackedTab.current === activeTab) return; trackedTab.current = activeTab; track("clinflow.tab.view", "ClinFlow tab opened", { tab: String(activeTab).replace(/^synthetic-/, "") }); }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps
  const trackedFilter = useRef(filter);
  useEffect(() => { if (trackedFilter.current === filter) return; trackedFilter.current = filter; track("clinflow.queue.filter", "ClinFlow queue changed", { queue: filter }); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (query.trim().length < 2) return undefined;
    const timer = setTimeout(() => track("clinflow.search", "ClinFlow documents searched", { termLength: query.trim().length }), 1500);
    return () => clearTimeout(timer);
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  function replaceSelected(changes) {
    if (!selected?.id) return null;
    const updated = { ...selected, ...changes };
    setDocuments((items) => items.map((item) => item.id === selected.id ? updated : item));
    if (updated.dataMode === "synthetic") cacheClinFlowDocuments([updated]).catch((error) => console.error("ClinFlow document cache update failed", error));
    return updated;
  }

  const lanes = useMemo(() => lanesFor(documents), [documents]);
  const visibleDocuments = useMemo(() => {
    const q = query.trim().toLowerCase();
    return documents.filter((item) => {
      if (!inLane(lanes.byId.get(item.id), filter)) return false;
      if (q && ![item.title, item.patient, item.source, item.specialty, item.nhs].join(" ").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [documents, lanes, filter, query]);

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

  // Every move a person makes is on the record: what they changed, what they opened, what they copied or downloaded, and what they were refused
  function track(action, summary, metadata = {}) {
    return record(action, summary, { ...metadata, automatedTransmission: false }).catch(() => {});
  }
  function denied(permission, message) {
    writeAuditEvent({ actor: { uid: user?.uid, displayName: displayName || user?.email }, action: "clinflow.action.denied", module: "clinflow", targetType: "clinical_document", targetId: selected?.id, summary: message, metadata: { permission, automatedTransmission: false }, permissionDecision: "denied", outcome: "denied", classification: selected?.dataMode === "live" ? "special_category" : "synthetic" }).catch(() => {});
    notify(message);
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

  // The coder accepts, removes or adds codes. The change is kept on the letter, in this device's copy, and written to the audit trail with who did it.
  async function saveCodeReview(review, action, summary, metadata = {}) {
    if (!can("clinflow.workflow")) return denied("clinflow.workflow", "Your role cannot change the codes on a ClinFlow letter");
    await runAction(async () => {
      const updated = { ...selected, codeReview: review, clinflowAnalysis: { ...selected.clinflowAnalysis, docmanDraft: { ...selected.clinflowAnalysis?.docmanDraft, clinicalCodes: codesAfterReview(reviewCandidates(selected.clinflowAnalysis, selected.syntheticOcr?.content), review) } } };
      setDocuments((items) => items.map((item) => item.id === selected.id ? updated : item));
      if (selected.dataMode === "synthetic") await cacheClinFlowDocuments([updated]);
      await record(action, summary, { ...metadata, ...versionsInUse(), automatedTransmission: false });
    });
  }
  const coder = () => ({ uid: user?.uid || "", name: displayName || user?.email || "" });
  const decideCode = (candidate, decision, pick = null) => saveCodeReview(decide(selected.codeReview, candidate, decision, { ...coder(), pick }), "clinflow.code_review", `SNOMED code ${decision === "suggested" ? "put back as a suggestion" : decision}: ${pick?.term || candidate.preferredTerm || candidate.searchTerm || candidate.sourceValue}`, { decision, conceptId: pick?.conceptId || candidate.conceptId || null, calculated: candidate.calculated?.kind || "" });
  const chooseCode = (candidate, option) => saveCodeReview(choose(selected.codeReview, candidate, option, coder()), "clinflow.code_review", `A different SNOMED code was chosen for ${candidate.searchTerm || candidate.sourceValue}: ${option?.term || "the first match"}`, { decision: "chose a different code", conceptId: option?.conceptId || null, calculated: candidate.calculated?.kind || "" });
  const addCodeByCoder = async (input) => { await saveCodeReview(addCode(selected.codeReview, input, coder()), "clinflow.code_review", `SNOMED code added by the coder: ${input.term}`, { decision: "added", conceptId: input.conceptId || null }); };
  const removeAddedCode = (id) => saveCodeReview(removeAdded(selected.codeReview, id, coder()), "clinflow.code_review", "A code added by the coder was taken out", { decision: "took out an added code" });

  async function routeDocument(destination) {
    if (!can("clinflow.workflow")) return denied("clinflow.workflow", "Your role cannot route ClinFlow documents");
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
    if (!can("clinflow.workflow")) return denied("clinflow.workflow", "Your role cannot finish ClinFlow documents");
    if (!folderKindFor(selected?.triageReview)) {
      setActiveTab("synthetic-triage");
      return notify("Confirm the outcome first (is any action needed?) so the finished PDF goes in the right Docman folder");
    }
    setFinishChecks({ original: false, identity: false, review: false });
    setFinishOpen(true);
    track("clinflow.finish.open", "Finish dialog opened", { codesWaiting: codingOf(selected).codesWaiting ?? 0 });
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
      await record("clinflow.finished.pack_created", "ClinFlow reviewed document moved to Finished and Docman pack prepared", { destination: updated.destination, originalUnchanged: true, automatedTransmission: false, ...codingOf(updated), ...stepsOf(updated), ...versionsInUse() });
      notify("Finished pack created with the original and ClinFlow summary");
    });
  }

  async function archiveDocument() {
    if (!can("clinflow.manage")) return denied("clinflow.manage", "ClinFlow management permission is required");
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
    if (!can("clinflow.manage")) return denied("clinflow.manage", "ClinFlow management permission is required");
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


  async function setPriority() {
    if (!can("clinflow.workflow")) return denied("clinflow.workflow", "Your role cannot change workflow priority");
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
    if (!can("clinflow.workflow")) return denied("clinflow.workflow", "Your role cannot claim workflow documents");
    await runAction(async () => {
      if (context.cloudEnabled) await applyClinFlowAction(selected, { type: "claim", summary: "Document claimed for review" }, context);
      replaceSelected({ status: "in_review", claimedByUid: user?.uid || "synthetic-demo-user", claimedAt: new Date().toISOString(), persisted: context.cloudEnabled || selected.persisted });
      await record("clinflow.claim", "Document claimed for review");
      notify("Document claimed for review");
    });
  }

  async function saveNote() {
    if (!can("clinflow.workflow")) return denied("clinflow.workflow", "Your role cannot add workflow notes");
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
    if (!can("clinflow.workflow")) return denied("clinflow.workflow", "Your role cannot confirm ClinFlow triage");
    let saved = false;
    await runAction(async () => {
      const triage = effectiveTriageFor(selected);
      const destination = feedback.confirmedDestination || (decision === "no_workflow" ? "NFWF" : decision === "review_required" ? "Workflow review" : decision === triage.decision ? triage.destination : decision === "urgent" ? "GP" : "Workflow Team");
      await saveClinFlowTeachingFeedback({ document: selected, suggestedDecision: triage.decision, confirmedDecision: decision, actorUid: user?.uid, feedback: { ...feedback, confirmedDestination: destination } });
      if (context.cloudEnabled) await applyClinFlowAction(selected, { type: "triage", decision, rulesetVersion: triage.rulesetVersion, summary: `ClinFlow triage confirmed as ${triageLabel(decision)}`, metadata: { suggestedDecision: triage.decision, confirmedDecision: decision, confirmedDestination: destination, nfwfCategory: feedback.nfwfCategory || "", rulesetVersion: triage.rulesetVersion } }, context);
      const spotCheck = decision === "no_workflow" && triage.decision === "no_workflow" && needsSpotCheck({ id: selected.id, category: triage.nfwf?.category }) ? { status: "pending", requestedAt: new Date().toISOString() } : null;
      const triageReview = { confirmedDecision: decision, suggestedDecision: triage.decision, confirmedDestination: destination, nfwfCategory: feedback.nfwfCategory || "", correctionReason: feedback.correctionReason || "", reasonCode: feedback.reasonCode || "", confirmedByUid: user?.uid || "", spotCheck, status: "human_confirmed", reviewedAt: new Date().toISOString(), rulesetVersion: triage.rulesetVersion };
      const updated = { ...selected, destination, priority: decision === "urgent" ? "high" : selected.priority, triageReview, persisted: context.cloudEnabled || selected.persisted };
      setDocuments((items) => items.map((item) => item.id === selected.id ? updated : item));
      await cacheClinFlowDocuments([updated]);
      await record("clinflow.triage_confirm", `ClinFlow triage confirmed as ${triageLabel(decision)}`, { suggestedDecision: triage.decision, confirmedDecision: decision, confirmedDestination: destination, nfwfCategory: feedback.nfwfCategory || "", reasonCode: feedback.reasonCode || "", docmanFolder: decision === "no_workflow" ? "nfw" : "action", spotCheckRequested: Boolean(spotCheck), rulesetVersion: triage.rulesetVersion });
      notify(`Triage confirmed: ${triageLabel(decision)}`);
      saved = true;
    });
    return saved;
  }

  function openTeaching() {
    if (!can("clinflow.workflow")) return denied("clinflow.workflow", "Your role cannot score or teach ClinFlow");
    if (selected?.dataMode === "live") return notify("Score and Teach is currently restricted to approved synthetic cases");
    setTeachingForm(teachingFormFor(effectiveTriageFor(selected)));
    setTeachingOpen(true);
    track("clinflow.teaching.open", "Score and teach opened", {});
  }

  async function saveTeaching() {
    if (!teachingForm.correctionReason.trim() && teachingForm.confirmedDecision !== effectiveTriageFor(selected).decision) {
      return notify("Add a short reason for the correction so it can be governed and reviewed");
    }
    const saved = await confirmTriageDecision(teachingForm.confirmedDecision, teachingForm);
    if (saved) setTeachingOpen(false);
  }

  async function chooseDocmanFolder(kind) {
    try {
      const path = await chooseFolder(kind);
      if (!path) return;
      setDocmanFolders(await loadFolders());
      await record("clinflow.docman.folder_set", `The ${kind === "nfw" ? "NFW" : "Action needed"} Docman folder was chosen on this computer`, { docmanFolder: kind });
      notify(`The ${kind === "nfw" ? "NFW" : "Action needed"} folder is set`);
    } catch (error) {
      notify(error?.message || "The folder could not be chosen");
    }
  }

  // The Docman PDF goes into the NFW folder if a person confirmed "no action needed", otherwise into the Action needed folder. Nothing is filed until a person has confirmed.
  async function fileToDocman() {
    const kind = folderKindFor(selected?.triageReview);
    if (!kind) {
      setActiveTab("synthetic-triage");
      return notify("Confirm the outcome first (is any action needed?) so the PDF goes in the right Docman folder");
    }
    const kindWord = kind === "nfw" ? "NFW" : "Action needed";
    try {
      const originalBlob = await resolveOriginalFile(selected).catch(() => null);
      const built = await createClinFlowSummaryPdfBlob(selected, originalBlob);
      const result = await deliverDocmanPdf({ blob: built.blob, fileName: built.fileName, kind, folders: docmanFolders });
      const updated = { ...selected, triageReview: { ...selected.triageReview, savedFolder: kind, savedAt: new Date().toISOString() } };
      setDocuments((items) => items.map((item) => item.id === selected.id ? updated : item));
      await cacheClinFlowDocuments([updated]);
      await record("clinflow.docman.filed", `Docman PDF ${result.saved ? "saved into" : "downloaded for"} the ${kindWord} folder`, { docmanFolder: kind, savedToFolder: result.saved, appendedOriginal: built.appendedOriginal, ...codingOf(selected), ...stepsOf(selected), ...versionsInUse(), automatedTransmission: false });
      notify(result.saved ? `Saved in the ${kindWord} folder` : `Downloaded for the ${kindWord} folder${desktopFoldersAvailable() ? ". Choose the two folders on this tab to save straight into them" : ""}`);
    } catch (error) {
      console.error("ClinFlow Docman filing failed", error);
      notify(error?.message || "The Docman PDF could not be saved");
    }
  }

  // A clinician's second look at a letter someone confirmed as "no action needed". It must be a different person. Agreeing is recorded; disagreeing moves the letter to
  // the Action needed folder and records why, so ClinFlow's mistake is counted.
  async function resolveSpotCheck(document, agree, reasonCode = "") {
    if (!can("clinflow.workflow")) return denied("clinflow.workflow", "Your role cannot check ClinFlow letters");
    const review = document?.triageReview;
    if (review?.spotCheck?.status !== "pending") return notify("That letter is not waiting for a check");
    if (!canSpotCheck({ checkerUid: user?.uid, confirmedByUid: review.confirmedByUid })) return notify("A different person from the one who confirmed it has to check it");
    if (!agree && !reasonCode) return notify("Say what needs action first");
    await runAction(async () => {
      await saveClinFlowTeachingFeedback({ document, suggestedDecision: "no_workflow", confirmedDecision: agree ? "no_workflow" : "workflow_required", actorUid: user?.uid, feedback: { source: "spot_check", reasonCode: agree ? "confirmed_right" : reasonCode, confirmedDestination: agree ? "NFWF" : "Workflow Team", nfwfCategory: agree ? review.nfwfCategory : "Not NFWF" } });
      const checkedAt = new Date().toISOString();
      const triageReview = { ...review, spotCheck: { ...review.spotCheck, status: agree ? "agree" : "disagree", byUid: user?.uid || "", checkedAt, reasonCode: agree ? "" : reasonCode }, ...(agree ? {} : { confirmedDecision: "workflow_required", confirmedDestination: "Workflow Team" }) };
      const updated = { ...document, ...(agree ? {} : { destination: "Workflow Team" }), triageReview };
      setDocuments((items) => items.map((item) => item.id === document.id ? updated : item));
      await cacheClinFlowDocuments([updated]);
      await record("clinflow.nfw.spot_check", agree ? "A clinician agreed a letter needs no action" : "A clinician said a 'no action needed' letter needs action", { agreed: agree, reasonCode: agree ? "" : reasonCode, alreadySavedInNfwFolder: !agree && review.savedFolder === "nfw" }, document.id);
      notify(agree ? "Check recorded: no action needed" : review.savedFolder === "nfw" ? "Recorded. The PDF was already saved in the NFW folder: move it to the Action needed folder" : "Recorded. It now belongs in the Action needed folder");
    });
  }

  async function downloadSummary() {
    try {
      const originalBlob = await resolveOriginalFile(selected).catch(() => null);
      const result = await downloadClinFlowSummaryPdf(selected, originalBlob);
      await record("clinflow.summary.download", "ClinFlow clinician-review summary downloaded", { format: "pdf", appendedOriginal: result.appendedOriginal, ...codingOf(selected), ...stepsOf(selected), ...versionsInUse() });
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
    if (!can("clinflow.capture")) return denied("clinflow.capture", "ClinFlow capture permission is required to reprocess OCR");
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
      const zip = await createDocmanPackZip(packs, (pack) => { const kind = folderKindFor(documents.find((doc) => doc.id === pack.documentId)?.triageReview); return kind === "nfw" ? "NFW" : kind === "action" ? "Action needed" : ""; });
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
    const kind = folderKindFor(selected?.triageReview);
    if (!kind) return notify("Confirm the outcome on the Triage tab first (is any action needed?) so the PDF goes in the right Docman folder");
    deliverDocmanPdf({ blob: pack.summaryBlob, fileName: pack.summaryFileName, kind, folders: docmanFolders }).then((result) => {
      record("clinflow.finished.download", `Finished ClinFlow document (summary + original copy) ${result.saved ? "saved into" : "downloaded for"} the ${kind === "nfw" ? "NFW" : "Action needed"} Docman folder`, { format: "pdf", docmanFolder: kind, savedToFolder: result.saved, automatedTransmission: false }, pack.documentId).catch(() => {});
      notify(result.saved ? `Saved in the ${kind === "nfw" ? "NFW" : "Action needed"} folder` : "Docman-ready PDF downloaded (ClinFlow summary + copy of the original letter)");
    }).catch((error) => notify(error?.message || "The Docman PDF could not be saved"));
  }

  async function refreshWorkflow() {
    try {
      const [cached, packs] = await Promise.all([loadCachedWithoutSamples(), loadFinishedClinFlowPacks()]);
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
    notify(selected.syntheticOcr ? "Patient matching requires human verification: check the name, date of birth and NHS number against the practice record" : "ClinFlow cannot open the patient record yet: there is no link to the clinical system. Search for the patient there by name and date of birth");
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

  // the working tabs first, what is only for reference at the end
  const tabs = [
    ["document", "Document"],
    ["summary", "AI Summary"],
    ...(selected?.syntheticOcr ? [["snomed", "SNOMED Review"], ["triage", "Triage"], ["quality", "Quality / QAIF"], ["outflow", "Docman Summary"]] : []),
    ["data", "Extracted Data"],
    ["timeline", "Timeline"],
  ];

  return (
    <section className={`clinflow-shell${panelCollapsed ? " clinflow-shell--panel-collapsed" : ""}${queueCollapsed ? " clinflow-shell--queue-collapsed" : ""}`}>
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
          <button className="cf-top-button" type="button" onClick={refreshWorkflow} disabled={busy}><RefreshCw size={15} /> Refresh</button>
          <span className="cf-user-chip"><UserRound size={16} /> {displayName || "Workflow user"}</span>
        </div>
      </header>

      <aside className="cf-queue">
        <button type="button" className="cf-rail" onClick={() => setLayout(false, panelCollapsed)} aria-label="Show the letters list" title="Show the letters list"><PanelLeftOpen size={16} /><span>Letters ({visibleDocuments.length})</span></button>
        <div className="cf-queue-tabs">
          {LANES.map(([key, label]) => (
            <button type="button" key={key} className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>{label} ({lanes.counts[key]})</button>
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
              <small>{item.received}{lanes.byId.get(item.id) !== "finished" && <em className={`cf-lane cf-lane--${lanes.byId.get(item.id)}`}>{LANE_WORDS[lanes.byId.get(item.id)]}</em>}</small>
            </button>
          ))}
        </div>
        <footer>Showing {visibleDocuments.length} of {documents.length} documents</footer>
      </aside>

      <main className="cf-workspace">
        {!selected ? <div className="cf-empty">{documents.length ? "No document selected." : "There are no letters in ClinFlow yet. Choose “Test Azure OCR” at the top to analyse one."}</div> : <>
          <div className="cf-document-heading">
            <div>
              <button type="button" className="cf-pane-button" onClick={() => setLayout(!queueCollapsed, panelCollapsed)} aria-pressed={queueCollapsed} aria-label={queueCollapsed ? "Show the letters list" : "Hide the letters list"} title={queueCollapsed ? "Show the letters list" : "Hide the letters list"}>{queueCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button>
              <h2>{selected.title}</h2>{selected.priority === "high" && <span>High Priority</span>}
            </div>
            <div>
              <small>Received: {selected.received}</small>
              <button type="button" className="cf-pane-button" onClick={() => (queueCollapsed && panelCollapsed ? setLayout(false, false) : setLayout(true, true))} aria-pressed={queueCollapsed && panelCollapsed} aria-label={queueCollapsed && panelCollapsed ? "Show both side panels" : "Give the letter the whole screen"} title={queueCollapsed && panelCollapsed ? "Show both side panels" : "Give the letter the whole screen"}>{queueCollapsed && panelCollapsed ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
              <button type="button" className="cf-pane-button" onClick={() => setLayout(queueCollapsed, !panelCollapsed)} aria-pressed={panelCollapsed} aria-label={panelCollapsed ? "Show the actions panel" : "Hide the actions panel"} title={panelCollapsed ? "Show the actions panel" : "Hide the actions panel"}>{panelCollapsed ? <PanelRightOpen size={17} /> : <PanelRightClose size={17} />}</button>
            </div>
          </div>
          <div className="cf-patient-banner">
            <UserCheck size={22} />
            <div><strong>{selected.patient}</strong><span>NHS: {selected.nhs} · DOB: {selected.dob}</span></div>
            <span className="cf-match">{selected.syntheticOcr ? "Synthetic · verify" : "Match 98%"}</span>
            <button type="button" onClick={verifyPatientRequest}>{selected.syntheticOcr ? "Verify patient" : "View patient"}</button>
          </div>
          {identityNote && !noticesFor(selected.id).includes("identity") && <div className="cf-identity-note" role="status"><AlertTriangle size={16} /><div><b>{identityNote.commonName ? "Common name: double-check this patient" : "Double-check this patient"}</b><span>{identityNote.reasons[0]}{identityNote.reasons.length > 2 ? ` (and ${identityNote.reasons.length - 2} more in What to do with this letter)` : ""}</span></div><button type="button" className="cf-notice-close" onClick={() => dismissNotice("identity")} aria-label="Put this notice away" title="Put this notice away"><X size={14} /></button></div>}
          {noticesFor(selected.id).length > 0 && <button type="button" className="cf-notices-show" onClick={showNotices}>Show {noticesFor(selected.id).length} notice{noticesFor(selected.id).length === 1 ? "" : "s"} put away</button>}
          {(selected.clinflowAnalysis?.docmanDraft?.urgent || selected.clinflowAnalysis?.docmanDraft?.medicationChanged) && !noticesFor(selected.id).includes("risk") && (
            <div className="cf-high-risk-banner"><AlertTriangle size={16} />{HIGH_RISK_BANNER}<button type="button" className="cf-notice-close" onClick={() => dismissNotice("risk")} aria-label="Put this notice away" title="Put this notice away"><X size={14} /></button></div>
          )}
          {selected.clinflowAnalysis && !noticesFor(selected.id).includes("brief") && <section className="cf-reviewer-brief">
            <button type="button" className="cf-notice-close" onClick={() => dismissNotice("brief")} aria-label="Put this notice away" title="Put this notice away"><X size={14} /></button>
            <h3><ClipboardCheck size={16} />What's required next</h3>
            <div className="cf-brief-chips">{buildReviewerBrief(selected.clinflowAnalysis).map((step, index) => <span key={index} className={`cf-brief-chip cf-brief-${step.tone}`}>{step.text}</span>)}</div>
          </section>}
          <nav className="cf-tabs">{tabs.map(([key, label]) => { const tabKey = selected.syntheticOcr ? `synthetic-${key}` : key; return <button type="button" key={key} className={activeTab === tabKey ? "active" : ""} onClick={() => setActiveTab(tabKey)}>{label}</button>; })}</nav>
          <section className="cf-viewer">
            {selected.syntheticOcr && <AzureReviewView folders={docmanFolders} onChooseFolder={chooseDocmanFolder} onFileToDocman={fileToDocman} onOpenTab={(tab) => setActiveTab(`synthetic-${tab}`)} onStepDecide={decideStep} onTriageOpen={() => track("clinflow.opportunity.open", "Send a triage item opened", { domain: "Triage" })} onTriageSent={(info) => track("clinflow.opportunity.sent", "A triage item was sent to a colleague", { recipients: info.sent, withDetails: info.withDetails, kind: "triage" })} onQualityOpen={(item) => track("clinflow.opportunity.open", "Send a quality opportunity opened", { domain: item.domain })} onQualitySent={(info) => track("clinflow.opportunity.sent", "A quality opportunity was sent to a colleague", { recipients: info.sent, withDetails: info.withDetails })} onCodeCopy={(what) => track("clinflow.codes.copy", "Coding details copied", { what })} onDocmanCopy={(field) => record("clinflow.docman.copy", "A detail was copied for Docman", { field, automatedTransmission: false }).catch(() => {})} selected={selected} activeTab={activeTab.replace(/^synthetic-/, "")} onDownloadSummary={downloadSummary} onOpenOriginal={openOriginal} onTriageDecision={confirmTriageDecision} onOpenTeaching={openTeaching} canReviewCodes={can("clinflow.workflow")} snomedList={auditedList(snomedList, "snomed")} medicinesList={auditedList(medicinesList, "dmd")} abbreviations={auditedAbbreviations} onCodeDecision={decideCode} onCodeChoose={chooseCode} onCodeAdd={addCodeByCoder} onCodeRemoveAdded={removeAddedCode} />}
            {!selected.syntheticOcr && activeTab === "document" && <>
              <div className="cf-viewer-toolbar"><button type="button" onClick={() => setSampleZoom((zoom) => Math.max(50, zoom - 10))} disabled={sampleZoom <= 50} aria-label="Zoom out" title="Zoom out">−</button><b>{sampleZoom}%</b><button type="button" onClick={() => setSampleZoom((zoom) => Math.min(200, zoom + 10))} disabled={sampleZoom >= 200} aria-label="Zoom in" title="Zoom in">+</button><button type="button" onClick={downloadDocument} aria-label="Download this letter as a PDF" title="Download this letter as a PDF"><Download size={14} /></button><span>Page 1 of 2</span></div>
              <div className="cf-viewer-body"><aside className="cf-thumbnails"><div className="active">Page 1</div><small>1</small><div>Page 2</div><small>2</small></aside><div className="cf-paper-stage" style={{ zoom: sampleZoom / 100 }}><article className="cf-paper"><div className="cf-letterhead"><strong>Glan Clwyd Hospital<br /><small>Cardiology Department</small></strong><strong>Date: 14 May 2026</strong></div><p>Dr A N Other<br />Greenfield Surgery<br />123 High Street<br />Mold<br />CH7 1AB</p><p>Dear Dr Other</p><p><b>Re: {selected.patient} · DOB: {selected.dob} · NHS: {selected.nhs}</b></p><p>Thank you for referring Mr Smith to the Cardiology Clinic.</p><h3>Assessment</h3><p>Mr Smith was reviewed today for atrial fibrillation. He remains symptomatic with exertional dyspnoea. Echocardiogram shows mild left ventricular dysfunction.</p><h3>Plan</h3><ul><li>Increase Bisoprolol to 5 mg once daily</li><li>Continue Apixaban 5 mg twice daily</li><li>Repeat U&Es in 2 weeks</li><li>Review in 3 months</li></ul><p>Yours sincerely</p><p><b>Dr B Consultant<br />Consultant Cardiologist</b></p></article></div></div>
            </>}
            {activeTab === "summary" && <div className="cf-tab-content"><section className="cf-summary-card"><Sparkles size={18} /><div><b>AI Summary</b><p>Cardiology review confirms symptomatic atrial fibrillation with mild LV dysfunction. Bisoprolol was increased, Apixaban continues, U&Es are due in two weeks and follow-up is planned in three months.</p></div></section><div className="cf-info-grid"><section><h3>Actions required</h3><ul><li>Update Bisoprolol dose</li><li>Arrange repeat U&Es</li><li>Add 3-month recall</li></ul></section><section><h3>Suggested route</h3><p><b>{selected.destination}</b><br />Routine review required</p></section><section><h3>Medication</h3><p>Bisoprolol increased<br />Apixaban continued</p></section><section><h3>Safety</h3><p>No immediate red-flag wording detected.</p></section></div></div>}
            {activeTab === "data" && <div className="cf-tab-content"><div className="cf-info-grid"><section><h3>Patient</h3><p>{selected.patient}<br />DOB {selected.dob}<br />NHS {selected.nhs}</p></section><section><h3>Clinical entities</h3><p>Atrial fibrillation<br />LV dysfunction<br />Bisoprolol<br />Apixaban</p></section><section><h3>Dates</h3><p>Letter 14/05/2026<br />Bloods 2 weeks<br />Review 3 months</p></section><section><h3>Confidence</h3><p>Patient 98%<br />Medication 94%<br />Actions 92%</p></section></div></div>}
            {activeTab === "timeline" && <div className="cf-timeline">{[["Document received", "Uploaded by Scanning Team"], ["OCR completed", "Mock provider result · 96%"], ["AI analysis completed", "Medication, coding and QAIF prompts generated"], ["Awaiting workflow review", "No final action recorded"]].map(([title, detail]) => <div key={title}><span /><strong>{title}</strong><p>{detail}</p></div>)}</div>}
          </section>
          {selected.clinflowAnalysis && <p className="cf-ai-output-footer">{AI_OUTPUT_FOOTER}</p>}
        </>}
      </main>

      <aside className="cf-insights">
        {panelCollapsed && <button className="cf-panel-toggle" type="button" onClick={() => setLayout(queueCollapsed, false)} aria-label="Show the actions panel" title="Show the actions panel"><ChevronLeft size={16} /></button>}
        {!panelCollapsed && <>
          <div className="cf-insight-scroll">
            <section className="cf-side-card">
              <h3><Stethoscope size={16} />This letter</h3>
              {[
                ["Findings", selected?.syntheticOcr ? [...(selected.clinflowAnalysis?.diagnoses || []), ...(selected.clinflowAnalysis?.medicines || []), ...(selected.clinflowAnalysis?.actions || [])].length : 0, "item(s)", "synthetic-summary"],
                ["Quality prompts", selected?.clinflowAnalysis?.qualityPrompts?.length || 0, "prompt(s)", "synthetic-quality"],
                ["SNOMED candidates", selected?.syntheticOcr ? reviewCandidates(selected.clinflowAnalysis, selected.syntheticOcr.content).length : 0, "candidate(s)", "synthetic-snomed"],
              ].map(([label, count, unit, tab]) => (
                <button key={label} type="button" className="cf-glance-row" disabled={!selected?.syntheticOcr} onClick={() => setActiveTab(tab)}>
                  <span>{label}</span><small>{count} {unit}</small><ChevronRight size={14} aria-hidden="true" />
                </button>
              ))}
            </section>
          </div>
          <section className="cf-actions-card">
            <h3>Actions</h3>
            <div className="cf-action-grid">
              <ActionButton active={selected?.status === "in_review" || Boolean(selected?.claimedByUid)} disabled={busy || !selected || selected?.status === "completed"} onClick={claimDocument}><UserCheck size={14} />{selected?.status === "in_review" || selected?.claimedByUid ? "Claimed by you" : "Claim this letter"}</ActionButton>
              <ActionButton tone="danger" active={selected?.priority === "high"} disabled={busy || !selected || selected?.priority === "high"} onClick={setPriority}><AlertTriangle size={14} />{selected?.priority === "high" ? "Marked urgent" : "Mark urgent"}</ActionButton>
            </div>
            <label className="cf-route">Route to
              <select value={selected?.destination || ""} disabled={busy || !selected} onChange={(event) => routeDocument(event.target.value)}>
                {!["GP", "Nurse / HCA", "Pharmacist", "Admin", "Workflow Team", "NFWF"].includes(selected?.destination) && <option value={selected?.destination || ""}>{selected?.destination || "Choose where it goes"}</option>}
                {["GP", "Nurse / HCA", "Pharmacist", "Admin", "Workflow Team", "NFWF"].map((destination) => <option key={destination} value={destination}>{destination}</option>)}
              </select>
            </label>
            <div className="cf-action-grid">
              <ActionButton tone="purple" disabled={busy || !selected} onClick={() => setNoteOpen(true)}>Add note{selected?.noteCount ? ` (${selected.noteCount})` : ""}</ActionButton>
              {selected?.syntheticOcr
                ? <><ActionButton disabled={busy} onClick={downloadSummary}><Download size={14} />Summary PDF</ActionButton><ActionButton disabled={busy} onClick={downloadOriginal}><Download size={14} />Original PDF</ActionButton></>
                : <ActionButton disabled={busy || !selected} onClick={downloadDocument}><Download size={14} />Download PDF</ActionButton>}
              {selected?.status === "completed" && <ActionButton tone="primary" wide disabled={busy} onClick={downloadSelectedFinishedPack}><FolderCheck size={14} />Download Docman PDF</ActionButton>}
            </div>
            <div className="cf-action-grid">
              <ActionButton tone="success" wide active={selected?.status === "completed"} disabled={busy || !selected || selected?.status === "completed"} onClick={requestFinishDocument}><CheckCircle2 size={15} />{selected?.status === "completed" ? "Finished · ready for Docman" : "Confirm & Finish"}</ActionButton>
            </div>
            <button type="button" className="cf-more-toggle" onClick={() => setShowMoreActions((value) => !value)} aria-expanded={showMoreActions}><MoreHorizontal size={14} /> {showMoreActions ? "Fewer options" : "More options"}</button>
            {showMoreActions && (
              <div className="cf-more">
                <div className="cf-action-grid">
                  <ActionButton disabled={busy || !selected} onClick={openTeaching}><GraduationCap size={14} />Score / Teach</ActionButton>
                  <ActionButton onClick={() => { setScorecardOpen(true); track("clinflow.scorecard.open", "ClinFlow scorecard opened", {}); }}><BarChart3 size={14} />Scorecard</ActionButton>
                  <ActionButton disabled={busy || !selected} onClick={printDocument}><Printer size={14} />Print</ActionButton>
                  <ActionButton tone="warning" disabled={busy || !selected} onClick={reprocessOcr} title={selected?.syntheticOcr?.sourceFileAvailable || selected?.syntheticOcr?.sourceFile instanceof Blob ? "Read the original again" : "Choose the original PDF"}><RefreshCw size={14} />Read again</ActionButton>
                </div>
                <p className="cf-more-danger">Removing a letter</p>
                <div className="cf-action-grid">
                  <ActionButton tone="danger" disabled={busy || !selected} onClick={requestArchiveDocument}><Trash2 size={14} />Archive</ActionButton>
                  <ActionButton tone="danger" disabled={busy || !selected} onClick={requestPermanentDeleteDocument}><Trash size={14} />Delete for good</ActionButton>
                </div>
              </div>
            )}
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
      {scorecardOpen && <Scorecard documents={documents} checkerUid={user?.uid} canCheck={can("clinflow.workflow")} onSpotCheck={resolveSpotCheck} onOpenDocument={(id) => { setSelectedId(id); setActiveTab("synthetic-triage"); setScorecardOpen(false); }} canExport={can("clinflow.workflow")} onClose={() => setScorecardOpen(false)} onExported={(card) => record("clinflow.scorecard.export", "ClinFlow scorecard downloaded for the rule reviewer", { corrections: card.corrections.length, triageConfirmed: card.triage.total, automatedTransmission: false }).catch(() => {})} />}
      {azureTestOpen && <SyntheticDocumentBatchPanel onClose={() => setAzureTestOpen(false)} onImport={importAzureResults} />}
      {toast && <div className="cf-toast">{toast}</div>}
    </section>
  );
}
