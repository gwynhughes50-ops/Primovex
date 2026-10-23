const test = require("node:test");
const assert = require("node:assert/strict");
const { buildIssueNotification, notifyIssueReport } = require("../services/issueReportNotify");

const FieldValue = { serverTimestamp: () => "NOW" };
const REPORT = { kind: "problem", message: "The save button on the SAR form does nothing", route: "/governance/sars", reporterUid: "staff1", reporterName: "Pat Example" };

function fakeDb(users) {
  const written = [];
  return {
    written,
    collection(name) {
      assert.equal(name, "users");
      return {
        where(field, op, value) {
          assert.deepEqual([field, op, value], ["role", "==", "System Admin"]);
          return { limit: () => ({ get: async () => ({ docs: users.map((u) => ({
            id: u.id, data: () => u.data,
            ref: { collection: () => ({ doc: (nid) => ({ create: async (doc) => {
              if (written.some((w) => w.uid === u.id && w.id === nid)) { const e = new Error("already exists"); e.code = 6; throw e; }
              written.push({ uid: u.id, id: nid, doc });
            } }) }) },
          })) }) }) };
        },
      };
    },
  };
}

test("the notification says who, what kind and where, with the message shortened", () => {
  const { id, data } = buildIssueNotification({ reportId: "r1", report: REPORT, adminUid: "admin1" });
  assert.equal(id, "issue-r1-admin1");
  assert.equal(data.title, "Problem reported: Pat Example");
  assert.equal(data.message, "The save button on the SAR form does nothing (/governance/sars)");
  assert.deepEqual([data.recipientUid, data.priority, data.actionUrl, data.read], ["admin1", "high", "/developer-centre", false]);
  const idea = buildIssueNotification({ reportId: "r2", report: { ...REPORT, kind: "idea", message: "x".repeat(400), route: "" }, adminUid: "a" }).data;
  assert.equal(idea.title, "Idea suggested: Pat Example");
  assert.equal(idea.priority, "routine");
  assert.ok(idea.message.length <= 160 && idea.message.endsWith("..."));
  assert.equal(buildIssueNotification({ reportId: "r3", report: { kind: "look", message: "ok" }, adminUid: "a" }).data.title, "Something confusing reported: A member of staff");
});

test("every active System Admin is told, once; an inactive one and the reporter themself are not", async () => {
  const db = fakeDb([{ id: "admin1", data: {} }, { id: "admin2", data: { active: false } }, { id: "staff1", data: {} }, { id: "admin3", data: { active: true } }]);
  const result = await notifyIssueReport({ db, FieldValue, reportId: "r1", report: REPORT });
  assert.equal(result.notified, 2);
  assert.deepEqual(db.written.map((w) => w.uid), ["admin1", "admin3"]);
  assert.equal(db.written[0].doc.createdAt, "NOW");
  // a repeat run does not pile up duplicates or fail
  const again = await notifyIssueReport({ db, FieldValue, reportId: "r1", report: REPORT });
  assert.equal(again.notified, 0);
  assert.equal(db.written.length, 2);
});

test("nothing happens without a report, and a real failure is not hidden", async () => {
  assert.deepEqual(await notifyIssueReport({ db: fakeDb([]), FieldValue, reportId: "", report: REPORT }), { notified: 0 });
  assert.deepEqual(await notifyIssueReport({ db: fakeDb([]), FieldValue, reportId: "r", report: null }), { notified: 0 });
  assert.deepEqual(await notifyIssueReport({ db: fakeDb([]), FieldValue, reportId: "r", report: REPORT }), { notified: 0 }, "no administrators");
  const broken = { collection: () => ({ where: () => ({ limit: () => ({ get: async () => ({ docs: [{ id: "a1", data: () => ({}), ref: { collection: () => ({ doc: () => ({ create: async () => { throw new Error("permission denied"); } }) }) } }] }) }) }) }) };
  await assert.rejects(() => notifyIssueReport({ db: broken, FieldValue, reportId: "r", report: REPORT }), /permission denied/);
});
