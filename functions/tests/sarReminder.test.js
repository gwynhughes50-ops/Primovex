const test = require("node:test");
const assert = require("node:assert/strict");
const { remindScope, mayRemind, dueText, chaseRow, sortRows, buildReminderNotification, listSarsToChase, sendSarReminder, londonDay } = require("../services/sarReminderService");

const NOW = new Date(Date.UTC(2026, 10, 13, 10, 0, 0)); // Fri 13 Nov 2026
const day = (offset) => new Date(Date.UTC(2026, 10, 13 + offset, 12, 0, 0));

// ---- a small in-memory database with what the service uses ----
function fakeDb(seed = {}) {
  const store = new Map(Object.entries(seed));
  let auto = 0;
  const plain = (value) => JSON.parse(JSON.stringify(value, (k, v) => (v && v._methodName ? `<${v._methodName}>` : v)));
  const docRef = (path) => ({
    path, id: path.split("/").pop(),
    get: async () => ({ exists: store.has(path), id: path.split("/").pop(), data: () => store.get(path), ref: docRef(path) }),
    set: async (value) => { store.set(path, plain(value)); },
    update: async (value) => { store.set(path, { ...store.get(path), ...plain(value) }); },
    collection: (name) => collectionRef(`${path}/${name}`),
  });
  const rowsOf = (path) => [...store.entries()].filter(([p]) => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes("/")).map(([p, d]) => ({ id: p.split("/").pop(), data: () => d, ref: docRef(p) }));
  const collectionRef = (path, filters = []) => ({
    doc: (id) => docRef(`${path}/${id || `auto${String(++auto).padStart(6, "0")}`}`),
    add: async (value) => { const ref = docRef(`${path}/auto${String(++auto).padStart(6, "0")}`); await ref.set(value); return ref; },
    where: (field, op, value) => collectionRef(path, [...filters, { field, op, value }]),
    get: async () => ({
      docs: rowsOf(path).filter((d) => filters.every(({ field, op, value }) => {
        const have = d.data()[field];
        if (op === "not-in") return have !== undefined && !value.includes(have);
        if (op === "in") return value.includes(have);
        if (op === "==") return have === value;
        throw new Error(`unsupported ${op}`);
      })),
    }),
  });
  return { store, collection: (name) => collectionRef(name) };
}

const people = {
  "users/pm": { displayName: "Gwyn Hughes", role: "Practice Manager", active: true },
  "users/lm": { displayName: "Lee Manager", role: "User", active: true },
  "users/other": { displayName: "Olive Other", role: "User", active: true },
  "users/craig": { displayName: "Craig Assignee", role: "User", active: true, reportsTo: ["lm"] },
  "users/dee": { displayName: "Dee Assignee", role: "User", active: true, reportsTo: "other" },
  "users/gone": { displayName: "Gone", role: "User", active: false, reportsTo: ["lm"] },
};
const sar = (over = {}) => ({ reference: "SAR-2026-007", requestTypeLabel: "Subject access", status: "in_progress", assignedToUid: "craig", assignedToName: "Craig Assignee", dueDate: day(2), patientInitials: "AB", emisNumber: "123456", informationRequired: "Secret detail", ...over });
const world = (sars = {}) => fakeDb({ ...people, ...Object.fromEntries(Object.entries(sars).map(([id, s]) => [`governance_sars/${id}`, s])) });
const profileOf = (uid) => ({ ...people[`users/${uid}`] });

test("who may remind: the Practice Manager for anyone, a line manager only for the people who report to them", () => {
  const users = Object.entries(people).map(([p, u]) => ({ id: p.split("/")[1], ...u }));
  const pm = remindScope({ uid: "pm", profile: profileOf("pm"), users });
  assert.equal(pm.all, true);
  assert.equal(mayRemind(pm, "craig"), true);
  const lm = remindScope({ uid: "lm", profile: profileOf("lm"), users });
  assert.deepEqual(lm, { all: false, assigneeUids: ["craig"] }, "reportsTo as a list; the inactive person is left out");
  assert.equal(mayRemind(lm, "craig"), true);
  assert.equal(mayRemind(lm, "dee"), false);
  const older = remindScope({ uid: "other", profile: profileOf("other"), users });
  assert.deepEqual(older.assigneeUids, ["dee"], "reportsTo as a single older string still counts");
  const nobody = remindScope({ uid: "craig", profile: profileOf("craig"), users });
  assert.equal(nobody.all, false);
  assert.deepEqual(nobody.assigneeUids, []);
  assert.equal(mayRemind(nobody, ""), false, "no assignee, no reminder");
});

