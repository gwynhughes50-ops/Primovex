import assert from "node:assert/strict";
import { OVERRIDABLE_ROLES, ROLE_TEMPLATES, getCapabilitiesForProfile } from "../src/core/identity/capabilities.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };

t("an original role has its own permissions until an administrator changes them", () => {
  const caps = getCapabilitiesForProfile({ role: "HCA" });
  assert.deepEqual([...caps].sort(), [...ROLE_TEMPLATES.HCA].sort());
  assert.equal(caps.includes("waste.read"), false);
});

t("a change replaces the original's permissions for everyone with that role", () => {
  const overrides = { HCA: { capabilities: [...ROLE_TEMPLATES.HCA, "waste.read", "training.manageClinical"] } };
  const caps = getCapabilitiesForProfile({ role: "HCA" }, {}, overrides);
  assert.ok(caps.includes("waste.read") && caps.includes("training.manageClinical") && caps.includes("inventory.verify"));
  assert.equal(getCapabilitiesForProfile({ role: "Nurse" }, {}, overrides).includes("waste.read"), false, "other roles are untouched");
  const narrower = getCapabilitiesForProfile({ role: "HCA" }, {}, { HCA: { capabilities: ["dashboard.read"] } });
  assert.deepEqual(narrower, ["dashboard.read"], "a change can also take permissions away");
});

t("System Admin, User and ReadOnly cannot be changed, whatever is stored", () => {
  assert.deepEqual(OVERRIDABLE_ROLES.sort(), ["Caretaker", "Cleaner", "HCA", "Nurse", "Partner", "Practice Manager", "Reception"]);
  const bad = { "System Admin": { capabilities: [] }, User: { capabilities: [] }, ReadOnly: { capabilities: ["admin.access"] } };
  assert.deepEqual(getCapabilitiesForProfile({ role: "System Admin" }, {}, bad), ["*"]);
  assert.deepEqual([...getCapabilitiesForProfile({ role: "User" }, {}, bad)].sort(), [...ROLE_TEMPLATES.User].sort());
  assert.equal(getCapabilitiesForProfile({ role: "ReadOnly" }, {}, bad).includes("admin.access"), false);
});

t("a malformed change is ignored rather than locking anyone out, and a custom role is not affected by overrides", () => {
  assert.deepEqual([...getCapabilitiesForProfile({ role: "HCA" }, {}, { HCA: { capabilities: "everything" } })].sort(), [...ROLE_TEMPLATES.HCA].sort());
  assert.deepEqual([...getCapabilitiesForProfile({ role: "HCA" }, {}, { HCA: {} })].sort(), [...ROLE_TEMPLATES.HCA].sort());
  assert.deepEqual(getCapabilitiesForProfile({ role: "Assistant Practitioner" }, { "Assistant Practitioner": ["inventory.read"] }, { HCA: { capabilities: ["x.y"] } }), ["inventory.read"]);
});

console.log(`\n${n} passed`);
