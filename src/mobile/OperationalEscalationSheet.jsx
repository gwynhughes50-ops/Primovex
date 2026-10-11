import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { DOMAIN_ROUTING, createOperationalEscalation } from "@/operations/escalations/operationalEscalationService";
import { useAuth } from "@/contexts/AuthContext";
import { loadFacilitiesState } from "@/modules/facilities/services/facilitiesStore";
import { raiseIssue } from "@/modules/maintenance/maintenanceService";

const FIELD = "mt-2 w-full rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-3 text-[var(--medtrak-text)]";

// "Report an issue" on the phone. For a problem with a room or the building (the usual one) it goes to the shared
// maintenance list, so the caretaker sees it on any device, and is told. The other areas keep the older routing.
export default function OperationalEscalationSheet({ open, onClose, seed = {}, onCreated }) {
  const { displayName, user } = useAuth();
  const [domain, setDomain] = useState(seed.domain || "facilities");
  const [title, setTitle] = useState(seed.title || "");
  const [note, setNote] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [roomId, setRoomId] = useState(seed.senseObjectId || "");
  const [urgent, setUrgent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const route = useMemo(() => DOMAIN_ROUTING[domain] || DOMAIN_ROUTING.workforce, [domain]);
  const rooms = useMemo(() => (open ? [...(loadFacilitiesState().rooms || [])].sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true })) : []), [open]);
  if (!open) return null;

  const maintenance = domain === "facilities";
  const room = rooms.find((r) => r.id === roomId) || rooms.find((r) => seed.location && String(r.name).toLowerCase() === String(seed.location).toLowerCase());

  const submit = async () => {
    if (!title.trim()) return;
    if (maintenance) {
      setBusy(true); setError("");
      try {
        await raiseIssue({ roomId: room?.id || "", roomName: room?.name || seed.location || "", note: title, urgent, source: "phone", actor: { uid: user?.uid, displayName, email: user?.email } });
        setSent(true);
        onCreated?.({ domain, title: title.trim() });
        window.setTimeout(() => { setSent(false); onClose?.(); }, 1400);
      } catch (problem) {
        setError(problem?.message || "Could not send this. Check your connection and try again.");
      } finally { setBusy(false); }
      return;
    }
    const created = createOperationalEscalation({ domain, title: title.trim(), note: note.trim(), dueAt: dueAt || null }, { displayName, email: user?.email });
    onCreated?.(created);
    onClose?.();
  };

  return <div className="fixed inset-0 z-[120] flex items-end bg-black/55">
    <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-[2rem] border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-[var(--medtrak-text)] shadow-2xl">
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[var(--medtrak-accent)]">Report an issue</p><h2 className="mt-1 text-xl font-bold">{maintenance ? "Tell the caretaker" : "Route it to the right team"}</h2></div><button onClick={onClose} className="rounded-full p-2" aria-label="Close"><X/></button></div>
      <div className="mt-5 space-y-4">
        <label className="block text-sm font-semibold">Area<select value={domain} onChange={e=>setDomain(e.target.value)} className={FIELD}>{Object.entries(DOMAIN_ROUTING).map(([key,value])=><option key={key} value={key}>{key === "facilities" ? "Building, room or equipment" : key.replaceAll("_"," ")} · {value.team}</option>)}</select></label>
        {maintenance && <label className="block text-sm font-semibold">Which room?<select value={room?.id || ""} onChange={e=>setRoomId(e.target.value)} className={FIELD}><option value="">{seed.location ? `${seed.location}` : "Choose the room…"}</option>{rooms.map((r)=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>}
        <label className="block text-sm font-semibold">{maintenance ? "What is wrong?" : "Issue"}<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Light out in Treatment Room 2" className={FIELD}/></label>
        {maintenance ? (
          <label className="flex min-h-12 items-center gap-3 rounded-2xl border border-[var(--medtrak-border)] px-4 text-sm font-semibold"><input type="checkbox" className="h-5 w-5" checked={urgent} onChange={e=>setUrgent(e.target.checked)}/> It is urgent (a safety risk, or the room can't be used)</label>
        ) : (
          <>
            <label className="block text-sm font-semibold">Note<textarea value={note} onChange={e=>setNote(e.target.value)} rows={3} placeholder="Add a short note for the team" className={FIELD}/></label>
            <label className="block text-sm font-semibold">Due date (optional)<input type="date" value={dueAt} onChange={e=>setDueAt(e.target.value)} className={FIELD}/></label>
            <div className="rounded-2xl border border-[var(--medtrak-border)] bg-[color-mix(in_srgb,var(--medtrak-accent)_8%,var(--medtrak-panel))] p-3 text-sm"><b>Suggested owner:</b> {route.team}</div>
          </>
        )}
        {error && <p className="rounded-xl border border-rose-400/40 bg-rose-500/10 p-3 text-sm font-semibold text-rose-700" role="alert">{error}</p>}
        {sent && <p className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-700" role="status">Sent to the caretaker.</p>}
        <button onClick={submit} disabled={!title.trim() || busy || sent} className="w-full rounded-2xl bg-[var(--medtrak-accent)] px-4 py-3 font-bold text-white disabled:opacity-50">{busy ? "Sending…" : maintenance ? "Send to the caretaker" : `Raise with ${route.team}`}</button>
      </div>
    </div>
  </div>;
}
