const test = require("node:test");
const assert = require("node:assert/strict");
const { sarNotificationDecision, buildSarAssignmentNotification, formatDate } = require("../services/notificationService");

const sar = { reference: "SAR-2026-007", status: "in_progress", assignedToUid: "craig", requestTypeLabel: "Subject access", priority: "high", dueDate: new Date(2026, 9, 30) };

test("the assignee is told when someone else assigns them a live SAR", () => {
  assert.deepEqual(sarNotificationDecision({ sar, callerUid: "liz" }), { send: true, assigneeUid: "craig" });
});

test("nobody is told when there's no assignee, the SAR is closed, or you assigned it to yourself", () => {
  assert.equal(sarNotificationDecision({ sar: { ...sar, assignedToUid: "" }, callerUid: "liz" }).reason, "unassigned");
  assert.equal(sarNotificationDecision({ sar: { ...sar, status: "completed" }, callerUid: "liz" }).reason, "closed");
  assert.equal(sarNotificationDecision({ sar: { ...sar, status: "archived" }, callerUid: "liz" }).reason, "closed");
  assert.equal(sarNotificationDecision({ sar, callerUid: "craig" }).reason, "self");
  assert.equal(sarNotificationDecision({ sar: null, callerUid: "liz" }).reason, "not-found");
});

test("the notification is built from the SAR record, not from the caller", () => {
  const { id, data } = buildSarAssignmentNotification({ sarId: "abc", sar, assigneeUid: "craig", assignerUid: "liz", assignerName: "Liz Jones" });
  assert.equal(id, "sar-assigned-abc-craig");
  assert.equal(data.recipientUid, "craig");
  assert.equal(data.title, "SAR assigned to you: SAR-2026-007");
  assert.equal(data.message, "Subject access request due 30/10/2026.");
  assert.equal(data.module, "sar");
  assert.equal(data.priority, "high");
  assert.equal(data.read, false);
  assert.equal(data.createdByUid, "liz");
  assert.equal(data.actionUrl, "/governance/sars");
});

test("the id is stable, so a repeat call doesn't create a second notification", () => {
  const a = buildSarAssignmentNotification({ sarId: "abc", sar, assigneeUid: "craig", assignerUid: "liz" });
  const b = buildSarAssignmentNotification({ sarId: "abc", sar, assigneeUid: "craig", assignerUid: "liz" });
  assert.equal(a.id, b.id);
  assert.notEqual(a.id, buildSarAssignmentNotification({ sarId: "abc", sar, assigneeUid: "other", assignerUid: "liz" }).id);
});

test("a missing reference, due date or label still gives a readable notification", () => {
  const { data } = buildSarAssignmentNotification({ sarId: "xyz", sar: { assignedToUid: "craig" }, assigneeUid: "craig", assignerUid: "liz" });
  assert.equal(data.title, "SAR assigned to you: xyz");
  assert.equal(data.message, "SAR request.");
  assert.equal(data.priority, "routine");
});

test("dates read day-first from a Firestore Timestamp, a Date, a string or nothing", () => {
  assert.equal(formatDate({ toDate: () => new Date(2026, 0, 5) }), "05/01/2026");
  assert.equal(formatDate(new Date(2026, 11, 31)), "31/12/2026");
  assert.equal(formatDate(""), "");
  assert.equal(formatDate("garbage"), "");
});
