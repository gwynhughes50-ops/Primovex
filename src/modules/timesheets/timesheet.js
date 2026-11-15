// The timesheet for a pay period. Everyone has one for each period, worked out from their working pattern. Most of the time nothing
// was different, so the person only declares that; if something was different (overtime, time in lieu, sickness, leave, other) they
// record it on the days it happened. A line manager signs it off, then the payroll team sends it to payroll. Pure (no Firestore,
// no screens) so the page, the phone, the rules' tests and the server's audit trail agree.
//
//   period:     { id, name, from, to, due }                           "YYYY-MM-DD", from..to inclusive
//   timesheet:  { periodId, staffId, uid, staffName, payrollNo, managerUid, state, kind, expected, lines, totals, declaration,
//                 decision, payroll, submissions }
//   line:       { date, code, hours, comment }                        only the days that were different

import { expectedDays, parseKey, dateKey } from "./workPattern";

// The variance codes on the paper sheets (A to F), as they are used today
export const CODES = [
  { code: "A", label: "Sick leave", note: "Hours you were off sick" },
  { code: "B", label: "Overtime, standard rate", note: "Extra hours worked" },
  { code: "C", label: "Overtime, time and a half", note: "Extra hours worked" },
  { code: "D", label: "Annual leave", note: "Hours of leave taken" },
  { code: "E", label: "Time off in lieu", note: "Hours of TOIL taken" },
  { code: "F", label: "Other", note: "Say what in the comment" },
];
export const codeLabel = (code) => CODES.find((c) => c.code === code)?.label || code;

export const STATE = { draft: "draft", submitted: "submitted", declined: "declined", approved: "approved", returned: "returned", sent: "sent" };
export const STATE_LABEL = {
  draft: "Not sent yet", submitted: "Waiting for your line manager", declined: "Declined: needs your attention", approved: "Signed off, with the payroll team",
  returned: "Returned by payroll: needs your attention", sent: "Sent to payroll",
};
// who may move a timesheet from one state to another (the rules enforce the same table)
export const TRANSITIONS = {
  staff: [["draft", "submitted"], ["declined", "submitted"], ["returned", "submitted"], ["draft", "draft"], ["declined", "declined"], ["returned", "returned"], ["submitted", "draft"]],
  manager: [["submitted", "approved"], ["submitted", "declined"]],
  payroll: [["approved", "sent"], ["approved", "returned"]],
};
export const canMove = (role, from, to) => TRANSITIONS[role]?.some(([a, b]) => a === from && b === to) || false;
export const needsStaff = (state) => state === STATE.draft || state === STATE.declined || state === STATE.returned;

export const MAX_LINE_HOURS = 24;
export const MAX_COMMENT = 200;

export const timesheetId = (periodId, staffId) => `${periodId}_${staffId}`;

const uk = (key) => (key ? key.split("-").reverse().join("/") : "");
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (key) => { const d = parseKey(key); return d ? `${d.getDate()} ${MONTH[d.getMonth()]}` : ""; };
export const periodLabel = (p) => (p ? `${short(p.from)} to ${short(p.to)} ${p.to.slice(0, 4)}` : "");

const addDays = (key, n) => { const d = parseKey(key); d.setDate(d.getDate() + n); return dateKey(d); };

// the next pay period after the last one: starts the day after, runs 4 weeks, due the day after it ends
export function suggestPeriod(periods, { weeks = 4, today = dateKey(new Date()) } = {}) {
  const last = [...periods].sort((a, b) => a.to.localeCompare(b.to)).pop();
  let from = last ? addDays(last.to, 1) : today;
  if (!last) { const d = parseKey(today); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); from = dateKey(d); } // the Monday of this week
  const to = addDays(from, weeks * 7 - 1);
  const month = parseKey(to).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  return { name: `${month} payroll`, from, to, due: addDays(to, 1) };
}

export const periodProblem = (p, others = []) => {
  if (!parseKey(p.from) || !parseKey(p.to)) return "Enter the first and last day of the pay period.";
  if (p.to < p.from) return "The last day can't be before the first.";
  if (p.to > addDays(p.from, 7 * 6)) return "A pay period is at most six weeks.";
  if (!parseKey(p.due)) return "Enter the day timesheets are due.";
  if (!String(p.name || "").trim()) return "Give the pay period a name.";
  const clash = others.find((o) => o.id !== p.id && o.from <= p.to && o.to >= p.from);
  return clash ? `That overlaps ${clash.name}.` : "";
};

