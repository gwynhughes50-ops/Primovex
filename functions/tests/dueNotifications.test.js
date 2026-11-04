const test = require("node:test");
const assert = require("node:assert/strict");
const { planDueNotifications, sendDueNotifications, daysUntil, dueKey, formatDate } = require("../services/dueNotificationService");

// 07:30 London on Fri 2 Oct 2026 (BST, so 06:30 UTC) - when the daily job runs.
const NOW = new Date(Date.UTC(2026, 9, 2, 6, 30));
// A due date `n` calendar days from NOW, at the given London hour.
const due = (n, londonHour = 12) => new Date(Date.UTC(2026, 9, 2 + n, londonHour - 1, 0)); // BST = UTC+1

const sar = (over = {}) => ({
  id: "s1", reference: "SAR-2026-007", status: "in_progress", requestTypeLabel: "Subject access",
  assignedToUid: "craig", assignedToName: "Craig", managerUid: "liz", dueDate: due(1), ...over,
});
const concern = (over = {}) => ({
  id: "c1", reference: "CN-2026-003", status: "investigation", ownerUid: "craig",
  acknowledgedAt: new Date(), acknowledgementDueAt: due(-30), finalResponseDueAt: due(10), ...over,
});
const ids = (plan) => plan.map((p) => p.id);

test("days are whole calendar days in London, not UTC", () => {
  assert.equal(daysUntil(due(0, 12), NOW), 0);
  assert.equal(daysUntil(due(1, 12), NOW), 1);
  assert.equal(daysUntil(due(-1, 12), NOW), -1);
  // 23:30 London on the 3rd is 22:30 UTC on the 3rd; 00:30 London on the 3rd is 23:30 UTC on the 2nd.
  assert.equal(daysUntil(new Date(Date.UTC(2026, 9, 2, 23, 30)), NOW), 1); // 00:30 London on the 3rd -> tomorrow, not today
  assert.equal(daysUntil(null, NOW), null);
  assert.equal(daysUntil({ toDate: () => due(2) }, NOW), 2);
});

test("dates read day-first in London time", () => {
  assert.equal(formatDate(new Date(Date.UTC(2026, 9, 2, 23, 30))), "03/10/2026");
  assert.equal(dueKey(new Date(Date.UTC(2026, 9, 2, 23, 30))), "20261003");
});

test("a SAR due within two days tells its assignee - and nobody else", () => {
  for (const n of [0, 1, 2]) {
    const plan = planDueNotifications({ sars: [sar({ dueDate: due(n) })], now: NOW });
    assert.equal(plan.length, 1, `due in ${n}`);
    assert.equal(plan[0].recipientUid, "craig");
    assert.equal(plan[0].data.kind, "due-soon");
    assert.equal(plan[0].data.priority, "high");
  }
  assert.match(planDueNotifications({ sars: [sar({ dueDate: due(0) })], now: NOW })[0].data.title, /due today: SAR-2026-007/);
  assert.match(planDueNotifications({ sars: [sar({ dueDate: due(1) })], now: NOW })[0].data.title, /due tomorrow/);
  assert.match(planDueNotifications({ sars: [sar({ dueDate: due(2) })], now: NOW })[0].data.title, /due in 2 days/);
});

test("a SAR more than two days away, closed, or with no due date is left alone", () => {
  assert.deepEqual(planDueNotifications({ sars: [sar({ dueDate: due(3) })], now: NOW }), []);
  assert.deepEqual(planDueNotifications({ sars: [sar({ dueDate: due(-5), status: "completed" })], now: NOW }), []);
  assert.deepEqual(planDueNotifications({ sars: [sar({ dueDate: due(-5), status: "archived" })], now: NOW }), []);
  assert.deepEqual(planDueNotifications({ sars: [sar({ dueDate: null })], now: NOW }), []);
});

test("an overdue SAR tells the assignee AND the escalation manager, as critical", () => {
  const plan = planDueNotifications({ sars: [sar({ dueDate: due(-3) })], now: NOW });
  assert.deepEqual(plan.map((p) => [p.recipientUid, p.data.kind, p.data.priority]), [
    ["craig", "overdue", "critical"],
    ["liz", "overdue-escalation", "critical"],
  ]);
  assert.match(plan[0].data.message, /was due 29\/09\/2026 \(3 days ago\)/);
  assert.match(plan[1].data.message, /Assigned to Craig/);
  assert.match(plan[1].data.message, /escalation manager/);
});

