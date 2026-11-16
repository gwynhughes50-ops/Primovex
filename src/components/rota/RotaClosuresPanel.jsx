import { useMemo, useState } from "react";
import { ArrowRight, Building2, Pencil, Plus, Trash2 } from "lucide-react";
import { CLOSURE_REASONS, CLOSURE_SITES, TIME_CHOICES, addDays, dateOf, isoOf, mondayOf, timeLabel } from "@/modules/rota/rotaModel";
import { addClosure, removeClosure, updateClosure } from "@/modules/rota/rotaService";
import { tint } from "./rotaStyle";

// When the main surgery or the branch surgery is shut: a bank holiday, a training afternoon, a burst pipe. The surgery, the days, the times and the reason are all picked from lists: nothing is typed.
// The rota is built around it: a shift at a closed surgery is not staffed, and a shift that runs into a closure is cut to the open hours.
const FIELD = "w-full rounded-xl border border-[var(--medtrak-border)] bg-transparent px-3 py-2 text-sm font-normal text-[var(--medtrak-text)] [&>option]:text-slate-900";
const BTN = "inline-flex items-center gap-1.5 rounded-xl border border-[var(--medtrak-border)] px-3 py-2 text-sm font-semibold text-[var(--medtrak-text)] disabled:opacity-40";
const PRIMARY = "inline-flex items-center gap-1.5 rounded-xl bg-[var(--medtrak-accent)] px-4 py-2 text-sm font-semibold text-slate-950 shadow-sm hover:brightness-110 disabled:opacity-40";
const CARD = "rounded-2xl border border-[var(--medtrak-border)] bg-[color:color-mix(in_srgb,var(--medtrak-panel,#0f172a)_60%,transparent)]";
const SITE_COLOUR = { main: "#3b82f6", branch: "#10b981", both: "#f59e0b" };
const dayText = (iso) => dateOf(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
// "Mon 25 Dec", "Tue 18 Nov from 12.30" (shut from then), "Tue 18 Nov until 10" (reopens then), "Mon 17 Nov from 14.30 to Wed 19 Nov until 10"
const rangeText = (c) => {
  const last = c.to || c.from;
  if (last === c.from) {
    if (c.fromTime && c.toTime) return `${dayText(c.from)}, ${timeLabel(c.fromTime)} to ${timeLabel(c.toTime)}`;
    if (c.fromTime) return `${dayText(c.from)} from ${timeLabel(c.fromTime)}`;
    if (c.toTime) return `${dayText(c.from)} until ${timeLabel(c.toTime)}`;
    return dayText(c.from);
  }
  return `${dayText(c.from)}${c.fromTime ? ` from ${timeLabel(c.fromTime)}` : ""} to ${dayText(last)}${c.toTime ? ` until ${timeLabel(c.toTime)}` : ""}`;
};
const daysIn = (c) => Math.round((dateOf(c.to || c.from) - dateOf(c.from)) / 86400000) + 1;

export default function RotaClosuresPanel({ closures, actor, canManage }) {
  const today = isoOf(new Date());
  const [site, setSite] = useState("branch");
  const [reason, setReason] = useState("bank");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [fromTime, setFromTime] = useState("");
  const [toTime, setToTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sure, setSure] = useState("");
  const [editing, setEditing] = useState("");
  const cutoff = addDays(mondayOf(new Date()), -7);
  const upcoming = useMemo(() => closures.filter((c) => (c.to || c.from) >= cutoff), [closures, cutoff]);
  const past = useMemo(() => closures.filter((c) => (c.to || c.from) < cutoff), [closures, cutoff]);

  async function add() {
    setError(""); setBusy(true);
    try {
      const row = { site, from, to: to < from ? from : to, fromTime, toTime, reason };
      if (editing) await updateClosure(editing, row, actor); else await addClosure(row, actor);
      setFromTime(""); setToTime(""); setEditing("");
    } catch (e) { setError(e?.message || "That could not be saved."); }
    setBusy(false);
  }
  function startEdit(c) {
    setError(""); setSure(""); setEditing(c.id); setSite(c.site); setReason(c.reason || "other"); setFrom(c.from); setTo(c.to || c.from); setFromTime(c.fromTime || ""); setToTime(c.toTime || "");
    if (typeof window !== "undefined") window.scrollTo?.({ top: 0, behavior: "smooth" });
  }
  function cancelEdit() { setEditing(""); setFromTime(""); setToTime(""); setError(""); }
  async function remove(id) { setBusy(true); try { await removeClosure(id); } catch (e) { setError(e?.message || "That could not be removed."); } setBusy(false); setSure(""); }

  const row = (c) => {
    const colour = SITE_COLOUR[c.site] || "#64748b";
    const days = daysIn(c);
    return (
      <li key={c.id} className={`${CARD} flex flex-wrap items-center gap-3 p-3`}>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: tint(colour, 18), color: colour }} aria-hidden="true"><Building2 className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[var(--medtrak-text)]">{CLOSURE_SITES[c.site] || c.site} closed</p>
          <p className="text-sm text-[var(--medtrak-muted)]">{rangeText(c)}</p>
        </div>
        <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: tint(colour, 16), color: colour }}>{CLOSURE_REASONS[c.reason] || "Other reason"}</span>
        {days > 1 && <span className="rounded-full px-2.5 py-1 text-xs font-semibold text-[var(--medtrak-muted)]" style={{ background: tint("#64748b", 14) }}>{days} days</span>}
        {canManage && sure !== c.id && <button type="button" className={BTN} onClick={() => startEdit(c)} aria-label={`Change the ${CLOSURE_SITES[c.site] || ""} closure on ${dayText(c.from)}`}><Pencil className="h-4 w-4" aria-hidden="true" /></button>}
        {canManage && (sure === c.id
          ? <span className="flex gap-2"><button type="button" className={PRIMARY} disabled={busy} onClick={() => remove(c.id)}>Yes, remove</button><button type="button" className={BTN} onClick={() => setSure("")}>Keep</button></span>
          : <button type="button" className={BTN} onClick={() => setSure(c.id)} aria-label={`Remove the ${CLOSURE_SITES[c.site] || ""} closure on ${dayText(c.from)}`}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>)}
      </li>
    );
  };

  return (
    <div className="space-y-5">
      {canManage && (
        <section className={`${CARD} p-5`}>
          <h2 className="text-lg font-black text-slate-50">{editing ? "Change this closure" : "Add a surgery closure"}</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="text-xs font-bold text-[var(--medtrak-text)]">Which surgery<select value={site} onChange={(e) => setSite(e.target.value)} className={`${FIELD} mt-1`}>{Object.entries(CLOSURE_SITES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="text-xs font-bold text-[var(--medtrak-text)]">Reason<select value={reason} onChange={(e) => setReason(e.target.value)} className={`${FIELD} mt-1`}>{Object.entries(CLOSURE_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          </div>
          <div className="mt-4 grid items-end gap-3 md:grid-cols-[1fr_1fr_auto_1fr_1fr]">
            <label className="text-xs font-bold text-[var(--medtrak-text)]">First day<input type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value); }} className={`${FIELD} mt-1`} /></label>
            <label className="text-xs font-bold text-[var(--medtrak-text)]">Closed from<select value={fromTime} onChange={(e) => setFromTime(e.target.value)} className={`${FIELD} mt-1`}><option value="">Start of the day</option>{TIME_CHOICES.map((t) => <option key={t} value={t}>{timeLabel(t)}</option>)}</select></label>
            <ArrowRight className="mb-2.5 hidden h-4 w-4 text-[var(--medtrak-muted)] md:block" aria-hidden="true" />
            <label className="text-xs font-bold text-[var(--medtrak-text)]">Last day<input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={`${FIELD} mt-1`} /></label>
            <label className="text-xs font-bold text-[var(--medtrak-text)]">Reopens at<select value={toTime} onChange={(e) => setToTime(e.target.value)} className={`${FIELD} mt-1`}><option value="">End of the day</option>{TIME_CHOICES.map((t) => <option key={t} value={t}>{timeLabel(t)}</option>)}</select></label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" className={PRIMARY} disabled={busy} onClick={add}>{editing ? null : <Plus className="h-4 w-4" aria-hidden="true" />}{editing ? "Save the changes" : "Add"}</button>
            {editing && <button type="button" className={BTN} onClick={cancelEdit}>Cancel</button>}
            {error && <span className="text-sm text-rose-300">{error}</span>}
          </div>
          <details className="mt-4 text-xs text-[var(--medtrak-muted)]">
            <summary className="cursor-pointer font-semibold">How closures change the rota</summary>
            <p className="mt-1 max-w-3xl">Leave the times alone for whole days (a bank holiday). For a training afternoon, set the first day and "Closed from" (for example 12.30): the surgery is open until then. To open late, set "Reopens at" (for example 10.00). For several days with part days at each end, set both. A shift at a closed surgery is not staffed that day, and a shift that runs into a closure is cut to the open hours (a closure of less than an hour's open time counts as closed). Which surgery each shift is at is set under People and rules, in the shifts table (the Ty Elan shift is the branch surgery's). After adding, go to the Rota tab: weeks that were built before the closure are marked, and you can rebuild them.</p>
          </details>
        </section>
      )}
      <section>
        <h2 className="text-lg font-black text-slate-50">Coming up and this week</h2>
        {upcoming.length ? <ul className="mt-3 space-y-2">{upcoming.map(row)}</ul> : <p className={`${CARD} mt-3 p-4 text-sm text-[var(--medtrak-muted)]`}>No closures have been entered.</p>}
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
