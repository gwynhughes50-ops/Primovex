import { useMemo, useRef, useState } from "react";
import { CheckCircle2, Database, Plus, RotateCcw, Tag, Trash2, XCircle } from "lucide-react";
import { addProblem, diagnosticText, matchSummary, reviewRows, reviewStats, statsLine, unmatchedText } from "./clinflowCodeReview";
import { SNOMED_NOTICE } from "./snomedIndex";

const STATE_WORDS = { suggested: "Waiting for you", accepted: "Accepted", removed: "Removed" };

// The UK SNOMED list on this computer: loaded once from the file the builder makes from the NHS TRUD download
function ListStatus({ list, canLoad }) {
  const meds = list.kind === "dmd";
  const input = useRef(null);
  const pick = (e) => { const file = e.target.files?.[0]; if (file) list.load(file); e.target.value = ""; };
  return (
    <section className="cf-summary-card cf-snomed-list"><Database size={18} /><div>
      <b>{meds ? "NHS dm+d medicines list" : "UK SNOMED list"}</b>
      {list.loading ? <p>Opening…</p> : list.search
        ? <p>{list.info}. {meds ? "Medicines" : "Codes"} are looked up here, on this computer; nothing from the letter is sent anywhere to find them.{list.kept === true ? " It is kept on this computer, so it is ready each time ClinFlow opens." : ""}</p>
        : <p>{meds ? "The dm+d medicines list is not loaded on this computer, so medicines cannot be looked up yet. It is made from the dm+d download on NHS TRUD." : "The UK SNOMED list is not loaded on this computer, so codes cannot be looked up yet. It is made from the SNOMED CT download on NHS TRUD (see the note on the builder)."}</p>}
      {list.old && <p className="cf-code-error" role="status">{meds ? "This list is more than four months old. Download the newest dm+d from TRUD and load it." : "This list is more than four months old. Download the newest SNOMED CT UK Clinical Edition from TRUD and load it: the licence asks for a new version to be taken up within 180 days."}</p>}
      {list.error && <p className="cf-code-error" role="alert">{list.error}</p>}
      {canLoad && (
        <>
          <input ref={input} type="file" accept=".gz,.json,application/gzip,application/json" onChange={pick} hidden />
          <button type="button" className="cf-top-button" onClick={() => input.current?.click()} disabled={list.loading}>{list.search ? "Load a newer list" : meds ? "Choose the medicines list file" : "Choose the SNOMED list file"}</button>
        </>
      )}
      <p className="cf-snomed-notice"><small>{SNOMED_NOTICE}</small></p>
    </div></section>
  );
}

// The abbreviations a letter uses ("CKD", "SOB", "U&Es"): the built-in list, or the practice's own, loaded from a plain file
function AbbreviationsStatus({ abbreviations, canLoad }) {
  const input = useRef(null);
  const pick = (e) => { const file = e.target.files?.[0]; if (file) abbreviations.load(file); e.target.value = ""; };
  const { info, problems } = abbreviations;
  return (
    <section className="cf-summary-card cf-snomed-list"><Database size={18} /><div>
      <b>Abbreviations</b>
      <p>{info.builtIn ? `Using the built-in list of ${info.count} common abbreviations (not an official NHS list: a clinician should check it).` : `Using ${info.label}: ${info.count} abbreviations.`} {info.ambiguous} can mean more than one thing; for those you choose the meaning, nothing is guessed.</p>
      {problems?.length > 0 && <p className="cf-muted">{problems.length} line{problems.length === 1 ? "" : "s"} in that file could not be used, for example line {problems[0].line}: {problems[0].why}.</p>}
      {abbreviations.error && <p className="cf-code-error" role="alert">{abbreviations.error}</p>}
      {canLoad && (
        <>
          <input ref={input} type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" onChange={pick} hidden />
          <button type="button" className="cf-top-button" onClick={() => input.current?.click()} disabled={abbreviations.loading}>Load an abbreviations file</button>
          {!info.builtIn && <button type="button" className="cf-top-button" onClick={abbreviations.remove} disabled={abbreviations.loading}>Go back to the built-in list</button>}
        </>
      )}
      <p className="cf-muted"><small>The file needs one abbreviation per line: the abbreviation, then its meaning, separated by a comma or a tab. An abbreviation on several lines has several meanings.</small></p>
    </div></section>
  );
}

