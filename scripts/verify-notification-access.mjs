// Covers the per-login notification check (src/lib/notificationAccess.js).
import assert from "node:assert/strict";
import { describeNotificationAccess, roleCapabilities } from "../src/lib/notificationAccess.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };
const row = (result, id) => result.rows.find((r) => r.id === id);
const custom = {
  "Medical Secretary": ["governance.manageSars", "governance.read", "dashboard.read"],
  "Stock Controller": ["inventory.read", "inventory.write", "inventory.purge"],
};

t("a built-in role resolves, a custom role resolves, anything else does not", () => {
  assert.equal(roleCapabilities("Nurse").source, "built-in");
  assert.equal(roleCapabilities("Medical Secretary", custom).source, "custom");
  assert.equal(roleCapabilities("Medical Secretery", custom), null);
});

t("a custom role with Manage SARs gets the SAR pop-up and nothing else", () => {
  const r = describeNotificationAccess({ role: "Medical Secretary", active: true }, custom);
  assert.equal(row(r, "popup-sars").ok, true);
  assert.equal(row(r, "popup-concerns").ok, false);
  assert.equal(row(r, "popup-stock").ok, false);
  assert.deepEqual(r.popups, ["new notifications", "SARs"]);
  assert.match(row(r, "role").detail, /custom role with 3 permissions/);
  assert.match(row(r, "popup-concerns").detail, /governance\.concernsTeam/);
});

t("Practice Manager gets every pop-up and the cleaning-issue fallback", () => {
  const r = describeNotificationAccess({ role: "Practice Manager" });
  assert.deepEqual(r.popups, ["new notifications", "SARs", "concerns", "stock"]);
  assert.equal(row(r, "bell-cleaning").ok, true);
  assert.match(row(r, "bell-cleaning").detail, /no Caretaker/);
});

t("System Admin gets everything", () => {
  assert.deepEqual(describeNotificationAccess({ role: "System Admin" }).popups, ["new notifications", "SARs", "concerns", "stock"]);
});

t("a nurse gets the stock pop-up only; Reception is on the concerns team and can view inventory", () => {
  assert.deepEqual(describeNotificationAccess({ role: "Nurse" }).popups, ["new notifications", "stock"]);
  assert.deepEqual(describeNotificationAccess({ role: "Reception" }).popups, ["new notifications", "concerns", "stock"]);
});

t("a role with no inventory or governance rights gets only the new-notification pop-up", () => {
  const r = describeNotificationAccess({ role: "Cleaner" });
  assert.deepEqual(r.popups, ["new notifications"]);
  assert.equal(row(r, "bell-cleaning").ok, false);
});

t("a Caretaker is the cleaning-issue recipient", () => {
  const r = describeNotificationAccess({ role: "Caretaker" });
  assert.equal(row(r, "bell-cleaning").ok, true);
  assert.match(row(r, "bell-cleaning").detail, /Caretakers are told/);
});

t("a role name that matches nothing is called out clearly (the live rules give it no access)", () => {
  const r = describeNotificationAccess({ role: "Medical Secretery" }, custom); // typo
  assert.equal(row(r, "role").ok, false);
  assert.match(row(r, "role").detail, /no role called "Medical Secretery"/);
  assert.match(row(r, "role").detail, /no access at all/);
  assert.deepEqual(r.popups, []);
  assert.equal(r.rows.length, 1);
});

t("no role set at all is also called out", () => {
  const r = describeNotificationAccess({}, custom);
  assert.equal(row(r, "role").ok, false);
  assert.match(row(r, "role").detail, /no role set/);
});

t("a deactivated account is flagged first, whatever its role", () => {
  const r = describeNotificationAccess({ role: "Practice Manager", active: false });
  assert.equal(r.rows[0].id, "account");
  assert.equal(r.rows[0].ok, false);
  assert.match(r.rows[0].detail, /deactivated/);
});

t("a SAR assignment notification is listed for every working account", () => {
  for (const role of ["Nurse", "Cleaner", "Medical Secretary"]) assert.equal(row(describeNotificationAccess({ role }, custom), "bell-sar").ok, true);
});

console.log(`\n${n} passed`);
