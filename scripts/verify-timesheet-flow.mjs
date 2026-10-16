import assert from "node:assert/strict";
import { CODES, STATE, canMove, declarationText, describeLines, dueStatus, expectedFor, hasChanges, lineProblem, needsStaff, payrollCsv, periodLabel, periodProblem, submitProblem, suggestPeriod, summary, timesheetId, totalsOf } from "../src/modules/timesheets/timesheet.js";
import { newPattern } from "../src/modules/timesheets/workPattern.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };

const period = { id: "p-oct", name: "October payroll", from: "2026-08-31", to: "2026-10-04", due: "2026-10-05" };
const day = (start, end, breakMin) => ({ blocks: [{ start, end }], breakMin });
const week = (d) => ({ mon: d, tue: d, wed: d, thu: d, fri: d, sat: { blocks: [], breakMin: 0 }, sun: { blocks: [], breakMin: 0 } });
const patterns = [{ ...newPattern("2020-01-06"), weeks: [week(day("08:30", "17:00", 60))] }];

t("the codes are the ones on the paper sheet, A to F", () => {
  assert.deepEqual(CODES.map((c) => c.code), ["A", "B", "C", "D", "E", "F"]);
  assert.equal(CODES[3].label, "Annual leave");
});

t("who may move a timesheet where: the person sends it, the line manager signs it off or declines it, payroll sends it on or returns it", () => {
  assert.ok(canMove("staff", "draft", "submitted") && canMove("staff", "declined", "submitted") && canMove("staff", "returned", "submitted"));
  assert.ok(canMove("manager", "submitted", "approved") && canMove("manager", "submitted", "declined"));
  assert.ok(canMove("payroll", "approved", "sent") && canMove("payroll", "approved", "returned"));
  assert.equal(canMove("staff", "submitted", "approved"), false, "nobody signs off their own");
  assert.equal(canMove("staff", "approved", "draft"), false, "a signed-off timesheet can't be taken back");
  assert.equal(canMove("manager", "approved", "sent"), false);
  assert.equal(canMove("payroll", "submitted", "sent"), false, "payroll only sees what a manager has signed off");
  assert.equal(canMove("manager", "sent", "declined"), false);
  assert.equal(needsStaff(STATE.declined) && needsStaff(STATE.draft) && needsStaff(STATE.returned), true);
  assert.equal(needsStaff(STATE.submitted) || needsStaff(STATE.sent), false);
});

t("the next pay period starts the day after the last one, runs four weeks, and is due the day after it ends", () => {
  const next = suggestPeriod([period]);
  assert.deepEqual([next.from, next.to, next.due], ["2026-10-05", "2026-11-01", "2026-11-02"]);
  assert.equal(next.name, "November 2026 payroll");
  assert.equal(suggestPeriod([period], { weeks: 5 }).to, "2026-11-08");
  const first = suggestPeriod([], { today: "2026-10-14" });
  assert.equal(first.from, "2026-10-12", "with none yet it starts on the Monday of this week");
});

