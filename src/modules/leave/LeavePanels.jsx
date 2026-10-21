import { useMemo, useState } from "react";
import { Download, Plus, Trash2, X } from "lucide-react";
import { LEAVE_GROUPS, calculateEntitlement, compareWithBrightHr, employmentPeriod, groupOf, leaveCsv } from "@/modules/leave/leaveEntitlement";
import { saveLeaveYearSettings } from "@/modules/leave/leaveService";
import { saveStaff } from "@/modules/timesheets/timesheetService";

// The screens for annual leave, used on the desktop (Annual leave page) and the phone (Me tab). `skin` picks the look.
//   LeaveSummary    one person's entitlement for the year, with how it was worked out
//   LeaveList       a table (desktop) or cards (phone) of several people, for a manager or the practice manager
//   LeaveEditDialog whoever manages timesheets sets a person's group, service date, carry-over (desktop)
//   LeaveSettings   the practice's choices for the year: closure days and the doctors' bank holidays (desktop)

const SKINS = {
  desktop: {
    field: "mt-1 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-300/60",
    label: "block text-xs font-semibold uppercase tracking-wide text-slate-400",
    card: "rounded-2xl border border-white/10 bg-slate-900/70 p-4", muted: "text-slate-400", strong: "text-slate-100", body: "text-slate-200",
    btn: "inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm font-semibold text-slate-100 hover:bg-white/5 disabled:opacity-40",
    primary: "inline-flex items-center justify-center gap-1.5 rounded-lg bg-teal-500/90 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40",
    warn: "rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100", ok: "text-emerald-300", bad: "text-rose-300", line: "border-t border-white/5",
  },
  phone: {
    field: "mt-1 min-h-12 w-full rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 text-base",
    label: "block text-sm font-bold", card: "rounded-2xl border border-[var(--medtrak-border)] p-3", muted: "text-[var(--medtrak-muted)]", strong: "", body: "",
    btn: "min-h-12 rounded-2xl border border-[var(--medtrak-border)] px-4 font-bold disabled:opacity-40", primary: "min-h-12 rounded-2xl bg-[var(--medtrak-accent)] px-4 font-bold text-white disabled:opacity-40",
    warn: "rounded-2xl bg-amber-400/20 p-3 text-sm font-semibold text-amber-900", ok: "text-emerald-700", bad: "text-rose-700", line: "border-t border-[var(--medtrak-border)]",
  },
};

const uk = (key) => (key ? key.split("-").reverse().join("/") : "");
const fix = (value) => (Math.round(Number(value) * 100) / 100).toString();
const amount = (value, unit) => `${fix(value)} ${unit === "days" ? "days" : "hours"}`;
// 367.5 hours is 49 days of 7.5 hours
const daysOf = (hours) => fix(hours / 7.5);

export function useLeaveResults(people, year, settings) {
  return useMemo(() => (people || []).map((person) => {
    const result = calculateEntitlement(person, year, settings);
    return { person, result, check: compareWithBrightHr(person, year, result) };
  }), [people, year, settings]);
}

