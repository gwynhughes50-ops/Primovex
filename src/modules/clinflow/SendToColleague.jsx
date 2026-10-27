import { useEffect, useMemo, useState } from "react";
import { Send, Users } from "lucide-react";
import { listOpportunityRecipients, sendQualityOpportunity } from "./qualityOpportunities";
import { patientDetailsFor, patientLine } from "./qualityOpportunityPayload";

// The box that sends one item from a letter (a quality prompt, a triage outcome) to a colleague, or to everyone with a role such as the business team.
// The caller says what is sent (`buildPayload`); this chooses who, shows exactly which patient details go with it, and asks the server to send.
export default function SendToColleague({ item, analysis, buildPayload, onClose, onSent }) {
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
      const payload = buildPayload({ includePatient: include, note, toUid: mode === "person" ? toUid : "", role: mode === "role" ? role : "" });
      const result = await sendQualityOpportunity(payload);
      const who = result.toName || `the ${result.role} team${result.sent > 1 ? ` (${result.sent} people)` : ""}`;
      onSent({ key: item.key, who, withDetails: include && Boolean(details), sent: result.sent });
    } catch (error) {
      setProblem(error?.message || "It could not be sent.");
      setBusy(false);
    }
  }

  return (
    <div className="cf-modal cf-qsend" role="dialog" aria-modal="true" aria-label="Send to a colleague"><div>
      <h2><Send size={17} /> Send to a colleague</h2>
      <p className="cf-modal-guidance">This sends one item to follow up. It does not file or change anything on the letter.</p>
      <div className={`cf-qsend-item cf-qtone--${item.tone || "blue"}`}><small>{item.domain}</small><b>{item.title}</b><span>{item.nextStep}</span></div>
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
