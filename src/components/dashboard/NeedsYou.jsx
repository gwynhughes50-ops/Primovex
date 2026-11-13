import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Car, ArrowLeftRight, CircleCheck, ClipboardCheck, Clock, FileText, MessageSquare, Package, ShieldAlert, Thermometer } from "lucide-react";
import SarBell from "@/components/governance/SarBell";
import { useAuth } from "@/contexts/AuthContext";
import { decideClaim } from "@/modules/mileage/mileageService";
import { STATUS as MILEAGE } from "@/modules/mileage/mileage";
import { askRota } from "@/modules/rota/rotaTeamService";

// "Needs you": everything waiting on the person, in three groups (now, soon, when you can), each row with one button that deals with it.
// A button that changes something asks once more ("Sure?") before it does it; the rest open the exact page and tab.
const TONE = { critical: "#e11d48", warning: "#d97706", info: "#64748b" };
const GROUPS = [["critical", "Now"], ["warning", "Soon"], ["info", "When you can"]];
const ICON = { sars: FileText, timesheets: Clock, mileage: Car, rota: ArrowLeftRight, concerns: ShieldAlert, stock: Package, fridges: Thermometer, compliance: ClipboardCheck, messages: MessageSquare };
const BTN = "inline-flex min-h-8 items-center justify-center whitespace-nowrap rounded-full border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-panel)] px-3.5 py-1 text-xs font-bold text-[color:var(--medtrak-text)] transition hover:border-[color:var(--medtrak-accent)] hover:bg-[color:var(--medtrak-accent)]/10 disabled:opacity-60";
const PRIMARY = "inline-flex min-h-8 items-center justify-center whitespace-nowrap rounded-full bg-[color:var(--medtrak-accent)] px-3.5 py-1 text-xs font-bold text-white shadow-sm disabled:opacity-60";

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

function Skeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-xl bg-[color:var(--medtrak-border)]" />
          <div className="flex-1 space-y-2"><div className="h-3 w-2/3 animate-pulse rounded bg-[color:var(--medtrak-border)]" /><div className="h-2.5 w-1/3 animate-pulse rounded bg-[color:var(--medtrak-border)]" /></div>
          <div className="h-8 w-20 animate-pulse rounded-full bg-[color:var(--medtrak-border)]" />
        </div>
      ))}
    </div>
  );
}

export default function NeedsYou({ rows, more = 0, ready, onSars }) {
  const { user, displayName } = useAuth();
  const actor = { uid: user?.uid || "", displayName: displayName || user?.email || "", email: user?.email || "" };
  const [problem, setProblem] = useState("");
  const total = rows.length + more;
  return (
    <section className="h-full rounded-3xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-panel-soft)] p-5 text-[color:var(--medtrak-text)] shadow-sm" aria-label="Needs you">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-black tracking-tight">Needs you</h2>
        {ready && total > 0 && <span className="rounded-full bg-[color:var(--medtrak-accent)] px-2.5 py-0.5 text-xs font-bold text-white">{total}</span>}
      </div>
      {problem && <p role="alert" className="mb-3 rounded-xl border border-rose-400/30 bg-rose-500/10 p-2.5 text-sm font-medium">{problem}</p>}

      {!ready ? <Skeleton /> : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <CircleCheck className="h-10 w-10 text-emerald-500" aria-hidden="true" />
          <p className="text-base font-bold">Nothing is waiting on you</p>
          <p className="text-sm text-[color:var(--medtrak-muted)]">Primovex will bring things here when they need you.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {GROUPS.map(([tone, label]) => {
            const group = rows.filter((row) => row.tone === tone);
            if (!group.length) return null;
            return (
              <div key={tone}>
                <p className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: TONE[tone] }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: TONE[tone] }} aria-hidden="true" />{label}
                </p>
                <ul className="divide-y divide-[color:var(--medtrak-border)]">
                  {group.map((row) => {
                    const Icon = ICON[row.category] || FileText;
                    return (
                      <li key={row.id} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: `color-mix(in srgb, ${TONE[row.tone]} 14%, transparent)`, color: TONE[row.tone] }}>
                            <Icon className="h-5 w-5" aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-bold leading-snug">{row.text}</p>
                            {row.detail && <p className="mt-0.5 line-clamp-2 text-xs text-[color:var(--medtrak-muted)]">{row.detail}</p>}
                          </div>
                        </div>
                        <div className="shrink-0"><Action row={row} actor={actor} onProblem={setProblem} onSars={onSars} /></div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
          {more > 0 && <p className="text-xs font-medium text-[color:var(--medtrak-muted)]">and {more} more. Change how many show in Customise.</p>}
        </div>
      )}
    </section>
  );
}
