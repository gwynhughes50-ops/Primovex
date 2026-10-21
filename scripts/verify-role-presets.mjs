// Role presets offered in Roles & Permissions > Add Role must only use real
// permissions, must never be admin-named (the editor refuses those), and the
// Stock Controller preset must carry the permanent-delete permission.
import assert from "node:assert/strict";
import { CAPABILITY_CATALOG, ROLE_PRESETS, recommendedPresetFor } from "../src/core/identity/capabilities.js";

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

t("Salaried GP sees stock only: no kits, no governance, no staff records, no purchasing, and nothing administrative", () => {
  const p = ROLE_PRESETS.find((x) => x.name === "Salaried GP");
  for (const id of ["inventory.read", "inventory.adjust", "dashboard.read", "mobile.access", "governance.concernsInvolved"]) assert.ok(p.permissions.includes(id), id);
  for (const id of ["inventory.kits", "inventory.write", "inventory.verify", "inventory.delete", "governance.read", "governance.manageConcerns", "governance.seTeam", "training.manage", "training.manageClinical", "timesheets.manage", "purchasing.read", "admin.access", "temperature.read", "compliance.read"]) {
    assert.ok(!p.permissions.includes(id), id);
  }
  assert.equal(p.homeType, "clinical");
});

const preset = (name) => ROLE_PRESETS.find((x) => x.name === name);
const has = (name, ...ids) => ids.forEach((id) => assert.ok(preset(name).permissions.includes(id), `${name} should have ${id}`));
const lacks = (name, ...ids) => ids.forEach((id) => assert.ok(!preset(name).permissions.includes(id), `${name} should not have ${id}`));

t("the sets follow the practice's who-sees-what table: reception sees only the concerns it is named in; secretaries run concerns and SARs", () => {
  has("Reception and front desk", "governance.concernsInvolved", "inventory.read", "purchasing.read", "purchasing.write");
  lacks("Reception and front desk", "governance.manageConcerns", "governance.concernsTeam", "governance.write", "clinflow.read", "inventory.kits", "purchasing.approve");
  has("Medical Secretary", "governance.manageConcerns", "governance.concernsTeam", "governance.manageSars", "governance.read");
  lacks("Medical Secretary", "inventory.read", "temperature.read", "compliance.read", "timesheets.manage", "inventory.kits");
});

t("nurses and HCAs check the kits and record fridges but have no compliance, ClinFlow or management; the caretaker only looks at fridges", () => {
  has("Nurse and HCA", "inventory.kits", "inventory.verify", "stocktake.count", "temperature.write", "coshh.read", "governance.concernsInvolved");
  lacks("Nurse and HCA", "compliance.read", "compliance.recordChecks", "clinflow.read", "training.manage", "governance.manageConcerns", "purchasing.read");
  has("Caretaker (premises)", "temperature.read", "compliance.manageAssets", "compliance.recordChecks", "coshh.read", "waste.manage", "governance.concernsInvolved");
  lacks("Caretaker (premises)", "temperature.write", "inventory.read", "inventory.kits", "governance.manageConcerns");
  assert.deepEqual(preset("Cleaner (cleaning)").permissions.sort(), ["dashboard.read", "mobile.access", "operations.read"]);
});

t("partners and advanced practitioners use stock only; partners can look at governance, compliance, training and the inspection pack", () => {
  has("Advanced Practitioner", "inventory.read", "inventory.adjust", "governance.concernsInvolved");
  lacks("Advanced Practitioner", "inventory.kits", "inventory.write", "governance.read", "temperature.read");
  has("Partner (stock and oversight)", "inventory.adjust", "governance.partnerAccess", "compliance.read", "coshh.read", "training.view", "reports.inspection");
  lacks("Partner (stock and oversight)", "inventory.kits", "inventory.write", "governance.manageConcerns", "governance.concernsTeam", "training.manage", "compliance.write", "temperature.read", "timesheets.manage");
});

t("a sub manager is a practice manager without setting up everyone's timesheets; the IT team has every permission", () => {
  lacks("Sub Manager", "timesheets.manage");
  has("Sub Manager", "admin.manageUsers", "training.manage", "governance.manageConcerns", "purchasing.approve", "inventory.kits");
  assert.equal(preset("IT Team").permissions.length, CAPABILITY_CATALOG.length);
  assert.ok(!preset("IT Team").permissions.includes("*"));
});

t("Edit offers the recommended set for an original role by its name, or for a custom role of the same name as a set", () => {
  assert.equal(recommendedPresetFor("Nurse").name, "Nurse and HCA");
  assert.equal(recommendedPresetFor("HCA").name, "Nurse and HCA");
  assert.equal(recommendedPresetFor("Reception").name, "Reception and front desk");
  assert.equal(recommendedPresetFor("Caretaker").name, "Caretaker (premises)");
  assert.equal(recommendedPresetFor("Cleaner").name, "Cleaner (cleaning)");
  assert.equal(recommendedPresetFor("Partner").name, "Partner (stock and oversight)");
  assert.equal(recommendedPresetFor("medical secretary").name, "Medical Secretary");
  assert.equal(recommendedPresetFor("Practice Manager"), null, "the practice manager is already everything");
  assert.equal(recommendedPresetFor(""), null);
});

console.log(`\n${n} passed`);
