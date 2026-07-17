import { useEffect, useMemo, useState } from "react";
import { Bell, Check, Clock3, Plus, Trash2, X } from "lucide-react";
import { addQuickNote, completeQuickNote, deleteQuickNote, getQuickNotes, isNoteOverdue, subscribeQuickNotes } from "@/services/quickNotesService";

function localDateTimeValue(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function tomorrowMorning() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return localDateTimeValue(d);
}

export default function QuickNotesSheet({ open, onClose }) {
  const [notes, setNotes] = useState(() => getQuickNotes());
  const [text, setText] = useState("");
  const [dueAt, setDueAt] = useState(tomorrowMorning);
  const [priority, setPriority] = useState("routine");
  const [scope, setScope] = useState("private");
  const [showComposer, setShowComposer] = useState(true);

  useEffect(() => subscribeQuickNotes(setNotes), []);
  const openNotes = useMemo(() => notes.filter((n) => n.status !== "completed"), [notes]);

  if (!open) return null;

  const save = () => {
    if (!text.trim()) return;
    addQuickNote({ text, dueAt: dueAt ? new Date(dueAt).toISOString() : null, priority, scope });
    setText("");
    setDueAt(tomorrowMorning());
    setPriority("routine");
    setShowComposer(false);
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-end bg-black/45">
      <section className="max-h-[88vh] w-full overflow-y-auto rounded-t-[2rem] border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 text-[var(--medtrak-text)] shadow-2xl">
        <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-[var(--medtrak-border)]" />
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.16em] text-[var(--medtrak-accent)]">Primovex productivity</p>
            <h2 className="mt-1 text-2xl font-bold">Quick Notes</h2>
            <p className="text-sm text-[var(--medtrak-muted)]">Capture work once and bring it back at the right time.</p>
          </div>
          <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full border border-[var(--medtrak-border)]" aria-label="Close"><X className="h-5 w-5" /></button>
        </header>

        {showComposer ? (
          <div className="mt-5 rounded-3xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-4">
            <label className="text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]">What needs doing?</label>
            <textarea autoFocus rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Check the fridge calibration certificate tomorrow" className="mt-2 w-full resize-none rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-4 py-3 text-[var(--medtrak-text)] outline-none" />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-[var(--medtrak-muted)]">Reminder
                <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="mt-1 w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 py-3 text-[var(--medtrak-text)]" />
              </label>
              <label className="text-xs font-semibold text-[var(--medtrak-muted)]">Priority
                <select value={priority} onChange={(e) => setPriority(e.target.value)} className="mt-1 w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 py-3 text-[var(--medtrak-text)]">
                  <option value="routine">Routine</option><option value="high">High</option><option value="critical">Critical</option>
                </select>
              </label>
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={() => setScope("private")} className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${scope === "private" ? "border-[var(--medtrak-accent)] bg-[color-mix(in_srgb,var(--medtrak-accent)_10%,var(--medtrak-panel))] text-[var(--medtrak-accent)]" : "border-[var(--medtrak-border)]"}`}>Private</button>
              <button onClick={() => setScope("practice")} className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${scope === "practice" ? "border-[var(--medtrak-accent)] bg-[color-mix(in_srgb,var(--medtrak-accent)_10%,var(--medtrak-panel))] text-[var(--medtrak-accent)]" : "border-[var(--medtrak-border)]"}`}>Practice task</button>
            </div>
            <button onClick={save} disabled={!text.trim()} className="mt-4 w-full rounded-2xl bg-[var(--medtrak-accent)] px-4 py-3 font-bold text-white disabled:opacity-50"><Bell className="mr-2 inline h-4 w-4" />Save reminder</button>
          </div>
        ) : (
          <button onClick={() => setShowComposer(true)} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] px-4 py-3 font-bold"><Plus className="h-5 w-5" />Add another note</button>
        )}

        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between"><h3 className="font-bold">Open reminders</h3><span className="rounded-full bg-[color-mix(in_srgb,var(--medtrak-accent)_10%,var(--medtrak-panel))] px-2.5 py-1 text-xs font-bold text-[var(--medtrak-accent)]">{openNotes.length}</span></div>
          {openNotes.length ? openNotes.map((note) => {
            const overdue = isNoteOverdue(note);
            return <article key={note.id} className="rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-4">
              <div className="flex items-start gap-3">
                <button onClick={() => completeQuickNote(note.id)} className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[var(--medtrak-border)] text-[var(--medtrak-accent)]" aria-label="Complete"><Check className="h-4 w-4" /></button>
                <div className="min-w-0 flex-1"><p className="font-semibold">{note.text}</p><p className={`mt-1 flex items-center gap-1 text-xs ${overdue ? "text-[var(--medtrak-danger,#b42318)]" : "text-[var(--medtrak-muted)]"}`}><Clock3 className="h-3.5 w-3.5" />{note.dueAt ? new Date(note.dueAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "No reminder time"} • {note.scope === "practice" ? "Practice" : "Private"}</p></div>
                <button onClick={() => deleteQuickNote(note.id)} className="text-[var(--medtrak-muted)]" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
              </div>
            </article>;
          }) : <div className="rounded-2xl border border-dashed border-[var(--medtrak-border)] p-5 text-center text-sm text-[var(--medtrak-muted)]">No reminders yet.</div>}
        </div>
      </section>
    </div>
  );
}
