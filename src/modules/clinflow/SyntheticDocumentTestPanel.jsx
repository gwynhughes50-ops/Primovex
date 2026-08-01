import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCopy,
  CloudCog,
  FileCheck2,
  FileText,
  LoaderCircle,
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

const PACK_FILES = [
  "01-degraded-respiratory-clinic-letter.pdf",
  "02-faxed-two-page-discharge-summary.pdf",
  "03-handwritten-ward-review-note.pdf",
  "04-annotated-two-page-cardiology-letter.pdf",
  "05-dense-emergency-handover-form.pdf",
];

const asPercent = (value) => Number.isFinite(value) ? `${Math.round(value * 100)}%` : "Not supplied";
const asSize = (bytes) => `${(Number(bytes || 0) / 1024).toFixed(1)} KB`;

function friendlyError(error) {
  const message = String(error?.message || error || "ClinFlow could not analyse the document.");
  return message
    .replace(/^Firebase:\s*/i, "")
    .replace(/\(functions\/[a-z-]+\)\.?/gi, "")
    .trim();
}

export default function SyntheticDocumentTestPanel({ onClose }) {
  const [file, setFile] = useState(null);
  const [attested, setAttested] = useState(false);
  const [health, setHealth] = useState({ state: "checking" });
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");
  const [response, setResponse] = useState(null);
  const [tab, setTab] = useState("extraction");
  const [inputKey, setInputKey] = useState(0);
  const dialogRef = useRef(null);

  useEffect(() => {
    getDocumentIntelligenceHealth()
      .then((value) => setHealth({ state: value?.configured ? "ready" : "not-configured", value }))
      .catch((reason) => setHealth({ state: "error", message: friendlyError(reason) }));
    dialogRef.current?.focus();
  }, []);

  const result = response?.result;
  const matched = useMemo(() => result?.groundTruth?.filter((item) => item.matched).length || 0, [result]);

  function chooseFile(event) {
    const next = event.target.files?.[0] || null;
    setError("");
    setResponse(null);
    if (!next) return setFile(null);
    try {
      validateSyntheticPdf(next);
      setFile(next);
    } catch (reason) {
      setFile(null);
      setError(friendlyError(reason));
    }
  }

  async function analyse() {
    if (state === "analysing") return;
    setError("");
    setState("analysing");
    try {
      const value = await analyzeSyntheticDocument(file, attested);
      setResponse(value);
      setTab("extraction");
      setState("complete");
    } catch (reason) {
      setError(friendlyError(reason));
      setState("error");
    }
  }

  function clearTest() {
    setFile(null);
    setAttested(false);
    setResponse(null);
    setError("");
    setState("idle");
    setInputKey((value) => value + 1);
  }

  async function copyText() {
    if (!result?.content) return;
    await navigator.clipboard.writeText(result.content);
  }

  return (
    <div className="cf-azure-backdrop" role="presentation">
      <section className="cf-azure-panel" role="dialog" aria-modal="true" aria-labelledby="cf-azure-title" tabIndex={-1} ref={dialogRef}>
        <header>
          <div className="cf-azure-heading-icon"><CloudCog /></div>
          <div>
            <p>ClinFlow governed test gateway</p>
            <h2 id="cf-azure-title">Azure Document Intelligence</h2>
            <span>Approved synthetic pack only · no PDF or extracted text is stored by Primovex</span>
          </div>
          <button type="button" className="cf-azure-close" onClick={onClose} aria-label="Close Azure test panel"><X /></button>
        </header>

        <div className="cf-azure-status-row">
          <div className={`cf-azure-provider cf-azure-provider--${health.state}`}>
            {health.state === "checking" && <LoaderCircle className="spin" />}
            {health.state === "ready" && <CheckCircle2 />}
            {(health.state === "error" || health.state === "not-configured") && <AlertTriangle />}
            <div><strong>{health.state === "ready" ? "Azure gateway ready" : health.state === "checking" ? "Checking secure gateway…" : "Azure gateway unavailable"}</strong><span>{health.value ? `${health.value.modelId} · API ${health.value.apiVersion}` : health.message || "Check deployed functions and secrets"}</span></div>
          </div>
          <div className="cf-azure-limit"><ShieldCheck /><div><strong>Synthetic safety lock</strong><span>Exact pack fingerprint · PDF · 2 pages · {Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB maximum</span></div></div>
        </div>

        {!result ? (
          <main className="cf-azure-setup">
            <section className="cf-azure-upload-card">
              <div className="cf-azure-drop-icon"><FileText /></div>
              <h3>Choose a test document</h3>
              <p>Select one PDF from the synthetic hospital pack. Other documents are rejected by the server even if renamed.</p>
              <input key={inputKey} type="file" accept="application/pdf,.pdf" onChange={chooseFile} />
              {file && <div className="cf-azure-file"><FileCheck2 /><div><strong>{file.name}</strong><span>{asSize(file.size)} · held in memory until cleared</span></div></div>}
              <label className="cf-azure-attestation"><input type="checkbox" checked={attested} onChange={(event) => setAttested(event.target.checked)} /><span>I confirm this is an approved Primovex synthetic test document and contains no real patient or staff information.</span></label>
              {error && <div className="cf-azure-error"><XCircle />{error}</div>}
              <button className="cf-azure-analyse" type="button" onClick={analyse} disabled={!file || !attested || state === "analysing" || health.state !== "ready"}>
                {state === "analysing" ? <><LoaderCircle className="spin" /> Analysing securely…</> : <><CloudCog /> Analyse synthetic PDF</>}
              </button>
              {state === "analysing" && <p className="cf-azure-wait">Azure free-tier analysis can take up to a minute. Keep ClinFlow open.</p>}
            </section>
            <aside className="cf-azure-pack-list"><h3>Approved files</h3>{PACK_FILES.map((name, index) => <div key={name}><span>{index + 1}</span><p>{name}</p></div>)}<small>Files are fingerprinted with SHA-256. Renaming an unapproved document cannot bypass the lock.</small></aside>
          </main>
        ) : (
          <main className="cf-azure-results">
            <section className="cf-azure-result-summary">
              <div><span>Document</span><strong>{result.document?.title}</strong><small>{response.fileName}</small></div>
              <div><span>Pages</span><strong>{result.pageCount}</strong><small>{result.wordCount} words · {result.lineCount} lines</small></div>
              <div><span>OCR confidence</span><strong>{asPercent(result.averageConfidence)}</strong><small>Average Azure word confidence</small></div>
              <div><span>Ground truth</span><strong>{matched}/{result.groundTruth?.length || 0}</strong><small>{asPercent(result.groundTruthScore)} exact-value detection</small></div>
            </section>

            <nav className="cf-azure-tabs">
              <button type="button" className={tab === "extraction" ? "active" : ""} onClick={() => setTab("extraction")}><FileText />Extracted text</button>
              <button type="button" className={tab === "validation" ? "active" : ""} onClick={() => setTab("validation")}><ShieldCheck />Ground truth</button>
              <button type="button" className={tab === "tables" ? "active" : ""} onClick={() => setTab("tables")}><Table2 />Tables ({result.tables?.length || 0})</button>
            </nav>

            <section className="cf-azure-result-body">
              {tab === "extraction" && <div className="cf-azure-text"><div><h3>Azure OCR output</h3><button type="button" onClick={copyText}><ClipboardCopy />Copy synthetic text</button></div><pre>{result.content || "Azure returned no text."}</pre></div>}
              {tab === "validation" && <div className="cf-azure-validation"><h3>Controlled comparison</h3><p>This checks whether each known synthetic value appears in Azure’s text. It is a test signal, not a clinical accuracy score.</p>{result.groundTruth?.map((item) => <div key={`${item.label}-${item.expected}`} className={item.matched ? "matched" : "missed"}>{item.matched ? <CheckCircle2 /> : <XCircle />}<span>{item.label}</span><strong>{item.expected}</strong><em>{item.matched ? "Detected" : "Review OCR"}</em></div>)}</div>}
              {tab === "tables" && <div className="cf-azure-tables">{result.tables?.length ? result.tables.map((table) => <section key={table.index}><h3>Table {table.index} · {table.rows} × {table.columns}</h3><div>{table.cells.map((cell, index) => <span key={`${table.index}-${cell.row}-${cell.column}-${index}`}><small>R{cell.row + 1} C{cell.column + 1}</small>{cell.content || "—"}</span>)}</div></section>) : <p>No table structure was returned for this document.</p>}</div>}
            </section>

            <footer className="cf-azure-result-footer">
              <div><ShieldCheck /><span>Analysis ID <code>{response.analysisId}</code>. Only test metadata was audited; the PDF and extracted text remain in this session.</span></div>
              <button type="button" onClick={clearTest}><Trash2 />Clear test document</button>
            </footer>
          </main>
        )}
      </section>
    </div>
  );
}
