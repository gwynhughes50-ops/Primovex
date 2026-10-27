import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Send, ShieldCheck, Users, X } from "lucide-react";
import { listOpportunityRecipients, sendQualityOpportunity } from "./qualityOpportunities";
import { opportunityPayload, patientDetailsFor, patientLine, toneOf } from "./qualityOpportunityPayload";

// The quality and register review of a letter: the record-check prompts ClinFlow raises (it never confirms an opportunity from a hospital letter alone),
// each in its own coloured card with a button to send it to a colleague (a person, or everyone with a role such as the business team) to follow up.
const keyOf = (item) => `${item.domain}|${item.title}`;

function SendDialog({ prompt, letterRef, analysis, onClose, onSent }) {
  const [directory, setDirectory] = useState(null);
  const [problem, setProblem] = useState("");
  const [mode, setMode] = useState("role");
  const [toUid, setToUid] = useState("");
  const [role, setRole] = useState("");
  const [include, setInclude] = useState(true);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const details = useMemo(() => patientDetailsFor(analysis), [analysis]);

  useEffect(() => {
    let live = true;
    listOpportunityRecipients().then((result) => { if (live) setDirectory(result); }).catch((error) => { if (live) { setDirectory({ staff: [], roles: [] }); setProblem(error?.message || "The list of colleagues could not be read."); } });
    return () => { live = false; };
  }, []);

  const ready = mode === "person" ? Boolean(toUid) : Boolean(role);
  async function send() {
    if (!ready || busy) return;
    setBusy(true); setProblem("");
    try {
      const payload = opportunityPayload({ prompt, letterRef, analysis, includePatient: include, note, toUid: mode === "person" ? toUid : "", role: mode === "role" ? role : "" });
      const result = await sendQualityOpportunity(payload);
      const who = result.toName || `the ${result.role} team${result.sent > 1 ? ` (${result.sent} people)` : ""}`;
      onSent({ key: keyOf(prompt), who, withDetails: include && Boolean(details), sent: result.sent });
    } catch (error) {
      setProblem(error?.message || "It could not be sent.");
      setBusy(false);
    }
  }

  return (
    <div className="cf-modal cf-qsend" role="dialog" aria-modal="true" aria-label="Send to a colleague"><div>
      <h2><Send size={17} /> Send to a colleague</h2>
      <p className="cf-modal-guidance">This sends one opportunity to follow up. It does not file or change anything on the letter.</p>
      <div className={`cf-qsend-item cf-qtone--${toneOf(prompt.domain)}`}><small>{prompt.domain}</small><b>{prompt.title}</b><span>{prompt.nextStep}</span></div>
      {directory === null ? <p className="cf-muted">Opening the list of colleagues…</p> : (
        <>
          <div className="cf-qsend-mode" role="radiogroup" aria-label="Who to send it to">
            <button type="button" role="radio" aria-checked={mode === "role"} className={mode === "role" ? "on" : ""} onClick={() => setMode("role")}><Users size={14} /> A team (role)</button>
            <button type="button" role="radio" aria-checked={mode === "person"} className={mode === "person" ? "on" : ""} onClick={() => setMode("person")}>One person</button>
          </div>
          {mode === "role" ? (
            <label>Everyone with the role<select value={role} onChange={(e) => setRole(e.target.value)}><option value="">Choose a role…</option>{directory.roles.map((r) => <option key={r.role} value={r.role}>{r.role} ({r.count})</option>)}</select></label>
          ) : (
            <label>Person<select value={toUid} onChange={(e) => setToUid(e.target.value)}><option value="">Choose a colleague…</option>{directory.staff.map((p) => <option key={p.id} value={p.id}>{p.label}{p.role ? ` · ${p.role}` : ""}</option>)}</select></label>
          )}
          <label className="cf-qsend-check"><input type="checkbox" checked={include} onChange={(e) => setInclude(e.target.checked)} disabled={!details} />
            <span><b>Include the patient's details so they can find the patient</b><small>{include && details ? patientLine(details) : details ? "Only the opportunity will be sent." : "No patient details were found on this letter."}</small></span></label>
          <label>Note for them (optional)<textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} rows={2} placeholder="e.g. Please check this at the next asthma review clinic" /></label>
          <p className="cf-muted"><small>The notification they get names the opportunity only. The patient's details are in the record, which only you and the person it goes to can open.</small></p>
        </>
      )}
      {problem && <p className="cf-code-error" role="alert">{problem}</p>}
      <footer>
        <button type="button" onClick={onClose}>Cancel</button>
        <button type="button" className="primary" onClick={send} disabled={!ready || busy}>{busy ? "Sending…" : "Send"}</button>
      </footer>
    </div></div>
  );
}

