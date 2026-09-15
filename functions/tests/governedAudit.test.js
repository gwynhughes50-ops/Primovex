const test = require("node:test");
const assert = require("node:assert/strict");
const { buildAuditEvent, safeMetadata } = require("../services/governedAuditService");

const auth = { uid: "user-123" };
const profile = { role: "Practice Manager", practiceId: "practice-a", siteId: "site-1" };

test("server-derived identity cannot be overridden by client metadata", () => {
  const event = buildAuditEvent({
    data: { action: "clinflow.document.view", module: "clinflow", actorUid: "forged-user", summary: "Document opened" },
    auth,
    profile,
    eventId: "event-1",
    sequence: 7,
    previousHash: "abc",
    occurredAt: "2026-08-01T10:00:00.000Z",
  });
  assert.equal(event.actorUid, "user-123");
  assert.equal(event.actorRole, "Practice Manager");
  assert.equal(event.practiceId, "practice-a");
  assert.equal(event.sequence, 7);
  assert.equal(event.previousHash, "abc");
  assert.match(event.integrityHash, /^[a-f0-9]{64}$/);
});

test("unsafe clinical and credential metadata is rejected", () => {
  const value = safeMetadata({
    destination: "GP",
    count: 4,
    patientName: "Do not store",
    nhsNumber: "0000000000",
    transcript: "raw speech",
    accessToken: "secret",
    sourceIds: ["one", "two"],
  });
  assert.deepEqual(value, { destination: "GP", count: 4, sourceIds: ["one", "two"] });
});

test("integrity hash changes when the chain or evidence changes", () => {
  const base = { data: { action: "inventory.stock.use", module: "inventory", summary: "Stock used", metadata: { delta: -1 } }, auth, profile, eventId: "event-2", sequence: 8, occurredAt: "2026-08-01T10:01:00.000Z" };
  const first = buildAuditEvent({ ...base, previousHash: "first" });
  const second = buildAuditEvent({ ...base, previousHash: "second" });
  assert.notEqual(first.integrityHash, second.integrityHash);
});
