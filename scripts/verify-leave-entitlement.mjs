import assert from "node:assert/strict";
import {
  LEAVE_GROUPS, bankHolidaysBetween, groupOf, groupsFor, calculateEntitlement, employmentPeriod, cleanLeaveFields, cleanYearSettings, compareWithBrightHr, gpBankHolidayDays, leaveCsv, leaveYear, leaveYearFor, parseLeaveYearKey, serviceTier,
} from "../src/modules/leave/leaveEntitlement.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.01, `${msg || ""} expected ${b}, got ${a}`);

// 7.5 paid hours: 08:00 to 16:00 with a 30 minute break
const day = { blocks: [{ start: "08:00", end: "16:00" }], breakMin: 30 };
const off = { blocks: [], breakMin: 0 };
const week = (days) => Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, days.includes(d) ? day : off]));
const pattern = (from, days) => ({ from, mode: "fixed", weeks: [week(days)] });
const FIVE = ["mon", "tue", "wed", "thu", "fri"];
const full = (from = "2020-01-01") => [pattern(from, FIVE)];
const Y = leaveYear(2026);

t("the leave year runs 1 April to 31 March and is named 2026-27", () => {
  assert.deepEqual([Y.key, Y.from, Y.to, Y.days], ["2026-27", "2026-04-01", "2027-03-31", 365]);
  assert.equal(leaveYear(2027).days, 366, "the year with 29 February is a day longer");
  assert.equal(leaveYear(2099).key, "2099-00");
  assert.equal(leaveYearFor("2026-03-31").key, "2025-26");
  assert.equal(leaveYearFor("2026-04-01").key, "2026-27");
  assert.equal(parseLeaveYearKey("2026-27").from, "2026-04-01");
  assert.equal(parseLeaveYearKey("nonsense"), null);
});

t("2026-27 has ten bank holidays because Easter 2027 falls in March, which is why the sheet adds ten days", () => {
  const list = bankHolidaysBetween(Y.from, Y.to);
  assert.equal(list.length, 10);
  assert.deepEqual(list.map((h) => h.date), ["2026-04-03", "2026-04-06", "2026-05-04", "2026-05-25", "2026-08-31", "2026-12-25", "2026-12-28", "2027-01-01", "2027-03-26", "2027-03-29"]);
  assert.equal(bankHolidaysBetween("2027-04-01", "2028-03-31").length, 6, "no Easter at all in that year, and Christmas and New Year on weekends");
  // the practice can add its own closure days, once each
  const extra = bankHolidaysBetween(Y.from, Y.to, [{ date: "2026-12-24", name: "Christmas Eve" }, { date: "2026-12-25", name: "again" }, { date: "2030-01-01" }]);
  assert.equal(extra.length, 11);
  assert.ok(extra.find((h) => h.date === "2026-12-24").practice);
});

t("a full-time person with ten years' clinical service gets what the sheet gave: 292.5 + 10 x 7.5 = 367.5", () => {
  const r = calculateEntitlement({ leaveGroup: "clinical", serviceFrom: "2010-01-01", patterns: full() }, Y);
  assert.equal(r.ready, true);
  assert.equal(r.segments.length, 1);
  near(r.annual, 292.5); near(r.bankHolidayAmount, 75); assert.equal(r.rounded, 367.5); assert.equal(r.total, 367.5);
});

t("every group and level uses its own scale", () => {
  const total = (leaveGroup, serviceFrom) => calculateEntitlement({ leaveGroup, serviceFrom, patterns: full() }, Y).rounded;
  assert.equal(total("clinical", "2026-04-01"), 232.5 + 75);
  assert.equal(total("clinical", "2024-01-01"), 255 + 75);
  assert.equal(total("clinical", "2020-01-01"), 262.5 + 75);
  assert.equal(total("admin", "2025-01-01"), 180 + 75, "admin after a year: the sheet's 255");
  assert.equal(total("admin", "2015-01-01"), 255 + 75);
  assert.equal(total("management", "2026-04-01"), 187.5 + 75);
  assert.equal(total("management", "2010-01-01"), 285 + 75);
  assert.deepEqual(LEAVE_GROUPS.filter((g) => g.hours).map((g) => g.hours.length), [4, 4, 4]);
});

