import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { DOMAIN_ROUTING, createOperationalEscalation } from "@/operations/escalations/operationalEscalationService";
import { useAuth } from "@/contexts/AuthContext";

export default function OperationalEscalationSheet({ open, onClose, seed = {}, onCreated }) {
  const { displayName, user } = useAuth();
  const [domain, setDomain] = useState(seed.domain || "facilities");
  const [title, setTitle] = useState(seed.title || "");
  const [note, setNote] = useState("");
  const [dueAt, setDueAt] = useState("");
  const route = useMemo(() => DOMAIN_ROUTING[domain] || DOMAIN_ROUTING.workforce, [domain]);
  if (!open) return null;

  const submit = () => {
    if (!title.trim()) return;
    const created = createOperationalEscalation({ domain, title: title.trim(), note: note.trim(), dueAt: dueAt || null }, { displayName, email: user?.email });
    onCreated?.(created);
    onClose?.();
  };

  return <div className="fixed inset-0 z-[120] flex items-end bg-black/55">
    <div className="w-full rounded-t-[2rem] border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-[var(--medtrak-text)] shadow-2xl">
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[var(--medtrak-accent)]">Raise operational issue</p><h2 className="mt-1 text-xl font-bold">Route it to the right team</h2></div><button onClick={onClose} className="rounded-full p-2"><X/></button></div>
      <div className="mt-5 space-y-4">
        <label className="block text-sm font-semibold">Area<select value={domain} onChange={e=>setDomain(e.target.value)} className="mt-2 w-full rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-3 text-[var(--medtrak-text)]">{Object.entries(DOMAIN_ROUTING).map(([key,value])=><option key={key} value={key}>{key.replaceAll("_"," ")} · {value.team}</option>)}</select></label>
        <label className="block text-sm font-semibold">Issue<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Light out in Treatment Room 2" className="mt-2 w-full rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-3"/></label>
        <label className="block text-sm font-semibold">Note<textarea value={note} onChange={e=>setNote(e.target.value)} rows={3} placeholder="Add a short note for the team" className="mt-2 w-full rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-3"/></label>
        <label className="block text-sm font-semibold">Due date (optional)<input type="date" value={dueAt} onChange={e=>setDueAt(e.target.value)} className="mt-2 w-full rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-3"/></label>
        <div className="rounded-2xl border border-[var(--medtrak-border)] bg-[color-mix(in_srgb,var(--medtrak-accent)_8%,var(--medtrak-panel))] p-3 text-sm"><b>Suggested owner:</b> {route.team}</div>
        <button onClick={submit} disabled={!title.trim()} className="w-full rounded-2xl bg-[var(--medtrak-accent)] px-4 py-3 font-bold text-white disabled:opacity-50">Raise with {route.team}</button>
      </div>
    </div>
  </div>;
}