export default function QualityReview({ analysis, letterRef, canSend, onSent, onOpenSend }) {
  const prompts = analysis?.qualityPrompts || [];
  const confirmed = analysis?.qaifOpportunities?.length || 0;
  const relevance = analysis?.qualityAwareness?.relevance || "Low";
  const [sending, setSending] = useState(null);
  const [sentTo, setSentTo] = useState({});
  const finished = (info) => { setSentTo((current) => ({ ...current, [info.key]: info })); setSending(null); onSent?.(info); };
  return (
    <div className="cf-tab-content cf-quality">
      <section className="cf-q-hero">
        <ShieldCheck size={26} aria-hidden="true" />
        <div>
          <p className="cf-q-kicker">Wales and England</p>
          <h3>Quality and register review</h3>
          <p>A hospital letter cannot establish a QAIF, Unified Contract or QOF opportunity by itself. ClinFlow gives record-check prompts, not confirmed opportunities. Send a prompt to a colleague to follow up.</p>
        </div>
      </section>
      <div className="cf-q-tiles">
        <section className="cf-q-tile cf-qtone--teal"><small>Prompts to check</small><b>{prompts.length}</b><span>{prompts.length ? "From the words in this letter" : "Nothing raised"}</span></section>
        <section className="cf-q-tile cf-qtone--blue"><small>Confirmed from this letter</small><b>{confirmed}</b><span>None are confirmed from a letter alone</span></section>
        <section className={`cf-q-tile cf-qtone--${/high/i.test(relevance) ? "rose" : /medium/i.test(relevance) ? "amber" : "slate"}`}><small>Awareness</small><b>{relevance}</b><span>How much quality work the letter touches</span></section>
      </div>
      {prompts.length === 0 && <p className="cf-muted">No record-check prompts were raised for this letter.</p>}
      <div className="cf-q-list">
        {prompts.map((item) => {
          const sent = sentTo[keyOf(item)];
          return (
            <article key={keyOf(item)} className={`cf-q-card cf-qtone--${toneOf(item.domain)}`}>
              <header><span className="cf-q-domain">{item.domain}</span>{item.priority === "high" && <span className="cf-q-high"><AlertTriangle size={12} /> High priority</span>}</header>
              <h4>{item.title}</h4>
              <p>{item.rationale}</p>
              <div className="cf-q-next"><small>Next step</small><span>{item.nextStep}</span></div>
              {item.framework && <p className="cf-q-framework">{item.framework}</p>}
              <footer>
                {sent ? <span className="cf-q-sent"><CheckCircle2 size={14} /> Sent to {sent.who}{sent.withDetails ? " with the patient's details" : ""}</span> : <span />}
                {canSend && <button type="button" className="cf-q-send" onClick={() => { setSending(item); onOpenSend?.(item); }}><Send size={14} /> {sent ? "Send to someone else" : "Send to a colleague"}</button>}
              </footer>
            </article>
          );
        })}
      </div>
      {sending && <SendDialog prompt={sending} letterRef={letterRef} analysis={analysis} onClose={() => setSending(null)} onSent={finished} />}
    </div>
  );
}