test("the manager is NOT told while it is merely due soon", () => {
  const plan = planDueNotifications({ sars: [sar({ dueDate: due(1) })], now: NOW });
  assert.ok(!plan.some((p) => p.recipientUid === "liz"));
});

test("overdue and unassigned: the manager is the one told; with neither, nobody is", () => {
  const plan = planDueNotifications({ sars: [sar({ assignedToUid: "", dueDate: due(-1) })], now: NOW });
  assert.deepEqual(plan.map((p) => p.recipientUid), ["liz"]);
  assert.match(plan[0].data.message, /Not assigned to anyone/);
  assert.deepEqual(planDueNotifications({ sars: [sar({ assignedToUid: "", managerUid: "", dueDate: due(-1) })], now: NOW }), []);
});

test("the manager is not told twice when they are also the assignee", () => {
  const plan = planDueNotifications({ sars: [sar({ managerUid: "craig", dueDate: due(-1) })], now: NOW });
  assert.equal(plan.length, 1);
});

test("a due-soon and an overdue notification for the same SAR are different, and a moved due date is new", () => {
  const soon = planDueNotifications({ sars: [sar({ dueDate: due(1) })], now: NOW })[0].id;
  const over = planDueNotifications({ sars: [sar({ dueDate: due(-1) })], now: NOW })[0].id;
  assert.notEqual(soon, over);
  const later = planDueNotifications({ sars: [sar({ dueDate: due(2) })], now: NOW })[0].id;
  assert.notEqual(soon, later);
  // the same record on the same due date always gives the same id
  assert.equal(soon, planDueNotifications({ sars: [sar({ dueDate: due(1) })], now: new Date(NOW.getTime() + 3 * 3600 * 1000) })[0].id);
});

test("a concern uses its most urgent applicable deadline, and tells its owner", () => {
  const soon = planDueNotifications({ concerns: [concern({ finalResponseDueAt: due(1) })], now: NOW });
  assert.equal(soon.length, 1);
  assert.equal(soon[0].recipientUid, "craig");
  assert.match(soon[0].data.title, /Concern final response due tomorrow: CN-2026-003/);
  assert.equal(soon[0].data.module, "governance");

  const ack = planDueNotifications({ concerns: [concern({ acknowledgedAt: null, acknowledgementDueAt: due(-2) })], now: NOW });
  assert.match(ack[0].data.message, /acknowledgement deadline was 30\/09\/2026 \(2 days ago\)/);
  assert.equal(ack[0].data.priority, "critical");
});

test("acknowledgement only matters until acknowledged; early resolution only while in it", () => {
  assert.deepEqual(planDueNotifications({ concerns: [concern({ acknowledgementDueAt: due(-9) })], now: NOW }), []); // acknowledged already
  const early = concern({ status: "early_resolution", earlyResolutionDueAt: due(0) });
  assert.match(planDueNotifications({ concerns: [early], now: NOW })[0].data.title, /early resolution due today/);
  assert.deepEqual(planDueNotifications({ concerns: [concern({ earlyResolutionDueAt: due(0) })], now: NOW }), []); // not in early resolution
});

test("a concern with no owner, or one that is closed, tells nobody", () => {
  assert.deepEqual(planDueNotifications({ concerns: [concern({ ownerUid: "", finalResponseDueAt: due(-1) })], now: NOW }), []);
  assert.deepEqual(planDueNotifications({ concerns: [concern({ status: "closed", finalResponseDueAt: due(-1) })], now: NOW }), []);
});

test("notifications are shaped for the inbox: unread, open, automated, with the due date and a link", () => {
  const { data } = planDueNotifications({ sars: [sar({ dueDate: due(-1) })], now: NOW })[0];
  assert.equal(data.read, false);
  assert.equal(data.status, "open");
  assert.equal(data.automated, true);
  assert.equal(data.module, "sar");
  assert.equal(data.actionUrl, "/governance/sars");
  assert.equal(data.sourceId, "s1");
  assert.ok(data.dueDate);
});

