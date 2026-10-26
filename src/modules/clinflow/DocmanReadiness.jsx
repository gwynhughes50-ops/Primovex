import { useMemo, useState } from "react";
import { CheckCircle2, ClipboardList, Copy, Download } from "lucide-react";
import { buildDocmanPayload, readinessSummary } from "./docmanPayload";
import { handoverCodes, handoverFields, handoverSteps, handoverText } from "./docmanHandover";

// Getting a coded letter into Docman 10X: the steps in order, the details Docman asks for with a Copy button on each, and the one PDF to drag in.
// Nothing is sent from here: the clinician still files the letter in Docman themselves. This is the checklist for that, and the exact record that
// would be posted if Docman's API is ever used.
export default function DocmanReadiness({ analysis, fileReady, outcome, onDownload, onCopy }) {
  const [showRecord, setShowRecord] = useState(false);
  const [copied, setCopied] = useState("");
  const result = useMemo(() => buildDocmanPayload(analysis?.docmanDraft || {}, { fileReady: Boolean(fileReady) }), [analysis, fileReady]);
  const fields = useMemo(() => handoverFields(result), [result]);
  const codes = useMemo(() => handoverCodes(result), [result]);
  const steps = useMemo(() => handoverSteps(result, outcome), [result, outcome]);
  const notes = result.problems.filter((p) => p.severity !== "blocks");
  const copy = async (key, value) => {
    try { await navigator.clipboard.writeText(value); setCopied(key); setTimeout(() => setCopied(""), 1800); onCopy?.(key === "all" ? "all the details" : /^\d/.test(key) ? "a SNOMED code" : key); } catch { /* the value is shown beside the button */ }
  };
  return (
    <section className="cf-summary-card cf-docman-ready" aria-label="What Docman needs">
      <ClipboardList size={18} />
      <div className="cf-handover">
        <b>Getting this letter into Docman 10X</b>
        <p role="status" className={result.ready ? "cf-docman-ok" : ""}>{result.ready && <CheckCircle2 size={14} style={{ verticalAlign: "-2px", marginRight: 4 }} />}{readinessSummary(result)}</p>
        <ol className="cf-steps">
          {steps.map((step, i) => (
            <li key={step.id} className={step.done ? "cf-step cf-step--done" : "cf-step"}>
              <span className="cf-step-no">{step.done ? <CheckCircle2 size={15} /> : i + 1}</span>
              <span><b>{step.text}</b><small>{step.detail}</small></span>
            </li>
          ))}
        </ol>
        {onDownload && <p><button type="button" className="cf-top-button cf-top-button--primary" onClick={onDownload}><Download size={14} /> Download the Docman PDF</button></p>}

        <h4 className="cf-handover-title">Details to fill in on Docman</h4>
        <ul className="cf-fields">
          {fields.map((f) => (
            <li key={f.label} className={f.missing ? "cf-field cf-field--missing" : "cf-field"}>
              <span><small>{f.label}</small><b>{f.value || "Not available"}</b></span>
              {!f.missing && <button type="button" className="cf-copy" onClick={() => copy(f.label, f.copy)} aria-label={`Copy ${f.label}`}>{copied === f.label ? "Copied" : <Copy size={13} />}</button>}
            </li>
          ))}
        </ul>
        {codes.length > 0 && (
          <>
            <h4 className="cf-handover-title">SNOMED codes accepted by the coder</h4>
            <ul className="cf-fields cf-fields--codes">
              {codes.map((c) => (
                <li key={`${c.code}-${c.descriptionId}`} className="cf-field">
                  <span><small>SNOMED {c.code} · description {c.descriptionId}</small><b>{c.description}</b></span>
                  <button type="button" className="cf-copy" onClick={() => copy(c.code, c.code)} aria-label={`Copy code ${c.code}`}>{copied === c.code ? "Copied" : <Copy size={13} />}</button>
                </li>
              ))}
            </ul>
          </>
        )}
        <p><button type="button" className="cf-top-button" onClick={() => copy("all", handoverText(result))}>{copied === "all" ? "Copied everything" : "Copy all the details"}</button></p>

        {result.blocking.length > 0 && (
          <ul className="cf-docman-list">{result.blocking.map((p) => <li key={`${p.field}-${p.message}`}>{p.message}</li>)}</ul>
        )}
        {notes.length > 0 && (
          <ul className="cf-docman-list cf-docman-notes">{notes.map((p) => <li key={`${p.field}-${p.message}`}>{p.message}</li>)}</ul>
        )}
        <p>Nothing is sent to Docman from here. These are the details Docman asks for when a letter is posted to it, so each can be checked now and the letter filed the usual way.</p>
        <button type="button" className="cf-top-button" onClick={() => setShowRecord(!showRecord)} aria-expanded={showRecord}>{showRecord ? "Hide" : "Show"} the record Docman would receive</button>
        {showRecord && <pre className="cf-docman-record" tabIndex={0}>{JSON.stringify(result.payload, null, 2)}</pre>}
      </div>
    </section>
  );
}