function Figure({ s, result }) {
  if (!result.ready) {
    return <ul className={`list-disc space-y-0.5 pl-5 ${s.muted}`}>{result.warnings.map((w) => <li key={w}>{w}</li>)}</ul>;
  }
  return (
    <>
      <p className={`text-3xl font-black ${s.strong}`}>{fix(result.total)} <span className="text-base font-semibold">{result.unit === "days" ? "days" : "hours"}</span></p>
      {result.unit === "hours" && <p className={s.muted}>{daysOf(result.total)} days of 7.5 hours</p>}
      {result.carryOver > 0 && <p className={s.muted}>{amount(result.rounded, result.unit)} for the year plus {amount(result.carryOver, result.unit)} carried over</p>}
      {result.warnings.length > 0 && <ul className={`mt-1 list-disc pl-5 ${s.muted}`}>{result.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
    </>
  );
}

// how it was worked out
function Workings({ s, result }) {
  if (result.unit === "days") {
    return (
      <dl className={`mt-2 space-y-1 text-sm ${s.body}`}>
        <div className="flex justify-between gap-3"><dt>Leave for the year</dt><dd>{fix(result.fixedDays)} days</dd></div>
        <div className="flex justify-between gap-3"><dt>{fix(result.bankHolidaysCounted)} bank holidays, by sessions worked</dt><dd>{fix(result.bankHolidayDays)} days</dd></div>
      </dl>
    );
  }
  return (
    <div className={`mt-2 space-y-2 text-sm ${s.body}`}>
      {result.segments.map((seg) => (
        <div key={seg.from} className={`${s.line} pt-2`}>
          <p className={`font-semibold ${s.strong}`}>{uk(seg.from)} to {uk(seg.to)} <span className={`font-normal ${s.muted}`}>({seg.days} days)</span></p>
          <p>{seg.weeklyHours} hours a week · {seg.tierLabel.toLowerCase()} ({fix(seg.fullTimeHours)} hours full-time)</p>
          <p>Annual leave <b>{fix(seg.annualHours)}</b> · {seg.holidays.length} bank holiday{seg.holidays.length === 1 ? "" : "s"} at {fix(seg.hoursPerHoliday)} hours = <b>{fix(seg.bankHolidayHours)}</b></p>
          {seg.holidays.length > 0 && <p className={s.muted}>{seg.holidays.map((h) => `${uk(h.date).slice(0, 5)} ${h.name}`).join(", ")}</p>}
        </div>
      ))}
      <p className={`${s.line} pt-2`}>Total {fix(result.exact)}, rounded up to the half hour: <b>{fix(result.rounded)}</b></p>
    </div>
  );
}

export function LeaveSummary({ person, year, settings, skin = "desktop" }) {
  const s = SKINS[skin];
  const [open, setOpen] = useState(false);
  const [{ result, check }] = useLeaveResults([person], year, settings);
  return (
    <div className={s.card}>
      <p className={`text-xs font-semibold uppercase tracking-wide ${s.muted}`}>Annual leave {year.key}</p>
      <p className={`text-sm ${s.muted}`}>{[groupOf(person.leaveGroup)?.label, person.jobTitle].filter(Boolean).join(" · ")}</p>
      {!employmentPeriod(person, year).full && <p className={`text-sm ${s.muted}`}>Part of the year: {employmentPeriod(person, year).label.toLowerCase()} ({employmentPeriod(person, year).days} days)</p>}
      <div className="mt-1"><Figure s={s} result={result} /></div>
      {result.ready && (
        <>
          <button type="button" className={`mt-2 text-sm font-semibold underline ${s.muted}`} onClick={() => setOpen(!open)}>{open ? "Hide how it was worked out" : "Show how it was worked out"}</button>
          {open && <Workings s={s} result={result} />}
          <p className={`mt-2 text-xs ${s.muted}`}>Your manager checks this against the Annual Leave Policy. Leave you have taken and what is left is in BrightHR.{check.known && check.same === false ? " BrightHR currently shows a different figure; your practice manager will look at it." : ""}</p>
        </>
      )}
    </div>
  );
}

export function LeaveList({ people, year, settings, skin = "desktop", onEdit, showCheck = false, title }) {
  const s = SKINS[skin];
  const rows = useLeaveResults(people, year, settings);
  const [search, setSearch] = useState("");
  const shown = rows.filter(({ person }) => person.active !== false && (!search.trim() || `${person.name} ${person.jobTitle || ""}`.toLowerCase().includes(search.trim().toLowerCase())));
  const missing = rows.filter(({ person, result }) => person.active !== false && !result.ready).length;

  function download() {
    const blob = new Blob([`﻿${leaveCsv(shown, year)}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `annual-leave-${year.key}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (!people.length) return <p className={`${s.card} text-sm ${s.muted}`}>Nobody is set up here yet.</p>;
  if (skin === "phone") {
    return (
      <div className="space-y-2">
        {shown.map(({ person, result }) => (
          <div key={person.id} className={s.card}>
            <p className="font-bold">{person.name}</p>
            <p className={`text-sm ${s.muted}`}>{[groupOf(person.leaveGroup)?.label, person.jobTitle].filter(Boolean).join(" · ")}</p>
            {!employmentPeriod(person, year).full && <p className={`text-sm ${s.muted}`}>{employmentPeriod(person, year).label}</p>}
            <p className="mt-1">{result.ready ? <b>{amount(result.total, result.unit)}</b> : <span className={s.muted}>{result.warnings[0]}</span>}</p>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        {title && <p className={`text-sm ${s.muted}`}>{title}</p>}
        <label className={s.label}>Find a person<input className={s.field} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or job" /></label>
        <button type="button" className={s.btn} onClick={download}><Download className="h-4 w-4" aria-hidden="true" /> Download for payroll (CSV)</button>
        {missing > 0 && <span className="text-sm text-amber-200">{missing} {missing === 1 ? "person needs" : "people need"} something filling in</span>}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr><th className="px-3 py-2">Person</th><th className="px-3 py-2">Group</th><th className="px-3 py-2">Period</th><th className="px-3 py-2">Leave</th><th className="px-3 py-2">Bank holidays</th><th className="px-3 py-2">Carried over</th><th className="px-3 py-2">Total</th>{showCheck && <th className="px-3 py-2">BrightHR</th>}{onEdit && <th className="px-3 py-2" />}</tr>
          </thead>
          <tbody>
            {shown.map(({ person, result, check }) => (
              <tr key={person.id} className="border-t border-white/5 align-top">
                <td className="px-3 py-2"><span className="font-semibold text-slate-100">{person.name}</span><span className="block text-xs text-slate-400">{person.jobTitle || ""}</span></td>
                <td className="px-3 py-2 text-slate-200">{groupOf(person.leaveGroup)?.label.split(" (")[0] || <span className="text-amber-200">Not set</span>}</td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-300">{employmentPeriod(person, year).label}</td>
                {result.ready ? (
                  <>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-200">{fix(result.annual)}{result.unit === "days" ? " days" : ""}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-200">{fix(result.bankHolidayAmount)}{result.unit === "days" ? " days" : ""}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-200">{result.carryOver ? fix(result.carryOver) : ""}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-50">{fix(result.total)}{result.unit === "days" ? " days" : ""}{result.unit === "hours" && <span className="block text-xs font-normal text-slate-400">{daysOf(result.total)} days</span>}</td>
                  </>
                ) : <td colSpan={4} className="px-3 py-2 text-amber-200">{result.warnings[0]}</td>}
                {showCheck && <td className="whitespace-nowrap px-3 py-2">{!check.known ? <span className="text-slate-500">Not imported</span> : check.same === null ? <span className="text-slate-400">{fix(check.figure)} {check.unit}</span> : check.same ? <span className="text-emerald-300">{fix(check.figure)} agrees</span> : <span className="text-rose-300">{fix(check.figure)} ({check.difference > 0 ? "+" : ""}{fix(check.difference)} here)</span>}</td>}
                {onEdit && <td className="px-3 py-2 text-right"><button type="button" className={s.btn} onClick={() => onEdit(person)}>Set up</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && <p className="p-4 text-sm text-slate-400">Nobody matches that.</p>}
      </div>
    </div>
  );
}

export function LeaveEditDialog({ person, year, actor, onClose }) {
  const s = SKINS.desktop;
  const adjust = person.leaveAdjust?.[year.key] || {};
  const [form, setForm] = useState({ leaveGroup: person.leaveGroup || "", serviceFrom: person.serviceFrom || "", startedOn: person.startedOn || "", leftOn: person.leftOn || "", leaveSessions: person.leaveSessions || "", carryOver: adjust.carryOver || "", fixedDays: adjust.fixedDays || "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const doctor = form.leaveGroup === "doctor";
  async function save() {
    setBusy(true); setError("");
    try {
      await saveStaff(person, {
        leaveGroup: form.leaveGroup, serviceFrom: form.serviceFrom, startedOn: form.startedOn, leftOn: form.leftOn, leaveSessions: form.leaveSessions,
        leaveAdjust: { ...(person.leaveAdjust || {}), [year.key]: { carryOver: form.carryOver, fixedDays: form.fixedDays } },
      }, actor);
      onClose();
    } catch (failure) { setError(failure?.message || "That didn't save. Check you have permission."); setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-4" role="presentation">
      <div role="dialog" aria-modal="true" aria-label="Annual leave set-up" className="max-h-[94vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div><h2 className="text-lg font-semibold text-slate-50">Annual leave set-up</h2><p className="text-sm text-slate-400">{person.name}{person.jobTitle ? ` · ${person.jobTitle}` : ""}</p></div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-white/10" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <label className={`${s.label} mt-4`}>Leave group
          <select className={s.field} value={form.leaveGroup} onChange={(e) => set({ leaveGroup: e.target.value })}><option value="">Choose…</option>{LEAVE_GROUPS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}</select>
        </label>
        {!doctor && (
          <label className={`${s.label} mt-3`}>Counting length of service from
            <input type="date" className={s.field} value={form.serviceFrom} onChange={(e) => set({ serviceFrom: e.target.value })} />
            <span className="mt-1 block text-xs font-normal normal-case text-slate-500">Leave blank to use their start date from BrightHR{person.startDate ? ` (${uk(person.startDate)})` : ""}. Use an earlier date if previous NHS service counts.</span>
          </label>
        )}
        <label className={`${s.label} mt-3`}>Started on, if part-way through the leave year
          <input type="date" className={s.field} value={form.startedOn} onChange={(e) => set({ startedOn: e.target.value })} />
          <span className="mt-1 block text-xs font-normal normal-case text-slate-500">Leave blank to use the start date from BrightHR{person.startDate ? ` (${uk(person.startDate)})` : ""}. Anyone who started before {uk(year.from)} gets the full year.</span>
        </label>
        <label className={`${s.label} mt-3`}>Last day of employment, if they are leaving
          <input type="date" className={s.field} value={form.leftOn} onChange={(e) => set({ leftOn: e.target.value })} />
        </label>
        {doctor ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className={s.label}>Their leave for {year.key}, in days<input type="number" min="0" step="0.5" className={s.field} value={form.fixedDays} onChange={(e) => set({ fixedDays: e.target.value })} /></label>
            <label className={s.label}>Sessions a week they work<input type="number" min="0" step="1" className={s.field} value={form.leaveSessions} onChange={(e) => set({ leaveSessions: e.target.value })} /></label>
          </div>
        ) : null}
        <label className={`${s.label} mt-3`}>Carried over into {year.key}, in {doctor ? "days" : "hours"}
          <input type="number" min="0" step="0.5" className={s.field} value={form.carryOver} onChange={(e) => set({ carryOver: e.target.value })} />
        </label>
        {error && <p className="mt-3 text-sm text-rose-300" role="alert">{error}</p>}
        <div className="mt-4 flex justify-end gap-2"><button type="button" className={s.btn} onClick={onClose}>Cancel</button><button type="button" className={s.primary} disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button></div>
      </div>
    </div>
  );
}

export function LeaveSettings({ year, settings, actor }) {
  const s = SKINS.desktop;
  const [form, setForm] = useState({ practiceDays: settings.practiceDays, gpBankHolidays: settings.gpBankHolidays || "", gpMaxSessions: settings.gpMaxSessions || 8 });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const setDay = (i, patch) => setForm((f) => ({ ...f, practiceDays: f.practiceDays.map((d, j) => (j === i ? { ...d, ...patch } : d)) }));
  async function save() {
    setBusy(true); setMessage("");
    try { await saveLeaveYearSettings(year.key, form, actor); setMessage("Saved."); } catch (failure) { setMessage(failure?.message || "That didn't save."); } finally { setBusy(false); }
  }
  return (
    <div className={`${s.card} max-w-2xl space-y-4`}>
      <div>
        <p className="font-semibold text-slate-100">Days the practice closes, {year.key}</p>
        <p className="text-sm text-slate-400">Counted like a bank holiday in everyone's entitlement. Bank holidays themselves are worked out from the calendar.</p>
        {form.practiceDays.map((d, i) => (
          <div key={i} className="mt-2 flex flex-wrap items-center gap-2">
            <input type="date" className={`${s.field} !mt-0 !w-auto`} value={d.date} onChange={(e) => setDay(i, { date: e.target.value })} aria-label="Date" />
            <input className={`${s.field} !mt-0 !w-56`} value={d.name} onChange={(e) => setDay(i, { name: e.target.value })} placeholder="Name, e.g. Christmas Eve" aria-label="Name" />
            <button type="button" className={s.btn} onClick={() => setForm((f) => ({ ...f, practiceDays: f.practiceDays.filter((_, j) => j !== i) }))} aria-label="Remove this day"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        <button type="button" className={`${s.btn} mt-2`} onClick={() => setForm((f) => ({ ...f, practiceDays: [...f.practiceDays, { date: "", name: "" }] }))}><Plus className="h-4 w-4" /> Add a day</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={s.label}>Bank holidays for GPs: leave blank to count them from the calendar<input type="number" min="0" step="1" className={s.field} value={form.gpBankHolidays} onChange={(e) => setForm({ ...form, gpBankHolidays: e.target.value })} /></label>
        <label className={s.label}>Most sessions in a working week<input type="number" min="1" step="1" className={s.field} value={form.gpMaxSessions} onChange={(e) => setForm({ ...form, gpMaxSessions: e.target.value })} /></label>
      </div>
      <p className="text-xs text-slate-500">GPs do not work bank holidays either, so all of them count. A GP's share is the number of bank holidays in the part of the year they are employed × their sessions ÷ the most sessions in a week, rounded up to the half day (10 × 7 ÷ 8 = 8.75, so 9 days).</p>
      <div className="flex items-center gap-3"><button type="button" className={s.primary} disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>{message && <span className="text-sm text-slate-300" role="status">{message}</span>}</div>
    </div>
  );
}
