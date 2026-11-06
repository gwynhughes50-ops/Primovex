import { AlertTriangle, Plus, X } from "lucide-react";
import { ANSWERS, COMMON_CHECKS, MAX_CHECKS, judgeCheck } from "@/modules/certificates/certificates";

// The checks a certificate records ("Gas supply tightness test: Pass", "Boiler safe to use: No"): what it is called on the document and the answer, and whether the answer is a problem.
// The problem box follows the answer by the same rule the AI's reading uses (judgeCheck), and can be changed by hand. A problem shows in red on the register.
const FIELD = "w-full rounded-lg border border-white/10 bg-slate-950/60 px-2.5 py-2 text-sm text-slate-100 outline-none focus:border-teal-300/60 [&>option]:bg-slate-900";

export default function FindingsEditor({ value = [], onChange, compact = false }) {
  const list = Array.isArray(value) ? value : [];
  const change = (i, patch) => onChange(list.map((row, j) => {
    if (j !== i) return row;
    const next = { ...row, ...patch };
    // a new label or answer re-judges the problem box (an answer the rule cannot judge keeps what it was)
    return "problem" in patch ? next : { ...next, problem: judgeCheck(next.label, next.answer, row.problem) };
  }));
  const remove = (i) => onChange(list.filter((_, j) => j !== i));
  const add = () => onChange([...list, { label: "", answer: "Yes", problem: false }]);
  return (
    <fieldset className="min-w-0">
      <legend className="block text-xs font-semibold uppercase tracking-wide text-slate-400">Checks the certificate records <span className="font-normal normal-case text-slate-500">(optional)</span></legend>
      <datalist id="common-checks">{COMMON_CHECKS.map((c) => <option key={c} value={c} />)}</datalist>
      <ul className="mt-1 space-y-2">
        {list.map((row, i) => (
          <li key={i} className={`rounded-lg border p-2 ${row.problem ? "border-rose-400/50 bg-rose-500/10" : "border-white/10"}`}>
            <div className={`grid grid-cols-1 gap-2 ${compact ? "" : "sm:grid-cols-[1fr_9rem]"}`}>
              <input className={FIELD} list="common-checks" value={row.label} maxLength={80} placeholder="e.g. Boiler safe to use" aria-label={`Check ${i + 1}: what it is`} onChange={(e) => change(i, { label: e.target.value })} />
              <select className={FIELD} value={row.answer} aria-label={`Check ${i + 1}: the answer`} onChange={(e) => change(i, { answer: e.target.value })}>
                {[...new Set([...ANSWERS, row.answer].filter(Boolean))].map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <label className={`inline-flex items-center gap-1.5 text-xs font-semibold ${row.problem ? "text-rose-200" : "text-slate-300"}`}>
                <input type="checkbox" checked={Boolean(row.problem)} onChange={(e) => change(i, { problem: e.target.checked })} />
                {row.problem ? <><AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> This is a problem</> : "This is a problem"}
              </label>
              <button type="button" onClick={() => remove(i)} className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-2 py-1 text-xs text-slate-300 hover:bg-white/10" aria-label={`Remove check ${i + 1}`}><X className="h-3.5 w-3.5" aria-hidden="true" /> Remove</button>
            </div>
          </li>
        ))}
      </ul>
      {list.length < MAX_CHECKS && <button type="button" onClick={add} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm font-semibold text-slate-100 hover:bg-white/5"><Plus className="h-4 w-4" aria-hidden="true" /> Add a check</button>}
    </fieldset>
  );
}
