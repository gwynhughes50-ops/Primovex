const test = require("node:test");
const assert = require("node:assert/strict");
const { queryAuditEntry, queryNotices, enrichment } = require("../services/timesheetQueryService");

const sheet = { periodId: "p1", staffId: "s1", uid: "u1", staffName: "Ann Example", managerUid: "m1", state: "approved", kind: "changes", lines: [{ date: "2026-10-22", code: "B", hours: 1, comment: "" }], totals: { B: 1 }, expected: { hours: 150 }, submissions: 1 };
const query = { timesheetId: "p1_s1", staffUid: "u1", staffName: "Ann Example", managerUid: "m1", to: "person", toUid: "u1", toName: "Ann Example", raisedByUid: "pay1", raisedByName: "Sam Payroll", status: "open" };
const message = (kind, extra = {}) => ({ queryId: "q1", timesheetId: "p1_s1", kind, text: "Was the overtime on the 22nd agreed?", authorUid: "pay1", authorName: "Sam Payroll", ...extra });

test("every step of a query is written to the timesheet's trail with who said what", () => {
  const raised = queryAuditEntry(message("raised"), query, sheet, { id: "q1" });
  assert.equal(raised.action, "query raised with the person");
  assert.equal(raised.actorUid, "pay1");
  assert.equal(raised.actorName, "Sam Payroll");
  assert.equal(raised.timesheetId, "p1_s1");
  assert.equal(raised.staffUid, "u1");
  assert.equal(raised.managerUid, "m1");
  assert.deepEqual(raised.query, { id: "q1", event: "raised", text: "Was the overtime on the 22nd agreed?", to: "person", toName: "Ann Example" });
  assert.equal(raised.fromState, "approved");
  assert.equal(raised.toState, "approved");
  assert.deepEqual(raised.lines, sheet.lines, "the lines are kept as they are, so a query never shows as a change to the hours");

  const toManager = queryAuditEntry(message("raised"), { ...query, to: "manager", toUid: "m1", toName: "Pat Manager" }, sheet);
  assert.equal(toManager.action, "query raised with the line manager");
  assert.equal(queryAuditEntry(message("reply", { authorUid: "u1", authorName: "Ann Example" }), query, sheet).action, "replied to the query");
  assert.equal(queryAuditEntry(message("resolved"), query, sheet).action, "query marked as resolved");
  assert.equal(queryAuditEntry(message("reopened"), query, sheet).action, "query reopened");
  assert.equal(queryAuditEntry(null, query, sheet), null);
});

test("a query is still recorded when the timesheet cannot be read, from what the query itself holds", () => {
  const entry = queryAuditEntry(message("reply", { authorUid: "u1", authorName: "Ann Example" }), query, null);
  assert.equal(entry.staffUid, "u1");
  assert.equal(entry.managerUid, "m1");
  assert.deepEqual(entry.lines, []);
});

test("long text is cut, so a message cannot make the trail huge", () => {
  const entry = queryAuditEntry(message("reply", { text: "x".repeat(5000), authorName: "n".repeat(500) }), query, sheet);
  assert.equal(entry.query.text.length, 1000);
  assert.equal(entry.actorName.length, 100);
});

test("the other side of the thread is told, and nobody is told about their own message", () => {
  const raised = queryNotices(message("raised"), query, "m-1");
  assert.equal(raised.length, 1);
  assert.equal(raised[0].uid, "u1", "raised by payroll: the person is told");
  assert.equal(raised[0].priority, "high");
  assert.match(raised[0].message, /Sam Payroll has a query about your timesheet/);
  assert.equal(raised[0].id, "ts-query-m-1-raised");

  const toManager = queryNotices(message("raised"), { ...query, to: "manager", toUid: "m1" }, "m-2");
  assert.equal(toManager[0].uid, "m1");
  assert.match(toManager[0].message, /about Ann Example's timesheet/);

  const reply = queryNotices(message("reply", { authorUid: "u1", authorName: "Ann Example", text: "Yes, agreed with Dr Smith" }), query, "m-3");
  assert.equal(reply[0].uid, "pay1", "the person replied: payroll is told");
  assert.match(reply[0].message, /Ann Example replied/);

  const resolved = queryNotices(message("resolved", { text: "Thanks, all fine" }), query, "m-4");
  assert.equal(resolved[0].uid, "u1");
  assert.match(resolved[0].title, /resolved/);
  assert.equal(queryNotices(message("reopened"), query, "m-5")[0].priority, "high");

  assert.deepEqual(queryNotices(message("raised", { authorUid: "u1" }), { ...query, raisedByUid: "u1", toUid: "u1" }, "m-6"), [], "never told about their own message");
  assert.deepEqual(queryNotices(null, query), []);
  assert.deepEqual(queryNotices(message("mystery"), query, "m-7"), []);
});

const staff = (extra) => new Map([["s1", { name: "Ann Example", teams: ["Reception", "Admin"], jobTitle: "Receptionist", managerId: "s9", ...extra }], ["s9", { name: "Pat Manager" }]]);

test("a timesheet gets its person's teams, job title and line manager's name, and only when they differ", () => {
  const patch = enrichment({ staffId: "s1" }, staff());
  assert.deepEqual(patch, { teams: ["Reception", "Admin"], jobTitle: "Receptionist", managerName: "Pat Manager" });
  assert.equal(enrichment({ staffId: "s1", ...patch }, staff()), null, "nothing left to copy the second time");
  assert.deepEqual(enrichment({ staffId: "s1", ...patch }, staff({ teams: ["Nursing"] })).teams, ["Nursing"], "a team change is carried over");
  assert.equal(enrichment({ staffId: "missing" }, staff()), null);
  assert.equal(enrichment({}, staff()), null);
  assert.deepEqual(enrichment({ staffId: "s1" }, staff({ managerId: "" })).managerName, "", "no line manager: no name");
  assert.equal(enrichment({ staffId: "s1" }, new Map([["s1", { name: "Ann" }]])), null, "nothing to copy for a person with no teams");
  assert.deepEqual(enrichment({ staffId: "s1", teams: ["Old"] }, new Map([["s1", { name: "Ann" }]])), { teams: [], jobTitle: "", managerName: "" }, "teams removed from the register are removed from the copy");
});