test("a row in the list has no patient details", () => {
  const row = chaseRow({ id: "s1", ...sar(), lastReminderAt: day(-1), lastReminderByName: "Lee Manager", reminderCount: 2 }, NOW);
  assert.deepEqual(Object.keys(row).sort(), ["assignedToName", "assignedToUid", "daysLeft", "dueDate", "dueLabel", "id", "lastReminderAt", "lastReminderByName", "reference", "remindedToday", "reminderCount", "requestTypeLabel", "status"]);
  assert.equal(row.daysLeft, 2);
  assert.equal(row.dueLabel, "15/11/2026");
  assert.equal(row.remindedToday, false);
  assert.ok(!JSON.stringify(row).includes("AB") || !JSON.stringify(row).includes("Secret"), "no initials or request details");
  for (const secret of ["123456", "Secret detail", "\"AB\""]) assert.ok(!JSON.stringify(row).includes(secret), secret);
});

test("the wording is fixed, built from the SAR, and goes critical once overdue", () => {
  assert.equal(dueText(-1), "is overdue by 1 day");
  assert.equal(dueText(-4), "is overdue by 4 days");
  assert.equal(dueText(0), "is due today");
  assert.equal(dueText(1), "is due tomorrow");
  assert.equal(dueText(5), "is due in 5 days");
  const soon = buildReminderNotification({ sarId: "s1", sar: sar(), senderUid: "lm", senderName: "Lee Manager", now: NOW });
  assert.equal(soon.id, `sar-reminder-s1-craig-${londonDay(NOW)}`);
  assert.equal(soon.data.title, "Reminder: SAR SAR-2026-007 needs prioritising");
  assert.equal(soon.data.message, "Lee Manager is reminding you that this Subject access request is due in 2 days (15/11/2026). Please prioritise it.");
  assert.equal(soon.data.priority, "high");
  assert.equal(soon.data.recipientUid, "craig");
  assert.equal(soon.data.createdByUid, "lm");
  const late = buildReminderNotification({ sarId: "s1", sar: sar({ dueDate: day(-3) }), senderUid: "lm", senderName: "Lee Manager", now: NOW });
  assert.equal(late.data.priority, "critical");
  assert.match(late.data.message, /is overdue by 3 days/);
  assert.ok(!JSON.stringify(soon).includes("Secret detail") && !JSON.stringify(soon).includes("123456"));
});

test("the list is most urgent first", () => {
  const rows = sortRows([
    chaseRow({ id: "b", ...sar({ reference: "B", dueDate: day(5) }) }, NOW),
    chaseRow({ id: "c", ...sar({ reference: "C", dueDate: null }) }, NOW),
    chaseRow({ id: "a", ...sar({ reference: "A", dueDate: day(-2) }) }, NOW),
  ]);
  assert.deepEqual(rows.map((r) => r.reference), ["A", "B", "C"]);
});

test("the Practice Manager's list: every live SAR with someone assigned, not the finished or unassigned ones", async () => {
  const db = world({
    s1: sar(), s2: sar({ reference: "S2", assignedToUid: "dee", assignedToName: "Dee Assignee" }),
    s3: sar({ reference: "S3", status: "completed" }), s4: sar({ reference: "S4", assignedToUid: "", assignedToName: "Unassigned", status: "new" }),
  });
  const out = await listSarsToChase({ db, uid: "pm", profile: profileOf("pm"), now: NOW });
  assert.equal(out.canChase, true);
  assert.deepEqual(out.rows.map((r) => r.id).sort(), ["s1", "s2"]);
});

test("a line manager's list: only SARs assigned to people who report to them; someone with no reports has no list at all", async () => {
  const db = world({ s1: sar(), s2: sar({ reference: "S2", assignedToUid: "dee", assignedToName: "Dee Assignee" }), s3: sar({ reference: "S3", status: "archived" }) });
  const lm = await listSarsToChase({ db, uid: "lm", profile: profileOf("lm"), now: NOW });
  assert.equal(lm.canChase, true);
  assert.deepEqual(lm.rows.map((r) => r.id), ["s1"]);
  const nobody = await listSarsToChase({ db, uid: "craig", profile: profileOf("craig"), now: NOW });
  assert.deepEqual(nobody, { canChase: false, rows: [] });
});

