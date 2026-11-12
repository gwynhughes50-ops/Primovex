import { useMemo, useState } from "react";
import { ArrowLeftRight, Check, Smartphone, UserCog, X } from "lucide-react";
import { ADJUSTMENT_REASONS, DECLINE_REASONS } from "@/modules/rota/rotaSwap";
import { askRota, setTeamAccess } from "@/modules/rota/rotaTeamService";
import { initials, personColour, tint } from "./rotaStyle";

// Requests from the reception team: swaps (the coordinator is told, and has to approve only when someone's hours change) and adjustments (always the coordinator's to agree or decline). Also where the
// Practice Manager switches the team's access on: until then the team see nothing and can ask for nothing.
const CARD = "rounded-2xl border border-[var(--medtrak-border)] bg-[color:color-mix(in_srgb,var(--medtrak-panel,#0f172a)_60%,transparent)]";
const BTN = "inline-flex items-center gap-1.5 rounded-xl border border-[var(--medtrak-border)] px-3 py-2 text-sm font-semibold text-[var(--medtrak-text)] disabled:opacity-40";
const PRIMARY = "inline-flex items-center gap-1.5 rounded-xl bg-[var(--medtrak-accent)] px-4 py-2 text-sm font-semibold text-slate-950 shadow-sm hover:brightness-110 disabled:opacity-40";
const STATUS = {
  awaiting_colleague: ["Waiting for the colleague", "#3b82f6"],
  awaiting_coordinator: ["Needs you", "#f59e0b"],
  approved: ["Agreed", "#10b981"],
  declined_by_colleague: ["Colleague said no", "#64748b"],
  declined: ["Declined", "#f43f5e"],
  cancelled: ["Cancelled", "#64748b"],
  failed: ["No longer possible", "#f43f5e"],
};

function Avatar({ uid, name }) {
  return <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold text-white" style={{ background: personColour(uid) }} aria-hidden="true">{initials(name)}</span>;
}

