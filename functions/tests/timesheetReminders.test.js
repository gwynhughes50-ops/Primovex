const test = require("node:test");
const assert = require("node:assert/strict");
const { planReminders, statusNotice, runTimesheetReminders, londonDay, daysBetween } = require("../services/timesheetReminderService");

const period = { id: "p1", name: "October payroll", from: "2026-08-31", to: "2026-10-04", due: "2026-10-05" };
const staff = [
  { id: "sa", uid: "ua", name: "Ann Example", active: true, managerUid: "m1" },
  { id: "sb", uid: "ub", name: "Bea Sample", active: true, managerUid: "m1" },
  { id: "sc", uid: null, name: "Cal NoAccount", active: true, managerUid: "m1" },
  { id: "sd", uid: "ud", name: "Dee Left", active: false, managerUid: "m1" },
  { id: "se", uid: "ue", name: "Eve Newstarter", active: true, startDate: "2026-11-01", managerUid: "m1" },
];
const sheets = [{ id: "p1_sb", periodId: "p1", staffId: "sb", uid: "ub", state: "submitted", managerUid: "m1", kind: "no-change" }];
const plan = (today, extra = {}) => planReminders({ today, periods: [period], staff, sheets, managerUids: ["pm"], payrollUids: ["pay"], ...extra });
const toStaff = (list, uid) => list.filter((n) => n.uid === uid && n.kind === "remind");

test("a person who has not sent theirs is reminded 5 days before, 2 days before and on the day; not in between", () => {
  assert.equal(toStaff(plan("2026-09-30"), "ua")[0].message.includes("due in 5 days (05/10/2026)"), true);
  assert.equal(toStaff(plan("2026-10-01"), "ua").length, 0, "4 days before");
  assert.equal(toStaff(plan("2026-10-02"), "ua").length, 0, "3 days before");
  assert.match(toStaff(plan("2026-10-03"), "ua")[0].message, /due in 2 days/);
  assert.equal(toStaff(plan("2026-09-20"), "ua").length, 0, "too early");
  const dueDay = toStaff(plan("2026-10-05"), "ua")[0];
  assert.equal(dueDay.title, "Timesheet due today");
  assert.equal(dueDay.priority, "high");
});

test("once it is overdue the reminder comes every day, in plain words, until 14 days", () => {
  for (const today of ["2026-10-06", "2026-10-07", "2026-10-12", "2026-10-19"]) assert.equal(toStaff(plan(today), "ua").length, 1, today);
  const late = toStaff(plan("2026-10-08"), "ua")[0];
  assert.equal(late.title, "Timesheet overdue");
  assert.match(late.message, /3 days overdue/);
  assert.equal(late.priority, "high");
  assert.equal(toStaff(plan("2026-10-20"), "ua").length, 0, "15 days: stop");
});

test("nobody is reminded who has already sent theirs, has left, has not started, or has no account", () => {
  const all = plan("2026-10-06");
  assert.equal(toStaff(all, "ub").length, 0, "already sent");
  assert.equal(toStaff(all, "ud").length, 0, "left");
  assert.equal(toStaff(all, "ue").length, 0, "starts after the period");
  assert.equal(all.filter((n) => n.kind === "remind").length, 1);
});

test("a declined or returned timesheet is reminded as one that needs correcting", () => {
  const declined = [{ id: "p1_sa", periodId: "p1", staffId: "sa", uid: "ua", state: "declined", managerUid: "m1", kind: "changes" }];
  const msg = toStaff(planReminders({ today: "2026-10-06", periods: [period], staff, sheets: declined }), "ua")[0].message;
  assert.match(msg, /was declined and needs correcting and sending again/);
});