t("part-time hours scale both the leave and each bank holiday: 3 days a week, admin, basic", () => {
  const r = calculateEntitlement({ leaveGroup: "admin", serviceFrom: "2026-04-01", patterns: [pattern("2020-01-01", ["mon", "tue", "wed"])] }, Y);
  near(r.annual, 157.5 * 0.6); near(r.bankHolidayAmount, 10 * 4.5); assert.equal(r.rounded, 139.5);
  assert.equal(r.segments[0].hoursPerHoliday, 4.5);
});

t("the total is rounded up to the half hour, never down", () => {
  const r = calculateEntitlement({ leaveGroup: "clinical", serviceFrom: "2026-04-01", patterns: [pattern("2020-01-01", ["mon", "tue", "wed", "thu"])] }, Y);
  near(r.exact, 232.5 * 0.8 + 10 * 6);
  assert.equal(r.rounded, 246);
  const odd = calculateEntitlement({ leaveGroup: "admin", serviceFrom: "2026-04-01", patterns: [pattern("2020-01-01", ["mon", "tue", "wed", "thu"]), ] , startDate: "2026-06-15" }, Y);
  assert.equal(odd.rounded * 2, Math.ceil(odd.exact * 2), "to the next half hour");
  assert.ok(odd.rounded >= odd.exact);
});

t("reaching a service anniversary part-way through the year splits it, so there is no second run of the sheet", () => {
  const r = calculateEntitlement({ leaveGroup: "clinical", serviceFrom: "2025-10-01", patterns: full() }, Y);
  assert.equal(r.segments.length, 2);
  assert.deepEqual(r.segments.map((s) => [s.from, s.to, s.days, s.tierLabel]), [["2026-04-01", "2026-09-30", 183, "Basic"], ["2026-10-01", "2027-03-31", 182, "After 1 year"]]);
  near(r.annual, 232.5 * 183 / 365 + 255 * 182 / 365);
  assert.deepEqual(r.segments.map((s) => s.holidays.length), [5, 5]);
  assert.equal(r.rounded, 319);
});

t("a change of hours part-way through the year gets each part its own hours", () => {
  const patterns = [pattern("2020-01-01", FIVE), pattern("2026-10-01", ["mon", "tue", "wed"])];
  const r = calculateEntitlement({ leaveGroup: "admin", serviceFrom: "2010-01-01", patterns }, Y);
  assert.deepEqual(r.segments.map((s) => s.weeklyHours), [37.5, 22.5]);
  near(r.annual, 255 * 183 / 365 + 255 * 0.6 * 182 / 365);
  near(r.bankHolidayAmount, 5 * 7.5 + 5 * 4.5);
});

t("someone who starts or leaves in the year gets only those days", () => {
  const starter = calculateEntitlement({ leaveGroup: "clinical", startDate: "2026-10-01", patterns: full() }, Y);
  assert.equal(starter.segments[0].from, "2026-10-01");
  near(starter.annual, 232.5 * 182 / 365); near(starter.bankHolidayAmount, 5 * 7.5);
  assert.equal(starter.rounded, 153.5);
  const leaver = calculateEntitlement({ leaveGroup: "clinical", serviceFrom: "2010-01-01", leftOn: "2026-09-30", patterns: full() }, Y);
  near(leaver.annual, 292.5 * 183 / 365); near(leaver.bankHolidayAmount, 5 * 7.5);
  const notThere = calculateEntitlement({ leaveGroup: "clinical", startDate: "2027-06-01", patterns: full() }, Y);
  assert.equal(notThere.rounded, 0);
  assert.match(notThere.warnings[0], /Not employed/);
});

