import assert from "node:assert/strict";
import { CAPABILITY_CATALOG, OVERRIDABLE_ROLES, ROLE_TEMPLATES, getCapabilitiesForProfile, permissionExceptionsOf, withLegacyKits } from "../src/core/identity/capabilities.js";

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

t("System Admin cannot be changed, whatever is stored; User and ReadOnly can", () => {
  assert.deepEqual([...OVERRIDABLE_ROLES].sort(), ["Caretaker", "Cleaner", "HCA", "Nurse", "Partner", "Practice Manager", "ReadOnly", "Reception", "User"]);
  const stored = { "System Admin": { capabilities: [] }, User: { capabilities: ["inventory.read", "dashboard.read"], capabilitiesVersion: 2 }, ReadOnly: { capabilities: ["admin.access"] } };
  assert.deepEqual(getCapabilitiesForProfile({ role: "System Admin" }, {}, stored), ["*"]);
  assert.deepEqual([...getCapabilitiesForProfile({ role: "User" }, {}, stored)].sort(), ["dashboard.read", "inventory.read"]);
  assert.equal(getCapabilitiesForProfile({ role: "ReadOnly" }, {}, stored).includes("admin.access"), true);
});

t("a malformed change is ignored rather than locking anyone out, and a custom role is not affected by overrides", () => {
  assert.deepEqual([...getCapabilitiesForProfile({ role: "HCA" }, {}, { HCA: { capabilities: "everything" } })].sort(), [...ROLE_TEMPLATES.HCA].sort());
  assert.deepEqual([...getCapabilitiesForProfile({ role: "HCA" }, {}, { HCA: {} })].sort(), [...ROLE_TEMPLATES.HCA].sort());
  assert.deepEqual(getCapabilitiesForProfile({ role: "Assistant Practitioner" }, { "Assistant Practitioner": ["inventory.read"] }, { HCA: { capabilities: ["x.y"] } }), ["inventory.read"]);
});

t("the emergency drugs and anaphylaxis boxes have a permission of their own, and every original role that could see stock still sees them", () => {
  assert.ok(CAPABILITY_CATALOG.some((c) => c.id === "inventory.kits"));
  for (const [role, caps] of Object.entries(ROLE_TEMPLATES)) {
    if (caps.includes("inventory.read")) assert.ok(caps.includes("inventory.kits"), `${role} could see the kits before`);
  }
  assert.ok(!ROLE_TEMPLATES.Cleaner.includes("inventory.kits"));
});

t("a role saved before that permission existed keeps the kits; one saved since decides for itself", () => {
  assert.deepEqual(withLegacyKits(["inventory.read", "inventory.write"], undefined), ["inventory.read", "inventory.write", "inventory.kits"]);
  assert.deepEqual(withLegacyKits(["inventory.read", "inventory.write"], 2), ["inventory.read", "inventory.write"]);
  assert.deepEqual(withLegacyKits(["dashboard.read"], 1), ["dashboard.read"], "no stock, no kits");
  assert.deepEqual(withLegacyKits(["inventory.read", "inventory.kits"], undefined), ["inventory.read", "inventory.kits"], "not added twice");
  // an original role changed before the permission existed
  assert.ok(getCapabilitiesForProfile({ role: "HCA" }, {}, { HCA: { capabilities: ["inventory.read"] } }).includes("inventory.kits"));
  assert.ok(!getCapabilitiesForProfile({ role: "HCA" }, {}, { HCA: { capabilities: ["inventory.read"], capabilitiesVersion: 2 } }).includes("inventory.kits"));
});

t("one person's exceptions add to and take from their role, and never narrow a System Admin", () => {
  const gp = { "Salaried GP": ["inventory.read", "inventory.adjust", "dashboard.read"] };
  const person = { role: "Salaried GP", permissionExceptions: { allow: ["training.manage"], deny: ["inventory.adjust"] } };
  assert.deepEqual([...getCapabilitiesForProfile(person, gp)].sort(), ["dashboard.read", "inventory.read", "training.manage"]);
  assert.deepEqual([...getCapabilitiesForProfile({ role: "Salaried GP" }, gp)].sort(), ["dashboard.read", "inventory.adjust", "inventory.read"]);
  assert.deepEqual(getCapabilitiesForProfile({ role: "System Admin", permissionExceptions: { deny: ["admin.access"] } }), ["*"]);
  assert.deepEqual(permissionExceptionsOf({ permissionExceptions: { allow: "x", deny: [1, "a", "a", ""] } }), { allow: [], deny: ["a"] });
  assert.deepEqual(permissionExceptionsOf(null), { allow: [], deny: [] });
  // an exception on one person does not touch anyone else with the same role
  assert.ok(getCapabilitiesForProfile({ role: "Salaried GP" }, gp).includes("inventory.adjust"));
});

console.log(`\n${n} passed`);
