import assert from "node:assert/strict";
import { STATUS, addMonths, buildMatrix, courseSummary, daysUntil, dueOf, filterMatrix, fromExcelSerial, reminderItems, statusOf, tally } from "../src/modules/training/training.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const now = new Date(2026, 9, 14); // 14 October 2026

t("dates: months are added to the end of a short month, and Excel's day numbers read as dates", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2024-01-31", 1), "2024-02-29");
  assert.equal(addMonths("2026-10-14", 12), "2027-10-14");
  assert.equal(addMonths("2026-10-14", 36), "2029-10-14");
  assert.equal(addMonths("nonsense", 12), "");
  assert.equal(fromExcelSerial(46023), "2026-01-01");
  assert.equal(fromExcelSerial(46753), "2028-01-01");
  assert.equal(fromExcelSerial(730), "", "a number of days is not a date");
  assert.equal(fromExcelSerial(1), "");
  assert.equal(fromExcelSerial("x"), "");
  assert.equal(daysUntil("2026-10-15", now), 1);
  assert.equal(daysUntil("2026-10-13", now), -1);
});

t("a record runs out on its due date, or its completed date plus the course's interval; once-only never does", () => {
  const yearly = { id: "c", intervalMonths: 12 };
  assert.equal(dueOf({ completedOn: "2026-03-01" }, yearly), "2027-03-01");
  assert.equal(dueOf({ completedOn: "2026-03-01", dueOn: "2027-06-30" }, yearly), "2027-06-30", "a date given wins");
  assert.equal(dueOf({ completedOn: "2026-03-01" }, { intervalMonths: 0 }), "");
  assert.equal(dueOf(null, yearly), "");
});

t("the traffic light: green, amber within 60 days, red once past, blue and purple as marked, grey with nothing", () => {
  const yearly = { id: "c", intervalMonths: 12 };
  assert.equal(statusOf({ completedOn: "2026-06-01" }, yearly, now), STATUS.inDate);
  assert.equal(statusOf({ completedOn: "2025-12-01" }, yearly, now), STATUS.dueSoon, "runs out 1 Dec 2026");
  assert.equal(statusOf({ completedOn: "2025-10-14" }, yearly, now), STATUS.dueSoon, "due today is not yet overdue");
  assert.equal(statusOf({ completedOn: "2025-10-13" }, yearly, now), STATUS.overdue);
  assert.equal(statusOf({ completedOn: "2024-01-01" }, { intervalMonths: 0 }, now), STATUS.inDate, "once only");
  assert.equal(statusOf({ dueOn: "2027-12-30" }, yearly, now), STATUS.inDate, "only a due date given");
  assert.equal(statusOf({ status: "not-required" }, yearly, now), STATUS.notRequired);
  assert.equal(statusOf({ status: "on-leave", completedOn: "2020-01-01" }, yearly, now), STATUS.onLeave, "away overrides an old date");
  assert.equal(statusOf(null, yearly, now), STATUS.none);
  assert.equal(statusOf({}, yearly, now), STATUS.none);
});

const people = [
  { id: "p1", name: "Ann Nurse", jobRole: "Nurse", group: "clinical", uid: "u1", active: true },
  { id: "p2", name: "Bob Admin", jobRole: "Admin", group: "admin", uid: "", active: true },
  { id: "p3", name: "Cat Left", jobRole: "HCA", group: "clinical", active: false },
];
const courses = [{ id: "ig", name: "Information governance", intervalMonths: 24 }, { id: "bls", name: "Basic life support", intervalMonths: 12 }];
const records = [
  { personId: "p1", courseId: "ig", completedOn: "2024-12-01" },
  { personId: "p1", courseId: "bls", completedOn: "2025-09-01" },
  { personId: "p2", courseId: "ig", completedOn: "2026-01-01" },
  { personId: "p3", courseId: "ig", completedOn: "2020-01-01" },
];

t("the matrix is everyone against every course, and the tally counts each light", () => {
  const matrix = buildMatrix({ people, courses, records, now });
  assert.deepEqual(matrix[0].cells.map((c) => c.status), [STATUS.dueSoon, STATUS.overdue]);
  assert.deepEqual(matrix[1].cells.map((c) => c.status), [STATUS.inDate, STATUS.none]);
  assert.equal(matrix[0].cells[0].due, "2026-12-01");
  const all = tally(matrix.flatMap((r) => r.cells));
  assert.deepEqual([all[STATUS.inDate], all[STATUS.dueSoon], all[STATUS.overdue], all[STATUS.none]], [1, 1, 2, 2]);
  assert.equal(all.dated, 4);
  assert.equal(tally([]).percentInDate, 100, "nothing recorded is not 0%");
});

t("filters: by group, by name or role, and only the people with something due or overdue", () => {
  const matrix = buildMatrix({ people, courses, records, now });
  assert.deepEqual(filterMatrix(matrix, { group: "admin" }).map((r) => r.person.id), ["p2"]);
  assert.deepEqual(filterMatrix(matrix, { search: "nurse" }).map((r) => r.person.id), ["p1"]);
  assert.deepEqual(filterMatrix(matrix, { onlyProblems: true }).map((r) => r.person.id), ["p1", "p3"]);
  assert.equal(filterMatrix(matrix, {}).length, 3);
});

t("reminders list only dated records of people still working here, soonest first, with the account to tell", () => {
  const items = reminderItems({ people, courses, records, now });
  assert.deepEqual(items.map((i) => [i.personName, i.courseName, i.kind]), [["Ann Nurse", "Basic life support", "overdue"], ["Ann Nurse", "Information governance", "due-soon"]]);
  assert.equal(items[0].uid, "u1");
  assert.ok(items[0].days < 0 && items[1].days > 0);
  assert.ok(!items.some((i) => i.personId === "p3"), "someone who has left is not reminded");
  assert.ok(!items.some((i) => i.personId === "p2" && i.courseId === "bls"), "a blank is a gap, not an expiry");
});

t("the course summary for the inspection pack has counts and no names", () => {
  const summary = courseSummary({ people, courses, records, now });
  assert.deepEqual(summary.map((s) => [s.course.id, s[STATUS.inDate], s[STATUS.dueSoon], s[STATUS.overdue], s[STATUS.none]]), [["ig", 1, 1, 0, 0], ["bls", 0, 0, 1, 1]]);
  assert.ok(!JSON.stringify(summary).includes("Ann"));
});

console.log(`\n${n} passed`);
