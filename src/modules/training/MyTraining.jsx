import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { LIGHT, STATUS, STATUS_LABEL, buildMatrix } from "./training";
import { useTrainingData } from "./trainingService";

// A person's own training, on their phone: what is overdue, what is coming up and what is in date. Reads only their own record
// (the rules allow nothing else). If nobody has linked their record to their account yet, it says who to ask.

const CHIP = { green: "bg-emerald-500/15 text-emerald-700", amber: "bg-amber-400/25 text-amber-800", red: "bg-rose-500/15 text-rose-700", blue: "bg-sky-500/15 text-sky-700", purple: "bg-violet-500/15 text-violet-700", grey: "bg-black/5 text-[var(--medtrak-muted)]" };
const uk = (key) => (key ? key.split("-").reverse().join("/") : "");
const ORDER = [STATUS.overdue, STATUS.dueSoon, STATUS.inDate, STATUS.onLeave, STATUS.notRequired];

export default function MyTraining() {
  const { user } = useAuth();
  const data = useTrainingData(true);
  const mine = useMemo(() => (data.people || []).filter((p) => p.uid && p.uid === user?.uid), [data.people, user?.uid]);
  const rows = useMemo(() => {
    if (!data.ready || !mine.length) return [];
    const cells = buildMatrix({ people: mine, courses: data.courses.filter((c) => c.active !== false), records: data.records }).flatMap((row) => row.cells);
    return cells.filter((c) => c.status !== STATUS.none).sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || (a.days ?? 1e9) - (b.days ?? 1e9));
  }, [data, mine]);

  if (data.error) return <p className="py-1 text-sm text-[var(--medtrak-muted)]">{data.error}</p>;
  if (!data.ready) return <p className="py-1 text-sm text-[var(--medtrak-muted)]">Opening…</p>;
  if (!mine.length) return <p className="py-1 text-sm text-[var(--medtrak-muted)]">Your training record is not linked to your account yet. Ask the Practice Manager to link it (Staff training, then People).</p>;
  if (!rows.length) return <p className="py-1 text-sm text-[var(--medtrak-muted)]">Nothing is recorded for you yet.</p>;
  const needs = rows.filter((c) => c.status === STATUS.overdue || c.status === STATUS.dueSoon).length;
  return (
    <div className="py-1">
      <p className="text-sm font-semibold">{needs ? `${needs} ${needs === 1 ? "course needs" : "courses need"} doing` : "All your training is in date"}</p>
      <ul className="mt-2 divide-y divide-[var(--medtrak-border)]">
        {rows.map((c) => (
          <li key={c.course.id} className="flex items-center justify-between gap-3 py-2">
            <span className="min-w-0"><span className="block truncate text-sm font-semibold">{c.course.name}</span><span className="block text-xs text-[var(--medtrak-muted)]">{c.due ? `Runs out ${uk(c.due)}` : c.record?.completedOn ? `Done ${uk(c.record.completedOn)}` : ""}</span></span>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${CHIP[LIGHT[c.status]]}`}>{STATUS_LABEL[c.status].replace(" (sick or maternity)", "")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