test("sending: the assignee gets the notification, the SAR records who reminded and when, and its history says so", async () => {
  const db = world({ s1: sar() });
  const out = await sendSarReminder({ db, uid: "lm", profile: profileOf("lm"), sarId: "s1", now: NOW });
  assert.deepEqual(out, { sent: true, assigneeName: "Craig Assignee" });
  const notes = [...db.store.entries()].filter(([p]) => p.startsWith("users/craig/notifications/"));
  assert.equal(notes.length, 1);
  assert.equal(notes[0][1].kind, "sar-reminder");
  assert.equal(notes[0][1].createdByName, "Lee Manager");
  const saved = db.store.get("governance_sars/s1");
  assert.equal(saved.lastReminderByUid, "lm");
  assert.equal(saved.lastReminderByName, "Lee Manager");
  assert.ok(saved.lastReminderAt, "the time is stamped by the server");
  const activity = [...db.store.entries()].filter(([p]) => p.startsWith("governance_sar_activity/"));
  assert.equal(activity.length, 1);
  assert.equal(activity[0][1].type, "reminder");
  assert.ok(!JSON.stringify(activity).includes("Secret detail"));
});

test("the Practice Manager can remind about any SAR", async () => {
  const db = world({ s2: sar({ assignedToUid: "dee", assignedToName: "Dee Assignee" }) });
  const out = await sendSarReminder({ db, uid: "pm", profile: profileOf("pm"), sarId: "s2", now: NOW });
  assert.equal(out.sent, true);
  assert.equal(db.store.get("users/dee/notifications/" + `sar-reminder-s2-dee-${londonDay(NOW)}`).createdByName, "Gwyn Hughes");
});

test("nobody else can: not another manager, not the assignee, and not for a finished, unassigned or missing SAR", async () => {
  const db = world({ s1: sar(), done: sar({ status: "completed" }), none: sar({ assignedToUid: "", status: "new" }), mine: sar({ assignedToUid: "lm", assignedToName: "Lee" }) });
  const deny = (promise, code) => assert.rejects(promise, (e) => e.code === code, code);
  await deny(sendSarReminder({ db, uid: "other", profile: profileOf("other"), sarId: "s1", now: NOW }), "permission-denied");
  await deny(sendSarReminder({ db, uid: "craig", profile: profileOf("craig"), sarId: "s1", now: NOW }), "failed-precondition");
  await deny(sendSarReminder({ db, uid: "lm", profile: profileOf("lm"), sarId: "done", now: NOW }), "failed-precondition");
  await deny(sendSarReminder({ db, uid: "lm", profile: profileOf("lm"), sarId: "none", now: NOW }), "failed-precondition");
  await deny(sendSarReminder({ db, uid: "lm", profile: profileOf("lm"), sarId: "mine", now: NOW }), "failed-precondition");
  await deny(sendSarReminder({ db, uid: "lm", profile: profileOf("lm"), sarId: "nope", now: NOW }), "not-found");
  await deny(sendSarReminder({ db, uid: "lm", profile: profileOf("lm"), sarId: "", now: NOW }), "invalid-argument");
  assert.equal([...db.store.keys()].filter((p) => p.includes("/notifications/")).length, 0, "nothing was sent");
});

test("a role is not enough: someone claiming to be the Practice Manager in the request changes nothing, only the stored profile counts", async () => {
  const db = world({ s1: sar() });
  // the service takes the profile read from the database by the caller; a different manager's profile is just that manager's
  await assert.rejects(sendSarReminder({ db, uid: "other", profile: profileOf("other"), sarId: "s1", now: NOW }), (e) => e.code === "permission-denied");
});

test("one reminder a day for a SAR: a second the same London day is declined and says who sent the first", async () => {
  const db = world({ s1: sar() });
  assert.equal((await sendSarReminder({ db, uid: "lm", profile: profileOf("lm"), sarId: "s1", now: NOW })).sent, true);
  // the fake stores the server stamp as a marker, so put in a real time for the check
  db.store.set("governance_sars/s1", { ...db.store.get("governance_sars/s1"), lastReminderAt: NOW });
  const again = await sendSarReminder({ db, uid: "pm", profile: profileOf("pm"), sarId: "s1", now: new Date(NOW.getTime() + 3 * 3600 * 1000) });
  assert.deepEqual(again, { sent: false, reason: "already-today", lastReminderByName: "Lee Manager" });
  const tomorrow = await sendSarReminder({ db, uid: "pm", profile: profileOf("pm"), sarId: "s1", now: new Date(NOW.getTime() + 24 * 3600 * 1000) });
  assert.equal(tomorrow.sent, true);
});

test("a deactivated assignee is not reminded", async () => {
  const db = world({ s1: sar({ assignedToUid: "gone", assignedToName: "Gone" }) });
  await assert.rejects(sendSarReminder({ db, uid: "pm", profile: profileOf("pm"), sarId: "s1", now: NOW }), (e) => e.code === "failed-precondition");
});
