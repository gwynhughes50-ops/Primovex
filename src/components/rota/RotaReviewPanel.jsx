import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ClipboardCheck, Eye, Info, Sparkles } from "lucide-react";
import { reviewRota } from "@/modules/rota/rotaReview";
import { askForSummary, reasonText } from "@/modules/rota/rotaReviewService";
import { tint } from "./rotaStyle";

// "Rota check": what needs fixing, what to watch and what is worth knowing, worked out from the built weeks by plain logic, with a suggestion for each. The person who builds the rota can also ask for a
// written summary from an AI (when an administrator has switched that on): it is given the findings with letters in place of names, and the names are put back here.
const CARD = "rounded-2xl border border-[var(--medtrak-border)] bg-[color:color-mix(in_srgb,var(--medtrak-panel,#0f172a)_60%,transparent)]";
const SHOWN = 6;
const LOOK = {
  fix: { colour: "#f43f5e", label: "to fix", Icon: AlertTriangle },
  watch: { colour: "#f59e0b", label: "to watch", Icon: Eye },
  info: { colour: "#64748b", label: "to know", Icon: Info },
};

export default function RotaReviewPanel({ rules, weeks, absences, startMonday, canManage, onGoToWeek }) {
  const { findings, stats } = useMemo(() => reviewRota({ rules, weeks, absences, fromMonday: startMonday, horizon: 4 }), [rules, weeks, absences, startMonday]);
  const [all, setAll] = useState(false);
  const [ai, setAi] = useState({ state: "idle", result: null, for: "" }); // idle | working | done | error
  const signature = useMemo(() => findings.map((f) => `${f.kind}|${f.detail}`).join("\n"), [findings]);
  useEffect(() => { setAi((a) => (a.for && a.for !== signature ? { state: "idle", result: null, for: "" } : a)); }, [signature]);
  const shown = all ? findings : findings.slice(0, SHOWN);

  async function summarise() {
    setAi({ state: "working", result: null, for: signature });
    try { setAi({ state: "done", result: await askForSummary(findings, rules), for: signature }); } catch (e) { setAi({ state: "error", result: { reason: "unavailable" }, for: signature }); }
  }

  return (
    <section className={`${CARD} p-4`} aria-label="Rota check">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: tint("#3b82f6", 16), color: "#3b82f6" }}><ClipboardCheck className="h-5 w-5" aria-hidden="true" /></span>
        <div>
          <h3 className="text-sm font-black text-[var(--medtrak-text)]">Rota check</h3>
          <p className="text-xs text-[var(--medtrak-muted)]">The next 4 weeks, and how fairly the last 12 have been shared.</p>
        </div>
        <span className="ml-auto flex flex-wrap gap-2">
          {["fix", "watch", "info"].map((k) => <span key={k} className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: tint(LOOK[k].colour, 16), color: LOOK[k].colour }}>{stats[k]} {LOOK[k].label}</span>)}
        </span>
      </div>

      {!findings.length ? (
        <p className="mt-3 rounded-xl px-3 py-2 text-sm text-[var(--medtrak-text)]" style={{ background: tint("#10b981", 12) }}>Nothing to fix or watch. The weeks that are built look sound.</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {shown.map((f) => {
            const look = LOOK[f.severity];
            return (
              <li key={f.id} className="flex items-start gap-2.5 rounded-xl px-3 py-2 text-sm" style={{ background: tint(look.colour, f.severity === "info" ? 7 : 10) }}>
                <look.Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: look.colour }} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[var(--medtrak-text)]">{f.title}</p>
                  <p className="text-[var(--medtrak-text)]">{f.detail}</p>
                  <p className="text-xs text-[var(--medtrak-muted)]">{f.suggestion}</p>
                </div>
                {f.weekIso && onGoToWeek && <button type="button" onClick={() => onGoToWeek(f.weekIso)} className="shrink-0 rounded-lg border border-[var(--medtrak-border)] px-2 py-1 text-xs font-semibold text-[var(--medtrak-text)] hover:bg-[color:color-mix(in_srgb,var(--medtrak-accent)_10%,transparent)]">Go to week</button>}
              </li>
            );
          })}
        </ul>
      )}
      {findings.length > SHOWN && <button type="button" onClick={() => setAll(!all)} className="mt-2 text-xs font-semibold text-[var(--medtrak-accent)] underline">{all ? "Show fewer" : `Show all ${findings.length}`}</button>}

      {canManage && findings.length > 0 && (
        <div className="mt-4 border-t border-[var(--medtrak-border)] pt-3">
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={summarise} disabled={ai.state === "working"} className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--medtrak-border)] px-3 py-2 text-sm font-semibold text-[var(--medtrak-text)] hover:bg-[color:color-mix(in_srgb,var(--medtrak-accent)_10%,transparent)] disabled:opacity-50"><Sparkles className="h-4 w-4" aria-hidden="true" />{ai.state === "working" ? "Writing…" : "Write a summary with AI"}</button>
            <span className="text-xs text-[var(--medtrak-muted)]">The AI is given the findings above with letters instead of names. It is optional.</span>
          </div>
          {ai.state !== "idle" && ai.state !== "working" && ai.result && (
            ai.result.ok ? (
              <div className="mt-3 rounded-xl border border-[var(--medtrak-border)] p-3" style={{ background: tint("#8b5cf6", 8) }}>
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--medtrak-muted)]"><Sparkles className="h-3.5 w-3.5" aria-hidden="true" />Summary written by AI</p>
                <p className="mt-1 text-base font-black text-[var(--medtrak-text)]">{ai.result.headline}</p>
                <p className="mt-1 text-sm text-[var(--medtrak-text)]">{ai.result.summary}</p>
                {ai.result.priorities?.length > 0 && <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-sm text-[var(--medtrak-text)]">{ai.result.priorities.map((p) => <li key={p}>{p}</li>)}</ol>}
                <p className="mt-2 text-xs text-[var(--medtrak-muted)]">Written by AI from the findings above, with the names added afterwards. It can be wrong: check it against the rota.</p>
              </div>
            ) : (
              <p className="mt-3 rounded-xl px-3 py-2 text-sm text-[var(--medtrak-text)]" style={{ background: tint("#64748b", 10) }}>
                {ai.result.enabled === false ? (ai.result.demo ? "The AI summary is not available in demo mode." : "The AI summary is switched off. An administrator can switch it on in Practice Admin, under the Orb's AI settings.") : reasonText(ai.result.reason)}
              </p>
            )
          )}
        </div>
      )}
    </section>
  );
}
