import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, CalendarDays, ChevronLeft, ChevronRight, MessageSquarePlus, Users, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { DAYS, DAY_LABELS, TIME_CHOICES, addDays, dateOf, isoOf, mondayOf, timeLabel } from "@/modules/rota/rotaModel";
import { dayRoster, myShifts } from "@/modules/rota/rotaPublish";
import { ADJUSTMENT_KINDS, ADJUSTMENT_REASONS } from "@/modules/rota/rotaSwap";
import { askRota, subscribeMyPublished, subscribeMyRequests, subscribeTeamAccess, teamUid } from "@/modules/rota/rotaTeamService";
import { initials, personColour, tint } from "./rotaStyle";

// My rota: for each member of the reception team, on their phone (and in the desktop app). Their own shifts, who is on each day, and requests: swap a shift with a colleague, ask for an adjustment
// (finish early, start late, part of a day, a day off, a different shift), and answer a colleague who asks them to swap. The team see only the weeks the coordinator has published, with who is on
// which shift and the times: never who is off, or why. Everything they ask goes to the server, which checks it against the rules; the coordinator is told, and approves only a swap that changes hours.
const CARD = "rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel,rgba(15,23,42,0.6))]";
const BTN = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-[var(--medtrak-border)] px-3 text-sm font-semibold text-[var(--medtrak-text)] disabled:opacity-40";
const PRIMARY = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-[var(--medtrak-accent)] px-4 text-sm font-bold text-slate-950 disabled:opacity-40";
const FIELD = "min-h-11 w-full rounded-xl border border-[var(--medtrak-border)] bg-transparent px-3 text-sm text-[var(--medtrak-text)] [&>option]:text-slate-900";
const STATUS = {
  awaiting_colleague: ["Waiting for your colleague", "#3b82f6"],
  awaiting_coordinator: ["Waiting for the coordinator", "#f59e0b"],
  approved: ["Agreed", "#10b981"],
  declined_by_colleague: ["Your colleague said no", "#64748b"],
  declined: ["Declined", "#f43f5e"],
  cancelled: ["Cancelled", "#64748b"],
  failed: ["No longer possible", "#f43f5e"],
};
const dayHeading = (iso, today) => (iso === today ? "Today" : iso === addDays(today, 1) ? "Tomorrow" : dateOf(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }));
const timeRange = (start, end) => `${timeLabel(start)} to ${timeLabel(end)}`;

function Avatar({ uid, name, size = "h-8 w-8 text-[11px]" }) {
  return <span className={`grid shrink-0 place-items-center rounded-full font-bold text-white ${size}`} style={{ background: personColour(uid) }} aria-hidden="true">{initials(name)}</span>;
}

function Sheet({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 sm:items-center" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg,#0b1220)] p-4 sm:rounded-3xl">
        <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-black text-[var(--medtrak-text)]">{title}</h2><button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--medtrak-border)]" aria-label="Close"><X className="h-5 w-5" /></button></div>
        <div className="mt-3 space-y-3">{children}</div>
      </div>
    </div>
  );
}

