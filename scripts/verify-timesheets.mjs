import assert from "node:assert/strict";
import { DAYS, averageWeekHours, bankHolidays, cycleWeek, dayHours, describeWeek, expectedDays, hoursLabel, newPattern, patternOn, patternProblems, planFor, toMinutes, weekHours } from "../src/modules/timesheets/workPattern.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };

const day = (start, end, breakMin = 0) => ({ blocks: [{ start, end }], breakMin });
const weekdays = (d) => ({ mon: d, tue: d, wed: d, thu: d, fri: d, sat: { blocks: [], breakMin: 0 }, sun: { blocks: [], breakMin: 0 } });

t("times and hours read and print plainly", () => {
  assert.equal(toMinutes("08:30"), 510);
  assert.equal(toMinutes("8:30"), 510);
  assert.equal(toMinutes("25:00"), null);
  assert.equal(toMinutes("nine"), null);
  assert.equal(hoursLabel(7.5), "7h 30m");
  assert.equal(hoursLabel(8), "8h");
  assert.equal(hoursLabel(0.25), "15m");
  assert.equal(hoursLabel(0), "0m");
});

t("a day is its time minus the unpaid break: 8.30 to 5 with an hour's lunch is 7.5 hours; with none, 8.5; with 30 minutes, 8", () => {
  assert.equal(dayHours(day("08:30", "17:00", 60)), 7.5);
  assert.equal(dayHours(day("08:30", "17:00", 0)), 8.5);
  assert.equal(dayHours(day("08:30", "17:00", 30)), 8);
  assert.equal(dayHours({ blocks: [], breakMin: 0 }), 0);
});

t("a split shift is paid for both parts, and the gap is not paid", () => {
  const split = { blocks: [{ start: "07:30", end: "10:30" }, { start: "13:00", end: "17:30" }], breakMin: 0 };
  assert.equal(dayHours(split), 7.5);
});

t("a week and its average: five 7.5 hour days is 37.5; four long days is the same hours over four days", () => {
  const five = weekdays(day("08:30", "17:00", 60));
  assert.equal(weekHours(five), 37.5);
  const four = { ...weekdays(day("08:00", "18:00", 30)), fri: { blocks: [], breakMin: 0 } };
  assert.equal(weekHours(four), 38);
  assert.equal(averageWeekHours({ mode: "fixed", weeks: [five] }), 37.5);
  assert.equal(averageWeekHours({ mode: "fixed", weeks: [five, four] }), 37.75, "alternate weeks average out");
  assert.equal(averageWeekHours({ mode: "zero-hours", weeks: [] }), 0);
});

t("the pattern in force is the latest one that has started; a date before the first has none", () => {
  const a = { ...newPattern("2024-04-01"), weeks: [weekdays(day("09:00", "17:00", 60))] };
  const b = { ...newPattern("2026-01-05"), weeks: [weekdays(day("08:00", "16:00", 30))] };
  assert.equal(patternOn([b, a], "2025-06-01"), a);
  assert.equal(patternOn([b, a], "2026-01-05"), b);
  assert.equal(patternOn([b, a], "2023-01-01"), null);
  assert.equal(planFor([b, a], "2026-01-07").hours, 7.5, "Wednesday under the newer pattern");
  assert.equal(planFor([b, a], "2025-06-04").hours, 7, "Wednesday under the older pattern");
  assert.equal(planFor([a], "2020-01-01").working, false);
});

t("alternate weeks: the cycle counts from the Monday of the week the pattern starts", () => {
  const early = weekdays(day("07:30", "15:30", 30));
  const late = weekdays(day("10:00", "18:30", 60));
  const p = { from: "2026-10-07", mode: "fixed", weeks: [early, late] }; // starts Wednesday 7 Oct: week 1 is the week of Mon 5 Oct
  assert.equal(cycleWeek(p, "2026-10-07"), 0);
  assert.equal(cycleWeek(p, "2026-10-11"), 0, "Sunday is still that week");
  assert.equal(cycleWeek(p, "2026-10-12"), 1);
  assert.equal(cycleWeek(p, "2026-10-19"), 0);
  assert.equal(planFor([p], "2026-10-14").hours, 7.5, "late week, Wednesday: 10 to 6.30 less an hour");
  assert.equal(planFor([p], "2026-10-21").hours, 7.5, "early week, Wednesday: 7.30 to 3.30 less 30m");
  assert.equal(cycleWeek({ ...p, from: "2026-10-12" }, "2026-10-05"), 1, "before the start it still counts back correctly");
});

