const test = require("node:test");
const assert = require("node:assert/strict");
const { mfaResetDecision } = require("../services/userAccountService");

const base = { callerUid: "admin-1", callerRole: "Practice Manager", targetUid: "nurse-1", targetRole: "Nurse" };

test("an administrator can reset an ordinary member of staff", () => {
  assert.deepEqual(mfaResetDecision(base), { allowed: true });
  assert.equal(mfaResetDecision({ ...base, callerRole: "System Admin" }).allowed, true);
});

test("nobody can reset their own two-step sign-in", () => {
  const result = mfaResetDecision({ ...base, targetUid: "admin-1" });
  assert.equal(result.allowed, false);
  assert.equal(result.code, "failed-precondition");
  assert.match(result.message, /another administrator/);
  // even a System Admin
  assert.equal(mfaResetDecision({ ...base, callerRole: "System Admin", targetUid: "admin-1" }).allowed, false);
});

test("only a real System Admin can reset a System Admin", () => {
  const blocked = mfaResetDecision({ ...base, targetRole: "System Admin" });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.code, "permission-denied");
  assert.equal(mfaResetDecision({ ...base, callerRole: "System Admin", targetRole: "System Admin", targetUid: "admin-2" }).allowed, true);
});

test("a missing user id is rejected", () => {
  const result = mfaResetDecision({ ...base, targetUid: "" });
  assert.equal(result.allowed, false);
  assert.equal(result.code, "invalid-argument");
});

test("a custom role holding admin.access can reset staff but not a System Admin", () => {
  assert.equal(mfaResetDecision({ ...base, callerRole: "IT" }).allowed, true);
  assert.equal(mfaResetDecision({ ...base, callerRole: "IT", targetRole: "System Admin" }).allowed, false);
});
