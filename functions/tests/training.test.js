const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const svc = require("../services/trainingReminderService");

const NOW = new Date(2026, 9, 14); // Wednesday 14 October 2026
const MONDAY = new Date(2026, 9, 12);

// the same sample the app's own tests use, so the two stay in step
const people = [
  { id: "p1", name: "Ann Nurse", group: "clinical", uid: "u1", active: true },
  { id: "p2", name: "Bob Admin", group: "admin", uid: "", active: true },
  { id: "p3", name: "Cat Left", group: "clinical", uid: "u3", active: false },
  { id: "p4", name: "Dee Admin", group: "admin", uid: "u4", active: true },
];
const courses = [{ id: "ig", name: "Information governance", intervalMonths: 24 }, { id: "bls", name: "Basic life support", intervalMonths: 12 }, { id: "once", name: "Once", intervalMonths: 0 }];
const records = [
  { id: "p1_ig", personId: "p1", courseId: "ig", completedOn: "2024-12-01" },
  { id: "p1_bls", personId: "p1", courseId: "bls", completedOn: "2025-09-01" },
  { id: "p2_ig", personId: "p2", courseId: "ig", completedOn: "2026-01-01" },
  { id: "p3_ig", personId: "p3", courseId: "ig", completedOn: "2020-01-01" },
  { id: "p4_ig", personId: "p4", courseId: "ig", completedOn: "2024-11-20" },
  { id: "p4_bls", personId: "p4", courseId: "bls", status: "not-required" },
  { id: "p4_once", personId: "p4", courseId: "once", completedOn: "2010-01-01" },
];

test("the server's rules for a record agree with the app's, on every combination of the sample", async () => {
  const client = await import(pathToFileURL(path.resolve(__dirname, "../../src/modules/training/training.js")).href);
  const cases = [];
  for (const person of people) for (const course of courses) cases.push({ person, course, record: records.find((r) => r.personId === person.id && r.courseId === course.id) || null });
  for (const { course, record } of cases) {
    const clientStatus = client.statusOf(record, course, NOW);
    const serverKind = svc.lightOf(record, course, NOW);
    const expected = clientStatus === "overdue" ? "overdue" : clientStatus === "due-soon" ? "due-soon" : "";
    assert.equal(serverKind, expected, `${record?.id || "no record"} ${course.id}`);
    assert.equal(svc.dueOf(record, course), client.dueOf(record, course));
  }
  assert.equal(svc.addMonths("2026-01-31", 1), client.addMonths("2026-01-31", 1));
  assert.equal(svc.addMonths("2024-01-31", 1), client.addMonths("2024-01-31", 1));
  const mine = svc.reminderItems({ people, courses, records, now: NOW }).map((i) => [i.personId, i.courseName, i.kind]).sort();
  const theirs = client.reminderItems({ people, courses, records, now: NOW }).map((i) => [i.personId, i.courseName, i.kind]).sort();
  assert.deepEqual(mine, theirs);
});

test("reminders cover only dated records of people still working here", () => {
  const items = svc.reminderItems({ people, courses, records, now: NOW });
  assert.deepEqual(items.map((i) => `${i.personId}:${i.courseName}:${i.kind}`), ["p1:Basic life support:overdue", "p4:Information governance:due-soon", "p1:Information governance:due-soon"]);
  assert.ok(!items.some((i) => i.personId === "p3"), "someone who has left");
  assert.ok(!items.some((i) => i.personId === "p4" && i.courseName === "Basic life support"), "not required");
  assert.ok(!items.some((i) => i.courseName === "Once"), "once only never expires");
  assert.ok(items.every((i, n) => n === 0 || items[n - 1].days <= i.days), "soonest first");
});

test("a person is told once for each date, in one notice, overdue first", () => {
  const mine = svc.reminderItems({ people, courses, records, now: NOW }).filter((i) => i.personId === "p1");
  const notice = svc.personNotice(mine);
  assert.equal(notice.title, "Training overdue");
  assert.match(notice.message, /Overdue: Basic life support \(ran out 01\/09\/2026\)\./);
  assert.match(notice.message, /Coming up: Information governance \(runs out 01\/12\/2026\)\./);
  const told = mine.map((i) => ({ ...i, notified: i.kind === "overdue" ? { overdue: i.due } : { soon: i.due } }));
  assert.equal(svc.personNotice(told), null, "already told for those dates");
  const newDate = told.map((i) => ({ ...i, due: "2026-11-01" }));
  assert.ok(svc.personNotice(newDate), "a new date is news again");
  const many = Array.from({ length: 5 }, (_, n) => ({ kind: "due-soon", courseName: `Course ${n}`, due: "2026-12-01", notified: {} }));
  assert.match(svc.personNotice(many).message, /and 2 more/);
});

// a small fake database
function fakeDb() {
  const store = new Map();
  const add = (path, value) => store.set(path, value);
  people.forEach((p) => add(`training_people/${p.id}`, p));
  courses.forEach((c) => add(`training_courses/${c.id}`, c));
  records.forEach((r) => add(`training_records/${r.id}`, r));
  const sent = [];
  const col = (name) => ({
    get: async () => ({ docs: [...store.entries()].filter(([k]) => k.startsWith(`${name}/`) && !k.slice(name.length + 1).includes("/")).map(([k, v]) => ({ id: k.slice(name.length + 1), data: () => v })) }),
    doc: (id) => ({
      update: async (patch) => { store.set(`${name}/${id}`, { ...store.get(`${name}/${id}`), ...patch }); },
      collection: (sub) => ({ add: async (doc) => { sent.push({ uid: id, ...doc }); } }),
    }),
  });
  return { store, sent, collection: col };
}
const FieldValue = { serverTimestamp: () => "now" };

test("the daily run tells people once, marks what it told, and does not repeat the next day", async () => {
  const db = fakeDb();
  const first = await svc.runTrainingReminders({ db, FieldValue, now: NOW });
  assert.deepEqual(first, { people: 2, managers: 0 }, "Ann and Dee have accounts and something due; Bob has none");
  assert.deepEqual(db.sent.map((n) => n.uid).sort(), ["u1", "u4"]);
  assert.equal(db.sent.find((n) => n.uid === "u4").title, "Training due soon");
  assert.equal(db.store.get("training_records/p1_bls").notified.overdue, "2026-09-01");
  const second = await svc.runTrainingReminders({ db, FieldValue, now: new Date(2026, 9, 15) });
  assert.deepEqual(second, { people: 0, managers: 0 });
});

test("on Mondays the people who look after training get a count with no names, the clinical lead only the clinical team's", async () => {
  const db = fakeDb();
  const managers = [{ uid: "pm", scope: "all" }, { uid: "nm", scope: "clinical" }, { uid: "quiet", scope: "all" }];
  const result = await svc.runTrainingReminders({ db, FieldValue, now: MONDAY, managers: managers.slice(0, 2) });
  assert.equal(result.managers, 2);
  const pm = db.sent.find((n) => n.uid === "pm" && n.kind === "training-weekly");
  const nm = db.sent.find((n) => n.uid === "nm" && n.kind === "training-weekly");
  assert.match(pm.message, /^1 course is overdue and 2 are due in the next 60 days, across 2 people\.$/);
  assert.match(nm.message, /^1 course is overdue and 1 is due in the next 60 days, across 1 person\.$/);
  assert.ok(!/Ann|Dee|Bob/.test(pm.message + nm.message), "no names");
  assert.equal(pm.actionUrl, "/training");
  const notMonday = await svc.runTrainingReminders({ db: fakeDb(), FieldValue, now: NOW, managers });
  assert.equal(notMonday.managers, 0);
});
