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

// a very long name (a camera's) is shown with its middle left out
const shortName = (name) => (String(name).length > 40 ? `${String(name).slice(0, 22)}...${String(name).slice(-14)}` : String(name));

export default function EvidencePanel({ evidence, confirmed, onConfirmedChange, compact = false }) {
  if (!evidence) return null;
  const todo = needsChecking(evidence);
  return (
    <section className={`mt-3 min-w-0 break-words rounded-xl border border-teal-300/30 bg-teal-500/5 text-sm text-slate-200 ${compact ? "-mx-1 p-2" : "p-3"}`} aria-label={evidence.title}>
      <h4 className="flex items-center gap-2 font-semibold text-slate-100"><Sparkles className="h-4 w-4 text-teal-300" aria-hidden="true" /> {evidence.title}</h4>
      <p className="mt-1 text-xs text-slate-400">
        Primovex read {evidence.fileName ? `"${shortName(evidence.fileName)}"` : "the document"} and filled in what it could. It can make mistakes, so check each line against the document itself.
        {todo > 0 ? ` ${todo} ${todo === 1 ? "line needs" : "lines need"} your eyes.` : ""}
      </p>
      {evidence.alerts?.length > 0 && (
        <div className="mt-2 rounded-lg border border-rose-400/60 bg-rose-500/15 px-2.5 py-2 text-sm font-bold text-rose-100" role="alert">
          <p className="flex items-center gap-1.5"><AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /> This document records a failed or unsafe result.</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-6 font-semibold">{evidence.alerts.map((a) => <li key={a}>{a}</li>)}</ul>
          <p className="mt-1 text-xs font-semibold text-rose-200">Do not treat it as a pass. It will be shown in red on the register until a new certificate replaces it.</p>
        </div>
      )}
      {evidence.sourceNote && <p className="mt-2 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-300">{evidence.sourceNote}</p>}
      {evidence.warnings?.length > 0 && <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs font-semibold text-amber-200" role="alert">{evidence.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
      <ul className="mt-2 space-y-1.5">
        {evidence.rows.map((r) => {
          const { Icon, text, border } = TONE[r.status];
          return (
            <li key={r.key} className={`rounded-lg border ${border} ${compact ? "px-2 py-1" : "px-2.5 py-1.5"}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-xs font-semibold text-slate-300">{r.label}</span>
                <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${text}`}><Icon className="h-3.5 w-3.5" aria-hidden="true" /> {STATUS_WORDS[r.status]}</span>
              </div>
              {r.display && <p className="break-words text-sm text-slate-100">{r.display}</p>}
              {r.evidence && <p className="mt-0.5 break-words text-[11px] italic text-slate-400">On the document: "{r.evidence}"</p>}
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
