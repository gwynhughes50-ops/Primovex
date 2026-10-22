// Annual leave entitlement, worked out the way the practice's spreadsheets did it (Clinical / Admin / Management calculators),
// but split automatically wherever something changes in the year. Pure (no Firestore, no screens) so it can be tested with
// made-up people and shared by the desktop and the phone.
//
//   Annual leave   = full-time hours for the person's group and length of service  x  (contracted hours / 37.5)  x  (days / days in the leave year)
//   Bank holidays  = (contracted hours / 5)  x  the bank holidays that fall inside the period
//   The year runs 1 April to 31 March. The total is rounded UP to the half hour. Carry-over is added after rounding.
//   A change of hours (a new working pattern) or reaching 1, 5 or 10 years' service starts a new period inside the year.
//
// Doctors are counted in days, not hours: their leave in days is typed in, and the bank holidays they do not work come from
// the session method (see gpBankHolidayDays).

import { averageWeekHours, bankHolidays, dateKey, parseKey, patternOn } from "@/modules/timesheets/workPattern";

export const FULL_TIME_HOURS = 37.5;
export const SERVICE_TIERS = [{ years: 0, label: "Basic" }, { years: 1, label: "After 1 year" }, { years: 5, label: "After 5 years" }, { years: 10, label: "After 10 years" }];

// full-time (37.5 hours a week) annual leave in hours for each length of service: basic, 1 year, 5 years, 10 years
export const LEAVE_GROUPS = [
  { key: "clinical", label: "Clinical", hours: [232.5, 255, 262.5, 292.5] },
  { key: "admin", label: "Admin", hours: [157.5, 180, 225, 255] },
  { key: "management", label: "Management", hours: [187.5, 210, 255, 285] },
  { key: "doctor", label: "GP or doctor (sessions, counted in days)", hours: null },
];
export const DAY_HOURS = 7.5;
const BUILT_IN = new Set(LEAVE_GROUPS.map((g) => g.key));

// The groups the practice uses for a year: the standard ones (their days can be changed in the year's settings) plus any it has
// added. Each has the days a full-timer gets at each length of service (basic, 1, 5, 10 years), as `hours` (days x 7.5) and `days`.
//   settings.groups: [{ key, label, days: [basic, 1 year, 5 years, 10 years] }]
export function groupsFor(settings = {}) {
  const saved = Array.isArray(settings?.groups) ? settings.groups : [];
  const byKey = new Map(saved.map((g) => [g.key, g]));
  const withDays = (g) => (g.hours ? { ...g, days: g.hours.map((h) => h / DAY_HOURS) } : g);
  const standard = LEAVE_GROUPS.map((g) => {
    const mine = byKey.get(g.key);
    return withDays(mine && g.hours ? { ...g, label: mine.label || g.label, hours: mine.days.map((d) => d * DAY_HOURS), changed: true } : g);
  });
  const added = saved.filter((g) => !BUILT_IN.has(g.key)).map((g) => withDays({ key: g.key, label: g.label, hours: g.days.map((d) => d * DAY_HOURS), custom: true }));
  return [...standard, ...added];
}
export const groupOf = (key, settings) => groupsFor(settings).find((g) => g.key === key) || null;

const DAY_MS = 86400000;
const keyDays = (key) => Math.round(Date.UTC(...ymd(key)) / DAY_MS);
function ymd(key) { const [y, m, d] = String(key).split("-").map(Number); return [y, m - 1, d]; }
const addDays = (key, n) => { const d = parseKey(key); d.setDate(d.getDate() + n); return dateKey(d); };
const addYears = (key, n) => { const [y, m, d] = ymd(key); return dateKey(new Date(y + n, m, d)); };
const daysIn = (from, to) => keyDays(to) - keyDays(from) + 1;
const roundUpHalf = (value) => Math.ceil(Math.round(value * 2 * 1e6) / 1e6) / 2;
const two = (value) => Math.round(value * 100) / 100;

// "2026-27" for the leave year that starts on 1 April 2026
export function leaveYear(startYear) {
  const from = `${startYear}-04-01`;
  const to = `${startYear + 1}-03-31`;
  return { key: `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`, startYear, from, to, days: daysIn(from, to) };
}
// the leave year a date falls in (April starts the year)
export function leaveYearFor(key) { const [y, m] = ymd(key); return leaveYear(m >= 3 ? y : y - 1); }
export const parseLeaveYearKey = (key) => { const m = /^(\d{4})-(\d{2})$/.exec(String(key || "")); return m ? leaveYear(Number(m[1])) : null; };