t("a leap year divides by its real length, so a full year is exactly the full figure", () => {
  const r = calculateEntitlement({ leaveGroup: "clinical", serviceFrom: "2010-01-01", patterns: full() }, leaveYear(2027));
  near(r.annual, 292.5);
});

t("service is counted from the service date, or the start date when there is none, and starts a level on the anniversary", () => {
  assert.equal(serviceTier("2025-04-01", "2026-03-31"), 0);
  assert.equal(serviceTier("2025-04-01", "2026-04-01"), 1);
  assert.equal(serviceTier("2021-04-01", "2026-04-01"), 2);
  assert.equal(serviceTier("2016-04-01", "2026-04-01"), 3);
  assert.equal(serviceTier("", "2026-04-01"), 0);
  const a = calculateEntitlement({ leaveGroup: "admin", startDate: "2010-01-01", patterns: full() }, Y);
  const b = calculateEntitlement({ leaveGroup: "admin", serviceFrom: "2010-01-01", patterns: full() }, Y);
  assert.equal(a.rounded, b.rounded);
});

t("carry-over is added after rounding and kept separate", () => {
  const r = calculateEntitlement({ leaveGroup: "admin", serviceFrom: "2010-01-01", patterns: full(), leaveAdjust: { "2026-27": { carryOver: 28 }, "2025-26": { carryOver: 5 } } }, Y);
  assert.deepEqual([r.rounded, r.carryOver, r.total], [330, 28, 358]);
});

t("what can't be worked out is said in words and is not shown as a figure", () => {
  assert.equal(calculateEntitlement({ patterns: full() }, Y).ready, false);
  assert.match(calculateEntitlement({ patterns: full() }, Y).warnings[0], /leave group/);
  const noPattern = calculateEntitlement({ leaveGroup: "admin", serviceFrom: "2010-01-01", patterns: [] }, Y);
  assert.equal(noPattern.ready, false);
  assert.match(noPattern.warnings.join(" "), /working pattern/);
  const zero = calculateEntitlement({ leaveGroup: "admin", serviceFrom: "2010-01-01", patterns: [{ from: "2020-01-01", mode: "zero-hours", weeks: [] }] }, Y);
  assert.equal(zero.ready, false);
  assert.match(zero.warnings.join(" "), /Zero hours/);
  assert.match(calculateEntitlement({ leaveGroup: "admin", patterns: full() }, Y).warnings.join(" "), /No start date/);
});

t("doctors are counted in days, with the bank holidays they do not work worked out by sessions", () => {
  assert.equal(gpBankHolidayDays({ bankHolidays: 6, sessions: 7, maxSessions: 8 }), 5.5, "6 x 7/8 = 5.25, up to the half day");
  assert.equal(gpBankHolidayDays({ bankHolidays: 6, sessions: 8, maxSessions: 8 }), 6);
  assert.equal(gpBankHolidayDays({ bankHolidays: 6, sessions: 4, maxSessions: 8 }), 3);
  assert.equal(gpBankHolidayDays({ bankHolidays: 0, sessions: 4, maxSessions: 8 }), 0);
  assert.equal(gpBankHolidayDays({ bankHolidays: 6, sessions: 4, maxSessions: 0 }), 0);
  const settings = { gpMaxSessions: 8 };
  // every bank holiday counts, from the calendar, shared by sessions: 10 x 7/8 = 8.75, so 9 days
  const r = calculateEntitlement({ leaveGroup: "doctor", leaveSessions: 7, leaveAdjust: { "2026-27": { fixedDays: 32, carryOver: 2 } } }, Y, settings);
  assert.deepEqual([r.unit, r.fixedDays, r.bankHolidaysCounted, r.bankHolidayDays, r.rounded, r.total, r.ready], ["days", 32, 10, 9, 41, 43, true]);
  // a full-time doctor (8 of 8) gets all ten, and a number typed into the year's settings overrides the calendar
  assert.equal(calculateEntitlement({ leaveGroup: "doctor", leaveSessions: 8, leaveAdjust: { "2026-27": { fixedDays: 32 } } }, Y, settings).bankHolidayDays, 10);
  assert.equal(calculateEntitlement({ leaveGroup: "doctor", leaveSessions: 7, leaveAdjust: { "2026-27": { fixedDays: 32 } } }, Y, { gpBankHolidays: 6, gpMaxSessions: 8 }).bankHolidayDays, 5.5);
  // starting part-way through the year, only the holidays after the start count (6 from 1 July: 6 x 4/8 = 3)
  assert.equal(calculateEntitlement({ leaveGroup: "doctor", leaveSessions: 4, startDate: "2026-07-01", leaveAdjust: { "2026-27": { fixedDays: 20 } } }, Y, settings).bankHolidayDays, 3);
  const missing = calculateEntitlement({ leaveGroup: "doctor" }, Y, {});
  assert.equal(missing.ready, false);
  assert.equal(missing.warnings.length, 2);
});

