import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCopy,
  CloudCog,
  FileCheck2,
  FileText,
  FolderPlus,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Table2,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import {
  analyzeSyntheticDocument,
  getDocumentIntelligenceHealth,
  MAX_FILE_BYTES,
  validateSyntheticPdf,
} from "./azureDocumentIntelligenceClient";
import "./synthetic-document-test.css";
import "./synthetic-document-batch.css";

const asPercent = (value) => Number.isFinite(value) ? `${Math.round(value * 100)}%` : "Not supplied";
const asSize = (bytes) => `${(Number(bytes || 0) / 1024).toFixed(1)} KB`;
const pause = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

function friendlyError(error) {
  return String(error?.message || error || "ClinFlow could not analyse the document.")
    .replace(/^Firebase:\s*/i, "")
    .replace(/\(functions\/[a-z-]+\)\.?/gi, "")
    .trim();
}

export default function SyntheticDocumentBatchPanel({ onClose, onImport }) {
  const [files, setFiles] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [attested, setAttested] = useState(false);
  const [health, setHealth] = useState({ state: "checking" });
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [tab, setTab] = useState("extraction");
  const [inputKey, setInputKey] = useState(0);
  const dialogRef = useRef(null);

  useEffect(() => {
    getDocumentIntelligenceHealth()
      .then((value) => setHealth({ state: value?.configured ? "ready" : "not-configured", value }))
      .catch((reason) => setHealth({ state: "error", message: friendlyError(reason) }));
    dialogRef.current?.focus();
  }, []);

  const successful = useMemo(() => jobs.filter((job) => job.status === "complete" && job.response), [jobs]);
  const selectedJob = jobs[selectedIndex] || null;
  const result = selectedJob?.response?.result;
  const matched = result?.groundTruth?.filter((item) => item.matched).length || 0;

  function chooseFiles(event) {
    const selected = Array.from(event.target.files || []);
    setError("");
    setJobs([]);
    setSelectedIndex(0);
    if (!selected.length) return setFiles([]);
    try {
      selected.forEach(validateSyntheticPdf);
      const unique = selected.filter((file, index, list) => list.findIndex((candidate) =>
        candidate.name === file.name && candidate.size === file.size && candidate.lastModified === file.lastModified
      ) === index);
      setFiles(unique);
    } catch (reason) {
      setFiles([]);
      setError(friendlyError(reason));
    }
  }

  async function analyseBatch() {
    if (processing || !files.length) return;
    setProcessing(true);
    setError("");
    const initial = files.map((file) => ({ file, status: "queued", response: null, error: "" }));
    setJobs(initial);
    for (let index = 0; index < files.length; index += 1) {
      setJobs((current) => current.map((job, jobIndex) => jobIndex === index ? { ...job, status: "analysing" } : job));
      setSelectedIndex(index);
      try {
        const response = await analyzeSyntheticDocument(files[index], attested);
        setJobs((current) => current.map((job, jobIndex) => jobIndex === index ? { ...job, status: "complete", response } : job));
      } catch (reason) {
        setJobs((current) => current.map((job, jobIndex) => jobIndex === index ? { ...job, status: "error", error: friendlyError(reason) } : job));
      }
      if (index < files.length - 1) await pause(3000);
    }
    setProcessing(false);
  }

  async function retryJob(index) {
    const job = jobs[index];
    if (processing || !job) return;
    setProcessing(true);
    setSelectedIndex(index);
    setJobs((current) => current.map((item, jobIndex) => jobIndex === index ? { ...item, status: "analysing", error: "" } : item));
    try {
      const response = await analyzeSyntheticDocument(job.file, attested);
      setJobs((current) => current.map((item, jobIndex) => jobIndex === index ? { ...item, status: "complete", response, error: "" } : item));
    } catch (reason) {
      setJobs((current) => current.map((item, jobIndex) => jobIndex === index ? { ...item, status: "error", error: friendlyError(reason) } : item));
    } finally {
      setProcessing(false);
    }
  }

  function clearBatch() {
    setFiles([]);
    setJobs([]);
    setAttested(false);
    setError("");
    setSelectedIndex(0);
    setInputKey((value) => value + 1);
  }

  async function copyText() {
    if (result?.content) await navigator.clipboard.writeText(result.content);
  }

  function importSuccessful() {
    if (!successful.length) return;
    onImport?.(successful.map((job) => ({ ...job.response, sourceFile: job.file })));
    onClose?.();
  }

  return (
    <div className="cf-azure-backdrop" role="presentation">
      <section className="cf-azure-panel" role="dialog" aria-modal="true" aria-labelledby="cf-azure-title" tabIndex={-1} ref={dialogRef}>
        <header>
          <div className="cf-azure-heading-icon"><CloudCog /></div>
          <div><p>ClinFlow governed batch gateway</p><h2 id="cf-azure-title">Azure Document Intelligence</h2><span>Approved synthetic pack only · documents processed individually through a controlled queue</span></div>
          <button type="button" className="cf-azure-close" onClick={onClose} aria-label="Close Azure test panel"><X /></button>
        </header>

        <div className="cf-azure-status-row">
          <div className={`cf-azure-provider cf-azure-provider--${health.state}`}>
            {health.state === "checking" && <LoaderCircle className="spin" />}
            {health.state === "ready" && <CheckCircle2 />}
            {(health.state === "error" || health.state === "not-configured") && <AlertTriangle />}
            <div><strong>{health.state === "ready" ? "Azure gateway ready" : health.state === "checking" ? "Checking secure gateway…" : "Azure gateway unavailable"}</strong><span>{health.value ? `${health.value.modelId} · API ${health.value.apiVersion}` : health.message || "Check deployed functions and secrets"}</span></div>
          </div>
          <div className="cf-azure-limit"><ShieldCheck /><div><strong>Controlled batch processing</strong><span>One PDF at a time · exact pack fingerprint · 2 pages · {Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB per file</span></div></div>
        </div>

        {!jobs.length ? (
          <main className="cf-azure-setup cf-azure-setup--batch">
            <section className="cf-azure-upload-card">
              <div className="cf-azure-drop-icon"><FileText /></div>
              <h3>Choose test documents</h3>
              <p>Select one or more PDFs from the approved synthetic hospital pack. Primovex queues every selected file and processes them sequentially to respect provider capacity.</p>
              <input key={inputKey} type="file" accept="application/pdf,.pdf" multiple onChange={chooseFiles} />
              {files.length > 0 && <div className="cf-azure-selected-files">{files.map((file) => <div className="cf-azure-file" key={`${file.name}-${file.size}`}><FileCheck2 /><div><strong>{file.name}</strong><span>{asSize(file.size)} · queued in memory</span></div></div>)}</div>}
              <label className="cf-azure-attestation"><input type="checkbox" checked={attested} onChange={(event) => setAttested(event.target.checked)} /><span>I confirm every selected file is an approved Primovex synthetic test document and contains no real patient or staff information.</span></label>
              {error && <div className="cf-azure-error"><XCircle />{error}</div>}
              <button className="cf-azure-analyse" type="button" onClick={analyseBatch} disabled={!files.length || !attested || processing || health.state !== "ready"}><CloudCog />Analyse {files.length || "selected"} PDF{files.length === 1 ? "" : "s"}</button>
            </section>
          </main>
        ) : (
          <main className="cf-azure-batch-results">
            <aside className="cf-azure-job-list">
              <h3>Batch progress <span>{successful.length}/{jobs.length}</span></h3>
              {jobs.map((job, index) => <button type="button" key={`${job.file.name}-${index}`} className={selectedIndex === index ? "active" : ""} onClick={() => setSelectedIndex(index)}>
                {job.status === "analysing" ? <LoaderCircle className="spin" /> : job.status === "complete" ? <CheckCircle2 /> : job.status === "error" ? <XCircle /> : <FileText />}
                <span><strong>{job.file.name}</strong><small>{job.status === "error" ? job.error : job.status}</small></span>
              </button>)}
              <div className="cf-azure-batch-actions">
                <button type="button" onClick={importSuccessful} disabled={!successful.length || processing}><FolderPlus />Add {successful.length} to ClinFlow</button>
                <button type="button" onClick={clearBatch} disabled={processing}><Trash2 />Clear batch</button>
              </div>
            </aside>

            <section className="cf-azure-job-detail">
              {selectedJob?.status === "analysing" && <div className="cf-azure-job-state"><LoaderCircle className="spin" /><h3>Analysing {selectedJob.file.name}</h3><p>Keep ClinFlow open while Azure processes this document.</p></div>}
              {selectedJob?.status === "queued" && <div className="cf-azure-job-state"><FileText /><h3>Queued</h3><p>This document will begin when the previous analysis finishes.</p></div>}
              {selectedJob?.status === "error" && <div className="cf-azure-job-state cf-azure-job-state--error"><XCircle /><h3>Analysis paused</h3><p>{selectedJob.error}</p><button className="cf-azure-analyse" type="button" onClick={() => retryJob(selectedIndex)} disabled={processing}><RefreshCw />Retry this document</button></div>}
              {result && <>
                <section className="cf-azure-result-summary"><div><span>Document</span><strong>{result.document?.title}</strong><small>{selectedJob.response.fileName}</small></div><div><span>Pages</span><strong>{result.pageCount}</strong><small>{result.wordCount} words</small></div><div><span>OCR confidence</span><strong>{asPercent(result.averageConfidence)}</strong><small>Azure word confidence</small></div><div><span>Ground truth</span><strong>{matched}/{result.groundTruth?.length || 0}</strong><small>{asPercent(result.groundTruthScore)}</small></div></section>
                <nav className="cf-azure-tabs"><button type="button" className={tab === "extraction" ? "active" : ""} onClick={() => setTab("extraction")}><FileText />Extracted text</button><button type="button" className={tab === "validation" ? "active" : ""} onClick={() => setTab("validation")}><ShieldCheck />Ground truth</button><button type="button" className={tab === "tables" ? "active" : ""} onClick={() => setTab("tables")}><Table2 />Tables ({result.tables?.length || 0})</button></nav>
                <section className="cf-azure-result-body">
                  {tab === "extraction" && <div className="cf-azure-text"><div><h3>Azure OCR output</h3><button type="button" onClick={copyText}><ClipboardCopy />Copy synthetic text</button></div><pre>{result.content || "Azure returned no text."}</pre></div>}
                  {tab === "validation" && <div className="cf-azure-validation"><h3>Controlled comparison</h3><p>Known synthetic values are test evidence, not a clinical accuracy score.</p>{result.groundTruth?.map((item) => <div key={`${item.label}-${item.expected}`} className={item.matched ? "matched" : "missed"}>{item.matched ? <CheckCircle2 /> : <XCircle />}<span>{item.label}</span><strong>{item.expected}</strong><em>{item.matched ? "Detected" : "Review OCR"}</em></div>)}</div>}
                  {tab === "tables" && <div className="cf-azure-tables">{result.tables?.length ? result.tables.map((table) => <section key={table.index}><h3>Table {table.index} · {table.rows} × {table.columns}</h3><div>{table.cells.map((cell, index) => <span key={`${table.index}-${cell.row}-${cell.column}-${index}`}><small>R{cell.row + 1} C{cell.column + 1}</small>{cell.content || "—"}</span>)}</div></section>) : <p>No table structure was returned.</p>}</div>}
                </section>
              </>}
            </section>
          </main>
        )}
      </section>
    </div>
  );
}