t("zero-hours has no expected hours", () => {
  const z = { from: "2026-01-01", mode: "zero-hours", weeks: [] };
  const plan = planFor([z], "2026-03-04");
  assert.equal(plan.zeroHours, true);
  assert.equal(plan.hours, 0);
  assert.deepEqual(patternProblems(z), []);
});

t("mistakes in a pattern are caught in words", () => {
  const ok = { ...newPattern("2026-01-05"), weeks: [weekdays(day("08:30", "17:00", 60))] };
  assert.deepEqual(patternProblems(ok), []);
  const backwards = { ...ok, weeks: [{ ...ok.weeks[0], mon: day("17:00", "08:30") }] };
  assert.match(patternProblems(backwards)[0], /Monday: a finish time must be after its start/);
  const overlap = { ...ok, weeks: [{ ...ok.weeks[0], tue: { blocks: [{ start: "08:00", end: "12:00" }, { start: "11:00", end: "15:00" }], breakMin: 0 } }] };
  assert.match(patternProblems(overlap)[0], /Tuesday: the times overlap/);
  const missing = { ...ok, weeks: [{ ...ok.weeks[0], wed: { blocks: [{ start: "08:00", end: "" }], breakMin: 0 } }] };
  assert.match(patternProblems(missing)[0], /Wednesday: enter both/);
  const longBreak = { ...ok, weeks: [{ ...ok.weeks[0], thu: day("09:00", "10:00", 90) }] };
  assert.match(patternProblems(longBreak)[0], /Thursday: the unpaid break is longer/);
  assert.match(patternProblems({ ...ok, from: "" })[0], /when this pattern starts/);
  assert.match(patternProblems({ ...ok, weeks: [] })[0], /1 to 6 weeks/);
  const twoWeeks = { ...ok, weeks: [ok.weeks[0], { ...ok.weeks[0], fri: day("12:00", "11:00") }] };
  assert.match(patternProblems(twoWeeks)[0], /Friday, week 2/);
});

t("the bank holidays of England and Wales, with substitute days", () => {
  const names = (y) => bankHolidays(y).map((h) => `${h.date} ${h.name}`);
  assert.deepEqual(bankHolidays(2026).map((h) => h.date), ["2026-01-01", "2026-04-03", "2026-04-06", "2026-05-04", "2026-05-25", "2026-08-31", "2026-12-25", "2026-12-28"]);
  assert.match(names(2026)[7], /Boxing Day \(substitute day\)/);
  assert.deepEqual(bankHolidays(2027).map((h) => h.date), ["2027-01-01", "2027-03-26", "2027-03-29", "2027-05-03", "2027-05-31", "2027-08-30", "2027-12-27", "2027-12-28"]);
  assert.deepEqual(bankHolidays(2028).map((h) => h.date), ["2028-01-03", "2028-04-14", "2028-04-17", "2028-05-01", "2028-05-29", "2028-08-28", "2028-12-25", "2028-12-26"]);
});

t("a run of dates shows what is expected, and where the bank holidays fall", () => {
  const p = { ...newPattern("2026-08-24"), weeks: [weekdays(day("08:30", "17:00", 60))] };
  const run = expectedDays([p], "2026-08-28", "2026-09-01");
  assert.deepEqual(run.map((d) => [d.date, d.dow, d.hours, d.bankHoliday]), [
    ["2026-08-28", "fri", 7.5, ""], ["2026-08-29", "sat", 0, ""], ["2026-08-30", "sun", 0, ""], ["2026-08-31", "mon", 7.5, "Summer bank holiday"], ["2026-09-01", "tue", 7.5, ""],
  ]);
  const overYearEnd = expectedDays([p], "2026-12-24", "2027-01-04");
  assert.ok(overYearEnd.some((d) => d.date === "2026-12-28" && d.bankHoliday) && overYearEnd.some((d) => d.date === "2027-01-01" && d.bankHoliday));
});

t("a week reads back in plain words, grouping days that are the same", () => {
  assert.equal(describeWeek(weekdays(day("08:30", "17:00", 60))), "Mon-Fri 08:30-17:00 (60m break)");
  const mixed = { ...weekdays(day("08:00", "16:00", 30)), wed: { blocks: [{ start: "07:30", end: "10:30" }, { start: "13:00", end: "17:30" }], breakMin: 0 }, fri: { blocks: [], breakMin: 0 } };
  assert.equal(describeWeek(mixed), "Mon-Tue 08:00-16:00 (30m break), Wed 07:30-10:30 + 13:00-17:30, Thu 08:00-16:00 (30m break)");
  assert.equal(describeWeek({}), "No working days");
  assert.equal(DAYS.length, 7);
});

console.log(`\n${n} passed`);
