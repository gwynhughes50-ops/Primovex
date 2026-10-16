import assert from "node:assert/strict";
import { brightDate, parseCsv, parseHolidayReport, planStaffImport, staffKey } from "../src/modules/timesheets/brightHr.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };

const HEADER = "First Name,Middle Name,Last Name,Team(s),Job Title,Contract Type,Payroll No,Terminated,Start Date,Year Start,Year End,Holiday Entitlement (including Carry Over),Taken,Upcoming,Awaiting Approval,Remaining,Carried Over";
const REPORT = [
  "Holiday Summary Report (Days)", "Period,Date run (GMT/UTC),Time run (GMT/UTC)", "Current Holiday Year,16-Oct-2026,8:11:24 AM", "", "", "", "Company", "Example Surgery", "",
  HEADER,
  "Dora,,Doctor,Clinicians,General Practitioner,Full-Time,,No,10-Aug-2022,01-Apr-2026,31-Mar-2027,38.50,26.50,11.00,1.00,0.00,9.00",
  "", "", "",
  "Holiday Summary Report (Hours)", "Period,Date run (GMT/UTC),Time run (GMT/UTC)", "Current Holiday Year,16-Oct-2026,8:11:24 AM", "", "", "", "Company", "Example Surgery", "",
  HEADER,
  "Ann,Marie,Example,Management; Business Team,Senior Management Assistant,,32,No,03-Sep-2001,01-Apr-2026,31-Mar-2027,151.00,61.00,15.00,0.00,75.00,4.00",
  "Bea,,Sample,PCA,Patient Care Administrator,Part-Time,18,No,29-Aug-2000,01-Apr-2026,31-Mar-2027,196.00,109.50,38.00,0.00,48.50,0.00",
  "Cal,,Twin,Clinicians,Practice Nurse,Full-Time,18,No,01-Jan-2001,01-Jan-2026,31-Dec-2026,220.50,136.50,48.00,0.00,\"\t-5.00\",0.00",
  "Dee,,Gone,Clinicians,,,,Yes,01-Jan-2010,01-Apr-2026,31-Mar-2027,0,0,0,0,0,0",
  "", "", "",
].join("\r\n");

t("a BrightHR date and a CSV with quotes read properly", () => {
  assert.equal(brightDate("10-Aug-2022"), "2022-08-10");
  assert.equal(brightDate("31-Feb-2022"), "");
  assert.equal(brightDate("soon"), "");
  assert.deepEqual(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3'), [["a", "b, c", 'say "hi"'], ["1", "2", "3"]]);
});

t("the holiday report's hours and days blocks are read separately, with the date it was run", () => {
  const out = parseHolidayReport(REPORT);
  assert.equal(out.asAt, "2026-10-16");
  assert.deepEqual(out.sections.map((s) => [s.unit, s.people.length]), [["days", 1], ["hours", 4]]);
  const ann = out.sections[1].people[0];
  assert.deepEqual([ann.name, ann.middleName, ann.teams, ann.jobTitle, ann.payrollNo, ann.startDate, ann.leaveYearFrom, ann.entitlement, ann.taken, ann.upcoming, ann.remaining, ann.carriedOver], ["Ann Example", "Marie", ["Management", "Business Team"], "Senior Management Assistant", "32", "2001-09-03", "2026-04-01", 151, 61, 15, 75, 4]);
  assert.equal(out.sections[1].people[2].remaining, -5, "a quoted value with a tab and a minus sign");
  assert.equal(out.sections[1].people[3].left, true);
});

t("things worth a second look are listed, not fixed behind your back", () => {
  const notes = parseHolidayReport(REPORT).notes.join(" | ");
  assert.match(notes, /Payroll number 18 is on 2 people in the hours report \(Bea Sample, Cal Twin\)/);
  assert.match(notes, /have no contract type/);
  assert.match(notes, /1 people in the hours report have a leave year that does not start on 1 April/);
  assert.match(notes, /1 people in the hours report have taken more leave than they are entitled to/);
});

t("names match on first and last name, ignoring a middle name and case", () => {
  assert.equal(staffKey("Karen Wyn Shaw"), staffKey("karen  SHAW"));
  assert.notEqual(staffKey("Karen Shaw"), staffKey("Karen Shore"));
  assert.equal(staffKey(""), "");
});

t("an import adds new people and updates the HR facts of existing ones, and never touches their pattern, account or manager", () => {
  const people = parseHolidayReport(REPORT).sections[1].people;
  const existing = [{ id: "ts-ann-example", name: "Ann Example", uid: "u1", managerId: "ts-bea-sample", patterns: [{ from: "2026-01-05" }], jobTitle: "Old title" }];
  const plan = planStaffImport(people, existing, { unit: "hours", asAt: "2026-10-16" });
  assert.deepEqual(plan.updated.map((u) => u.id), ["ts-ann-example"]);
  assert.equal(plan.updated[0].hr.jobTitle, "Senior Management Assistant");
  assert.equal(plan.updated[0].hr.leave.remaining, 75);
  assert.equal(plan.updated[0].hr.leave.asAt, "2026-10-16");
  assert.ok(!("uid" in plan.updated[0].hr) && !("patterns" in plan.updated[0].hr) && !("managerId" in plan.updated[0].hr));
  assert.deepEqual(plan.added.map((a) => a.id), ["ts-bea-sample", "ts-cal-twin", "ts-dee-gone"]);
  assert.equal(plan.added[2].hr.active, false, "someone marked as terminated is added as left");
  const twice = planStaffImport(people, [...existing, ...plan.added.map((a) => ({ id: a.id, name: a.name }))]);
  assert.equal(twice.added.length, 0, "running it again adds nobody");
  const same = planStaffImport([{ ...people[0], name: "Sam Same" }, { ...people[1], name: "Sam Same" }], []);
  assert.deepEqual(same.added.map((a) => a.id), ["ts-sam-same"], "two rows for one name are one person");
});

console.log(`\n${n} passed`);
