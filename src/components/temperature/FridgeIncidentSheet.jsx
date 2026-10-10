import { useEffect, useMemo, useState } from "react";
import { collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { AlertTriangle, CheckCircle2, ShieldAlert, X } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { clearBlockedReason, clearPatch, incidentStatusLabel, isOpen, isQuarantined, quarantinePatch, stockPatch } from "@/modules/temperature/fridgeIncidents";

// "Take action" on an out-of-range fridge, from the message card, the manager's home or the Temperature page:
// who recorded it and what they saw, then Quarantine the fridge, Record what happened to the stock, and
// Clear it once a recheck is back in range. Only people who can resolve incidents get the buttons (the
// database rules say the same); everyone else just sees where it stands.

const toDate = (value) => (value?.toDate ? value.toDate() : value ? new Date(value) : null);
const when = (value) => { const d = toDate(value); return d && !Number.isNaN(d.getTime()) ? d.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""; };
const temp = (value) => (Number.isFinite(Number(value)) && value !== null && value !== "" ? `${Number(value)}°C` : "–");

export default function FridgeIncidentSheet({ incidentId, onClose }) {
  const { user, displayName, email, can } = useAuth();
  const actor = useMemo(() => ({ uid: user?.uid || null, displayName: displayName || user?.displayName || "", email: email || user?.email || "" }), [user, displayName, email]);
  const mayAct = can("temperature.resolveIncident");
  const [incident, setIncident] = useState(undefined); // undefined = loading, null = not there
  const [logs, setLogs] = useState([]);
  const [stockOpen, setStockOpen] = useState(false);
  const [stock, setStock] = useState({ moved: false, discarded: false, movedUnits: "", discardedUnits: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => onSnapshot(doc(db, "temperature_incidents", incidentId), (snap) => setIncident(snap.exists() ? { id: snap.id, ...snap.data() } : null), () => setIncident(null)), [incidentId]);

  // this fridge's latest readings, to see whether a recheck is back in range
  useEffect(() => {
    if (!incident?.unitId) return undefined;
    return onSnapshot(query(collection(db, "temperature_logs"), where("unitId", "==", incident.unitId), orderBy("created_at", "desc"), limit(10)), (snap) => setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setLogs([]));
  }, [incident?.unitId]);

  const blocked = incident ? clearBlockedReason(incident, logs, incident.expectedRange) : "";
  const run = async (work, doneNote) => {
    setBusy(true); setError(""); setNote("");
    try { await work(); setNote(doneNote); } catch (problem) { setError(problem?.message || "That didn't work. Try again."); } finally { setBusy(false); }
  };
  const update = (patch) => updateDoc(doc(db, "temperature_incidents", incidentId), patch);
  const quarantine = () => run(() => update({ ...quarantinePatch({ actor }), quarantinedAt: serverTimestamp() }), "The fridge is quarantined. Its stock is not to be used.");
  const saveStock = () => run(async () => { await update({ ...stockPatch(incident, { ...stock, actor }), stockRecordedAt: serverTimestamp() }); setStockOpen(false); }, "Recorded what happened to the stock.");
  const clear = () => run(() => update({ ...clearPatch(incident, logs, { actor }), resolvedAt: serverTimestamp() }), "Cleared. The fridge can be used again.");

  const open = incident && isOpen(incident);
  const quarantined = incident && isQuarantined(incident);

  return (
    <div className="fixed inset-0 z-[165] flex items-end justify-center bg-black/55 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="fridge-incident-title">
      <section className="max-h-[calc(92dvh-var(--pvx-sheet-bottom-clearance,0px))] w-full overflow-y-auto rounded-t-3xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-5 pb-6 pt-4 text-[var(--medtrak-text)] shadow-2xl sm:max-w-lg sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[.14em] text-[var(--medtrak-accent)]">Fridge incident</p>
            <h2 id="fridge-incident-title" className="mt-1 text-2xl font-bold">{incident === undefined ? "Loading…" : incident ? incident.unitName || "A fridge" : "Not found"}</h2>
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[var(--medtrak-border)]" aria-label="Close"><X className="h-5 w-5" aria-hidden="true" /></button>
        </div>

        {incident === null && <p className="mt-4 text-sm text-[var(--medtrak-muted)]">That incident isn't there any more.</p>}

        {incident && (
          <>
            <div className={`mt-4 rounded-2xl border p-4 ${quarantined ? "border-rose-500/50 bg-rose-500/10" : open ? "border-amber-500/40 bg-amber-500/10" : "border-emerald-500/40 bg-emerald-500/10"}`}>
              <p className={`flex items-center gap-2 text-lg font-bold ${quarantined ? "text-rose-700" : open ? "text-amber-700" : "text-emerald-700"}`}>
                {open ? (quarantined ? <ShieldAlert className="h-5 w-5" aria-hidden="true" /> : <AlertTriangle className="h-5 w-5" aria-hidden="true" />) : <CheckCircle2 className="h-5 w-5" aria-hidden="true" />}
                {incidentStatusLabel(incident)}{quarantined ? ": do not use the stock" : ""}
              </p>
              <p className="mt-1 text-sm">{incident.summary}</p>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                {[["Now", incident.observedTemp], ["Min", incident.observedMin], ["Max", incident.observedMax]].map(([label, value]) => <div key={label} className="rounded-xl bg-[var(--medtrak-panel)] p-2"><dt className="text-[10px] font-bold uppercase text-[var(--medtrak-muted)]">{label}</dt><dd className="text-lg font-black">{temp(value)}</dd></div>)}
              </dl>
              {incident.expectedRange && <p className="mt-2 text-xs text-[var(--medtrak-muted)]">Safe range {temp(incident.expectedRange.min)} to {temp(incident.expectedRange.max)}</p>}
            </div>

            <ul className="mt-3 space-y-1 text-sm text-[var(--medtrak-muted)]">
              <li>Recorded by {incident.openedBy || "a colleague"}{when(incident.openedAt) ? `, ${when(incident.openedAt)}` : ""}</li>
              {incident.actionsTaken && <li>Done at the time: {incident.actionsTaken}</li>}
              {incident.quarantinedBy && <li>Quarantined by {incident.quarantinedBy}{when(incident.quarantinedAt) ? `, ${when(incident.quarantinedAt)}` : ""}</li>}
              {incident.affectedStock?.stockNotes && <li>Stock: {incident.affectedStock.stockNotes}{incident.stockRecordedBy ? ` (recorded by ${incident.stockRecordedBy})` : ""}</li>}
              {!open && incident.resolutionNotes && <li>{incident.resolutionNotes}</li>}
            </ul>

            {open && mayAct && (
              <div className="mt-5 space-y-2">
                {!quarantined && <button type="button" onClick={quarantine} disabled={busy} className="min-h-12 w-full rounded-2xl bg-rose-600 px-4 font-bold text-white disabled:opacity-50">Quarantine this fridge</button>}

                {stockOpen ? (
                  <div className="rounded-2xl border border-[var(--medtrak-border)] p-3">
                    <p className="text-sm font-bold">What happened to the stock?</p>
                    {[["moved", "Moved to another fridge", "movedUnits"], ["discarded", "Discarded", "discardedUnits"]].map(([key, label, unitsKey]) => (
                      <div key={key} className="mt-2 flex items-center gap-3">
                        <label className="flex min-h-11 flex-1 items-center gap-3 text-sm font-semibold"><input type="checkbox" className="h-5 w-5" checked={stock[key]} onChange={(e) => setStock((old) => ({ ...old, [key]: e.target.checked }))} /> {label}</label>
                        {stock[key] && <label className="flex items-center gap-2 text-xs text-[var(--medtrak-muted)]">How many <input inputMode="numeric" value={stock[unitsKey]} onChange={(e) => setStock((old) => ({ ...old, [unitsKey]: e.target.value.replace(/\D/g, "").slice(0, 4) }))} className="h-10 w-16 rounded-lg border border-[var(--medtrak-border)] bg-transparent px-2 text-base" aria-label={`${label}: how many units`} /></label>}
                      </div>
                    ))}
                    <div className="mt-3 flex gap-2">
                      <button type="button" onClick={saveStock} disabled={busy || (!stock.moved && !stock.discarded)} className="min-h-11 flex-1 rounded-xl bg-[var(--medtrak-accent)] px-4 font-bold text-white disabled:opacity-40">Save</button>
                      <button type="button" onClick={() => setStockOpen(false)} disabled={busy} className="min-h-11 rounded-xl border border-[var(--medtrak-border)] px-4 font-semibold">Back</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setStockOpen(true)} disabled={busy} className="min-h-12 w-full rounded-2xl border border-[var(--medtrak-border)] px-4 font-bold">Record stock moved or discarded</button>
                )}

                <button type="button" onClick={clear} disabled={busy || Boolean(blocked)} className="min-h-12 w-full rounded-2xl border border-emerald-600/50 px-4 font-bold text-emerald-700 disabled:opacity-40">Clear it and return to use</button>
                {blocked && <p className="text-xs text-[var(--medtrak-muted)]">{blocked}</p>}
              </div>
            )}
            {open && !mayAct && <p className="mt-4 rounded-xl bg-black/5 p-3 text-sm text-[var(--medtrak-muted)]">Only the Practice Manager or the nurse lead can quarantine, record stock or clear this.</p>}

            {note && <p className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700" role="status">{note}</p>}
            {error && <p className="mt-3 rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-700" role="alert">{error}</p>}
          </>
        )}
      </section>
    </div>
  );
}
