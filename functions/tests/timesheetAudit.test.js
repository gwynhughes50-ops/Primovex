const test = require("node:test");
const assert = require("node:assert/strict");
const { buildAuditEntry } = require("../services/timesheetAuditService");

const base = { periodId: "p1", staffId: "s1", uid: "u1", staffName: "Ann Example", managerUid: "m1", kind: "no-change", lines: [], totals: {}, expected: { hours: 150 }, submissions: 1, lastActorUid: "u1", lastActorName: "Ann Example" };
const at = (state, extra = {}) => ({ ...base, state, ...extra });

test("a new timesheet that is sent at once is recorded as created and submitted, by whoever wrote it", () => {
  const entry = buildAuditEntry(null, at("submitted", { declaration: { confirmedAt: "2026-10-05T09:00:00Z" } }), { id: "p1_s1" });
  assert.equal(entry.action, "created and submitted");
  assert.equal(entry.actorUid, "u1");
  assert.equal(entry.toState, "submitted");
  assert.equal(entry.timesheetId, "p1_s1");
  assert.equal(entry.staffUid, "u1");
  assert.equal(entry.managerUid, "m1");
  assert.equal(entry.expectedHours, 150);
});

test("each step in the flow is named, with the reason when one was given", () => {
  const sent = at("submitted");
  const declined = at("declined", { lastActorUid: "m1", lastActorName: "Manager", decision: { outcome: "declined", byUid: "m1", reason: "Overtime on 12th was not agreed" } });
  const e1 = buildAuditEntry(sent, declined);
  assert.equal(e1.action, "declined by the line manager");
  assert.equal(e1.reason, "Overtime on 12th was not agreed");
  assert.equal(e1.actorUid, "m1");
  const again = buildAuditEntry(at("declined"), at("submitted", { submissions: 2 }));
  assert.equal(again.action, "resubmitted after a decline");
  const approved = buildAuditEntry(sent, at("approved", { lastActorUid: "m1", decision: { outcome: "approved", byUid: "m1" } }));
  assert.equal(approved.action, "signed off by the line manager");
  const dispatched = buildAuditEntry(at("approved"), at("sent", { lastActorUid: "p1", payroll: { outcome: "sent", byUid: "p1", reference: "OCT-26" } }));
  assert.equal(dispatched.action, "sent to payroll");
  assert.equal(dispatched.reference, "OCT-26");
  const returned = buildAuditEntry(at("approved"), at("returned", { lastActorUid: "p1", payroll: { outcome: "returned", byUid: "p1", reason: "Wrong payroll number" } }));
  assert.equal(returned.action, "returned by the payroll team");
  assert.equal(returned.reason, "Wrong payroll number");
  assert.equal(buildAuditEntry(at("returned"), at("submitted")).action, "resubmitted after payroll returned it");
});

test("an edit to the lines or the declaration is recorded; a change to nothing but the updated-at stamp is not", () => {
  const lines = [{ date: "2026-09-12", code: "B", hours: 2, comment: "" }];
  const edited = buildAuditEntry(at("draft", { kind: "changes" }), at("draft", { kind: "changes", lines }));
  assert.equal(edited.action, "changed");
  assert.deepEqual(edited.lines, lines);
  assert.equal(buildAuditEntry(at("draft", { updatedAt: 1 }), at("draft", { updatedAt: 2 })), null);
  assert.equal(buildAuditEntry(null, null), null);
});

test("a deleted timesheet is recorded too (the rules do not allow it, but the trail would show it)", () => {
  const entry = buildAuditEntry(at("approved"), null, { id: "p1_s1" });
  assert.equal(entry.action, "deleted");
  assert.equal(entry.fromState, "approved");
});

test("text kept in the trail is trimmed so it can't grow without limit", () => {
  const entry = buildAuditEntry(at("submitted"), at("declined", { decision: { reason: "x".repeat(900) }, staffName: "n".repeat(500) }));
  assert.equal(entry.reason.length, 300);
  assert.equal(entry.staffName.length, 100);
});

test("a person taking a sent timesheet back to change it is recorded as such, and the lines are not touched", () => {
  const lines = [{ date: "2026-09-12", code: "B", hours: 1, comment: "" }];
  const entry = buildAuditEntry(at("submitted", { kind: "changes", lines }), at("draft", { kind: "changes", lines, lastActorName: "Ann Example" }));
  assert.equal(entry.action, "taken back by the person to change");
  assert.equal(entry.fromState, "submitted");
  assert.equal(entry.toState, "draft");
  assert.deepEqual(entry.lines, lines, "what was sent is kept in the trail as it was");
  assert.equal(entry.actorName, "Ann Example");
});
