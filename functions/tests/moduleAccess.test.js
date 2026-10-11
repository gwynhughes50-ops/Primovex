const test = require("node:test");
const assert = require("node:assert/strict");
const { clinFlowEnabledFor } = require("../services/moduleAccess");

test("ClinFlow is off when nobody has ever set it, even for an administrator", () => {
  assert.equal(clinFlowEnabledFor(undefined, "admin"), false);
  assert.equal(clinFlowEnabledFor({}, "admin"), false);
  assert.equal(clinFlowEnabledFor({ moduleToggles: {} }, "admin"), false);
  assert.equal(clinFlowEnabledFor({ moduleToggles: { clinflow: {} } }, "admin"), false);
});

test("switched off, it is on only for the people on the allow-list", () => {
  const config = { moduleToggles: { clinflow: { disabled: true, allowUids: ["dev"] } } };
  assert.equal(clinFlowEnabledFor(config, "dev"), true);
  assert.equal(clinFlowEnabledFor(config, "nurse"), false);
  assert.equal(clinFlowEnabledFor(config, "other-admin"), false);
  assert.equal(clinFlowEnabledFor(config, ""), false);
  assert.equal(clinFlowEnabledFor(config, undefined), false);
});

test("it is on for everyone only when it has been deliberately turned on", () => {
  assert.equal(clinFlowEnabledFor({ moduleToggles: { clinflow: { disabled: false, allowUids: [] } } }, "nurse"), true);
  assert.equal(clinFlowEnabledFor({ moduleToggles: { clinflow: { disabled: "false" } } }, "nurse"), false, "only a real false counts");
  assert.equal(clinFlowEnabledFor({ moduleToggles: { clinflow: { disabled: true, allowUids: "dev" } } }, "dev"), false, "a malformed allow-list allows no one");
});
