import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { actionChoicesFor, ageText, closeBlockedReason, isOpen, openedMs, recheckState } from "@/modules/compliance/complianceIncidents";
import { recordIncidentAction, resolveIncident, useAssetChecks, useAssetRecord, useComplianceIncident } from "@/modules/compliance/complianceIncidentService";

// "Take action" on a failed compliance check, from the message card, the Compliance page or the phone: what failed
// and who found it, what has been done so far, then record what you did, and close it once the asset has passed a
// check again. Only the caretaker and the practice manager (anyone who can update compliance) get the buttons; the
// database rules say the same, everyone else just sees where it stands.

const toDate = (value) => (value?.toDate ? value.toDate() : value ? new Date(value) : null);
const when = (value) => { const d = toDate(value); return d && !Number.isNaN(d.getTime()) ? d.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""; };

export default function ComplianceIncidentSheet({ incidentId, onClose }) {
  const { user, displayName, email, can, isAdmin } = useAuth();
  const actor = useMemo(() => ({ uid: user?.uid || "", displayName: displayName || user?.displayName || "", email: email || user?.email || "" }), [user, displayName, email]);
  const mayAct = can("compliance.write") || can("compliance.manageAssets") || isAdmin;
  const incident = useComplianceIncident(incidentId);
  const checks = useAssetChecks(incident?.assetId);
  const asset = useAssetRecord(incident?.assetId);
  const [choice, setChoice] = useState("");
  const [note, setNote] = useState("");
  const [closeNote, setCloseNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const open = incident ? isOpen(incident) : false;
  const blocked = incident ? closeBlockedReason(incident, checks, asset) : "";
  const recheck = incident ? recheckState(incident, checks) : { state: "none" };
  const choices = actionChoicesFor(incident?.assetType);
  const run = async (work, done) => {
    setBusy(true); setError(""); setSaved("");
    try { await work(); setSaved(done); } catch (problem) { setError(problem?.message || "That didn't work. Try again."); } finally { setBusy(false); }
  };
  const record = () => {
    if (!choice) { setError("Choose what was done."); return; }
    if (choice === "other" && !note.trim()) { setError("Add a note to say what you did."); return; }
    run(async () => { await recordIncidentAction(incidentId, { choice, note, actor }); setChoice(""); setNote(""); }, "Recorded.");
  };

  return (
    <div className="fixed inset-0 z-[165] flex items-end justify-center bg-black/55 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="compliance-incident-title">
      <section className="max-h-[calc(92dvh-var(--pvx-sheet-bottom-clearance,0px))] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-5 pb-6 pt-4 text-[var(--medtrak-text)] shadow-2xl sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[.14em] text-[var(--medtrak-accent)]">Failed check</p>
            <h2 id="compliance-incident-title" className="mt-1 text-2xl font-bold">{incident === undefined ? "Loading…" : incident ? incident.assetLabel || incident.assetCode || "An asset" : "Not found"}</h2>
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[var(--medtrak-border)]" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>

        {incident === null && <p className="mt-4 text-sm text-[var(--medtrak-muted)]">That incident isn't there any more.</p>}

        {incident && (
          <>
            <div className={`mt-4 rounded-2xl border p-4 ${open ? "border-rose-500/40 bg-rose-500/10" : "border-emerald-500/40 bg-emerald-500/10"}`}>
              <p className={`flex items-center gap-2 text-lg font-bold ${open ? "text-rose-700" : "text-emerald-700"}`}>
                {open ? <AlertTriangle className="h-5 w-5" aria-hidden="true" /> : <CheckCircle2 className="h-5 w-5" aria-hidden="true" />}
                {open ? `Open for ${ageText(incident)}` : "Closed"}
              </p>
              <p className="mt-1 text-sm">{incident.summary}</p>
              <p className="mt-2 text-xs text-[var(--medtrak-muted)]">{[incident.assetCode, incident.location].filter(Boolean).join(" · ")}</p>
            </div>

            <ul className="mt-3 space-y-1 text-sm text-[var(--medtrak-muted)]">
              <li>Found by {incident.openedBy || "a colleague"}{when(incident.openedAt || (openedMs(incident) ? new Date(openedMs(incident)) : null)) ? `, ${when(incident.openedAt || new Date(openedMs(incident)))}` : ""}</li>
              {(incident.actions || []).map((a, i) => <li key={`${a.atMs}-${i}`} className="text-[var(--medtrak-text)]">{a.label}{a.note ? `: ${a.note}` : ""} <span className="text-[var(--medtrak-muted)]">({a.by}, {when(a.atMs)})</span></li>)}
              {open && recheck.state === "passed" && <li className="font-semibold text-emerald-700">Checked again and passed{when(recheck.check?.performedAt || recheck.check?.createdAt) ? `, ${when(recheck.check?.performedAt || recheck.check?.createdAt)}` : ""}</li>}
              {open && recheck.state === "failed" && <li className="font-semibold text-rose-700">Checked again and failed</li>}
              {!open && <li>Closed by {incident.resolvedBy}{incident.resolutionNote ? `: ${incident.resolutionNote}` : ""}</li>}
            </ul>

            {open && mayAct && (
              <div className="mt-5 space-y-3">
                <fieldset>
                  <legend className="text-sm font-bold">What was done?</legend>
                  <div className="mt-2 space-y-1.5">
                    {choices.map((c) => (
                      <label key={c.key} className={`flex min-h-11 items-center gap-3 rounded-xl border px-3 text-sm font-semibold ${choice === c.key ? "border-[var(--medtrak-accent)] bg-[var(--medtrak-accent)]/10" : "border-[var(--medtrak-border)]"}`}>
                        <input type="radio" name="incident-action" className="h-4 w-4" checked={choice === c.key} onChange={() => setChoice(c.key)} /> {c.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder={choice === "other" ? "What did you do?" : "Note (optional)"} aria-label="Note" className="min-h-11 w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] px-3 text-sm" />
                <button type="button" onClick={record} disabled={busy} className="min-h-12 w-full rounded-2xl bg-[var(--medtrak-accent)] px-4 font-bold text-white disabled:opacity-50">Record this</button>

                <div className="rounded-2xl border border-[var(--medtrak-border)] p-3">
                  <p className="flex items-center gap-2 text-sm font-bold"><ClipboardCheck className="h-4 w-4" aria-hidden="true" /> Close it</p>
                  {blocked ? <p className="mt-1 text-sm text-[var(--medtrak-muted)]">{blocked}</p> : <p className="mt-1 text-sm text-emerald-700">Done and checked again. It can be closed.</p>}
                  <input value={closeNote} onChange={(e) => setCloseNote(e.target.value)} maxLength={200} placeholder="Closing note (optional)" aria-label="Closing note" className="mt-2 min-h-11 w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] px-3 text-sm" />
                  <button type="button" disabled={busy || Boolean(blocked)} onClick={() => run(() => resolveIncident({ incident, checks, asset, actor, note: closeNote }), "Closed.")} className="mt-2 min-h-12 w-full rounded-2xl border border-emerald-600/50 px-4 font-bold text-emerald-700 disabled:opacity-40">Close this failed check</button>
                </div>
              </div>
            )}
            {open && !mayAct && <p className="mt-4 rounded-xl bg-black/5 p-3 text-sm text-[var(--medtrak-muted)]">The caretaker or the practice manager deals with this. You can see where it stands.</p>}

            {saved && <p className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700" role="status">{saved}</p>}
            {error && <p className="mt-3 rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-700" role="alert">{error}</p>}
          </>
        )}
      </section>
    </div>
  );
}
