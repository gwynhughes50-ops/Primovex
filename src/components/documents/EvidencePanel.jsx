import { AlertTriangle, CheckCircle2, HelpCircle, Sparkles } from "lucide-react";
import { STATUS_WORDS, needsChecking } from "@/modules/documents/documentIntake";

// "What was read from the document": shown above a register form that has been pre-filled from a dropped certificate or safety data sheet. Each row says
// what was found, whether the document's own words back it, and the words themselves; nothing here saves anything. The person ticks the box to say
// they have checked the form against the document, and the form's Save button stays off until they do.
const TONE = {
  found: { Icon: CheckCircle2, text: "text-emerald-300", border: "border-emerald-400/20" },
  check: { Icon: AlertTriangle, text: "text-amber-300", border: "border-amber-400/40" },
  missing: { Icon: HelpCircle, text: "text-slate-400", border: "border-white/10" },
};

export default function EvidencePanel({ evidence, confirmed, onConfirmedChange }) {
  if (!evidence) return null;
  const todo = needsChecking(evidence);
  return (
    <section className="mt-3 rounded-xl border border-teal-300/30 bg-teal-500/5 p-3 text-sm text-slate-200" aria-label={evidence.title}>
      <h4 className="flex items-center gap-2 font-semibold text-slate-100"><Sparkles className="h-4 w-4 text-teal-300" aria-hidden="true" /> {evidence.title}</h4>
      <p className="mt-1 text-xs text-slate-400">
        Primovex read {evidence.fileName ? `"${evidence.fileName}"` : "the document"} and filled in what it could. It can make mistakes, so check each line against the document itself.
        {todo > 0 ? ` ${todo} ${todo === 1 ? "line needs" : "lines need"} your eyes.` : ""}
      </p>
      {evidence.warnings?.length > 0 && <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs font-semibold text-amber-200" role="alert">{evidence.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
      <ul className="mt-2 space-y-1.5">
        {evidence.rows.map((r) => {
          const { Icon, text, border } = TONE[r.status];
          return (
            <li key={r.key} className={`rounded-lg border ${border} px-2.5 py-1.5`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-xs font-semibold text-slate-300">{r.label}</span>
                <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${text}`}><Icon className="h-3.5 w-3.5" aria-hidden="true" /> {STATUS_WORDS[r.status]}</span>
              </div>
              {r.display && <p className="text-sm text-slate-100">{r.display}</p>}
              {r.evidence && <p className="mt-0.5 text-[11px] italic text-slate-400">On the document: "{r.evidence}"</p>}
              {r.note && <p className="mt-0.5 text-[11px] text-slate-300">{r.note}</p>}
            </li>
          );
        })}
      </ul>
      <label className="mt-3 flex items-start gap-2 text-sm font-semibold text-slate-100">
        <input type="checkbox" className="mt-1 h-4 w-4" checked={confirmed} onChange={(e) => onConfirmedChange(e.target.checked)} />
        <span>I have checked these details against the document myself.</span>
      </label>
    </section>
  );
}