// the bank holidays (England and Wales) from one date to another, plus any days the practice itself closes
export function bankHolidaysBetween(from, to, practiceDays = []) {
  const years = [];
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y += 1) years.push(y);
  const list = years.flatMap((y) => bankHolidays(y)).filter((h) => h.date >= from && h.date <= to);
  const extra = (practiceDays || []).filter((d) => d?.date >= from && d?.date <= to && !list.some((h) => h.date === d.date)).map((d) => ({ name: d.name || "Practice closure", date: d.date, practice: true }));
  return [...list, ...extra].sort((a, b) => a.date.localeCompare(b.date));
}

// 0 basic, 1 after a year, 2 after five, 3 after ten, on a given date
export function serviceTier(serviceFrom, onDate) {
  if (!serviceFrom) return 0;
  let tier = 0;
  SERVICE_TIERS.forEach((t, i) => { if (t.years && onDate >= addYears(serviceFrom, t.years)) tier = i; });
  return tier;
}

// A doctor's share of the bank holidays, by sessions: holidays x sessions worked / the most sessions in a week, up to the half day.
// e.g. 10 holidays x 7 of 8 sessions = 8.75, so 9 days (the practice's own example used 6 holidays: 5.25, so 5.5 days).
export function gpBankHolidayDays({ bankHolidays: holidays, sessions, maxSessions }) {
  const h = Number(holidays);
  const s = Number(sessions);
  const m = Number(maxSessions);
  if (!(h > 0) || !(s > 0) || !(m > 0)) return 0;
  return roundUpHalf((h * s) / m);
}

// The part of a leave year someone was employed: the whole year for most, from the day they started if that was part-way through,
// to their last day if they left before the end. `startedOn` (typed in) wins over the start date BrightHR holds.
export function employmentPeriod(person, year) {
  const started = person?.startedOn || person?.startDate || "";
  const from = started && started > year.from ? started : year.from;
  const to = person?.leftOn && person.leftOn < year.to ? person.leftOn : year.to;
  if (from > to) return { from, to, days: 0, full: false, none: true, label: from > year.to ? "Starts after this leave year" : "Left before this leave year" };
  const days = daysIn(from, to);
  const startsLate = from !== year.from;
  const endsEarly = to !== year.to;
  const uk = (k) => k.split("-").reverse().join("/");
  const label = !startsLate && !endsEarly ? "Full year" : startsLate && endsEarly ? `${uk(from)} to ${uk(to)}` : startsLate ? `From ${uk(from)}` : `To ${uk(to)}`;
  return { from, to, days, full: !startsLate && !endsEarly, none: false, label };
}

