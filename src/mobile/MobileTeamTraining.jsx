import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { STATUS, buildMatrix, dueOf, reminderItems, tally } from "@/modules/training/training";
import { saveRecord, useTrainingData } from "@/modules/training/trainingService";

// Team training on the phone for a nurse manager (or anyone who may see staff training): who is overdue or due soon, and a way to
// record that a course has been done. The full matrix is on the desktop.

const uk = (key) => (key ? key.split("-").reverse().join("/") : "");
const FIELD = "min-h-12 w-full rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 text-base";
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export default function MobileTeamTraining({ onClose }) {
  const { user, displayName } = useAuth();
  const data = useTrainingData(true);
  const [edit, setEdit] = useState(null); // { person, course, record }
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const items = useMemo(() => (data.ready ? reminderItems({ people: data.people, courses: data.courses.filter((c) => c.active !== false), records: data.records }) : []), [data]);
  const totals = useMemo(() => (data.ready ? tally(buildMatrix({ people: data.people.filter((p) => p.active !== false), courses: data.courses.filter((c) => c.active !== false), records: data.records }).flatMap((r) => r.cells)) : null), [data]);
  const byPerson = useMemo(() => {
    const map = new Map();
    for (const item of items) map.set(item.personId, [...(map.get(item.personId) || []), item]);
    return [...map.entries()].map(([personId, list]) => ({ personId, name: list[0].personName, list }));
  }, [items]);

  function open(item) {
    const person = data.people.find((p) => p.id === item.personId);
    const course = data.courses.find((c) => c.id === item.courseId);
    const record = data.records.find((r) => r.personId === item.personId && r.courseId === item.courseId) || null;
    setEdit({ person, course, record }); setDate(todayKey()); setError("");
  }
  async function save() {
    setBusy(true); setError("");
    try {
      await saveRecord({ person: edit.person, course: edit.course, completedOn: date, dueOn: "", status: "" }, { displayName: displayName || user?.email || "" });
      setNotice(`${edit.course.name} recorded for ${edit.person.name}.`); setEdit(null);
    } catch (problem) { setError(problem?.message || "That did not save."); } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[145] flex items-end bg-black/55">
      <div className="max-h-[94dvh] w-full overflow-y-auto rounded-t-[2rem] border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-[var(--medtrak-text)]">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div><h2 className="text-xl font-bold">Team training</h2><p className="text-sm text-[var(--medtrak-muted)]">Who is overdue or due in the next 60 days.</p></div>
          <button type="button" onClick={onClose} className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[var(--medtrak-border)]" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        {data.error && <p className="text-sm font-semibold text-rose-700" role="alert">{data.error}</p>}
        {!data.ready ? <p className="text-sm text-[var(--medtrak-muted)]">Opening…</p> : (
          <>
            {totals && <div className="grid grid-cols-3 gap-2 text-center"><div className="rounded-2xl bg-rose-500/10 p-2"><b className="text-xl">{totals[STATUS.overdue]}</b><p className="text-xs">Overdue</p></div><div className="rounded-2xl bg-amber-400/15 p-2"><b className="text-xl">{totals[STATUS.dueSoon]}</b><p className="text-xs">Due soon</p></div><div className="rounded-2xl bg-emerald-500/10 p-2"><b className="text-xl">{totals[STATUS.inDate]}</b><p className="text-xs">In date</p></div></div>}
            {notice && <p className="mt-3 rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-800" role="status">{notice}</p>}
            {!byPerson.length ? <p className="mt-4 text-sm text-[var(--medtrak-muted)]">Nothing is overdue or due soon.</p> : (
              <ul className="mt-4 space-y-3">
                {byPerson.map((p) => (
                  <li key={p.personId} className="rounded-2xl border border-[var(--medtrak-border)] p-3">
                    <p className="font-bold">{p.name}</p>
                    <ul className="mt-1 divide-y divide-[var(--medtrak-border)]">
                      {p.list.map((item) => (
                        <li key={item.courseId}>
                          <button type="button" onClick={() => open(item)} className="flex min-h-12 w-full items-center justify-between gap-3 text-left">
                            <span className="min-w-0 truncate text-sm font-semibold">{item.courseName}</span>
                            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${item.kind === STATUS.overdue ? "bg-rose-500/15 text-rose-700" : "bg-amber-400/25 text-amber-800"}`}>{item.kind === STATUS.overdue ? `Overdue ${uk(item.due)}` : `Due ${uk(item.due)}`}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {edit && (
          <div className="fixed inset-0 z-[150] flex items-end bg-black/55">
            <div className="w-full rounded-t-[2rem] border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              <h3 className="text-lg font-bold">{edit.course.name}</h3>
              <p className="text-sm text-[var(--medtrak-muted)]">{edit.person.name}. It last ran out {uk(dueOf(edit.record, edit.course)) || "(no date)"}.</p>
              <label className="mt-3 block text-sm font-bold">Done on<input type="date" className={FIELD} value={date} onChange={(e) => setDate(e.target.value)} /></label>
              {error && <p className="mt-2 text-sm font-semibold text-rose-700" role="alert">{error}</p>}
              <div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={() => setEdit(null)} className="min-h-12 rounded-2xl border border-[var(--medtrak-border)] font-bold">Cancel</button><button type="button" disabled={busy || !date} onClick={save} className="min-h-12 rounded-2xl bg-[var(--medtrak-accent)] font-bold text-white disabled:opacity-40">{busy ? "Saving…" : "Record it"}</button></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
