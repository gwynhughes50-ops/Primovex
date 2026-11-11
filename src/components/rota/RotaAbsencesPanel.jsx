import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { ABSENCE_REASONS, TIME_CHOICES, addDays, dateOf, isoOf, mondayOf, timeLabel } from "@/modules/rota/rotaModel";
import { addAbsence, removeAbsence } from "@/modules/rota/rotaService";

// Who is off. The person is picked from the people on the rota, the days from the calendar, and the reason from a short list: nothing is typed. Sickness is entered as "Off": the rota does
// not keep why someone is off sick.
const FIELD = "rounded-lg border border-[var(--medtrak-border)] bg-transparent px-2 py-2 text-sm text-[var(--medtrak-text)] [&>option]:text-slate-900";
const BTN = "rounded-lg border border-[var(--medtrak-border)] px-3 py-2 text-sm font-semibold text-[var(--medtrak-text)] disabled:opacity-40";
const PRIMARY = "rounded-lg bg-[var(--medtrak-accent)] px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40";
const dayText = (iso) => dateOf(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
// "Mon 17 Nov from 14.30 to Wed 19 Nov until 10", or "Tue 18 Nov from 14.30" (finishes early), "Tue 18 Nov until 10" (starts late), "Tue 18 Nov 10 to 13"
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

  const row = (a) => (
    <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--medtrak-border)] p-3 text-sm">
      <span><strong>{a.name}</strong> · {rangeText(a)} · {ABSENCE_REASONS[a.reason] || "Off"}</span>
      {canManage && (sure === a.id
        ? <span className="flex gap-2"><button type="button" className={PRIMARY} disabled={busy} onClick={() => remove(a.id)}>Yes, remove</button><button type="button" className={BTN} onClick={() => setSure("")}>Keep</button></span>
        : <button type="button" className={BTN} onClick={() => setSure(a.id)} aria-label={`Remove ${a.name}'s absence`}><Trash2 className="h-4 w-4" /></button>)}
    </li>
  );

  return (
    <div className="space-y-4">
      {canManage && (
        <section className="rounded-2xl border border-[var(--medtrak-border)] p-4">
          <h2 className="text-lg font-bold text-slate-50">Add someone being off</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_auto_auto_auto_1fr_auto]">
            <label className="text-xs font-bold">Who<select value={uid} onChange={(e) => setUid(e.target.value)} className={`${FIELD} mt-1 w-full font-normal`}><option value="">Choose from the rota team</option>{people.map((p) => <option key={p.uid} value={p.uid}>{p.name}</option>)}</select></label>
            <label className="text-xs font-bold">First day<input type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value); }} className={`${FIELD} mt-1 w-full font-normal`} /></label>
            <label className="text-xs font-bold">Off from<select value={fromTime} onChange={(e) => setFromTime(e.target.value)} className={`${FIELD} mt-1 w-full font-normal`}><option value="">Start of the day</option>{TIME_CHOICES.map((t) => <option key={t} value={t}>{timeLabel(t)}</option>)}</select></label>
            <label className="text-xs font-bold">Last day<input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={`${FIELD} mt-1 w-full font-normal`} /></label>
            <label className="text-xs font-bold">Back at<select value={toTime} onChange={(e) => setToTime(e.target.value)} className={`${FIELD} mt-1 w-full font-normal`}><option value="">End of the day</option>{TIME_CHOICES.map((t) => <option key={t} value={t}>{timeLabel(t)}</option>)}</select></label>
            <label className="text-xs font-bold">Reason<select value={reason} onChange={(e) => setReason(e.target.value)} className={`${FIELD} mt-1 w-full font-normal`}>{Object.entries(ABSENCE_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <div className="flex items-end"><button type="button" className={PRIMARY} disabled={busy || !uid} onClick={add}>Add</button></div>
          </div>
          <p className="mt-2 text-xs text-[var(--medtrak-muted)]">Leave the times alone for whole days. For a half day or finishing early, set the first day and "Off from" (for example 12.00): they are in until then. For starting late, set "Back at" (for example 13.00): they are in from then. For a day or more with part days at each end, set both. Someone in for less than an hour of a day is treated as off that day. After adding, go to the Rota tab: weeks that now have someone off are marked, and you can rebuild them.</p>
          {error && <p className="mt-2 text-sm text-rose-200">{error}</p>}
        </section>
      )}
      <section>
        <h2 className="text-lg font-bold text-slate-50">Coming up and this week</h2>
        {upcoming.length ? <ul className="mt-2 space-y-2">{upcoming.map(row)}</ul> : <p className="mt-2 text-sm text-slate-400">Nobody is off at the moment.</p>}
      </section>
      {past.length > 0 && (
        <section>
          <h2 className="text-lg font-bold text-slate-50">Earlier</h2>
          <ul className="mt-2 space-y-2">{past.slice(-20).reverse().map(row)}</ul>
        </section>
      )}
    </div>
  );
}
