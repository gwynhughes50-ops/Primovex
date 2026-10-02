// Role presets offered in Roles & Permissions > Add Role must only use real
// permissions, must never be admin-named (the editor refuses those), and the
// Stock Controller preset must carry the permanent-delete permission.
import assert from "node:assert/strict";
import { CAPABILITY_CATALOG, ROLE_PRESETS } from "../src/core/identity/capabilities.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };
const known = new Set(CAPABILITY_CATALOG.map((c) => c.id));

t("every preset permission exists in the catalog", () => {
  for (const preset of ROLE_PRESETS) for (const id of preset.permissions) assert.ok(known.has(id), `${preset.name}: ${id}`);
});
t("no duplicate permissions, and no wildcard", () => {
  for (const preset of ROLE_PRESETS) {
    assert.equal(new Set(preset.permissions).size, preset.permissions.length, preset.name);
    assert.ok(!preset.permissions.includes("*"), preset.name);
  }
});
t("preset names are valid custom-role names (not admin-named, unique)", () => {
  const names = ROLE_PRESETS.map((p) => p.name);
  assert.equal(new Set(names.map((x) => x.toLowerCase())).size, names.length);
  for (const name of names) assert.ok(!name.toLowerCase().includes("admin"), name);
});
t("Stock Controller can read, edit and delete stock, but holds no admin or purchasing-approval rights", () => {
  const p = ROLE_PRESETS.find((x) => x.name === "Stock Controller");
  for (const id of ["inventory.read", "inventory.write", "inventory.delete", "inventory.purge"]) assert.ok(p.permissions.includes(id), id);
  for (const id of ["admin.access", "admin.manageUsers", "admin.manageRoles", "purchasing.approve", "purchasing.write", "governance.read"]) {
    assert.ok(!p.permissions.includes(id), id);
  }
});

console.log(`\n${n} passed`);