// ---- ask for a swap: pick from the swaps that work ----
function SwapSheet({ shift, onClose, onDone }) {
  const [state, setState] = useState({ loading: true, options: [], error: "", off: false });
  const [chosen, setChosen] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(null);
  useEffect(() => {
    let live = true;
    askRota({ action: "options", from: { monday: shift.monday, day: shift.day, key: shift.key } })
      .then((r) => { if (live) setState({ loading: false, options: r.options || [], error: "", off: r.enabled === false }); })
      .catch((e) => { if (live) setState({ loading: false, options: [], error: e?.message || "The swaps could not be loaded.", off: false }); });
    return () => { live = false; };
  }, [shift.monday, shift.day, shift.key]);

  async function send() {
    setBusy(true);
    try {
      const r = await askRota({ action: "create_swap", from: { monday: shift.monday, day: shift.day, key: shift.key }, to: { monday: chosen.monday, day: chosen.day, key: chosen.key }, fromLabel: `${shift.label}`, toLabel: chosen.label });
      setSent(r); onDone?.();
    } catch (e) { setState((s) => ({ ...s, error: e?.message || "That could not be sent." })); }
    setBusy(false);
  }

  return (
    <Sheet title="Swap this shift" onClose={onClose}>
      <p className={`${CARD} p-3 text-sm text-[var(--medtrak-text)]`}><strong>{shift.label}</strong>, {dayHeading(shift.iso, isoOf(new Date()))}, {timeRange(shift.start, shift.end)}</p>
      {sent ? (
        <div className="space-y-3">
          <p className="rounded-xl p-3 text-sm text-[var(--medtrak-text)]" style={{ background: tint("#10b981", 14) }}>Sent to {chosen.name}. They will get a message, and you will hear back here.{sent.changesHours ? " It changes someone's hours, so the coordinator will also have to agree it." : " Nobody's hours change, so once they say yes it is done and the coordinator is told."}</p>
          <button type="button" className={BTN} onClick={onClose}>Close</button>
        </div>
      ) : state.loading ? <p className="text-sm text-[var(--medtrak-muted)]">Looking for swaps that work…</p> : state.off ? <p className="text-sm text-[var(--medtrak-muted)]">Requests are not switched on for the team yet.</p> : (
        <>
          {state.options.length === 0 ? <p className="rounded-xl p-3 text-sm text-[var(--medtrak-text)]" style={{ background: tint("#64748b", 12) }}>There are no swaps that work for this shift. A swap has to keep everyone's hours and rules. You can ask the coordinator for a change instead.</p> : (
            <>
              <p className="text-sm text-[var(--medtrak-muted)]">These swaps work. Choose one:</p>
              <ul className="space-y-2">
                {state.options.map((o) => (
                  <li key={`${o.monday}${o.day}${o.key}`}>
                    <button type="button" onClick={() => setChosen(o)} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${chosen && chosen.key === o.key && chosen.day === o.day && chosen.monday === o.monday ? "border-[var(--medtrak-accent)] bg-[color:color-mix(in_srgb,var(--medtrak-accent)_12%,transparent)]" : "border-[var(--medtrak-border)]"}`}>
                      <Avatar uid={o.withUid} name={o.name} />
                      <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-[var(--medtrak-text)]">{o.name}</span><span className="block text-xs text-[var(--medtrak-muted)]">{o.label}</span></span>
                      {o.changesHours && <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: tint("#f59e0b", 20), color: "#f59e0b" }}>Changes hours</span>}
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" className={PRIMARY} disabled={!chosen || busy} onClick={send}>{busy ? "Sending…" : chosen ? `Ask ${chosen.name}` : "Choose a swap"}</button>
            </>
          )}
        </>
      )}
      {state.error && <p role="alert" className="rounded-xl p-3 text-sm text-rose-300" style={{ background: tint("#f43f5e", 12) }}>{state.error}</p>}
    </Sheet>
  );
}

// ---- ask for an adjustment ----
function AdjustSheet({ shift, onClose, onDone }) {
  const [kind, setKind] = useState("finish_early");
  const [fromTime, setFromTime] = useState("");
  const [toTime, setToTime] = useState("");
  const [reason, setReason] = useState("other");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const needs = ADJUSTMENT_KINDS[kind].needs;
  async function send() {
    setBusy(true); setError("");
    try { await askRota({ action: "create_adjust", monday: shift.monday, day: shift.day, kind, fromTime: needs === "from" || needs === "both" ? fromTime : "", toTime: needs === "to" || needs === "both" ? toTime : "", reason }); setSent(true); onDone?.(); } catch (e) { setError(e?.message || "That could not be sent."); }
    setBusy(false);
  }
  return (
    <Sheet title="Ask for a change" onClose={onClose}>
      <p className={`${CARD} p-3 text-sm text-[var(--medtrak-text)]`}><strong>{dayHeading(shift.iso, isoOf(new Date()))}</strong>: {shift.label}, {timeRange(shift.start, shift.end)}</p>
      {sent ? (
        <div className="space-y-3"><p className="rounded-xl p-3 text-sm text-[var(--medtrak-text)]" style={{ background: tint("#10b981", 14) }}>Sent to the coordinator. You will hear back here.</p><button type="button" className={BTN} onClick={onClose}>Close</button></div>
      ) : (
        <>
          <label className="block text-xs font-bold text-[var(--medtrak-text)]">What would you like?<select value={kind} onChange={(e) => setKind(e.target.value)} className={`${FIELD} mt-1 font-normal`}>{Object.entries(ADJUSTMENT_KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
          {(needs === "from" || needs === "both") && <label className="block text-xs font-bold text-[var(--medtrak-text)]">{needs === "both" ? "Off from" : "Finish at"}<select value={fromTime} onChange={(e) => setFromTime(e.target.value)} className={`${FIELD} mt-1 font-normal`}><option value="">Choose a time</option>{TIME_CHOICES.map((t) => <option key={t} value={t}>{timeLabel(t)}</option>)}</select></label>}
          {(needs === "to" || needs === "both") && <label className="block text-xs font-bold text-[var(--medtrak-text)]">{needs === "both" ? "Back at" : "Start at"}<select value={toTime} onChange={(e) => setToTime(e.target.value)} className={`${FIELD} mt-1 font-normal`}><option value="">Choose a time</option>{TIME_CHOICES.map((t) => <option key={t} value={t}>{timeLabel(t)}</option>)}</select></label>}
          {!ADJUSTMENT_KINDS[kind].noAbsence && <label className="block text-xs font-bold text-[var(--medtrak-text)]">How should it be counted?<select value={reason} onChange={(e) => setReason(e.target.value)} className={`${FIELD} mt-1 font-normal`}>{Object.entries(ADJUSTMENT_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>}
          {kind === "other" || kind === "different_shift" ? <p className="text-xs text-[var(--medtrak-muted)]">The coordinator will get in touch to talk it through.</p> : null}
          {error && <p role="alert" className="rounded-xl p-3 text-sm text-rose-300" style={{ background: tint("#f43f5e", 12) }}>{error}</p>}
          <button type="button" className={PRIMARY} disabled={busy} onClick={send}>{busy ? "Sending…" : "Send to the coordinator"}</button>
        </>
      )}
    </Sheet>
  );
}

// ---- the three views ----
function MyShifts({ shifts, today, onSwap, onAdjust }) {
  if (!shifts.length) return <p className={`${CARD} p-4 text-sm text-[var(--medtrak-muted)]`}>You have no shifts in the weeks that have been published.</p>;
  const groups = [];
  for (const s of shifts) { const last = groups[groups.length - 1]; if (last && last.iso === s.iso) last.items.push(s); else groups.push({ iso: s.iso, items: [s] }); }
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <section key={g.iso}>
          <h3 className="mb-1.5 text-xs font-black uppercase tracking-wide text-[var(--medtrak-muted)]">{dayHeading(g.iso, today)}</h3>
          {g.items.map((s) => (
            <div key={`${s.iso}${s.key}`} className={`${CARD} p-3.5 ${g.iso === today ? "ring-2 ring-[var(--medtrak-accent)]" : ""}`}>
              <p className="text-base font-black text-[var(--medtrak-text)]">{s.label}</p>
              <p className="text-sm text-[var(--medtrak-text)]">{timeRange(s.start, s.end)}{(s.from || s.until) && <span className="ml-2 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: tint("#f59e0b", 18), color: "#d97706" }}>part of the shift</span>}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={BTN} onClick={() => onSwap(s)}><ArrowLeftRight className="h-4 w-4" aria-hidden="true" />Swap</button>
                <button type="button" className={BTN} onClick={() => onAdjust(s)}><MessageSquarePlus className="h-4 w-4" aria-hidden="true" />Ask for a change</button>
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

export function TeamDay({ published, uid, today }) {
  const weeks = useMemo(() => Object.keys(published).sort(), [published]);
  const [monday, setMonday] = useState("");
  const [day, setDay] = useState("");
  useEffect(() => {
    if (!weeks.length) return;
    const thisWeek = mondayOf(new Date());
    const startWeek = weeks.includes(thisWeek) ? thisWeek : (weeks.find((w) => w >= thisWeek) || weeks[weeks.length - 1]);
    setMonday((m) => (m && weeks.includes(m) ? m : startWeek));
  }, [weeks.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (monday) { const idx = DAYS.findIndex((d) => addDays(monday, DAYS.indexOf(d)) === today); setDay((d) => (d && DAYS.includes(d) ? d : DAYS[idx >= 0 ? idx : 0])); } }, [monday, today]);
  const week = published[monday];
  const i = weeks.indexOf(monday);
  if (!week) return <p className={`${CARD} p-4 text-sm text-[var(--medtrak-muted)]`}>No weeks have been published yet.</p>;
  const roster = dayRoster(week, day);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button type="button" className={BTN} disabled={i <= 0} onClick={() => setMonday(weeks[i - 1])} aria-label="Previous week"><ChevronLeft className="h-4 w-4" /></button>
        <p className="text-center text-sm font-black text-[var(--medtrak-text)]">Week commencing {dateOf(monday).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</p>
        <button type="button" className={BTN} disabled={i >= weeks.length - 1} onClick={() => setMonday(weeks[i + 1])} aria-label="Next week"><ChevronRight className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {DAYS.map((d) => { const dIso = addDays(monday, DAYS.indexOf(d)); return (
          <button key={d} type="button" onClick={() => setDay(d)} className={`min-h-12 rounded-xl border text-center text-xs font-bold ${day === d ? "border-transparent bg-[var(--medtrak-accent)] text-slate-950" : "border-[var(--medtrak-border)] text-[var(--medtrak-text)]"}`} aria-pressed={day === d}>
            {DAY_LABELS[d].slice(0, 3)}<span className="block text-base font-black">{dateOf(dIso).getDate()}</span>
          </button>
        ); })}
      </div>
      <ul className="space-y-1.5">
        {roster.length === 0 && <li className={`${CARD} p-3 text-sm text-[var(--medtrak-muted)]`}>Nobody is on the rota that day.</li>}
        {roster.map((r) => (
          <li key={r.key} className={`${CARD} flex items-center gap-3 p-3 ${r.uid === uid ? "ring-2 ring-[var(--medtrak-accent)]" : ""}`}>
            <Avatar uid={r.uid} name={r.name} />
            <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-[var(--medtrak-text)]">{r.name}{r.uid === uid ? " (you)" : ""}</span><span className="block text-xs text-[var(--medtrak-muted)]">{r.label}, {timeRange(r.start, r.end)}</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Requests({ requests, uid, onAnswer, busy }) {
  if (!requests.length) return <p className={`${CARD} p-4 text-sm text-[var(--medtrak-muted)]`}>No requests yet. To swap a shift or ask for a change, open My shifts.</p>;
  const forMe = requests.filter((r) => r.targetUid === uid && r.status === "awaiting_colleague");
  const rest = requests.filter((r) => !forMe.includes(r));
  const text = (r) => (r.type === "swap" ? (r.requesterUid === uid ? `You asked ${r.targetName} to swap: your ${r.a?.label} for their ${r.b?.label}` : `${r.requesterName} asks you to swap: their ${r.a?.label} for your ${r.b?.label}`) : `You asked for: ${r.adjust?.text} on ${dateOf(r.adjust?.iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}`);
  return (
    <div className="space-y-4">
      {forMe.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-xs font-black uppercase tracking-wide text-amber-400">Waiting for you</h3>
          <ul className="space-y-2">
            {forMe.map((r) => (
              <li key={r.id} className={`${CARD} p-3.5`}>
                <p className="text-sm font-bold text-[var(--medtrak-text)]">{text(r)}</p>
                {r.changesHours && <p className="mt-1 text-xs text-amber-300">It changes hours, so the coordinator also has to agree it.</p>}
                <div className="mt-3 flex gap-2"><button type="button" className={PRIMARY} disabled={busy} onClick={() => onAnswer({ action: "accept", id: r.id })}>Yes, swap</button><button type="button" className={BTN} disabled={busy} onClick={() => onAnswer({ action: "decline", id: r.id })}>No</button></div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        {forMe.length > 0 && <h3 className="mb-1.5 text-xs font-black uppercase tracking-wide text-[var(--medtrak-muted)]">Everything else</h3>}
        <ul className="space-y-2">
          {rest.map((r) => { const [label, colour] = STATUS[r.status] || [r.status, "#64748b"]; return (
            <li key={r.id} className={`${CARD} p-3.5`}>
              <p className="text-sm text-[var(--medtrak-text)]">{text(r)}</p>
              {r.status === "declined" && r.decision?.reason && <p className="mt-1 text-xs text-[var(--medtrak-muted)]">{r.decision.reason}.</p>}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: tint(colour, 16), color: colour }}>{label}</span>
                {r.requesterUid === uid && ["awaiting_colleague", "awaiting_coordinator"].includes(r.status) && <button type="button" className="text-xs font-semibold text-[var(--medtrak-muted)] underline" disabled={busy} onClick={() => onAnswer({ action: "cancel", id: r.id })}>Cancel the request</button>}
              </div>
            </li>
          ); })}
        </ul>
      </section>
    </div>
  );
}

export default function MyRota() {
  const { user } = useAuth();
  const uid = teamUid(user?.uid);
  const today = isoOf(new Date());
  const [access, setAccess] = useState(null); // null while loading
  const [published, setPublished] = useState({});
  const [requests, setRequests] = useState([]);
  const [tab, setTab] = useState("mine");
  const [sheet, setSheet] = useState(null); // { kind: "swap" | "adjust", shift }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadedWeeks, setLoadedWeeks] = useState(false);

  useEffect(() => subscribeTeamAccess(setAccess, () => setAccess(false)), []);
  useEffect(() => {
    if (!access) return undefined;
    const stops = [subscribeMyPublished(uid, (w) => { setPublished(w); setLoadedWeeks(true); }, () => { setPublished({}); setLoadedWeeks(true); }), subscribeMyRequests(uid, setRequests, () => setRequests([]))];
    return () => stops.forEach((s) => s());
  }, [access, uid]);

  const shifts = useMemo(() => myShifts(published, uid, today), [published, uid, today]);
  const waitingForMe = requests.filter((r) => r.targetUid === uid && r.status === "awaiting_colleague").length;

  async function answer(data) {
    setBusy(true); setError("");
    try { const r = await askRota(data); if (r.ok === false) setError(r.problems?.[0] || "That could not be done."); } catch (e) { setError(e?.message || "That could not be done."); }
    setBusy(false);
  }

  if (access === null) return <p className="text-sm text-[var(--medtrak-muted)]">Loading…</p>;
  if (!access) return <p className={`${CARD} p-4 text-sm text-[var(--medtrak-text)]`}>The rota is not switched on for the team yet. Your coordinator will tell you when it is.</p>;
  if (loadedWeeks && !Object.keys(published).length) return <p className={`${CARD} p-4 text-sm text-[var(--medtrak-text)]`}>No weeks have been published yet, or you are not on the reception rota.</p>;

  const tabs = [["mine", "My shifts", CalendarDays], ["team", "Team", Users], ["requests", waitingForMe ? `Requests (${waitingForMe})` : "Requests", ArrowLeftRight]];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-1 rounded-2xl border border-[var(--medtrak-border)] p-1" role="tablist">
        {tabs.map(([id, label, Icon]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-bold ${tab === id ? "bg-[var(--medtrak-accent)] text-slate-950" : "text-[var(--medtrak-text)]"}`}><Icon className="h-4 w-4" aria-hidden="true" />{label}</button>
        ))}
      </div>
      {error && <p role="alert" className="rounded-xl p-3 text-sm text-rose-300" style={{ background: tint("#f43f5e", 12) }}>{error}</p>}
      {tab === "mine" && <MyShifts shifts={shifts} today={today} onSwap={(shift) => setSheet({ kind: "swap", shift })} onAdjust={(shift) => setSheet({ kind: "adjust", shift })} />}
      {tab === "team" && <TeamDay published={published} uid={uid} today={today} />}
      {tab === "requests" && <Requests requests={requests} uid={uid} onAnswer={answer} busy={busy} />}
      {sheet?.kind === "swap" && <SwapSheet shift={sheet.shift} onClose={() => setSheet(null)} onDone={() => setTab("requests")} />}
      {sheet?.kind === "adjust" && <AdjustSheet shift={sheet.shift} onClose={() => setSheet(null)} onDone={() => setTab("requests")} />}
    </div>
  );
}