t("each person's figure is checked against what BrightHR holds, for the same year and unit", () => {
  const person = { leaveGroup: "admin", serviceFrom: "2010-01-01", patterns: full() };
  const result = calculateEntitlement(person, Y);
  assert.equal(compareWithBrightHr(person, Y, result).known, false, "nothing imported");
  const withLeave = (leave) => compareWithBrightHr({ ...person, leave }, Y, result);
  assert.deepEqual(withLeave({ yearFrom: "2026-04-01", unit: "hours", entitlement: 330 }), { known: true, figure: 330, unit: "hours", same: true, difference: 0 });
  assert.equal(withLeave({ yearFrom: "2026-04-01", unit: "hours", entitlement: 322.5 }).same, false);
  assert.equal(withLeave({ yearFrom: "2026-04-01", unit: "hours", entitlement: 322.5 }).difference, 7.5);
  assert.equal(withLeave({ yearFrom: "2025-04-01", unit: "hours", entitlement: 330 }).known, false, "last year's report says nothing about this year");
  assert.equal(withLeave({ yearFrom: "2026-04-01", unit: "days", entitlement: 44 }).same, null, "days against hours cannot be compared");
  assert.equal(compareWithBrightHr({ ...person, leave: { yearFrom: "2026-04-01", entitlement: 330 } }, Y, calculateEntitlement({ patterns: [] }, Y)).known, false, "nothing to compare when it can't be worked out");
});

t("what is written to a staff record is cleaned, so a form can never write something odd", () => {
  assert.deepEqual(cleanLeaveFields({ leaveGroup: "nonsense", serviceFrom: "tomorrow", leftOn: "2026-13-45", leaveSessions: -3, hacked: true }), { leaveGroup: "", serviceFrom: "", leftOn: "", leaveSessions: 0 });
  assert.deepEqual(cleanLeaveFields({ leaveGroup: "clinical", serviceFrom: "2010-05-01", leftOn: "" }), { leaveGroup: "clinical", serviceFrom: "2010-05-01", leftOn: "" });
  assert.deepEqual(cleanLeaveFields({ leaveAdjust: { "2026-27": { carryOver: "28", fixedDays: "x" }, bad: { carryOver: 1 } } }), { leaveAdjust: { "2026-27": { carryOver: 28, fixedDays: 0, extraDays: 0, extraReason: "" } } });
  assert.deepEqual(cleanLeaveFields({}), {}, "only what was sent");
  const s = cleanYearSettings({ practiceDays: [{ date: "2026-12-24", name: "  Christmas Eve " }, { date: "bad" }, null], gpBankHolidays: "6" });
  assert.deepEqual(s, { practiceDays: [{ date: "2026-12-24", name: "Christmas Eve" }], gpBankHolidays: 6, gpMaxSessions: 8, groups: [] });
  assert.equal(cleanYearSettings({}).gpBankHolidays, 0);
});