const headline = (r) => (r.type === "swap" ? `${r.requesterName} and ${r.targetName} would swap shifts` : `${r.requesterName} has asked for an adjustment`);
const detail = (r) => (r.type === "swap" ? `${r.requesterName}'s ${r.a?.label} for ${r.targetName}'s ${r.b?.label}` : `${r.adjust?.text}, ${new Date(`${r.adjust?.iso}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} (${ADJUSTMENT_REASONS[r.adjust?.reason] || ""})`);

function RequestCard({ r, onAnswer, busy }) {
  const [declining, setDeclining] = useState(false);
  const [reasonKey, setReasonKey] = useState("");
  const [look, colour] = STATUS[r.status] || [r.status, "#64748b"];
  const needsYou = r.status === "awaiting_coordinator";
  return (
    <li className={`${CARD} p-3.5`}>
      <div className="flex flex-wrap items-start gap-3">
        <Avatar uid={r.requesterUid} name={r.requesterName} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[var(--medtrak-text)]">{headline(r)}</p>
          <p className="text-sm text-[var(--medtrak-text)]">{detail(r)}</p>
          {r.type === "swap" && r.changesHours && r.hoursNote?.length > 0 && <p className="mt-1 text-xs text-amber-300">It changes hours: {r.hoursNote.join("; ")}.</p>}
          {r.type === "swap" && !r.changesHours && <p className="mt-1 text-xs text-[var(--medtrak-muted)]">No one's hours change, so it needs no approval once the colleague agrees.</p>}
          {r.status === "declined" && r.decision?.reason && <p className="mt-1 text-xs text-[var(--medtrak-muted)]">Declined: {r.decision.reason}.</p>}
          {r.status === "failed" && r.failedBecause?.length > 0 && <p className="mt-1 text-xs text-rose-300">{r.failedBecause[0]}.</p>}
        </div>
        <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: tint(colour, 16), color: colour }}>{look}</span>
      </div>
      {needsYou && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--medtrak-border)] pt-3">
          {declining ? (
            <>
              <select value={reasonKey} onChange={(e) => setReasonKey(e.target.value)} className="rounded-xl border border-[var(--medtrak-border)] bg-transparent px-2.5 py-2 text-sm [&>option]:text-slate-900" aria-label="Why it is declined">
                <option value="">Choose a reason</option>
                {Object.entries(DECLINE_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <button type="button" className={PRIMARY} disabled={busy || !reasonKey} onClick={() => onAnswer({ action: "reject", id: r.id, reasonKey })}><X className="h-4 w-4" aria-hidden="true" />Decline</button>
              <button type="button" className={BTN} onClick={() => setDeclining(false)}>Back</button>
            </>
          ) : (
            <>
              <button type="button" className={PRIMARY} disabled={busy} onClick={() => onAnswer({ action: r.type === "swap" ? "approve" : "agree_adjust", id: r.id })}><Check className="h-4 w-4" aria-hidden="true" />{r.type === "swap" ? "Approve the swap" : "Agree"}</button>
              <button type="button" className={BTN} disabled={busy} onClick={() => setDeclining(true)}>Decline…</button>
            </>
          )}
        </div>
      )}
    </li>
  );
}

export default function RotaRequestsPanel({ requests, teamAccess, canSwitch, actor, showAccess = true }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const needs = useMemo(() => requests.filter((r) => r.status === "awaiting_coordinator"), [requests]);
  const waiting = useMemo(() => requests.filter((r) => r.status === "awaiting_colleague"), [requests]);
  const recent = useMemo(() => requests.filter((r) => !["awaiting_coordinator", "awaiting_colleague"].includes(r.status)).slice(0, 15), [requests]);

  async function answer(data) {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await askRota(data);
      if (result.ok === false) setError(result.problems?.[0] || "That could not be done.");
      else if (result.enteredTimeOff) setNotice("Agreed, and the time off is entered. Go to the Rota tab: the weeks that now have someone off are marked, and you can rebuild them.");
      else if (result.status === "approved") setNotice("Agreed. The rota is updated, and if the week is published the team's copy is too.");
    } catch (e) { setError(e?.message || "That could not be done."); }
    setBusy(false);
  }
  async function flip(on) {
    setBusy(true); setError("");
    try { await setTeamAccess(on, actor); setConfirmed(false); } catch (e) { setError(e?.message || "That could not be changed."); }
    setBusy(false);
  }

  return (
    <div className="space-y-5">
      {showAccess && <section className={`${CARD} p-5`}>
        <div className="flex flex-wrap items-start gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: tint("#8b5cf6", 16), color: "#8b5cf6" }}><Smartphone className="h-5 w-5" aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-black text-slate-50">The team's access on their phones</h2>
            <p className="text-sm text-slate-400">When this is on, each member of the reception team can see the weeks you publish (who is on which shift, never who is off), swap shifts with a colleague, and ask for an adjustment. You are told about every swap, and only have to approve one that changes someone's hours. Adjustments are always yours to agree or decline.</p>
          </div>
          <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: tint(teamAccess ? "#10b981" : "#64748b", 16), color: teamAccess ? "#10b981" : "#94a3b8" }}>{teamAccess ? "On" : "Off"}</span>
        </div>
        {canSwitch ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {teamAccess ? <button type="button" className={BTN} disabled={busy} onClick={() => flip(false)}>Turn off</button> : (
              <>
                <label className="flex max-w-2xl items-start gap-2 text-xs text-slate-300"><input type="checkbox" className="mt-0.5" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />I have checked that the DPIA addition for the team's use of the rota has been agreed, and that the reception team have been told what is held and who sees it.</label>
                <button type="button" className={PRIMARY} disabled={busy || !confirmed} onClick={() => flip(true)}>Turn on</button>
              </>
            )}
          </div>
        ) : <p className="mt-2 text-xs text-[var(--medtrak-muted)]">Only the Practice Manager and administrators can switch this on or off.</p>}
      </section>}

      {error && <p className="rounded-xl border border-rose-400/20 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</p>}
      {notice && <p className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm text-emerald-100">{notice}</p>}

      <section>
        <h2 className="flex items-center gap-2 text-lg font-black text-slate-50"><UserCog className="h-5 w-5" aria-hidden="true" />Needs you {needs.length > 0 && <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: tint("#f59e0b", 20), color: "#f59e0b" }}>{needs.length}</span>}</h2>
        {needs.length ? <ul className="mt-3 space-y-2">{needs.map((r) => <RequestCard key={r.id} r={r} busy={busy} onAnswer={answer} />)}</ul> : <p className={`${CARD} mt-3 p-4 text-sm text-[var(--medtrak-muted)]`}>Nothing is waiting for you.</p>}
      </section>

      {waiting.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 text-lg font-black text-slate-50"><ArrowLeftRight className="h-5 w-5" aria-hidden="true" />Waiting for a colleague</h2>
          <ul className="mt-3 space-y-2">{waiting.map((r) => <RequestCard key={r.id} r={r} busy={busy} onAnswer={answer} />)}</ul>
        </section>
      )}

      {recent.length > 0 && (
        <section>
          <h2 className="text-lg font-black text-slate-50">Recent</h2>
          <ul className="mt-3 space-y-2">{recent.map((r) => <RequestCard key={r.id} r={r} busy={busy} onAnswer={answer} />)}</ul>
        </section>
      )}
    </div>
  );
}