// What a person is entitled to in a leave year.
//   person:   { name, leaveGroup, serviceFrom, startedOn, startDate, leftOn, patterns, leaveSessions, leaveAdjust: { "2026-27": { carryOver, fixedDays } } }
//   year:     leaveYear(...)
//   settings: { practiceDays: [{ date, name }], gpBankHolidays, gpMaxSessions }   (the practice's choices for that year)
export function calculateEntitlement(person, year, settings = {}) {
  const group = groupOf(person?.leaveGroup, settings);
  const adjust = person?.leaveAdjust?.[year.key] || {};
  // extra (or fewer) days just for this person this year, e.g. IPR days: shared out by hours and days worked like the rest of the leave
  const extraDays = Math.max(-60, Math.min(60, Number(adjust.extraDays) || 0));
  const extraReason = String(adjust.extraReason || "").trim().slice(0, 60);
  const carryOver = Math.max(0, Number(adjust.carryOver) || 0);
  const warnings = [];
  const base = { year, group: group?.key || "", groupLabel: group?.label || "", unit: group?.key === "doctor" ? "days" : "hours", segments: [], carryOver, warnings, extraDays, extraReason };

  if (!group) return { ...base, ready: false, warnings: ["Choose which leave group they are in (Clinical, Admin, Management or Doctor)."] };

  if (group.key === "doctor") {
    const fixed = Math.max(0, Number(adjust.fixedDays) || 0);
    // Doctors do not work bank holidays either, so every one in the part of the year they are employed counts (from the calendar, as for
    // everyone else), shared by sessions: a day off that lands on a bank holiday is not lost. A number typed into the year's settings
    // overrides the calendar count.
    const period = employmentPeriod(person, year);
    const holidays = period.none ? [] : bankHolidaysBetween(period.from, period.to, settings.practiceDays);
    const counted = Number(settings.gpBankHolidays) > 0 ? Number(settings.gpBankHolidays) : holidays.length;
    const bhDays = gpBankHolidayDays({ bankHolidays: counted, sessions: person.leaveSessions, maxSessions: settings.gpMaxSessions || 8 });
    if (!fixed) warnings.push("Type in their leave in days for this year.");
    if (!(Number(person.leaveSessions) > 0)) warnings.push("Set how many sessions a week they work.");
    const total = Math.max(0, fixed + extraDays) + bhDays;
    return { ...base, ready: warnings.length === 0, fixedDays: fixed, bankHolidayDays: bhDays, bankHolidaysCounted: counted, holidays, annual: fixed, bankHolidayAmount: bhDays, exact: total, rounded: total, total: total + carryOver };
  }

  // the part of the year they were employed
  const { from: employedFrom, to: employedTo } = employmentPeriod(person, year);
  if (employedFrom > employedTo) return { ...base, ready: true, annual: 0, bankHolidayAmount: 0, exact: 0, rounded: 0, total: carryOver, warnings: ["Not employed during this leave year."] };

  const serviceFrom = person.serviceFrom || person.startedOn || person.startDate || "";
  if (!serviceFrom) warnings.push("No start date, so they are counted as new (the basic leave).");
  // hours typed in (the wizard's "what would it be" for someone without a pattern) are used instead of the working pattern
  const typedHours = Number(person.weeklyHours) > 0 ? Number(person.weeklyHours) : 0;
  if (!typedHours && !(person.patterns || []).length) warnings.push("No working pattern is set, so their hours are unknown.");

  // where the year splits: a new working pattern, or an anniversary that moves them up a level
  const cuts = new Set();
  if (!typedHours) for (const p of person.patterns || []) if (p.from > employedFrom && p.from <= employedTo) cuts.add(p.from);
  if (serviceFrom) for (const t of SERVICE_TIERS) if (t.years) { const d = addYears(serviceFrom, t.years); if (d > employedFrom && d <= employedTo) cuts.add(d); }
  const starts = [employedFrom, ...[...cuts].sort()];

  let annual = 0;
  let bankHolidayAmount = 0;
  const segments = starts.map((from, i) => {
    const to = i + 1 < starts.length ? addDays(starts[i + 1], -1) : employedTo;
    const pattern = typedHours ? null : patternOn(person.patterns, from);
    const weeklyHours = typedHours || (pattern ? averageWeekHours(pattern) : 0);
    if (pattern?.mode === "zero-hours" && !warnings.some((w) => /zero hours/i.test(w))) warnings.push("Zero hours: their leave builds up with the hours they work, so it is not worked out here.");
    const tier = serviceTier(serviceFrom, from);
    const days = daysIn(from, to);
    const fullTimeHours = Math.max(0, group.hours[tier] + extraDays * DAY_HOURS);
    const annualHours = (fullTimeHours * weeklyHours / FULL_TIME_HOURS) * (days / year.days);
    const holidays = bankHolidaysBetween(from, to, settings.practiceDays);
    const hoursPerHoliday = weeklyHours / 5;
    annual += annualHours;
    bankHolidayAmount += holidays.length * hoursPerHoliday;
    return { from, to, days, weeklyHours: two(weeklyHours), tier, tierLabel: SERVICE_TIERS[tier].label, fullTimeHours, annualHours: two(annualHours), holidays, hoursPerHoliday: two(hoursPerHoliday), bankHolidayHours: two(holidays.length * hoursPerHoliday) };
  });

  const exact = annual + bankHolidayAmount;
  const rounded = roundUpHalf(exact);
  return { ...base, ready: warnings.filter((w) => !/Not employed/.test(w)).length === 0, segments, annual: two(annual), bankHolidayAmount: two(bankHolidayAmount), exact: two(exact), rounded, total: rounded + carryOver };
}

