import { useMemo, useState } from "react";
import { ArrowRight, Plus, Trash2 } from "lucide-react";
import { ABSENCE_REASONS, TIME_CHOICES, addDays, dateOf, isoOf, mondayOf, timeLabel } from "@/modules/rota/rotaModel";
import { addAbsence, removeAbsence } from "@/modules/rota/rotaService";
import { initials, personColour, tint } from "./rotaStyle";

// Who is off. The person is picked from the people on the rota, the days from the calendar, the times and the reason from lists: nothing is typed. Sickness is entered as "Off": the rota does not
// keep why someone is off sick.
const FIELD = "w-full rounded-xl border border-[var(--medtrak-border)] bg-transparent px-3 py-2 text-sm font-normal text-[var(--medtrak-text)] [&>option]:text-slate-900";
const BTN = "inline-flex items-center gap-1.5 rounded-xl border border-[var(--medtrak-border)] px-3 py-2 text-sm font-semibold text-[var(--medtrak-text)] disabled:opacity-40";
const PRIMARY = "inline-flex items-center gap-1.5 rounded-xl bg-[var(--medtrak-accent)] px-4 py-2 text-sm font-semibold text-slate-950 shadow-sm hover:brightness-110 disabled:opacity-40";
const CARD = "rounded-2xl border border-[var(--medtrak-border)] bg-[color:color-mix(in_srgb,var(--medtrak-panel,#0f172a)_60%,transparent)]";
const REASON_COLOUR = { leave: "#3b82f6", toil: "#8b5cf6", other: "#f59e0b" };
const REASON_SHORT = { leave: "Annual leave", toil: "TOIL", other: "Off" }; // the short name on the list; the form spells it out
const dayText = (iso) => dateOf(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
// "Mon 17 Nov from 14.30 to Wed 19 Nov until 10", or "Tue 18 Nov from 14.30" (finishes early), "Tue 18 Nov until 10" (starts late), "Tue 18 Nov, 10 to 13"
const rangeText = (a) => {
  const last = a.to || a.from;
  if (last === a.from) {
    if (a.fromTime && a.toTime) return `${dayText(a.from)}, ${timeLabel(a.fromTime)} to ${timeLabel(a.toTime)}`;
    if (a.fromTime) return `${dayText(a.from)} from ${timeLabel(a.fromTime)}`;
    if (a.toTime) return `${dayText(a.from)} until ${timeLabel(a.toTime)}`;
    return dayText(a.from);
  }
  return `${dayText(a.from)}${a.fromTime ? ` from ${timeLabel(a.fromTime)}` : ""} to ${dayText(last)}${a.toTime ? ` until ${timeLabel(a.toTime)}` : ""}`;
};
const daysIn = (a) => Math.round((dateOf(a.to || a.from) - dateOf(a.from)) / 86400000) + 1;

function Avatar({ uid, name }) {
  return <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold text-white" style={{ background: personColour(uid) }} aria-hidden="true">{initials(name)}</span>;
}

export default function RotaAbsencesPanel({ rules, absences, actor, canManage }) {
  const today = isoOf(new Date());
  const [uid, setUid] = useState("");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [reason, setReason] = useState("leave");
  const [fromTime, setFromTime] = useState("");
  const [toTime, setToTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sure, setSure] = useState("");
  const people = rules.people || [];
  const upcoming = useMemo(() => absences.filter((a) => (a.to || a.from) >= addDays(mondayOf(new Date()), -7)), [absences]);
  const past = useMemo(() => absences.filter((a) => (a.to || a.from) < addDays(mondayOf(new Date()), -7)), [absences]);

  async function add() {
    setError("");
    const person = people.find((p) => p.uid === uid);
    if (!person) { setError("Choose who is off."); return; }
    setBusy(true);
    try { await addAbsence({ uid, name: person.name, from, to: to < from ? from : to, fromTime, toTime, reason }, actor); setUid(""); setFromTime(""); setToTime(""); } catch (e) { setError(e?.message || "That could not be saved."); }
    setBusy(false);
  }
  async function remove(id) { setBusy(true); try { await removeAbsence(id); } catch (e) { setError(e?.message || "That could not be removed."); } setBusy(false); setSure(""); }

  const row = (a) => {
    const colour = REASON_COLOUR[a.reason] || "#64748b";
    const days = daysIn(a);
    return (
      <li key={a.id} className={`${CARD} flex flex-wrap items-center gap-3 p-3`}>
        <Avatar uid={a.uid} name={a.name} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[var(--medtrak-text)]">{a.name}</p>
          <p className="text-sm text-[var(--medtrak-muted)]">{rangeText(a)}</p>
        </div>
        <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: tint(colour, 16), color: colour }}>{REASON_SHORT[a.reason] || "Off"}</span>
        {days > 1 && <span className="rounded-full px-2.5 py-1 text-xs font-semibold text-[var(--medtrak-muted)]" style={{ background: tint("#64748b", 14) }}>{days} days</span>}
        {canManage && (sure === a.id
          ? <span className="flex gap-2"><button type="button" className={PRIMARY} disabled={busy} onClick={() => remove(a.id)}>Yes, remove</button><button type="button" className={BTN} onClick={() => setSure("")}>Keep</button></span>
          : <button type="button" className={BTN} onClick={() => setSure(a.id)} aria-label={`Remove ${a.name}'s absence`}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>)}
      </li>
    );
  };

  return (
    <div className="space-y-5">
      {canManage && (
        <section className={`${CARD} p-5`}>
          <h2 className="text-lg font-black text-slate-50">Add someone being off</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="text-xs font-bold text-[var(--medtrak-text)]">Who<select value={uid} onChange={(e) => setUid(e.target.value)} className={`${FIELD} mt-1`}><option value="">Choose from the rota team</option>{people.map((p) => <option key={p.uid} value={p.uid}>{p.name}</option>)}</select></label>
            <label className="text-xs font-bold text-[var(--medtrak-text)]">Reason<select value={reason} onChange={(e) => setReason(e.target.value)} className={`${FIELD} mt-1`}>{Object.entries(ABSENCE_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          </div>
          <div className="mt-4 grid items-end gap-3 md:grid-cols-[1fr_1fr_auto_1fr_1fr]">
            <label className="text-xs font-bold text-[var(--medtrak-text)]">First day<input type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value); }} className={`${FIELD} mt-1`} /></label>
            <label className="text-xs font-bold text-[var(--medtrak-text)]">Off from<select value={fromTime} onChange={(e) => setFromTime(e.target.value)} className={`${FIELD} mt-1`}><option value="">Start of the day</option>{TIME_CHOICES.map((t) => <option key={t} value={t}>{timeLabel(t)}</option>)}</select></label>
            <ArrowRight className="mb-2.5 hidden h-4 w-4 text-[var(--medtrak-muted)] md:block" aria-hidden="true" />
            <label className="text-xs font-bold text-[var(--medtrak-text)]">Last day<input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={`${FIELD} mt-1`} /></label>
            <label className="text-xs font-bold text-[var(--medtrak-text)]">Back at<select value={toTime} onChange={(e) => setToTime(e.target.value)} className={`${FIELD} mt-1`}><option value="">End of the day</option>{TIME_CHOICES.map((t) => <option key={t} value={t}>{timeLabel(t)}</option>)}</select></label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" className={PRIMARY} disabled={busy || !uid} onClick={add}><Plus className="h-4 w-4" aria-hidden="true" />Add</button>
            {error && <span className="text-sm text-rose-300">{error}</span>}
          </div>
          <details className="mt-4 text-xs text-[var(--medtrak-muted)]">
            <summary className="cursor-pointer font-semibold">How the times work</summary>
            <p className="mt-1 max-w-3xl">Leave the times alone for whole days. For a half day or finishing early, set the first day and "Off from" (for example 12.00): they are in until then. For starting late, set "Back at" (for example 13.00): they are in from then. For a day or more with part days at each end, set both. Someone in for less than an hour of a day is treated as off that day. After adding, go to the Rota tab: weeks that now have someone off are marked, and you can rebuild them.</p>
          </details>
        </section>
      )}
      <section>
        <h2 className="text-lg font-black text-slate-50">Coming up and this week</h2>
        {upcoming.length ? <ul className="mt-3 space-y-2">{upcoming.map(row)}</ul> : <p className={`${CARD} mt-3 p-4 text-sm text-[var(--medtrak-muted)]`}>Nobody is off at the moment.</p>}
      </section>
      {past.length > 0 && (
        <section>
          <h2 className="text-lg font-black text-slate-50">Earlier</h2>
          <ul className="mt-3 space-y-2">{past.slice(-20).reverse().map(row)}</ul>
        </section>
      )}
    </div>
  );
}