t("the table for payroll lists every person with their figure and whether BrightHR agrees", () => {
  const person = { name: "Test, Person", jobTitle: "Nurse", leaveGroup: "clinical", serviceFrom: "2010-01-01", patterns: full(), leave: { yearFrom: "2026-04-01", unit: "hours", entitlement: 367.5 } };
  const result = calculateEntitlement(person, Y);
  const csv = leaveCsv([{ person, result, check: compareWithBrightHr(person, Y, result) }, { person: { name: "No Group" }, result: calculateEntitlement({}, Y), check: { known: false } }], Y);
  const lines = csv.split("\r\n");
  assert.equal(lines[0], "Annual leave 2026-27");
  assert.match(lines[1], /^Name,Job title,Group/);
  assert.equal(lines[2], '"Test, Person",Nurse,Clinical,hours,292.5,75,367.5,0,367.5,367.5,yes');
  assert.match(lines[3], /^No Group,,,hours/);
});

t("leave periods: a full year, a start part-way through, and a leaver", () => {
  const p = (extra) => employmentPeriod(extra, Y);
  assert.deepEqual([p({}).label, p({}).days, p({}).full], ["Full year", 365, true]);
  assert.equal(p({ startDate: "2015-06-01" }).label, "Full year", "started in an earlier year");
  assert.equal(p({ startDate: "2026-04-01" }).full, true, "starting on the first day is the full year");
  assert.deepEqual([p({ startDate: "2026-07-01" }).label, p({ startDate: "2026-07-01" }).days], ["From 01/07/2026", 274]);
  assert.deepEqual([p({ leftOn: "2026-09-30" }).label, p({ leftOn: "2026-09-30" }).days], ["To 30/09/2026", 183]);
  assert.deepEqual([p({ startDate: "2026-07-01", leftOn: "2026-12-31" }).label, p({ startDate: "2026-07-01", leftOn: "2026-12-31" }).days], ["01/07/2026 to 31/12/2026", 184]);
  assert.equal(p({ leftOn: "2026-03-31" }).none, true);
  assert.equal(p({ startDate: "2027-04-01" }).none, true);
  assert.equal(p({ leftOn: "2027-03-31" }).full, true, "leaving on the last day is the full year");
  // a start date typed in wins over BrightHR's
  assert.equal(p({ startDate: "2020-01-01", startedOn: "2026-09-01" }).label, "From 01/09/2026");
});

t("the entitlement follows the period: joined part-way, left early, both, and a typed-in start date", () => {
  const base = { leaveGroup: "admin", patterns: full() };
  const joiner = calculateEntitlement({ ...base, startDate: "2026-07-01" }, Y);
  near(joiner.annual, 157.5 * 274 / 365);
  assert.equal(joiner.segments[0].holidays.length, 6, "the holidays before 1 July are not theirs");
  const both = calculateEntitlement({ ...base, startDate: "2026-07-01", leftOn: "2026-12-31" }, Y);
  near(both.annual, 157.5 * 184 / 365);
  assert.deepEqual(both.segments[0].holidays.map((h) => h.date), ["2026-08-31", "2026-12-25", "2026-12-28"]);
  const typed = calculateEntitlement({ ...base, startDate: "2020-01-01", startedOn: "2026-09-01" }, Y);
  near(typed.annual, 157.5 * 212 / 365);
  // service from an earlier NHS job counts towards the level even though they only joined this practice this year
  const transfer = calculateEntitlement({ ...base, startDate: "2026-07-01", serviceFrom: "2010-01-01" }, Y);
  near(transfer.annual, 255 * 274 / 365);
  // starting part-way, then reaching the next level before the year ends, splits that part
  const split = calculateEntitlement({ ...base, startDate: "2026-07-01", serviceFrom: "2025-10-01" }, Y);
  assert.deepEqual(split.segments.map((x) => [x.from, x.to, x.tierLabel]), [["2026-07-01", "2026-09-30", "Basic"], ["2026-10-01", "2027-03-31", "After 1 year"]]);
});