test("whoever manages timesheets is told from the day after it is due who is overdue, and who has no account to be reminded on", () => {
  assert.equal(plan("2026-10-05").filter((n) => n.uid === "pm" && n.kind === "overdue").length, 0, "not on the due day");
  const note = plan("2026-10-06").find((n) => n.uid === "pm" && n.kind === "overdue");
  assert.match(note.message, /2 timesheets are overdue for October payroll \(1 day\): Ann Example, Cal NoAccount\./);
  assert.match(note.message, /1 person has no Primovex account linked, so can't be reminded: Cal NoAccount/);
});

test("line managers hear which of their team are overdue only from the third day", () => {
  assert.equal(plan("2026-10-07").some((n) => n.kind === "team-overdue"), false, "2 days");
  const note = plan("2026-10-08").find((n) => n.kind === "team-overdue");
  assert.equal(note.uid, "m1");
  assert.match(note.message, /2 people in your team have not sent their timesheet for October payroll: Ann Example, Cal NoAccount/);
});

test("line managers get a daily count of timesheets waiting for them, and the payroll team of signed-off ones to send", () => {
  const more = [...sheets, { id: "p1_sf", periodId: "p1", staffId: "sf", uid: "uf", state: "submitted", managerUid: "m1", kind: "changes" }, { id: "p1_sg", periodId: "p1", staffId: "sg", uid: "ug", state: "submitted", managerUid: null, kind: "no-change" }, { id: "p1_sh", periodId: "p1", staffId: "sh", uid: "uh", state: "approved", managerUid: "m1", kind: "no-change" }];
  const out = planReminders({ today: "2026-09-01", periods: [period], staff, sheets: more, managerUids: ["pm"], payrollUids: ["pay"] });
  assert.match(out.find((n) => n.uid === "m1" && n.kind === "signoff").message, /^2 timesheets are waiting for you to sign off \(1 with changes\)\.$/);
  assert.match(out.find((n) => n.uid === "pm" && n.kind === "signoff").message, /1 timesheet is waiting with no line manager set, for you to sign off/);
  assert.equal(out.find((n) => n.uid === "pay").message, "1 signed-off timesheet is waiting to be sent to payroll.");
  assert.equal(planReminders({ today: "2026-09-01", periods: [period], staff, sheets: [], managerUids: ["pm"], payrollUids: ["pay"] }).length, 0, "nothing waiting, nothing sent");
});

test("a person is told at once, with the reason, when a timesheet is declined or returned", () => {
  const after = { uid: "ua", from: "2026-08-31", to: "2026-10-04", submissions: 2, decision: { by: "Pat Manager", reason: "Overtime on the 12th was not agreed" } };
  const note = statusNotice({ toState: "declined", timesheetId: "p1_sa", reason: "Overtime on the 12th was not agreed" }, after);
  assert.equal(note.uid, "ua");
  assert.equal(note.title, "Timesheet declined");
  assert.equal(note.message, "Pat Manager declined your timesheet for 31/08/2026 to 04/10/2026: “Overtime on the 12th was not agreed” Please correct it and send it again.");
  assert.equal(note.id, "ts-declined-p1_sa-2");
  const back = statusNotice({ toState: "returned", timesheetId: "p1_sa", reason: "Payroll number is wrong" }, { ...after, payroll: { by: "Payroll" } });
  assert.match(back.message, /^Payroll returned your timesheet/);
  assert.equal(statusNotice({ toState: "approved", timesheetId: "x" }, after), null);
  assert.equal(statusNotice(null, after), null);
});

test("days are counted in London, and a late evening in summer is already tomorrow there", () => {
  assert.equal(londonDay(new Date("2026-10-05T23:30:00Z")), "2026-10-06");
  assert.equal(londonDay(new Date("2026-12-05T23:30:00Z")), "2026-12-05");
  assert.equal(daysBetween("2026-10-01", "2026-10-05"), 4);
  assert.equal(daysBetween("2026-10-06", "2026-10-05"), -1);
});

function fakeDb() {
  const store = new Map();
  const col = (name) => ({
    get: async () => ({ docs: [...store.entries()].filter(([k]) => k.startsWith(`${name}/`) && !k.slice(name.length + 1).includes("/")).map(([k, v]) => ({ id: k.slice(name.length + 1), data: () => v })) }),
    doc: (id) => ({ collection: (sub) => ({ doc: (nid) => ({ create: async (data) => { const key = `users/${id}/${sub}/${nid}`; if (store.has(key)) { const e = new Error("already exists"); e.code = 6; throw e; } store.set(key, data); } }) }) }),
  });
  const db = { collection: col, store };
  const put = (path, v) => store.set(path, v);
  return { db, put, store };
}

test("the daily run writes each notification once, and a second run the same day writes none", async () => {
  const { db, put, store } = fakeDb();
  put("timesheet_periods/p1", period);
  staff.forEach((s) => put(`timesheet_staff/${s.id}`, s));
  sheets.forEach((t) => put(`timesheets/${t.id}`, t));
  const FieldValue = { serverTimestamp: () => "now" };
  const now = new Date("2026-10-08T07:00:00Z"); // 3 days overdue
  const first = await runTimesheetReminders({ db, FieldValue, now, managerUids: ["pm"], payrollUids: ["pay"] });
  assert.ok(first.sent >= 4 && first.sent === first.planned);
  const mine = [...store.entries()].filter(([k]) => k.startsWith("users/ua/notifications/"));
  assert.equal(mine.length, 1);
  assert.equal(mine[0][1].module, "operations");
  assert.equal(mine[0][1].actionUrl, "/my-timesheet");
  assert.equal(mine[0][1].kind, "timesheet-remind");
  const second = await runTimesheetReminders({ db, FieldValue, now, managerUids: ["pm"], payrollUids: ["pay"] });
  assert.equal(second.sent, 0);
  assert.equal(second.planned, first.planned);
  const nextDay = await runTimesheetReminders({ db, FieldValue, now: new Date("2026-10-09T07:00:00Z"), managerUids: ["pm"], payrollUids: ["pay"] });
  assert.ok(nextDay.sent > 0, "a new day sends again");
});