// ---- is there a pay period for today? ----
// Pay periods are set up by hand, so one can run out without anyone noticing. null when today is inside a pay period and nothing is about to run out. Otherwise what is wrong:
//   { kind: "none" }                                 no pay period has been set up at all
//   { kind: "ended", lastEnd, from, daysSince }      the last one ended before today and there is no next one (from: the day after it ended, where the next one would start)
//   { kind: "gap", nextFrom, from }                  today falls between two periods (from: the day after the previous one ended)
//   { kind: "ending", lastEnd, from, daysLeft }      today is inside the last one, which ends within ENDING_SOON_DAYS days with no next one: time to set it up
export const ENDING_SOON_DAYS = 7;
export function payPeriodGap(periods = [], today = dateKey(new Date())) {
  const list = (periods || []).filter((p) => parseKey(p?.from) && parseKey(p?.to));
  if (!list.length) return { kind: "none" };
  if (list.some((p) => p.from <= today && today <= p.to)) {
    const next = list.some((p) => p.from > today);
    const lastEnd = list.map((p) => p.to).sort().pop();
    const daysLeft = Math.round((parseKey(lastEnd) - parseKey(today)) / 86400000);
    return !next && daysLeft <= ENDING_SOON_DAYS ? { kind: "ending", lastEnd, from: addDays(lastEnd, 1), daysLeft } : null;
  }
  const before = list.filter((p) => p.to < today).map((p) => p.to).sort();
  const after = list.filter((p) => p.from > today).map((p) => p.from).sort();
  const lastEnd = before.pop() || "";
  if (after.length) return { kind: "gap", nextFrom: after[0], from: lastEnd ? addDays(lastEnd, 1) : today };
  return { kind: "ended", lastEnd, from: addDays(lastEnd, 1), daysSince: Math.round((parseKey(today) - parseKey(lastEnd)) / 86400000) };
}

// the words for a gap: `title` and `detail` for the manager's Needs you row, and `staff` for a member of staff opening their timesheet (who cannot fix it, so is told who can)
export function payPeriodGapWords(gap) {
  if (!gap) return null;
  const plural = (n, one) => `${n} ${n === 1 ? one : `${one}s`}`;
  if (gap.kind === "none") return { title: "No pay period has been set up", detail: "Staff can't send timesheets until one is added.", staff: "No pay period has been set up yet. Ask the Practice Manager." };
  if (gap.kind === "ended") return {
    title: "No pay period covers today",
    detail: `The last one ended on ${uk(gap.lastEnd)}, ${plural(gap.daysSince, "day")} ago. Staff can't record or send hours from ${uk(gap.from)} until the next is added.`,
    staff: `No pay period has been set up from ${uk(gap.from)} yet, so hours worked since then can't be recorded. Ask the Practice Manager to add the next one.`,
  };
  if (gap.kind === "gap") return {
    title: "Today falls between two pay periods",
    detail: `Nothing covers ${uk(gap.from)} to the day before the next one starts (${uk(gap.nextFrom)}). Hours worked in between can't be recorded.`,
    staff: `Today isn't in any pay period (the next starts on ${uk(gap.nextFrom)}), so hours worked in between can't be recorded. Ask the Practice Manager.`,
  };
  return {
    title: gap.daysLeft === 0 ? "The pay period ends today, and the next isn't set up" : `The pay period ends in ${plural(gap.daysLeft, "day")}, and the next isn't set up`,
    detail: `It ends on ${uk(gap.lastEnd)}. Add the next one (from ${uk(gap.from)}) so staff can keep recording hours.`,
    staff: "",
  };
}

// What this person was expected to work in the period, from their pattern: the total and each day
export function expectedFor(patterns, period) {
  const days = expectedDays(patterns, period.from, period.to).map((d) => ({ date: d.date, hours: Math.round(d.hours * 100) / 100, bankHoliday: d.bankHoliday, zeroHours: d.zeroHours }));
  return { hours: Math.round(days.reduce((n, d) => n + d.hours, 0) * 100) / 100, days, zeroHours: days.length > 0 && days.every((d) => d.zeroHours), hasPattern: days.some((d) => d.hours > 0 || d.zeroHours) };
}