t("a typed-in start date is kept in the staff record fields", () => {
  assert.deepEqual(cleanLeaveFields({ startedOn: "2026-09-01" }), { startedOn: "2026-09-01" });
  assert.deepEqual(cleanLeaveFields({ startedOn: "soon" }), { startedOn: "" });
});

t("hours typed in (a new starter who is not on the list yet) are used instead of a working pattern", () => {
  const typed = calculateEntitlement({ leaveGroup: "admin", serviceFrom: "2026-04-01", weeklyHours: 30, patterns: [] }, Y);
  assert.equal(typed.ready, true, "no pattern is needed when the hours are typed");
  near(typed.annual, 157.5 * 30 / 37.5); near(typed.bankHolidayAmount, 10 * 6);
  assert.equal(typed.segments[0].weeklyHours, 30);
  // they win over the pattern and ignore its changes
  const over = calculateEntitlement({ leaveGroup: "admin", serviceFrom: "2010-01-01", weeklyHours: 18.75, patterns: [pattern("2020-01-01", FIVE), pattern("2026-10-01", ["mon"])] }, Y);
  assert.equal(over.segments.length, 1);
  near(over.annual, 255 * 0.5);
  assert.deepEqual(cleanLeaveFields({ weeklyHours: 30 }), {}, "and are never written to a staff record");
});

t("the practice can change the days each group gets, and add groups of its own (a nursing group of 28, 34 and 38 days)", () => {
  const nursing = { key: "custom-nursing", label: "Nursing", days: [28, 28, 34, 38] };
  const settings = { groups: [nursing, { key: "admin", label: "Admin", days: [22, 25, 30, 35] }] };
  // standard groups keep their days unless changed; added ones come after them
  assert.deepEqual(groupsFor({}).map((g) => g.key), ["clinical", "admin", "management", "doctor"]);
  assert.deepEqual(groupsFor(settings).map((g) => g.key), ["clinical", "admin", "management", "doctor", "custom-nursing"]);
  assert.deepEqual(groupOf("clinical", settings).days, [31, 34, 35, 39], "untouched");
  assert.deepEqual(groupOf("admin", settings).days, [22, 25, 30, 35], "changed");
  assert.equal(groupOf("custom-nursing", settings).custom, true);
  assert.equal(groupOf("custom-nursing", {}), null, "a group that is not in the year's settings is not known");
  // a full-time nurse with 10 years' service: 38 days + 10 bank holidays (the policy's 33 + 5 IPR + bank holidays)
  const nurse = { leaveGroup: "custom-nursing", serviceFrom: "2010-01-01", patterns: full() };
  const r = calculateEntitlement(nurse, Y, settings);
  assert.equal(r.ready, true);
  near(r.annual, 38 * 7.5); near(r.bankHolidayAmount, 75); assert.equal(r.rounded, 285 + 75);
  assert.equal(r.groupLabel, "Nursing");
  // the days at each level apply as people move up: 28 under five years, 34 from five, 38 from ten
  assert.equal(calculateEntitlement({ ...nurse, serviceFrom: "2026-04-01" }, Y, settings).rounded, 28 * 7.5 + 75);
  assert.equal(calculateEntitlement({ ...nurse, serviceFrom: "2020-01-01" }, Y, settings).rounded, 34 * 7.5 + 75);
  // an unknown group asks for one rather than guessing
  assert.equal(calculateEntitlement({ ...nurse, leaveGroup: "custom-gone" }, Y, settings).ready, false);
});