// BrightHR's own figure for the same year, if the last report it was imported from covers it, and whether it agrees
export function compareWithBrightHr(person, year, result) {
  const leave = person?.leave;
  if (!leave || leave.yearFrom !== year.from || !result?.ready) return { known: false };
  const unitOk = (leave.unit || "hours") === result.unit;
  if (!unitOk) return { known: true, figure: leave.entitlement, unit: leave.unit, same: null };
  const figure = Number(leave.entitlement) || 0;
  const same = Math.abs(figure - result.total) < 0.01 || Math.abs(figure - result.rounded) < 0.01;
  return { known: true, figure, unit: leave.unit || "hours", same, difference: two(result.total - figure) };
}

// ---- reading a person's fields from a form, and the practice's yearly choices -----------------------------------------------

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isKey = (v) => DATE.test(String(v || "")) && parseKey(v);
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0; };
// a number of days that may be negative (fewer days than the group's), kept within a sensible range
const signed = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.max(-60, Math.min(60, Math.round(n * 100) / 100)) : 0; };
// a group key: one of the standard ones, or one the practice added ("custom-nursing")
const GROUP_KEY = /^(clinical|admin|management|doctor|custom-[a-z0-9-]{1,30})$/;

// What is written to a staff record. Anything unrecognised is dropped, so a form can never write something odd.
export function cleanLeaveFields(input = {}) {
  const out = {};
  if ("leaveGroup" in input) out.leaveGroup = GROUP_KEY.test(String(input.leaveGroup || "")) ? input.leaveGroup : "";
  if ("serviceFrom" in input) out.serviceFrom = isKey(input.serviceFrom) ? input.serviceFrom : "";
  if ("startedOn" in input) out.startedOn = isKey(input.startedOn) ? input.startedOn : "";
  if ("leftOn" in input) out.leftOn = isKey(input.leftOn) ? input.leftOn : "";
  if ("leaveSessions" in input) out.leaveSessions = num(input.leaveSessions);
  if ("leaveAdjust" in input) {
    out.leaveAdjust = {};
    for (const [key, value] of Object.entries(input.leaveAdjust || {})) if (parseLeaveYearKey(key)) out.leaveAdjust[key] = { carryOver: num(value?.carryOver), fixedDays: num(value?.fixedDays), extraDays: signed(value?.extraDays), extraReason: String(value?.extraReason || "").trim().slice(0, 60) };
  }
  return out;
}

export function cleanYearSettings(input = {}) {
  const practiceDays = (Array.isArray(input.practiceDays) ? input.practiceDays : [])
    .filter((d) => isKey(d?.date)).slice(0, 20).map((d) => ({ date: d.date, name: String(d.name || "Practice closure").trim().slice(0, 60) }));
  // the groups and their days: a standard group with different days, or one the practice added. Four numbers each, in days.
  const seen = new Set();
  const groups = (Array.isArray(input.groups) ? input.groups : []).filter((g) => {
    if (!GROUP_KEY.test(String(g?.key || "")) || g.key === "doctor" || seen.has(g.key) || !Array.isArray(g.days) || g.days.length !== 4) return false;
    seen.add(g.key);
    return true;
  }).slice(0, 12).map((g) => ({ key: g.key, label: String(g.label || "").trim().slice(0, 40) || (groupOf(g.key)?.label ?? "Group"), days: g.days.map((d) => Math.min(100, num(d))) }));
  return { practiceDays, gpBankHolidays: num(input.gpBankHolidays), gpMaxSessions: num(input.gpMaxSessions) || 8, groups };
}

// ---- the table for payroll and BrightHR ----------------------------------------------------------------------------------

const csvCell = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function leaveCsv(rows, year, settings = {}) {
  const head = ["Name", "Job title", "Group", "Unit", "Annual leave", "Bank holidays", "Rounded entitlement", "Carried over", "Total", "BrightHR figure", "Agrees with BrightHR"];
  const lines = rows.map(({ person, result, check }) => [
    person.name, person.jobTitle || "", groupOf(person.leaveGroup, settings)?.label || "", result.unit || "", result.annual ?? "", result.bankHolidayAmount ?? "", result.rounded ?? "", result.carryOver ?? "", result.ready === false ? "" : result.total ?? "",
    check?.known ? check.figure : "", check?.known ? (check.same === null ? "different unit" : check.same ? "yes" : "no") : "",
  ]);
  return [`Annual leave ${year.key}`, head, ...lines].map((l) => (Array.isArray(l) ? l.map(csvCell).join(",") : csvCell(l))).join("\r\n");
}