// ---- the part that talks to Firestore, against a tiny in-memory stand-in ----
function fakeDb({ sars = [], concerns = [], laptops = [], users = {} }) {
  const notifications = new Map(); // "uid/id" -> data
  const snap = (rows) => ({ docs: rows.map(({ id, ...data }) => ({ id, data: () => data })) });
  return {
    notifications,
    collection(name) {
      if (name === "governance_sars") return { where: () => ({ get: async () => snap(sars) }) };
      if (name === "governance_concerns") return { where: () => ({ get: async () => snap(concerns) }) };
      if (name === "it_laptops") return { where: () => ({ get: async () => snap(laptops) }) };
      if (name === "users") {
        return {
          doc: (uid) => ({
            id: uid,
            get: async () => ({ id: uid, exists: uid in users, data: () => users[uid] }),
            collection: () => ({
              doc: (nid) => ({
                create: async (data) => {
                  const key = `${uid}/${nid}`;
                  if (notifications.has(key)) { const e = new Error("6 ALREADY_EXISTS: Document already exists"); e.code = 6; throw e; }
                  notifications.set(key, data);
                },
              }),
            }),
          }),
        };
      }
      throw new Error("unexpected collection " + name);
    },
    getAll: async (...refs) => Promise.all(refs.map((r) => r.get())),
  };
}

test("sending creates each notification once: a second run the same day adds nothing", async () => {
  const db = fakeDb({
    sars: [sar({ dueDate: due(-2) })],
    users: { craig: { displayName: "Craig" }, liz: { displayName: "Liz" } },
  });
  const first = await sendDueNotifications({ db, now: NOW });
  assert.deepEqual(first, { considered: 2, created: 2, alreadySent: 0, skippedInactive: 0 });
  assert.equal(db.notifications.size, 2);
  const second = await sendDueNotifications({ db, now: new Date(NOW.getTime() + 24 * 3600 * 1000) });
  assert.equal(second.created, 0);
  assert.equal(second.alreadySent, 2);
  assert.equal(db.notifications.size, 2);
});

test("deactivated or missing accounts are not written to", async () => {
  const db = fakeDb({
    sars: [sar({ dueDate: due(-2) })],
    users: { craig: { displayName: "Craig", active: false } }, // liz has no profile at all
  });
  const result = await sendDueNotifications({ db, now: NOW });
  assert.deepEqual(result, { considered: 2, created: 0, alreadySent: 0, skippedInactive: 2 });
  assert.equal(db.notifications.size, 0);
});

test("nothing due means nothing is read or written beyond the two queries", async () => {
  const db = fakeDb({ sars: [sar({ dueDate: due(20) })] });
  assert.deepEqual(await sendDueNotifications({ db, now: NOW }), { considered: 0, created: 0, alreadySent: 0, skippedInactive: 0 });
});

test("an unexpected write error is not swallowed", async () => {
  const db = fakeDb({ sars: [sar({ dueDate: due(1) })], users: { craig: {} } });
  const original = db.collection.bind(db);
  db.collection = (name) => {
    if (name !== "users") return original(name);
    const base = original(name);
    return { doc: (uid) => ({ ...base.doc(uid), collection: () => ({ doc: () => ({ create: async () => { throw new Error("permission denied"); } }) }) }) };
  };
  await assert.rejects(() => sendDueNotifications({ db, now: NOW }), /permission denied/);
});

test("the notification ids carry the real SAR id, the person and the due date", async () => {
  const db = fakeDb({ sars: [sar({ dueDate: due(-2) })], users: { craig: {}, liz: {} } });
  await sendDueNotifications({ db, now: NOW });
  assert.deepEqual([...db.notifications.keys()].sort(), [
    "craig/sar-overdue-s1-craig-20260930",
    "liz/sar-overdue-manager-s1-liz-20260930",
  ]);
});

// ---- IT laptops ----
// NOW is Fri 2 Oct 2026 in London.
const laptop = (over = {}) => ({ id: "L1", assetCode: "W91003MLAP10026", status: "in_use", active: true, currentUserUid: "ann", currentUserName: "Ann", nextUpdateDue: "2026-10-09", ...over });
const loaned = (over = {}) => laptop({ status: "on_loan", currentUserUid: "", loan: { borrowerUid: "bob", borrowerName: "Bob", dueBackOn: "2026-10-20" }, nextUpdateDue: "", ...over });