// what is wrong with one line of "something was different", in words ("" when it is fine)
export function lineProblem(line, period) {
  if (!parseKey(line.date)) return "Choose the day.";
  if (line.date < period.from || line.date > period.to) return `That day is outside this pay period (${periodLabel(period)}).`;
  if (!CODES.some((c) => c.code === line.code)) return "Choose what it was.";
  const hours = Number(line.hours);
  if (!Number.isFinite(hours) || hours <= 0) return "Enter the number of hours.";
  if (hours > MAX_LINE_HOURS) return `That is more than ${MAX_LINE_HOURS} hours in a day.`;
  if (line.code === "F" && !String(line.comment || "").trim()) return "Say what it was in the comment.";
  if (String(line.comment || "").length > MAX_COMMENT) return "Keep the comment short.";
  return "";
}

// hours for each code, and the total of each kind
export function totalsOf(lines) {
  const totals = Object.fromEntries(CODES.map((c) => [c.code, 0]));
  for (const l of lines || []) if (totals[l.code] !== undefined) totals[l.code] = Math.round((totals[l.code] + (Number(l.hours) || 0)) * 100) / 100;
  return totals;
}
export const hasChanges = (totals) => Object.values(totals || {}).some((h) => h > 0);

// The sentence the person confirms. It is stored with the timesheet as it was worded when they confirmed it.
export function declarationText(kind, period) {
  return kind === "no-change"
    ? `I confirm that the hours I worked from ${uk(period.from)} to ${uk(period.to)} were the same as my usual working pattern, and that I have no overtime, time off in lieu, sickness, leave or other changes to report.`
    : `I confirm that the changes listed here are a true record of how my hours differed from my usual working pattern from ${uk(period.from)} to ${uk(period.to)}, and that there is nothing else to report.`;
}

// can this be sent? ("" when yes, else why not)
export function submitProblem({ kind, lines, confirmed }, period) {
  if (!confirmed) return "Tick the box to confirm.";
  if (kind === "no-change") return (lines || []).length ? "Remove the changes, or choose \"Something was different\"." : "";
  if (!(lines || []).length) return "Add what was different, or choose \"No changes\".";
  for (const l of lines) { const p = lineProblem(l, period); if (p) return `${uk(l.date) || "A line"}: ${p}`; }
  return "";
}

// how a timesheet stands against its due date
export function dueStatus(period, state, today = dateKey(new Date())) {
  if (!needsStaff(state)) return "done";
  if (today > period.due) return "overdue";
  return today >= addDays(period.due, -2) ? "due-soon" : "open";
}

// Totals for the manager and payroll: each code's hours, and who has changes
export function summary(timesheets) {
  const out = { people: timesheets.length, noChange: 0, withChanges: 0, totals: Object.fromEntries(CODES.map((c) => [c.code, 0])) };
  for (const t of timesheets) {
    if (t.kind === "no-change") out.noChange += 1; else out.withChanges += 1;
    for (const [code, hours] of Object.entries(t.totals || {})) if (out.totals[code] !== undefined) out.totals[code] = Math.round((out.totals[code] + hours) * 100) / 100;
  }
  return out;
}

// one plain line for a record of what changed ("Overtime, standard rate 2h on 12/10; Sick leave 7.5h on 14/10")
export const describeLines = (lines) => (lines || []).map((l) => `${codeLabel(l.code)} ${l.hours}h on ${uk(l.date).slice(0, 5)}${l.comment ? ` (${l.comment})` : ""}`).join("; ");

// A CSV of timesheets for the payroll team: one row per person for the period
export function payrollCsv(timesheets, period, mileageByUid = {}) {
  const cell = (v) => { const t = String(v ?? ""); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const head = ["Pay period", "Name", "Payroll no", "Declaration", ...CODES.map((c) => `${c.code} ${c.label} (h)`), "Mileage (GBP)", "Details"];
  const rows = [...timesheets].sort((a, b) => String(a.staffName).localeCompare(String(b.staffName))).map((t) => [
    period?.name || t.periodId, t.staffName, t.payrollNo || "", t.kind === "no-change" ? "No changes" : "Changes", ...CODES.map((c) => t.totals?.[c.code] || 0), ((mileageByUid[t.uid] || 0) / 100).toFixed(2), describeLines(t.lines),
  ]);
  return [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}
