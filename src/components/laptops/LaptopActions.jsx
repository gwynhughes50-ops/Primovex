import { useEffect, useMemo, useState } from "react";
import { CONDITION, STATUS, WIN11, addDays, dayKey, holderText, isLive, isOnLoan, loanState, ukDay, updateState } from "@/modules/laptops/laptops";
import { assignLaptop, editLaptop, loanOutLaptop, markLaptopUpdated, returnLaptop, subscribeLaptopEvents } from "@/modules/laptops/laptopService";

// What the IT team can do with one laptop: lend it, take it back, record an update, say who has it, change its facts, and read its log. Used on the desktop and on the phone. The person who
// has it is always picked from the staff list, never typed. Every change is checked in laptops.js and says in words what is wrong.

const FIELD = "w-full rounded-lg border border-[var(--medtrak-border)] bg-transparent px-2 py-2 text-sm text-[var(--medtrak-text)] [&>option]:text-slate-900";
const BUTTON = "min-h-10 rounded-xl border border-[var(--medtrak-border)] px-3 text-sm font-semibold hover:bg-[var(--medtrak-bg)] disabled:opacity-40";
const PRIMARY = "min-h-10 rounded-xl bg-[var(--medtrak-accent)] px-4 text-sm font-bold text-white disabled:opacity-40";
const TONE = { overdue: "border-rose-400/50 bg-rose-500/10 text-rose-700", soon: "border-amber-400/50 bg-amber-500/10 text-amber-700", ok: "border-[var(--medtrak-border)] text-[var(--medtrak-muted)]", none: "border-[var(--medtrak-border)] text-[var(--medtrak-muted)]" };

export const dueWords = (what, { state, days }, dueOn) => {
  if (state === "none") return `${what}: not set`;
  if (days < 0) return `${what}: overdue by ${-days} day${days === -1 ? "" : "s"} (${ukDay(dueOn)})`;
  if (days === 0) return `${what}: due today`;
  return `${what}: ${ukDay(dueOn)}${state === "soon" ? ` (in ${days} day${days === 1 ? "" : "s"})` : ""}`;
};

export function Chips({ laptop, today = dayKey() }) {
  if (!laptop) return null;
  const update = updateState(laptop, today);
  const loan = loanState(laptop, today);
  return (
    <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
      <span className="rounded-full border border-[var(--medtrak-border)] px-2 py-0.5 font-semibold">{STATUS[laptop.status] || laptop.status}</span>
      {isLive(laptop) && <span className="rounded-full border border-[var(--medtrak-border)] px-2 py-0.5">{CONDITION[laptop.condition] || "Not recorded"}</span>}
      {isLive(laptop) && laptop.win11 !== "unknown" && <span className="rounded-full border border-[var(--medtrak-border)] px-2 py-0.5">{WIN11[laptop.win11]}</span>}
      {isLive(laptop) && <span className={`rounded-full border px-2 py-0.5 ${TONE[update.state]}`}>{dueWords("Update", update, laptop.nextUpdateDue)}</span>}
      {isOnLoan(laptop) && <span className={`rounded-full border px-2 py-0.5 ${TONE[loan.state]}`}>{dueWords("Back", loan, laptop.loan.dueBackOn)}</span>}
    </div>
  );
}

function PersonSelect({ staff, value, onChange, empty = "Choose from the staff list" }) {
  return (
    <select className={FIELD} value={value || ""} onChange={(e) => onChange(staff.find((s) => s.uid === e.target.value) || null)} aria-label="Person">
      <option value="">{empty}</option>
      {staff.map((s) => <option key={s.uid} value={s.uid}>{s.displayName}</option>)}
    </select>
  );
}

// only what is different from the record, so saving without a change says "Nothing was changed" instead of writing an empty line to the log
export function changedFacts(laptop, form) {
  const now = { condition: laptop.condition, win11: laptop.win11, office365: laptop.office365 === true, upgraded: laptop.upgraded === true, nextUpdateDue: laptop.nextUpdateDue || "", notes: laptop.notes || "", status: laptop.status };
  return Object.fromEntries(Object.entries(form).filter(([key, value]) => key in now && value !== now[key] && !(key === "status" && value === "")));
}

