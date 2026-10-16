import { useEffect, useMemo, useState } from "react";
import { PURPOSES, VEHICLES, claimProblem, dateKey, money, pence, routeMiles, totalMiles, VISIT_PLACE } from "./mileage";

// One journey: when, from where to where, there and back or not, the miles, the vehicle and why. Used on the desktop and the phone.
// Places are chosen from a list (never typed) so no patient's address ends up in a claim; the miles fill in for a known route.
// `skin` picks the look: "desktop" (dark) or "phone" (the phone app's light colours).

const SKINS = {
  desktop: {
    field: "mt-1 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-300/60",
    label: "block text-xs font-semibold uppercase tracking-wide text-slate-400",
    muted: "text-slate-400", btn: "inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-white/5 disabled:opacity-40",
    primary: "inline-flex items-center justify-center gap-1.5 rounded-lg bg-teal-500/90 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40",
    error: "text-rose-300", note: "rounded-lg bg-white/5 p-2 text-slate-300",
  },
  phone: {
    field: "mt-1 min-h-12 w-full rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 text-base",
    label: "block text-sm font-bold",
    muted: "text-[var(--medtrak-muted)]", btn: "min-h-12 rounded-2xl border border-[var(--medtrak-border)] px-4 font-bold",
    primary: "min-h-12 rounded-2xl bg-[var(--medtrak-accent)] px-4 font-bold text-white disabled:opacity-40",
    error: "text-rose-700", note: "rounded-2xl bg-black/5 p-3",
  },
};
const LAST_VEHICLE = "primovex.mileage.vehicle";
const lastVehicle = () => { try { return localStorage.getItem(LAST_VEHICLE) || "car"; } catch { return "car"; } };

export default function ClaimForm({ skin = "desktop", options, routes, rates, initial = null, milesBefore = () => 0, onSubmit, onCancel }) {
  const s = SKINS[skin];
  const [form, setForm] = useState(() => initial
    ? { date: initial.date, fromId: initial.fromId, toId: initial.toId, miles: String(initial.miles), returnTrip: Boolean(initial.returnTrip), vehicle: initial.vehicle, purpose: initial.purpose, note: initial.note || "" }
    : { date: dateKey(new Date()), fromId: "", toId: "", miles: "", returnTrip: true, vehicle: lastVehicle(), purpose: "", note: "" });
  const [typed, setTyped] = useState(Boolean(initial)); // the person has set the miles themselves
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  // a known route fills in the miles until the person types their own
  const known = useMemo(() => routeMiles(routes, form.fromId, form.toId), [routes, form.fromId, form.toId]);
  useEffect(() => { if (!typed) set({ miles: known === null ? "" : String(known) }); }, [known, typed]); // eslint-disable-line react-hooks/exhaustive-deps

  const problem = claimProblem(form);
  const total = totalMiles({ miles: form.miles, returnTrip: form.returnTrip });
  const estimate = Number(form.miles) > 0 ? pence(rates, form.vehicle, milesBefore(form.vehicle, form.date), total) : 0;
  async function save() {
    setBusy(true); setError("");
    try { await onSubmit(form); try { localStorage.setItem(LAST_VEHICLE, form.vehicle); } catch { /* not remembered */ } } catch (failure) { setError(failure?.message || "That didn't save."); setBusy(false); }
  }
  const placeSelect = (label, value, onChange, exclude) => (
    <label className={s.label}>{label}
      <select className={s.field} value={value} onChange={(e) => { setTyped(false); onChange(e.target.value); }}>
        <option value="">Choose a place</option>
        {options.filter((o) => o.id !== exclude || o.id === VISIT_PLACE.id).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
  );

  return (
    <div className="space-y-3">
      <label className={s.label}>Date of the journey<input type="date" className={s.field} value={form.date} max={dateKey(new Date())} onChange={(e) => set({ date: e.target.value })} /></label>
      {placeSelect("From", form.fromId, (fromId) => set({ fromId }), form.toId)}
      {placeSelect("To", form.toId, (toId) => set({ toId }), form.fromId)}
      <label className={`flex items-center gap-2 ${skin === "phone" ? "min-h-12 text-base font-semibold" : "text-sm text-slate-200"}`}><input type="checkbox" checked={form.returnTrip} onChange={(e) => set({ returnTrip: e.target.checked })} /> There and back (a return trip)</label>
      <label className={s.label}>Miles, one way
        <input type="number" inputMode="decimal" min="0" step="0.1" className={s.field} value={form.miles} onChange={(e) => { setTyped(true); set({ miles: e.target.value }); }} />
      </label>
      {form.fromId && form.toId && <p className={`text-xs ${s.muted}`}>{known !== null ? (typed && Number(form.miles) !== known ? `The usual distance is ${known} miles.` : "The usual distance for this route.") : "This route isn't in the list yet: enter the miles. The Practice Manager can add it for next time."}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={s.label}>Vehicle<select className={s.field} value={form.vehicle} onChange={(e) => set({ vehicle: e.target.value })}>{VEHICLES.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}</select></label>
        <label className={s.label}>Reason<select className={s.field} value={form.purpose} onChange={(e) => set({ purpose: e.target.value })}><option value="">Choose a reason</option>{PURPOSES.map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
      </div>
      <label className={s.label}>Note (optional)<input className={s.field} value={form.note} maxLength={120} onChange={(e) => set({ note: e.target.value })} placeholder="e.g. went via the pharmacy" /></label>
      <p className={`text-xs ${s.muted}`}>Never put a patient's name or address here.</p>
      {Number(form.miles) > 0 && <p className={`text-sm ${s.note}`}>{total} miles in total{estimate ? `, about ${money(estimate)} at the current rate` : ""}.</p>}
      {error && <p className={`text-sm font-semibold ${s.error}`} role="alert">{error}</p>}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {problem && <span className={`mr-auto text-sm ${s.muted}`}>{problem}</span>}
        <button type="button" className={s.btn} onClick={onCancel}>Cancel</button>
        <button type="button" className={s.primary} disabled={busy || Boolean(problem)} onClick={save}>{busy ? "Saving…" : initial ? "Save changes" : "Send for approval"}</button>
      </div>
    </div>
  );
}
