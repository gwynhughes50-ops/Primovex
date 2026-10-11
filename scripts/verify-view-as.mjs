import assert from "node:assert/strict";
import { ADMIN_ROLE, VIEW_AS_KEY, previewFrameName, previewFrameRole, readViewAs, resolveViewAs, viewAsChoices, writeViewAs } from "../src/core/identity/viewAs.js";
import { ROLE_TEMPLATES, getCapabilitiesForProfile } from "../src/core/identity/capabilities.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };

const store = new Map();
globalThis.sessionStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.window = { name: "" };

t("only a System Admin can view as another role, and viewing your own role is not a view", () => {
  assert.equal(resolveViewAs({ realRole: ADMIN_ROLE, requested: "Caretaker" }), "Caretaker");
  assert.equal(resolveViewAs({ realRole: ADMIN_ROLE, requested: ADMIN_ROLE }), null);
  assert.equal(resolveViewAs({ realRole: ADMIN_ROLE, requested: "" }), null);
  assert.equal(resolveViewAs({ realRole: ADMIN_ROLE, requested: null }), null);
  for (const role of ["Practice Manager", "Nurse", "Caretaker", "Partner", null, undefined]) assert.equal(resolveViewAs({ realRole: role, requested: "System Admin" }), null, String(role));
  assert.equal(resolveViewAs({ realRole: "Practice Manager", requested: "Nurse" }), null, "a non-admin can't pick a role by editing session storage");
});

t("the choice lives in the tab's session storage and can be cleared", () => {
  assert.equal(readViewAs(), null);
  writeViewAs("Caretaker");
  assert.equal(store.get(VIEW_AS_KEY), "Caretaker");
  assert.equal(readViewAs(), "Caretaker");
  writeViewAs(null);
  assert.equal(readViewAs(), null);
});

t("a phone preview frame carries its own role and never touches the main window's choice", () => {
  writeViewAs("Nurse");
  globalThis.window.name = previewFrameName("Caretaker");
  assert.equal(previewFrameRole(), "Caretaker");
  assert.equal(readViewAs(), "Caretaker", "the frame sees its own role, not the main window's");
  writeViewAs("Reception");
  writeViewAs(null);
  globalThis.window.name = "";
  assert.equal(readViewAs(), "Nurse", "the main window's choice is untouched");
  assert.equal(previewFrameRole(), null);
  assert.equal((globalThis.window.name = "primovex-phone-preview:", previewFrameRole()), null, "an empty role is not a role");
  globalThis.window.name = "";
});

t("the dropdown offers every role but the administrator's own, then the practice's own roles", () => {
  const choices = viewAsChoices({ builtIn: Object.keys(ROLE_TEMPLATES), custom: [{ name: "Nurse Manager" }, { name: "Management Assistant" }, { name: "Old", active: false }, { name: "Nurse" }, { id: "Medical Secretary" }] });
  assert.ok(!choices.builtIn.includes(ADMIN_ROLE));
  for (const role of ["Practice Manager", "Nurse", "HCA", "Reception", "Caretaker", "Cleaner", "Partner", "ReadOnly"]) assert.ok(choices.builtIn.includes(role), role);
  assert.deepEqual(choices.custom, ["Management Assistant", "Medical Secretary", "Nurse Manager"], "sorted, inactive and duplicate names left out");
});

t("viewing as a role gives that role's own permissions, not the administrator's", () => {
  const caretaker = getCapabilitiesForProfile({ role: "Caretaker" }, {});
  assert.ok(caretaker.includes("compliance.manageAssets") && caretaker.includes("coshh.manage"));
  assert.ok(!caretaker.includes("*") && !caretaker.includes("admin.access") && !caretaker.includes("inventory.write"));
  const custom = getCapabilitiesForProfile({ role: "Nurse Manager" }, { "Nurse Manager": ["stocktake.manage", "inventory.write"] });
  assert.deepEqual(custom.sort(), ["inventory.write", "stocktake.manage"]);
});

console.log(`\n${n} passed`);
