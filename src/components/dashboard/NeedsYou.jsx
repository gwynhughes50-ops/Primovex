import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CircleCheck } from "lucide-react";
import HomeWidget from "@/smart-home/components/HomeWidget";
import SarBell from "@/components/governance/SarBell";
import { useAuth } from "@/contexts/AuthContext";
import { decideClaim } from "@/modules/mileage/mileageService";
import { STATUS as MILEAGE } from "@/modules/mileage/mileage";
import { askRota } from "@/modules/rota/rotaTeamService";

// "Needs you" on the Practice Manager's Dashboard: everything waiting on them, most urgent first, each row with one button that deals with it.
// A button that changes something asks once more ("Sure?") before it does it; the rest open the exact page and tab.
const DOT = { critical: "#e11d48", warning: "#d97706", info: "#64748b" };
const BTN = "inline-flex min-h-8 items-center justify-center rounded-full border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-panel)] px-3 py-1 text-xs font-bold text-[color:var(--medtrak-text)] hover:bg-[color:var(--medtrak-accent)]/10 disabled:opacity-60";
const PRIMARY = "inline-flex min-h-8 items-center justify-center rounded-full bg-[color:var(--medtrak-accent)] px-3 py-1 text-xs font-bold text-white disabled:opacity-60";

// Press once to arm ("Sure?"), press again to do it. Disarms by itself after a few seconds.
function ConfirmButton({ label, onConfirm, busy }) {
  const [armed, setArmed] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      disabled={busy}
      className={armed ? PRIMARY : BTN}
      onClick={() => {
        if (!armed) { setArmed(true); timer.current = setTimeout(() => setArmed(false), 4000); return; }
        clearTimeout(timer.current); setArmed(false); onConfirm();
      }}
    >
      {busy ? "Working…" : armed ? "Sure?" : label}
    </button>
  );
}

function Action({ row, actor, onProblem, onSars }) {
  const { action } = row;
  const [busy, setBusy] = useState(false);
  async function run(fn) {
    setBusy(true); onProblem("");
    try { await fn(); } catch (err) { onProblem(err?.message || "That could not be done."); }
    setBusy(false);
  }
  if (action.kind === "remind-sar") return <SarBell row={action.row} onSent={onSars} label="Remind" align="right" />;
  if (action.kind === "approve-mileage") return <ConfirmButton label="Approve" busy={busy} onConfirm={() => run(() => decideClaim(action.claim, MILEAGE.approved, "", actor))} />;
  if (action.kind === "agree-rota") {
    const r = action.request;
    return <ConfirmButton label="Agree" busy={busy} onConfirm={() => run(async () => {
      const result = await askRota({ action: r.type === "swap" ? "approve" : "agree_adjust", id: r.id });
      if (result.ok === false) throw new Error(result.problems?.[0] || "That could not be done.");
    })} />;
  }
  return <Link to={action.to} className={BTN}>{action.label}</Link>;
}

export default function NeedsYou({ rows, ready, onSars }) {
  const { user, displayName } = useAuth();
  const actor = { uid: user?.uid || "", displayName: displayName || user?.email || "", email: user?.email || "" };
  const [problem, setProblem] = useState("");
  return (
    <HomeWidget title="Needs you" description={!ready ? "Checking…" : rows.length ? `${rows.length} ${rows.length === 1 ? "thing" : "things"} waiting, most urgent first.` : undefined}>
      {problem && <p role="alert" className="mb-2 rounded-xl border border-rose-400/30 bg-rose-500/10 p-2 text-sm text-[color:var(--medtrak-text)]">{problem}</p>}
      {ready && rows.length === 0 ? (
        <p className="flex items-center gap-2 text-sm font-semibold text-[color:var(--medtrak-text)]"><CircleCheck className="h-5 w-5 text-emerald-500" aria-hidden="true" />Nothing is waiting on you.</p>
      ) : (
        <ul className="divide-y divide-[color:var(--medtrak-border)]">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="flex min-w-0 items-start gap-2.5">
                <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: DOT[row.tone] }} aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[color:var(--medtrak-text)]">{row.text}</p>
                  {row.detail && <p className="text-xs text-[color:var(--medtrak-muted)]">{row.detail}</p>}
                </div>
              </div>
              <div className="shrink-0"><Action row={row} actor={actor} onProblem={setProblem} onSars={onSars} /></div>
            </li>
          ))}
        </ul>
      )}
    </HomeWidget>
  );
}