t("a person can be given extra days (or fewer) for the year with a reason, shared out like the rest of their leave", () => {
  const base = { leaveGroup: "clinical", serviceFrom: "2010-01-01", patterns: full() };
  const withExtra = (extra, p = base) => calculateEntitlement({ ...p, leaveAdjust: { "2026-27": { extraDays: extra, extraReason: "  IPR days " } } }, Y);
  const plain = calculateEntitlement(base, Y);
  const plus = withExtra(5);
  near(plus.annual - plain.annual, 5 * 7.5);
  assert.deepEqual([plus.extraDays, plus.extraReason], [5, "IPR days"]);
  assert.equal(plus.segments[0].fullTimeHours, 292.5 + 37.5);
  near(withExtra(-2).annual - plain.annual, -15);
  // part-time people get their share: 3 days a week, 5 extra days -> 5 x 7.5 x 0.6
  const partTime = { ...base, patterns: [pattern("2020-01-01", ["mon", "tue", "wed"])] };
  near(withExtra(5, partTime).annual - calculateEntitlement(partTime, Y).annual, 5 * 7.5 * 0.6);
  // and only for the part of the year they are here
  const starter = { ...base, startDate: "2026-10-01" };
  near(withExtra(5, starter).annual - calculateEntitlement(starter, Y).annual, 5 * 7.5 * 182 / 365);
  // never below nothing, whatever is typed
  assert.equal(calculateEntitlement({ ...base, leaveAdjust: { "2026-27": { extraDays: -500 } } }, Y).extraDays, -60);
  assert.ok(calculateEntitlement({ ...base, leaveAdjust: { "2026-27": { extraDays: -60 } } }, Y).annual >= 0);
  // a doctor's extra days are added to the days typed in
  const doc = calculateEntitlement({ leaveGroup: "doctor", leaveSessions: 8, leaveAdjust: { "2026-27": { fixedDays: 30, extraDays: 2 } } }, Y, { gpMaxSessions: 8 });
  assert.deepEqual([doc.rounded, doc.bankHolidayDays], [32 + 10, 10]);
});

t("the groups and extra days are cleaned before they are saved", () => {
  const s = cleanYearSettings({ groups: [
    { key: "custom-nursing", label: "  Nursing  ", days: ["28", 34, 38, "38.5"] },
    { key: "clinical", label: "", days: [30, 32, 34, 36] },
    { key: "doctor", label: "x", days: [1, 2, 3, 4] },
    { key: "custom-nursing", label: "again", days: [1, 2, 3, 4] },
    { key: "Evil Group!", label: "x", days: [1, 2, 3, 4] },
    { key: "admin", label: "Admin", days: [1, 2, 3] },
    { key: "management", label: "M", days: [999, -4, "x", 20] },
  ] });
  assert.deepEqual(s.groups.map((g) => g.key), ["custom-nursing", "clinical", "management"], "no doctor, no repeats, nothing odd, four numbers each");
  assert.deepEqual(s.groups[0], { key: "custom-nursing", label: "Nursing", days: [28, 34, 38, 38.5] });
  assert.equal(s.groups[1].label, "Clinical", "a blank name falls back to the standard one");
  assert.deepEqual(s.groups[2].days, [100, 0, 0, 20], "kept within 0 to 100");
  assert.equal(cleanYearSettings({ groups: Array.from({ length: 30 }, (_, i) => ({ key: `custom-g${i}`, label: "g", days: [1, 2, 3, 4] })) }).groups.length, 12);
  assert.deepEqual(cleanLeaveFields({ leaveGroup: "custom-nursing" }), { leaveGroup: "custom-nursing" });
  assert.deepEqual(cleanLeaveFields({ leaveGroup: "custom-Bad Name" }), { leaveGroup: "" });
  assert.deepEqual(cleanLeaveFields({ leaveAdjust: { "2026-27": { extraDays: "-3", extraReason: "x".repeat(100) } } }).leaveAdjust["2026-27"].extraDays, -3);
  assert.equal(cleanLeaveFields({ leaveAdjust: { "2026-27": { extraReason: "x".repeat(100) } } }).leaveAdjust["2026-27"].extraReason.length, 60);
});

console.log(`\n${n} passed`);