function Label({ text, children }) { return <label className="block text-xs font-bold">{text}<div className="mt-1 font-normal">{children}</div></label>; }

export default function LaptopActions({ laptop, staff = [], actor, canManage = false, onChanged = () => {} }) {
  const today = dayKey();
  const [mode, setMode] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [done, setDone] = useState("");
  const [events, setEvents] = useState([]);
  const [form, setForm] = useState({});
  const set = (patch) => { setForm((f) => ({ ...f, ...patch })); setProblem(""); };

  useEffect(() => (mode === "history" ? subscribeLaptopEvents(laptop.id, setEvents, () => setEvents([])) : undefined), [mode, laptop.id]);

  const open = (next, initial = {}) => { setMode(next); setForm(initial); setProblem(""); setDone(""); };
  const run = (task, message) => async () => {
    setBusy(true); setProblem("");
    try { await task(); setMode(""); setDone(message); onChanged(); } catch (error) { setProblem(error?.message || "That could not be saved. Try again."); } finally { setBusy(false); }
  };
  const live = isLive(laptop);
  const loaned = isOnLoan(laptop);
  const events24 = useMemo(() => events.slice(0, 25), [events]);

  return (
    <div className="mt-2 rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-3 text-[var(--medtrak-text)]">
      <p className="text-sm font-semibold">{holderText(laptop)}</p>
      {laptop.notes && <p className="mt-1 text-xs text-[var(--medtrak-muted)]">{laptop.notes}</p>}
      {done && <p className="mt-2 text-sm font-semibold text-emerald-600" role="status">{done}</p>}

      {canManage && live && !mode && (
        <div className="mt-3 flex flex-wrap gap-2">
          {loaned
            ? <button type="button" className={PRIMARY} onClick={() => open("return", { condition: "" })}>Return</button>
            : <button type="button" className={PRIMARY} onClick={() => open("loan", { borrower: null, dueBackOn: addDays(today, 7) })}>Loan out</button>}
          <button type="button" className={BUTTON} onClick={() => open("updated", { updatedOn: today, nextDueOn: addDays(today, 180) })}>Mark updated</button>
          {!loaned && <button type="button" className={BUTTON} onClick={() => open("assign", { holder: laptop.currentUserUid ? staff.find((s) => s.uid === laptop.currentUserUid) || null : null })}>Who has it</button>}
          <button type="button" className={BUTTON} onClick={() => open("edit", { condition: laptop.condition, win11: laptop.win11, office365: laptop.office365 === true, upgraded: laptop.upgraded === true, nextUpdateDue: laptop.nextUpdateDue || "", notes: laptop.notes || "", status: laptop.status === "on_loan" ? "" : laptop.status })}>Edit</button>
        </div>
      )}
      {!mode && <button type="button" className="mt-2 text-xs font-semibold text-[var(--medtrak-accent)] underline" onClick={() => open("history")}>History</button>}

      {mode === "loan" && (
        <div className="mt-3 space-y-2">
          <Label text="Who is borrowing it"><PersonSelect staff={staff} value={form.borrower?.uid} onChange={(p) => set({ borrower: p && { uid: p.uid, name: p.displayName } })} /></Label>
          <Label text="Due back"><input type="date" className={FIELD} value={form.dueBackOn || ""} min={today} onChange={(e) => set({ dueBackOn: e.target.value })} /></Label>
          <Label text="Its condition going out"><select className={FIELD} value={form.conditionOut || laptop.condition} onChange={(e) => set({ conditionOut: e.target.value })}>{Object.entries(CONDITION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Label>
          <Footer busy={busy} problem={problem} onCancel={() => setMode("")} onSave={run(() => loanOutLaptop({ laptop, borrower: form.borrower, dueBackOn: form.dueBackOn, conditionOut: form.conditionOut, actor }), `${laptop.assetCode} loaned out.`)} label="Loan it out" />
        </div>
      )}
      {mode === "return" && (
        <div className="mt-3 space-y-2">
          <Label text="Its condition coming back"><select className={FIELD} value={form.condition || ""} onChange={(e) => set({ condition: e.target.value })}><option value="">Choose</option>{Object.entries(CONDITION).filter(([k]) => k !== "unknown").map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Label>
          <Footer busy={busy} problem={problem} onCancel={() => setMode("")} onSave={run(() => returnLaptop({ laptop, condition: form.condition, actor }), `${laptop.assetCode} returned.`)} label="Record the return" />
        </div>
      )}
      {mode === "updated" && (
        <div className="mt-3 space-y-2">
          <Label text="Updated on"><input type="date" className={FIELD} value={form.updatedOn || ""} max={today} onChange={(e) => set({ updatedOn: e.target.value })} /></Label>
          <Label text="Next update due"><input type="date" className={FIELD} value={form.nextDueOn || ""} onChange={(e) => set({ nextDueOn: e.target.value })} /></Label>
          <Footer busy={busy} problem={problem} onCancel={() => setMode("")} onSave={run(() => markLaptopUpdated({ laptop, updatedOn: form.updatedOn, nextDueOn: form.nextDueOn, actor }), "Update recorded.")} label="Save" />
        </div>
      )}
      {mode === "assign" && (
        <div className="mt-3 space-y-2">
          <Label text="Who has it day to day"><PersonSelect staff={staff} value={form.holder?.uid} onChange={(p) => set({ holder: p && { uid: p.uid, name: p.displayName } })} empty="Nobody: a spare" /></Label>
          <Footer busy={busy} problem={problem} onCancel={() => setMode("")} onSave={run(() => assignLaptop({ laptop, holder: form.holder, actor }), "Saved.")} label="Save" />
        </div>
      )}
      {mode === "edit" && (
        <div className="mt-3 space-y-2">
          <Label text="Condition"><select className={FIELD} value={form.condition} onChange={(e) => set({ condition: e.target.value })}>{Object.entries(CONDITION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Label>
          <Label text="Windows 11"><select className={FIELD} value={form.win11} onChange={(e) => set({ win11: e.target.value })}>{Object.entries(WIN11).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.office365 === true} onChange={(e) => set({ office365: e.target.checked })} /> Office 365</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.upgraded === true} onChange={(e) => set({ upgraded: e.target.checked })} /> Upgraded</label>
          <Label text="Next update due"><input type="date" className={FIELD} value={form.nextUpdateDue || ""} onChange={(e) => set({ nextUpdateDue: e.target.value })} /></Label>
          {!loaned && <Label text="Status"><select className={FIELD} value={form.status} onChange={(e) => set({ status: e.target.value })}>{Object.entries(STATUS).filter(([k]) => k !== "on_loan").map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Label>}
          <Label text="A short note (what is wrong with it, for example)"><input className={FIELD} maxLength={200} value={form.notes || ""} onChange={(e) => set({ notes: e.target.value })} /></Label>
          <Footer busy={busy} problem={problem} onCancel={() => setMode("")} onSave={run(() => editLaptop({ laptop, changes: changedFacts(laptop, form), actor }), "Saved.")} label="Save" />
        </div>
      )}
      {mode === "history" && (
        <div className="mt-3">
          {events24.length === 0 ? <p className="text-xs text-[var(--medtrak-muted)]">Nothing recorded yet.</p> : (
            <ul className="divide-y divide-[var(--medtrak-border)] rounded-lg border border-[var(--medtrak-border)] text-xs">
              {events24.map((e) => <li key={e.id} className="px-2 py-1.5"><span className="font-semibold">{e.text}</span><span className="block text-[var(--medtrak-muted)]">{ukDay(e.onDay)} · {e.byName || "Not recorded"}</span></li>)}
            </ul>
          )}
          <button type="button" className="mt-2 text-xs font-semibold text-[var(--medtrak-accent)] underline" onClick={() => setMode("")}>Close the history</button>
        </div>
      )}
    </div>
  );
}

function Footer({ busy, problem, onCancel, onSave, label }) {
  return (
    <>
      {problem && <p className="text-sm font-semibold text-rose-600" role="alert">{problem}</p>}
      <div className="flex gap-2"><button type="button" className={PRIMARY} disabled={busy} onClick={onSave}>{busy ? "Saving…" : label}</button><button type="button" className={BUTTON} disabled={busy} onClick={onCancel}>Cancel</button></div>
    </>
  );
}
