import { useMemo, useState } from "react";
import { Download, Plus, Trash2 } from "lucide-react";
import { calculateEntitlement, compareWithBrightHr, employmentPeriod, groupOf, groupsFor, leaveCsv, ownDaysOf } from "@/modules/leave/leaveEntitlement";
import { saveLeaveYearSettings } from "@/modules/leave/leaveService";

// The screens for annual leave, used on the desktop (Annual leave page) and the phone (Me tab). `skin` picks the look.
//   LeaveSummary    one person's entitlement for the year, with how it was worked out
//   LeaveList       a table (desktop) or cards (phone) of several people, for a manager or the practice manager
//   (setting a person up, and "work out leave", are the step-by-step LeaveWizard)
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
export function Workings({ s, result }) {
  if (result.unit === "days") {
    return (
      <dl className={`mt-2 space-y-1 text-sm ${s.body}`}>
        <div className="flex justify-between gap-3"><dt>Leave for the year</dt><dd>{fix(result.fixedDays)} days</dd></div>
        {result.monthsOfService < 12 && <div className="flex justify-between gap-3"><dt>1/12th for each whole month of service ({result.monthsOfService} of 12)</dt><dd>{fix(result.annual)} days</dd></div>}
        {result.extraDays !== 0 && <div className="flex justify-between gap-3"><dt>{result.extraDays > 0 ? "Extra days" : "Fewer days"}{result.extraReason ? ` (${result.extraReason})` : ""}</dt><dd>{result.extraDays > 0 ? "+" : ""}{fix(result.extraDays)} days</dd></div>}
        <div className="flex justify-between gap-3"><dt>{fix(result.bankHolidaysCounted)} bank holidays, by sessions worked</dt><dd>{fix(result.bankHolidayDays)} days</dd></div>
      </dl>
    );
  }
  return (
    <div className={`mt-2 space-y-2 text-sm ${s.body}`}>
      {result.extraDays !== 0 && <p>{result.extraDays > 0 ? "Extra days" : "Fewer days"} for them this year{result.extraReason ? ` (${result.extraReason})` : ""}: <b>{result.extraDays > 0 ? "+" : ""}{fix(result.extraDays)} days</b>, shared out by their hours and the days they are here, and included below.</p>}
      {result.contractDays && <p>Days from their own contract: <b>{result.contractDays.map((d) => fix(d)).join(" / ")}</b> (basic, after 1, 5 and 10 years) instead of the group's.</p>}
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
      <p className={`text-sm ${s.muted}`}>{[groupOf(person.leaveGroup, settings)?.label, person.jobTitle].filter(Boolean).join(" · ")}</p>
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
    const blob = new Blob([`﻿${leaveCsv(shown, year, settings)}`], { type: "text/csv;charset=utf-8" });
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
            <p className={`text-sm ${s.muted}`}>{[groupOf(person.leaveGroup, settings)?.label, person.jobTitle].filter(Boolean).join(" · ")}</p>
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
                <td className="px-3 py-2 text-slate-200">{groupOf(person.leaveGroup, settings)?.label.split(" (")[0] || (ownDaysOf(person) ? "Own contract" : <span className="text-amber-200">Not set</span>)}{ownDaysOf(person) && groupOf(person.leaveGroup, settings) ? <span className="block text-xs text-slate-400">own days</span> : null}</td>
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

export function LeaveSettings({ year, settings, actor }) {
  const s = SKINS.desktop;
  const [form, setForm] = useState({
    practiceDays: settings.practiceDays, gpBankHolidays: settings.gpBankHolidays || "", gpMaxSessions: settings.gpMaxSessions || 8,
    groups: groupsFor(settings).filter((g) => g.key !== "doctor").map((g) => ({ key: g.key, label: g.label, days: g.days, custom: Boolean(g.custom) })),
  });
  const setGroup = (key, patch) => setForm((f) => ({ ...f, groups: f.groups.map((g) => (g.key === key ? { ...g, ...patch } : g)) }));
  const setGroupDays = (key, index, value) => setForm((f) => ({ ...f, groups: f.groups.map((g) => (g.key === key ? { ...g, days: g.days.map((d, i) => (i === index ? value : d)) } : g)) }));
  const addGroup = () => setForm((f) => {
    let n = f.groups.filter((g) => g.custom).length + 1;
    while (f.groups.some((g) => g.key === `custom-group-${n}`)) n += 1;
    return { ...f, groups: [...f.groups, { key: `custom-group-${n}`, label: "", days: [0, 0, 0, 0], custom: true }] };
  });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const setDay = (i, patch) => setForm((f) => ({ ...f, practiceDays: f.practiceDays.map((d, j) => (j === i ? { ...d, ...patch } : d)) }));
  async function save() {
    setBusy(true); setMessage("");
    try {
      if (form.groups.some((g) => g.custom && !String(g.label).trim())) throw new Error("Give each group you added a name.");
      await saveLeaveYearSettings(year.key, { ...form, groups: form.groups.map((g) => ({ key: g.key, label: g.label, days: g.days.map((d) => Number(d) || 0) })) }, actor);
      setMessage("Saved. Everyone's leave for this year is worked out from these days.");
    } catch (failure) { setMessage(failure?.message || "That didn't save."); } finally { setBusy(false); }
  }
  return (
    <div className={`${s.card} max-w-3xl space-y-4`}>
      <div>
        <p className="font-semibold text-slate-100">Leave groups and their days, {year.key}</p>
        <p className="text-sm text-slate-400">Days of annual leave a full-time person (37.5 hours a week) gets at each length of service, before bank holidays. Change a group's days, or add a group of your own (for example nursing staff, with their IPR days included). A person can also be given extra days of their own when you set them up.</p>
        <div className="mt-2 overflow-x-auto rounded-xl border border-white/10">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-900 text-left text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-3 py-2">Group</th><th className="px-3 py-2">Basic</th><th className="px-3 py-2">After 1 year</th><th className="px-3 py-2">After 5 years</th><th className="px-3 py-2">After 10 years</th><th className="px-3 py-2" /></tr></thead>
            <tbody>
              {form.groups.map((g) => (
                <tr key={g.key} className="border-t border-white/5">
                  <td className="px-3 py-1.5"><input className={`${s.field} !mt-0 !w-44`} value={g.label} onChange={(e) => setGroup(g.key, { label: e.target.value })} placeholder="Group name" aria-label="Group name" /></td>
                  {g.days.map((d, i) => <td key={i} className="px-3 py-1.5"><input type="number" min="0" max="100" step="0.5" className={`${s.field} !mt-0 !w-20`} value={d} onChange={(e) => setGroupDays(g.key, i, e.target.value)} aria-label={`${g.label || "Group"} days ${["basic", "after 1 year", "after 5 years", "after 10 years"][i]}`} /></td>)}
                  <td className="px-3 py-1.5 text-right">{g.custom && <button type="button" className={s.btn} onClick={() => setForm((f) => ({ ...f, groups: f.groups.filter((x) => x.key !== g.key) }))} aria-label={`Remove ${g.label || "this group"}`}><Trash2 className="h-4 w-4" /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" className={`${s.btn} mt-2`} onClick={addGroup} disabled={form.groups.length >= 11}><Plus className="h-4 w-4" /> Add a group</button>
        {settings.groupsFromLastYear && <p className="mt-1 text-xs text-amber-200">These are last year's groups, used until you press Save for {year.key}.</p>}
        <p className="mt-1 text-xs text-slate-500">GPs and doctors are not in this table: their days are typed in for each person.</p>
      </div>
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
