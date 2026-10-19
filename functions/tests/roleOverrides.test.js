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

test("System Admin, User and ReadOnly ignore any override; a malformed one is ignored", async () => {
  const db = fakeDb({ "role_overrides/System Admin": { capabilities: [] }, "role_overrides/User": { capabilities: [] }, "role_overrides/ReadOnly": { capabilities: ["admin.access"] }, "role_overrides/Nurse": { capabilities: "all" } });
  assert.deepEqual(await getEffectiveCapabilities(db, "System Admin"), ["*"]);
  assert.deepEqual(await getEffectiveCapabilities(db, "User"), BUILT_IN_ROLE_CAPABILITIES.User);
  assert.equal(hasCapability(await getEffectiveCapabilities(db, "ReadOnly"), "admin.access"), false);
  assert.deepEqual(await getEffectiveCapabilities(db, "Nurse"), BUILT_IN_ROLE_CAPABILITIES.Nurse);
});

test("a custom role is read from roles as before, and the overridable list is the one the app and rules use", async () => {
  const db = fakeDb({ "roles/Assistant Practitioner": { capabilities: ["inventory.read"] } });
  assert.deepEqual(await getEffectiveCapabilities(db, "Assistant Practitioner"), ["inventory.read"]);
  assert.deepEqual(await getEffectiveCapabilities(db, "Nobody"), []);
  assert.deepEqual([...OVERRIDABLE_ROLES].sort(), ["Caretaker", "Cleaner", "HCA", "Nurse", "Partner", "Practice Manager", "Reception"]);
});
