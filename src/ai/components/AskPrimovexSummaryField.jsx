import { useEffect, useRef, useState } from "react";
import { Loader2, ShieldCheck, Sparkles, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { loadStaffNames } from "@/ai/guard/staffNames";
import { suggestConcernSummary } from "@/ai/governance/concernSummary";

// The Anonymised summary box on a concern, with a small "Ask Primovex AI" button beside its label. Pressing it suggests a clearer, anonymised
// summary from what has been typed (and the case's category and priority), with tips on what would make it better. Worked out on this device:
// nothing is sent anywhere. The suggestion is only shown: the summary changes only when the person presses Use this, and Undo puts it back.
export const STAFF_LIST_WAIT_MS = 3000;

export default function AskPrimovexSummaryField({ value, onChange, category, priority, desiredOutcome, rows = 4, label = "Anonymised summary", placeholder = "Brief factual summary. Do not include patient name.", className = "lg:col-span-3" }) {
  const { profile } = useAuth();
  const [state, setState] = useState({ status: "idle" }); // idle | working | suggestion | error
  const [previous, setPrevious] = useState(null); // what was there before Use this, for Undo
  const alive = useRef(true);
  // Marked alive on every mount, not only the first: React's development mode mounts, cleans up and mounts again straight away, and a flag that was only ever set to false on cleanup
  // would stay false, so the answer was dropped and the button sat on "Thinking…" for ever.
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const ask = async () => {
    setState({ status: "working" });
    setPrevious(null);
    try {
      // The colleagues' names only stop a named colleague being taken out. If the staff list is slow or cannot be reached (offline, demo mode), carry on without it after a few seconds rather than wait for ever.
      const ownName = profile?.displayName ? [profile.displayName] : [];
      const allow = await Promise.race([loadStaffNames(profile?.displayName).catch(() => ownName), new Promise((resolve) => window.setTimeout(() => resolve(ownName), STAFF_LIST_WAIT_MS))]);
      await new Promise((resolve) => window.setTimeout(resolve, 250)); // long enough to see it working, not long enough to wait for
      if (!alive.current) return;
      const result = suggestConcernSummary({ summary: value, category, priority, desiredOutcome, allow });
      setState(result.ok ? { status: "suggestion", ...result } : { status: "error", message: result.reason });
    } catch (error) {
      console.error("Ask Primovex summary help failed:", error);
      if (alive.current) setState({ status: "error", message: "Ask Primovex could not help with this just now. Your summary has not been changed. Try again in a moment." });
    }
  };

  const use = () => { setPrevious(value || ""); onChange(state.text); setState({ status: "idle" }); };
  const undo = () => { onChange(previous); setPrevious(null); };
  const dismiss = () => setState({ status: "idle" });
  const working = state.status === "working";

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor="concern-anonymised-summary" className="text-sm font-semibold text-slate-200">{label}</label>
        <button
          type="button"
          onClick={ask}
          disabled={working}
          title="Suggest a clearer, anonymised summary from what you have typed. Nothing leaves this device."
          className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/20 disabled:opacity-60"
        >
          {working ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}
          {working ? "Thinking…" : "Ask Primovex AI"}
        </button>
      </div>
      <textarea id="concern-anonymised-summary" value={value} onChange={(e) => onChange(e.target.value)} rows={rows} className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-3 text-white" placeholder={placeholder} />

      {previous !== null && (
        <p className="flex items-center gap-2 text-xs text-slate-400">
          Summary updated by Ask Primovex AI.
          <button type="button" onClick={undo} className="font-semibold text-cyan-200 underline underline-offset-2">Undo</button>
        </p>
      )}

      {state.status === "error" && (
        <div role="alert" className="flex items-start gap-2 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          <p className="flex-1">{state.message}</p>
          <button type="button" onClick={dismiss} aria-label="Dismiss" className="rounded-full p-0.5 hover:bg-amber-500/20"><X className="h-4 w-4" /></button>
        </div>
      )}

      {state.status === "suggestion" && (
        <div role="region" aria-label="Suggested anonymised summary" className="space-y-3 rounded-2xl border border-cyan-400/20 bg-cyan-500/5 p-4">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-cyan-200"><Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Suggested summary</p>
          <p className="whitespace-pre-wrap text-sm text-white">{state.text}</p>
          {state.removed.length > 0 && (
            <p className="text-xs text-amber-200">Taken out to keep it anonymised: {[...new Set(state.removed.map((r) => r.label))].join(", ")}. Keep those in the paper file, not here.</p>
          )}
          {state.tips.length > 0 && (
            <div className="text-xs text-slate-300">
              <p className="font-semibold text-slate-200">To make it more useful:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">{state.tips.map((tip) => <li key={tip}>{tip}</li>)}</ul>
            </div>
          )}
          <p className="flex items-center gap-1.5 text-xs text-slate-400"><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Worked out on this device. Nothing was sent anywhere. Check it says what happened before using it.</p>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={dismiss} className="rounded-full px-3 py-1.5 text-sm font-semibold text-slate-300 hover:bg-cyan-500/10">Dismiss</button>
            <button type="button" onClick={use} disabled={state.unchanged} className="rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 px-4 py-1.5 text-sm font-semibold text-slate-950 disabled:opacity-60">{state.unchanged ? "Already looks good" : "Use this"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
