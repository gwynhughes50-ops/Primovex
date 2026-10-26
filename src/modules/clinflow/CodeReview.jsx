import { useMemo, useState } from "react";
import { CheckCircle2, Plus, RotateCcw, Tag, Trash2, XCircle } from "lucide-react";
import { addProblem, reviewRows, reviewStats, statsLine } from "./clinflowCodeReview";

const STATE_WORDS = { suggested: "Waiting for you", accepted: "Accepted", removed: "Removed" };

// The coder's screen for one letter: each suggested SNOMED code with the words in the letter behind it, and buttons to accept it, remove it
// or put it back; a way to add a code the reader missed; and the counts that say how well the reader did.
export default function CodeReview({ candidates, letter, review, canEdit, onDecide, onAdd, onRemoveAdded }) {
  const rows = useMemo(() => reviewRows(candidates, letter, review), [candidates, letter, review]);
  const stats = useMemo(() => reviewStats(candidates, review), [candidates, review]);
  const [form, setForm] = useState({ term: "", conceptId: "", descriptionId: "" });
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const set = (key) => (e) => { setForm((f) => ({ ...f, [key]: e.target.value })); setError(""); };

  async function add() {
    const problem = addProblem(form);
    if (problem) { setError(problem); return; }
    try { await onAdd(form); setForm({ term: "", conceptId: "", descriptionId: "" }); setOpen(false); } catch (failure) { setError(failure?.message || "That could not be added."); }
  }

  return (
    <div className="cf-code-review">
      <section className="cf-summary-card"><Tag size={18} /><div><b>Codes for this letter</b><p>Each suggestion shows the words in the letter that led to it. Accept the ones that are right, remove the ones that are wrong, and add any the reader missed. Nothing is filed until you have checked it against the original letter.</p><p><small>{statsLine(stats)}{stats.right !== null ? ` The reader was right ${stats.right}% of the time on the ones you have looked at.` : ""}</small></p></div></section>
      {!canEdit && <p className="cf-muted">You can see these suggestions, but your role cannot accept or remove them.</p>}
      <ul className="cf-code-list">
        {rows.length === 0 && <li className="cf-code-row"><p>No codes were suggested for this letter.</p></li>}
        {rows.map((row) => (
          <li key={row.key} className={`cf-code-row cf-code-row--${row.state}`}>
            <div className="cf-code-main">
              <p><b>{row.term || "No term found"}</b> <small>{row.label}</small></p>
              <p className="cf-code-ids">{row.conceptId ? `SNOMED ${row.conceptId}` : "No SNOMED code found yet"}{row.candidate.descriptionId ? ` · description ${row.candidate.descriptionId}` : " · description ID still needed"}</p>
              {row.evidence.found
                ? <blockquote className="cf-evidence">“{row.evidence.quote}”</blockquote>
                : <p className="cf-evidence cf-evidence--none">No matching words found in the letter. Check the original before accepting.</p>}
              <p className="cf-code-state"><span className={`cf-code-chip cf-code-chip--${row.state}`}>{STATE_WORDS[row.state]}</span>{row.by ? ` ${row.by}` : ""}</p>
            </div>
            {canEdit && (
              <div className="cf-code-buttons">
                {row.state !== "accepted" && <button type="button" className="cf-top-button cf-top-button--primary" onClick={() => onDecide(row.candidate, "accepted")}><CheckCircle2 size={13} /> Accept</button>}
                {row.state !== "removed" && <button type="button" className="cf-top-button" onClick={() => onDecide(row.candidate, "removed")}><XCircle size={13} /> Remove</button>}
                {row.state !== "suggested" && <button type="button" className="cf-top-button" onClick={() => onDecide(row.candidate, "suggested")}><RotateCcw size={13} /> Put back</button>}
              </div>
            )}
          </li>
        ))}
        {(review?.added || []).map((a) => (
          <li key={a.id} className="cf-code-row cf-code-row--accepted">
            <div className="cf-code-main">
              <p><b>{a.term}</b> <small>Added by {a.byName || "the coder"}</small></p>
              <p className="cf-code-ids">{a.conceptId ? `SNOMED ${a.conceptId}` : "No SNOMED code given"}{a.descriptionId ? ` · description ${a.descriptionId}` : ""}</p>
            </div>
            {canEdit && <div className="cf-code-buttons"><button type="button" className="cf-top-button" onClick={() => onRemoveAdded(a.id)}><Trash2 size={13} /> Take out</button></div>}
          </li>
        ))}
      </ul>
      {canEdit && (
        <div className="cf-code-add">
          {!open ? <button type="button" className="cf-top-button" onClick={() => setOpen(true)}><Plus size={13} /> Add a code the reader missed</button> : (
            <div className="cf-code-form">
              <label>What is it?<input value={form.term} onChange={set("term")} maxLength={200} placeholder="e.g. Heart failure" /></label>
              <label>SNOMED concept ID (if you have it)<input value={form.conceptId} onChange={set("conceptId")} inputMode="numeric" placeholder="e.g. 84114007" /></label>
              <label>Description ID (if you have it)<input value={form.descriptionId} onChange={set("descriptionId")} inputMode="numeric" /></label>
              {error && <p className="cf-code-error" role="alert">{error}</p>}
              <div className="cf-code-buttons"><button type="button" className="cf-top-button cf-top-button--primary" onClick={add}>Add it</button><button type="button" className="cf-top-button" onClick={() => { setOpen(false); setError(""); }}>Cancel</button></div>
              <p><small>A term on its own is kept as a note on the letter. Docman needs the concept ID and description ID before it will take a code.</small></p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