t("a pay period is checked: dates, order, a name, no overlaps, at most six weeks", () => {
  assert.equal(periodProblem(period), "");
  assert.match(periodProblem({ ...period, from: "" }), /first and last day/);
  assert.match(periodProblem({ ...period, to: "2026-08-01" }), /can't be before/);
  assert.match(periodProblem({ ...period, to: "2026-12-31" }), /at most six weeks/);
  assert.match(periodProblem({ ...period, due: "" }), /due/);
  assert.match(periodProblem({ ...period, name: " " }), /name/);
  assert.match(periodProblem({ ...period, id: "other", from: "2026-10-01", to: "2026-10-30" }, [period]), /overlaps October payroll/);
  assert.equal(periodProblem(period, [period]), "", "it does not overlap itself");
  assert.equal(periodLabel(period), "31 Aug to 4 Oct 2026");
});

t("what a person was expected to work comes from their pattern, bank holidays included", () => {
  const e = expectedFor(patterns, period); // 31 Aug to 4 Oct: 5 weeks of 5 x 7.5h; 31 Aug is the summer bank holiday (a paid day)
  assert.equal(e.days.length, 35);
  assert.equal(e.hours, 187.5);
  assert.equal(e.days[0].bankHoliday, "Summer bank holiday");
  assert.equal(e.hasPattern, true);
  assert.equal(expectedFor([], period).hasPattern, false, "no pattern set yet");
  const zero = expectedFor([{ from: "2020-01-01", mode: "zero-hours", weeks: [] }], period);
  assert.equal(zero.zeroHours, true);
  assert.equal(zero.hours, 0);
});

t("a line saying something was different is checked in words", () => {
  const ok = { date: "2026-09-10", code: "B", hours: 2, comment: "" };
  assert.equal(lineProblem(ok, period), "");
  assert.match(lineProblem({ ...ok, date: "" }, period), /Choose the day/);
  assert.match(lineProblem({ ...ok, date: "2026-11-01" }, period), /outside this pay period/);
  assert.match(lineProblem({ ...ok, code: "Z" }, period), /Choose what it was/);
  assert.match(lineProblem({ ...ok, hours: 0 }, period), /number of hours/);
  assert.match(lineProblem({ ...ok, hours: 30 }, period), /more than 24 hours/);
  assert.match(lineProblem({ ...ok, code: "F" }, period), /Say what it was/);
  assert.equal(lineProblem({ ...ok, code: "F", comment: "Training day off site" }, period), "");
  assert.match(lineProblem({ ...ok, comment: "x".repeat(201) }, period), /short/);
});

t("totals add up by code, and a timesheet has changes only if there is some", () => {
  const lines = [{ code: "B", hours: 2 }, { code: "B", hours: 1.5 }, { code: "D", hours: 7.5 }, { code: "E", hours: 3 }];
  const totals = totalsOf(lines);
  assert.deepEqual(totals, { A: 0, B: 3.5, C: 0, D: 7.5, E: 3, F: 0 });
  assert.equal(hasChanges(totals), true);
  assert.equal(hasChanges(totalsOf([])), false);
});

t("the declaration reads in plain words and carries the dates", () => {
  assert.match(declarationText("no-change", period), /from 31\/08\/2026 to 04\/10\/2026 were the same as my usual working pattern/);
  assert.match(declarationText("changes", period), /changes listed here are a true record/);
});

t("a timesheet can be sent only when it is confirmed and consistent", () => {
  const line = { date: "2026-09-10", code: "B", hours: 2, comment: "" };
  assert.match(submitProblem({ kind: "no-change", lines: [], confirmed: false }, period), /Tick the box/);
  assert.equal(submitProblem({ kind: "no-change", lines: [], confirmed: true }, period), "");
  assert.match(submitProblem({ kind: "no-change", lines: [line], confirmed: true }, period), /Remove the changes/);
  assert.match(submitProblem({ kind: "changes", lines: [], confirmed: true }, period), /Add what was different/);
  assert.equal(submitProblem({ kind: "changes", lines: [line], confirmed: true }, period), "");
  assert.match(submitProblem({ kind: "changes", lines: [{ ...line, hours: 0 }], confirmed: true }, period), /10\/09\/2026: Enter the number of hours/);
});

t("due dates: open, due soon, overdue, and done once it is with the manager", () => {
  assert.equal(dueStatus(period, STATE.draft, "2026-09-20"), "open");
  assert.equal(dueStatus(period, STATE.draft, "2026-10-03"), "due-soon");
  assert.equal(dueStatus(period, STATE.draft, "2026-10-05"), "due-soon");
  assert.equal(dueStatus(period, STATE.draft, "2026-10-06"), "overdue");
  assert.equal(dueStatus(period, STATE.declined, "2026-10-20"), "overdue");
  assert.equal(dueStatus(period, STATE.submitted, "2026-10-20"), "done");
});

t("the manager's and payroll's view: how many are no-change, how many have changes, and the hours by code", () => {
  const list = [{ kind: "no-change", totals: totalsOf([]) }, { kind: "changes", totals: totalsOf([{ code: "B", hours: 2 }]) }, { kind: "changes", totals: totalsOf([{ code: "B", hours: 1 }, { code: "A", hours: 7.5 }]) }];
  const s = summary(list);
  assert.deepEqual([s.people, s.noChange, s.withChanges, s.totals.A, s.totals.B], [3, 1, 2, 7.5, 3]);
});

t("changes read back in one plain line, and the payroll file has a row per person with the mileage beside it", () => {
  const lines = [{ date: "2026-09-12", code: "B", hours: 2, comment: "" }, { date: "2026-09-14", code: "A", hours: 7.5, comment: "flu" }];
  assert.equal(describeLines(lines), "Overtime, standard rate 2h on 12/09; Sick leave 7.5h on 14/09 (flu)");
  const csv = payrollCsv([
    { periodId: "p-oct", uid: "u1", staffName: "Ann Example", payrollNo: "32", kind: "changes", totals: totalsOf(lines), lines },
    { periodId: "p-oct", uid: "u2", staffName: "Bea \"B\" Sample", payrollNo: "", kind: "no-change", totals: totalsOf([]), lines: [] },
  ], period, { u1: 1350 });
  const rows = csv.split("\r\n");
  assert.equal(rows.length, 3);
  assert.ok(rows[0].startsWith('Pay period,Name,Payroll no,Declaration,A Sick leave (h),"B Overtime, standard rate (h)"'));
  assert.equal(rows[1], 'October payroll,Ann Example,32,Changes,7.5,2,0,0,0,0,13.50,"Overtime, standard rate 2h on 12/09; Sick leave 7.5h on 14/09 (flu)"');
  assert.equal(rows[2], 'October payroll,"Bea ""B"" Sample",,No changes,0,0,0,0,0,0,0.00,');
  assert.equal(timesheetId("p-oct", "ts-ann"), "p-oct_ts-ann");
});

console.log(`\n${n} passed`);