test("a laptop update due within a week tells the person it is assigned to, a week ahead and no earlier", () => {
  const plan = planDueNotifications({ laptops: [laptop({ nextUpdateDue: "2026-10-09" })], now: NOW });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].recipientUid, "ann");
  assert.equal(plan[0].id, "laptop-update-soon-L1-ann-20261009");
  assert.equal(plan[0].data.kind, "due-soon");
  assert.equal(plan[0].data.actionUrl, "/my-laptop");
  assert.match(plan[0].data.title, /Laptop update due in 7 days: W91003MLAP10026/);
  assert.equal(planDueNotifications({ laptops: [laptop({ nextUpdateDue: "2026-10-10" })], now: NOW }).length, 0, "8 days ahead is too early");
  assert.match(planDueNotifications({ laptops: [laptop({ nextUpdateDue: "2026-10-02" })], now: NOW })[0].data.title, /today/);
});

test("an overdue update is a separate, later notice", () => {
  const plan = planDueNotifications({ laptops: [laptop({ nextUpdateDue: "2026-09-28" })], now: NOW });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].id, "laptop-update-overdue-L1-ann-20260928");
  assert.equal(plan[0].data.kind, "overdue");
  assert.match(plan[0].data.message, /4 days ago/);
});

test("a laptop on loan tells the borrower about its return, and not the person it was assigned to", () => {
  const plan = planDueNotifications({ laptops: [loaned({ loan: { borrowerUid: "bob", dueBackOn: "2026-10-05" }, currentUserUid: "ann" })], now: NOW });
  assert.deepEqual(plan.map((p) => [p.recipientUid, p.id]), [["bob", "laptop-return-soon-L1-bob-20261005"]]);
  const late = planDueNotifications({ laptops: [loaned({ loan: { borrowerUid: "bob", dueBackOn: "2026-09-30" } })], now: NOW });
  assert.equal(late[0].id, "laptop-return-overdue-L1-bob-20260930");
});

test("a lent laptop that is also due an update tells the borrower both", () => {
  const plan = planDueNotifications({ laptops: [loaned({ nextUpdateDue: "2026-10-03", loan: { borrowerUid: "bob", dueBackOn: "2026-10-04" } })], now: NOW });
  assert.deepEqual(plan.map((p) => p.id).sort(), ["laptop-return-soon-L1-bob-20261004", "laptop-update-soon-L1-bob-20261003"]);
});

test("nobody is told about a spare, unassigned or decommissioned laptop, or a bad date", () => {
  const cases = [
    laptop({ status: "spare", currentUserUid: "" }), laptop({ currentUserUid: "" }), laptop({ status: "decommissioned" }), laptop({ active: false }),
    laptop({ nextUpdateDue: "" }), laptop({ nextUpdateDue: "2026-02-31" }), laptop({ nextUpdateDue: "soon" }),
  ];
  for (const c of cases) assert.equal(planDueNotifications({ laptops: [c], now: NOW }).length, 0, JSON.stringify(c));
});

test("a moved update date is a new notice, so the holder is told again", () => {
  const a = planDueNotifications({ laptops: [laptop({ nextUpdateDue: "2026-10-05" })], now: NOW })[0].id;
  const b = planDueNotifications({ laptops: [laptop({ nextUpdateDue: "2026-10-06" })], now: NOW })[0].id;
  assert.notEqual(a, b);
});

test("the laptop reminders are sent once, and never carry a BitLocker key or note", async () => {
  const db = fakeDb({
    laptops: [laptop({ nextUpdateDue: "2026-10-05", notes: "key 111111-222222", bitlocker: "111111" })],
    users: { ann: { displayName: "Ann" } },
  });
  const first = await sendDueNotifications({ db, now: NOW });
  const second = await sendDueNotifications({ db, now: NOW });
  assert.equal(first.created, 1);
  assert.equal(second.created, 0);
  assert.equal(second.alreadySent, 1);
  assert.doesNotMatch(JSON.stringify([...db.notifications.values()]), /111111|bitlocker/i);
});