// A search of the list for the add-a-code form
function ListSearch({ search, onUse }) {
  const [q, setQ] = useState("");
  const results = useMemo(() => (q.trim().length >= 2 ? search.search(q, { limit: 6 }) : []), [q, search]);
  return (
    <div className="cf-code-search">
      <label>Type what you are looking for<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. heart failure" /></label>
      {q.trim().length >= 2 && !results.length && <p className="cf-muted">Nothing in the list matches those words. Try one word, or a different spelling.</p>}
      {results[0]?.corrected?.length > 0 && <p className="cf-muted">Showing results for {results[0].corrected.map((c) => `“${c.to}”`).join(", ")} (you typed {results[0].corrected.map((c) => `“${c.from}”`).join(", ")}).</p>}
      <ul>{results.map((r) => <li key={r.conceptId}><span><b>{r.term}</b> <small>{r.tag} · SNOMED {r.conceptId}</small></span><button type="button" className="cf-top-button" onClick={() => { onUse(r); setQ(""); }}>Use this</button></li>)}</ul>
    </div>
  );
}

// The coder's screen for one letter: each suggested SNOMED code with the words in the letter behind it, and buttons to accept it, remove it
// or put it back; other matches from the UK list; a way to add a code the reader missed; and the counts that say how well the reader did.
export default function CodeReview({ candidates, letter, review, canEdit, list, medList, abbreviations, onDecide, onChoose, onAdd, onRemoveAdded }) {
  const rows = useMemo(() => reviewRows(candidates, letter, review, list?.search || null, medList?.search || null), [candidates, letter, review, list?.search, medList?.search, abbreviations?.version]);
  const stats = useMemo(() => reviewStats(candidates, review), [candidates, review]);
  const summary = useMemo(() => matchSummary(rows), [rows]);
  const [copied, setCopied] = useState(false);
  const [copiedDetails, setCopiedDetails] = useState(false);
  const copyDetails = async () => {
    const version = (typeof import.meta !== "undefined" && import.meta.env?.VITE_APP_VERSION) || "";
    try { await navigator.clipboard.writeText(diagnosticText(rows, { version, snomedInfo: list?.search ? list.info : "", medicinesInfo: medList?.search ? medList.info : "" })); setCopiedDetails(true); setTimeout(() => setCopiedDetails(false), 2500); } catch { /* the details are also on each row */ }
  };
  const copyUnmatched = async () => { try { await navigator.clipboard.writeText(unmatchedText(summary)); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* the list is also shown above */ } };
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
      {list && <ListStatus list={list} canLoad={canEdit} />}
      {medList && <ListStatus list={medList} canLoad={canEdit} />}
      {abbreviations && <AbbreviationsStatus abbreviations={abbreviations} canLoad={canEdit} />}
      <section className="cf-summary-card"><Tag size={18} /><div><b>Codes for this letter</b><p>Each suggestion shows the words in the letter that led to it. Accept the ones that are right, remove the ones that are wrong, and add any the reader missed. Nothing is filed until you have checked it against the original letter.</p><p><small>{statsLine(stats)}{stats.right !== null ? ` The reader was right ${stats.right}% of the time on the ones you have looked at.` : ""}</small></p></div></section>
      {(list?.search || medList?.search) && summary.total > 0 && (
        <section className="cf-summary-card cf-match-summary" role="status"><div>
          <b>{summary.matched} of {summary.total} found a code in the lists.</b>
          {summary.unmatched.length > 0 && <><p>Nothing in the lists matched: {summary.unmatched.map((u) => `“${u.words}”`).join(", ")}. Check the original letter, remove them, or add the right code below.</p>
            <button type="button" className="cf-top-button" onClick={copyUnmatched}>{copied ? "Copied" : "Copy these words"}</button></>}
        </div></section>
      )}
      {summary.total > 0 && <p className="cf-muted"><button type="button" className="cf-top-button" onClick={copyDetails}>{copiedDetails ? "Copied" : "Copy the lookup details"}</button> If something is not found, copy these and send them: they show what the letter said, what was searched for and what came back.</p>}
      {!canEdit && <p className="cf-muted">You can see these suggestions, but your role cannot accept or remove them.</p>}
      <ul className="cf-code-list">
        {rows.length === 0 && <li className="cf-code-row"><p>No codes were suggested for this letter.</p></li>}
        {rows.map((row) => (
          <li key={row.key} className={`cf-code-row cf-code-row--${row.state}`}>
            <div className="cf-code-main">
              <p><b>{row.term || "No term found"}</b> <small>{row.label}</small></p>
              <p className="cf-code-ids">{row.medicine ? (row.medicineListMissing ? "A medicine: it is looked up in the NHS dm+d list, which is not loaded yet." : row.conceptId ? `dm+d ${row.conceptId}${row.descriptionId ? ` · description ${row.descriptionId}` : " · SNOMED description ID not in this list (build it with the Drug Extension)"}` : "Nothing in the dm+d list matches these words") : <>{row.conceptId ? `SNOMED ${row.conceptId}` : list?.search ? "Nothing in the UK list matches these words" : "No SNOMED code found yet"}{row.descriptionId ? ` · description ${row.descriptionId}` : row.conceptId ? " · description ID still needed" : ""}</>}</p>
              <details className="cf-code-others"><summary>How this was looked up</summary>
                <p className="cf-muted">Label: {row.label || "none"}<br />Words found: {row.candidate.sourceValue || row.candidate.searchTerm || "none"}<br />Looked up as: {row.lookedUp ? `“${row.lookedUp}”` : "nothing to look up"}{row.options.length ? <><br />Best matches: {row.options.slice(0, 3).map((o) => `${o.term} (${o.score})`).join("; ")}</> : null}</p>
              </details>
              {row.ambiguity && !row.pick && <p className="cf-quality cf-quality--possible">“{row.ambiguity.abbr}” can mean more than one thing: {row.ambiguity.meanings.join("; ")}. Choose the one the letter means; nothing is picked for you.</p>}
              {row.quality && <p className={`cf-quality cf-quality--${row.quality.level}`}>{row.quality.label}</p>}
              {row.evidence.found
                ? <blockquote className="cf-evidence">“{row.evidence.quote}”</blockquote>
                : <p className="cf-evidence cf-evidence--none">No matching words found in the letter. Check the original before accepting.</p>}
              {canEdit && (row.options.length > 1 || row.ambiguity) && row.state !== "removed" && (
                <details className="cf-code-others" open={Boolean(row.ambiguity && !row.pick)}><summary>{row.ambiguity && !row.pick ? `Choose the meaning (${row.options.length})` : `Other matches (${Math.max(0, row.options.length - 1)})`}</summary>
                  <ul>{row.options.filter((o) => o.conceptId !== row.conceptId).map((o) => <li key={o.conceptId}><span>{o.term} <small>{o.viaAbbreviation ? `${o.viaAbbreviation} · ` : ""}{o.tag} · {row.medicine ? "dm+d" : "SNOMED"} {o.conceptId}</small></span><button type="button" className="cf-top-button" onClick={() => onChoose(row.candidate, o)}>Use this</button></li>)}</ul>
                </details>
              )}
              {canEdit && row.state !== "removed" && (row.medicine ? medList?.search : list?.search) && (
                <details className="cf-code-others"><summary>Search for a different code</summary>
                  <ListSearch search={row.medicine ? medList.search : list.search} onUse={(r) => onChoose(row.candidate, r)} />
                </details>
              )}
              <p className="cf-code-state"><span className={`cf-code-chip cf-code-chip--${row.state}`}>{STATE_WORDS[row.state]}</span>{row.by ? ` ${row.by}` : ""}</p>
            </div>
            {canEdit && (
              <div className="cf-code-buttons">
                {row.state !== "accepted" && <button type="button" className="cf-top-button cf-top-button--primary" disabled={row.medicine ? !row.pick : (list?.search && !row.pick)} title={row.medicine ? (!row.pick ? "No medicine in the dm+d list matches this. Remove it, or load the dm+d list." : undefined) : list?.search && !row.pick ? "Nothing in the list matches this. Remove it, or add the right code below." : undefined} onClick={() => onDecide(row.candidate, "accepted", row.pick)}><CheckCircle2 size={13} /> Accept</button>}
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
              {list?.search && <ListSearch search={list.search} onUse={(r) => { setForm({ term: r.term, conceptId: r.conceptId, descriptionId: r.descriptionId || "" }); setError(""); }} />}
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
