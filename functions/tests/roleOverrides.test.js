const test = require("node:test");
const assert = require("node:assert/strict");
const { BUILT_IN_ROLE_CAPABILITIES, OVERRIDABLE_ROLES, getEffectiveCapabilities, hasCapability } = require("../services/roleCapabilities");

const fakeDb = (docs) => ({ collection: (name) => ({ doc: (id) => ({ get: async () => { const d = docs[`${name}/${id}`]; return { exists: Boolean(d), data: () => d }; } }) }) });

test("an original role has its built-in permissions until an administrator changes them", async () => {
  const caps = await getEffectiveCapabilities(fakeDb({}), "HCA");
  assert.deepEqual(caps, BUILT_IN_ROLE_CAPABILITIES.HCA);
  assert.equal(hasCapability(caps, "waste.read"), false);
});

test("a change in role_overrides replaces the built-in permissions for that role only", async () => {
  const db = fakeDb({ "role_overrides/HCA": { capabilities: [...BUILT_IN_ROLE_CAPABILITIES.HCA, "waste.read"] } });
  assert.equal(hasCapability(await getEffectiveCapabilities(db, "HCA"), "waste.read"), true);
  assert.equal(hasCapability(await getEffectiveCapabilities(db, "Nurse"), "waste.read"), false);
});

test("System Admin ignores any override; User and ReadOnly can be changed; a malformed one is ignored", async () => {
  const db = fakeDb({ "role_overrides/System Admin": { capabilities: [] }, "role_overrides/User": { capabilities: ["inventory.read"], capabilitiesVersion: 2 }, "role_overrides/ReadOnly": { capabilities: ["admin.access"] }, "role_overrides/Nurse": { capabilities: "all" } });
  assert.deepEqual(await getEffectiveCapabilities(db, "System Admin"), ["*"]);
  assert.deepEqual(await getEffectiveCapabilities(db, "User"), ["inventory.read"]);
  assert.equal(hasCapability(await getEffectiveCapabilities(db, "ReadOnly"), "admin.access"), true);
  assert.deepEqual(await getEffectiveCapabilities(db, "Nurse"), BUILT_IN_ROLE_CAPABILITIES.Nurse);
});

test("a custom role is read from roles as before, and the overridable list is the one the app and rules use", async () => {
  const db = fakeDb({ "roles/Assistant Practitioner": { capabilities: ["inventory.read"], capabilitiesVersion: 2 } });
  assert.deepEqual(await getEffectiveCapabilities(db, "Assistant Practitioner"), ["inventory.read"]);
  assert.deepEqual(await getEffectiveCapabilities(db, "Nobody"), []);
  assert.deepEqual([...OVERRIDABLE_ROLES].sort(), ["Caretaker", "Cleaner", "HCA", "Nurse", "Partner", "Practice Manager", "ReadOnly", "Reception", "User"]);
});

test("a role saved before the emergency drugs and anaphylaxis boxes had their own permission keeps seeing them; a role saved since decides for itself", async () => {
  const db = fakeDb({
    "roles/Old role": { capabilities: ["inventory.read", "inventory.write"] },
    "roles/New role": { capabilities: ["inventory.read", "inventory.write"], capabilitiesVersion: 2 },
    "roles/No stock": { capabilities: ["dashboard.read"] },
    "role_overrides/HCA": { capabilities: ["inventory.read"] },
    "role_overrides/Nurse": { capabilities: ["inventory.read"], capabilitiesVersion: 2 },
  });
  assert.ok((await getEffectiveCapabilities(db, "Old role")).includes("inventory.kits"));
  assert.ok(!(await getEffectiveCapabilities(db, "New role")).includes("inventory.kits"));
  assert.ok(!(await getEffectiveCapabilities(db, "No stock")).includes("inventory.kits"), "no stock access, no kits");
  assert.ok((await getEffectiveCapabilities(db, "HCA")).includes("inventory.kits"), "an older change to an original role too");
  assert.ok(!(await getEffectiveCapabilities(db, "Nurse")).includes("inventory.kits"));
  assert.ok(BUILT_IN_ROLE_CAPABILITIES.Nurse.includes("inventory.kits") && BUILT_IN_ROLE_CAPABILITIES.User.includes("inventory.kits"), "the original roles still see the kits");
});

test("one person's exceptions add to and take from their role, and never narrow a System Admin", async () => {
  const db = fakeDb({ "roles/Salaried GP": { capabilities: ["inventory.read", "inventory.adjust", "dashboard.read"], capabilitiesVersion: 2 } });
  const person = { role: "Salaried GP", permissionExceptions: { allow: ["training.manage"], deny: ["inventory.adjust", "not-a-real-one"] } };
  const caps = await getEffectiveCapabilities(db, "Salaried GP", person);
  assert.deepEqual([...caps].sort(), ["dashboard.read", "inventory.read", "training.manage"]);
  assert.deepEqual(await getEffectiveCapabilities(db, "Salaried GP", { role: "Salaried GP" }), ["inventory.read", "inventory.adjust", "dashboard.read"], "no exceptions, no change");
  assert.deepEqual(await getEffectiveCapabilities(db, "System Admin", { role: "System Admin", permissionExceptions: { deny: ["admin.access"] } }), ["*"]);
  assert.deepEqual(await getEffectiveCapabilities(db, "Salaried GP", { permissionExceptions: { allow: "everything", deny: [5, null] } }), ["inventory.read", "inventory.adjust", "dashboard.read"], "malformed exceptions are ignored");
});
