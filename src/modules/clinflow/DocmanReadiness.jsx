import { useMemo, useState } from "react";
import { CheckCircle2, ClipboardList } from "lucide-react";
import { buildDocmanPayload, readinessSummary } from "./docmanPayload";

// What Docman 10X would need to receive this letter, checked against Docman's own published rules, and what is still missing.
// Nothing is sent from here: the clinician still downloads the summary and files it in Docman themselves. This is the checklist for
// that, and the exact record that would be posted if Docman's API is ever used.
export default function DocmanReadiness({ analysis, fileReady }) {
  const [showRecord, setShowRecord] = useState(false);
  const result = useMemo(() => buildDocmanPayload(analysis?.docmanDraft || {}, { fileReady: Boolean(fileReady) }), [analysis, fileReady]);
  const notes = result.problems.filter((p) => p.severity !== "blocks");
  return (
    <section className="cf-summary-card cf-docman-ready" aria-label="What Docman needs">
      <ClipboardList size={18} />
      <div>
        <b>What Docman 10X needs for this letter</b>
        <p role="status" className={result.ready ? "cf-docman-ok" : ""}>{result.ready && <CheckCircle2 size={14} style={{ verticalAlign: "-2px", marginRight: 4 }} />}{readinessSummary(result)}</p>
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
