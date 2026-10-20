const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { buildAuditEvent, safeMetadata } = require("../services/governedAuditService");

const load = () => import(pathToFileURL(path.resolve(__dirname, "../../src/modules/audit/auditEvents.js")).href);

const asset = { id: "a1", label: "Call point 14", assetCode: "FP-014", assetType: "fire_point", checkMode: "pass_fail", category: "it" };
const incident = { id: "i1", kind: "panel_fault", assetLabel: "Fire alarm panel fault", assetType: "fire_alarm_panel" };
const concern = { id: "c1", reference: "C-2026-012", source: "phone" };
const check = {
  id: "k1", result: "pass", source: "mobile_offline", savedOffline: true, manualEntry: false, performedAt: new Date(2026, 9, 12, 8, 0), faultDetected: true,
  checklist: [{ key: "arc", ok: true }, { key: "sounders", ok: true }, { key: "reset", ok: false }],
};

async function everyEvent() {
  const ev = await load();
  return [
    ev.complianceCheckEvent({ asset, check }),
    ev.complianceCheckEvent({ asset, check: { id: "k2", result: "fail", manualEntry: true } }),
    ev.complianceIncidentEvent("opened", { incident }),
    ev.complianceIncidentEvent("action", { incident, choice: "engineer" }),
    ev.complianceIncidentEvent("resolved", { incident, outcome: "fixed" }),
    ev.complianceAssetEvent("created", { asset }),
    ev.complianceAssetEvent("updated", { asset }),
    ev.complianceAssetEvent("retired", { asset, reason: "replaced" }),
    ev.complianceAssetEvent("restored", { asset }),
    ev.complianceAssetEvent("imported", { count: 24 }),
    ev.patTestEvent({ asset, test: { id: "t1", result: "fail", nextDueOn: "2027-10-12" } }),
    ev.patAssetEvent("created", { asset }),
    ev.patAssetEvent("imported", { count: 9 }),
    ev.patIntervalsEvent({ it: 24, handheld: 12 }),
    ev.concernEvent("created", { concern }),
    ev.concernEvent("step", { concern, party: "indemnity", action: "sent", round: 2 }),
    ev.concernEvent("closed", { concern, outcome: "upheld", sentBeforeAccepted: true }),
    ev.concernEvent("extended", { concern }),
    ev.concernEvent("deleted", { concern }),
  ];
}

test("the server keeps every field of every compliance, PAT and concern audit event", async () => {
  for (const e of await everyEvent()) {
    assert.deepEqual(safeMetadata(e.metadata), e.metadata, `${e.action}: the server drops a field`);
    const built = buildAuditEvent({ data: e, auth: { uid: "u1" }, profile: { role: "Caretaker" }, eventId: "x", sequence: 1, previousHash: null, occurredAt: new Date() });
    assert.equal(built.action, e.action, `${e.action}: the action code is rewritten`);
    assert.equal(built.module, e.module);
    assert.equal(built.targetType, e.targetType);
    assert.equal(built.classification, e.classification, `${e.action}: the classification is rewritten`);
    assert.ok(built.summary.length > 0 && built.summary !== e.action);
  }
});

test("a fire test records how many steps were done and that it was filed from the phone", async () => {
  const ev = await load();
  const e = ev.complianceCheckEvent({ asset, check });
  assert.equal(e.metadata.stepsDone, 2);
  assert.equal(e.metadata.stepsTotal, 3);
  assert.equal(e.metadata.savedOffline, true);
  assert.equal(e.metadata.panelFault, true);
  assert.match(e.summary, /without a signal/);
  assert.match(e.metadata.performedAt, /^2026-10-12T/);
});

test("nothing a person typed reaches the ledger", async () => {
  const ev = await load();
  const typed = { ...check, notes: "ZZTYPED notes", faultNote: "ZZTYPED fault", manualReason: "ZZTYPED reason", checklist: [{ key: "arc", ok: true, label: "ZZTYPED label" }] };
  const noisy = { ...incident, summary: "ZZTYPED summary", faultNote: "ZZTYPED", actions: [{ note: "ZZTYPED note" }] };
  const all = [
    ev.complianceCheckEvent({ asset, check: typed }), ev.complianceIncidentEvent("action", { incident: noisy, choice: "other" }),
    ev.concernEvent("step", { concern: { ...concern, description: "ZZTYPED patient story" }, party: "gmpi", action: "changes", round: 1 }),
  ];
  assert.ok(!JSON.stringify(all).includes("ZZTYPED"));
});

test("a concern event names the case by its reference, never the person", async () => {
  const ev = await load();
  const e = ev.concernEvent("step", { concern: { ...concern, patientName: "Someone" }, party: "solicitor", action: "instructed" });
  assert.match(e.summary, /C-2026-012/);
  assert.ok(!JSON.stringify(e).includes("Someone"));
  assert.equal(e.classification, "governance");
});
