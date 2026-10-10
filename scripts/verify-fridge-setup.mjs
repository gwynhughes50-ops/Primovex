import assert from "node:assert/strict";
import { UNIT_TYPES, buildUnitDoc, canChooseAlertRoles, canSetUpFridges, cleanAlertRoles, emptyForm, formFromUnit, roleChoices, validateUnit, withType } from "../src/modules/temperature/fridgeSetup.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const sites = [{ id: "main_branch", name: "Main Branch" }, { id: "branch_a", name: "Branch A" }];
const good = { id: "", name: "Vaccine fridge", siteId: "main_branch", type: "fridge", min: "2", max: "8", active: true };

t("a new fridge starts at the usual 2 to 8, and the type offers the usual range for it", () => {
  assert.deepEqual(emptyForm("main_branch"), { id: "", name: "", siteId: "main_branch", type: "fridge", min: "2", max: "8", active: true });
  assert.deepEqual([withType(good, "freezer20").min, withType(good, "freezer20").max], ["-25", "-15"]);
  assert.deepEqual([withType(good, "freezer40").min, withType(good, "freezer40").max], ["-45", "-35"]);
  assert.equal(UNIT_TYPES.length, 3);
});

t("a form is checked before it is saved", () => {
  assert.equal(validateUnit(good), "");
  assert.match(validateUnit({ ...good, name: "  " }), /name/);
  assert.match(validateUnit({ ...good, siteId: "" }), /site/);
  assert.match(validateUnit({ ...good, min: "" }), /lowest and highest/);
  assert.match(validateUnit({ ...good, max: "abc" }), /lowest and highest/);
  assert.match(validateUnit({ ...good, min: "8", max: "2" }), /below the highest/);
  assert.match(validateUnit({ ...good, min: "2", max: "2" }), /below the highest/);
  assert.match(validateUnit({ ...good, min: "-90" }), /don't look right/);
  assert.equal(validateUnit({ ...good, min: "2,5", max: "7,5" }), "", "a comma decimal is fine");
});

t("two fridges can't share a name at one site, but can at different sites, and a fridge can keep its own name", () => {
  const existing = [{ id: "u1", name: "Vaccine Fridge", siteId: "main_branch" }];
  assert.match(validateUnit(good, existing), /already a fridge with that name/);
  assert.equal(validateUnit({ ...good, siteId: "branch_a" }, existing), "");
  assert.equal(validateUnit({ ...good, id: "u1" }, existing), "");
});

t("what is stored is what the Temperature page reads", () => {
  assert.deepEqual(buildUnitDoc({ ...good, name: " Vaccine fridge ", min: "2,5" }, { sites }), { unitName: "Vaccine fridge", unitType: "fridge", site: "main_branch", siteName: "Main Branch", rangeMin: 2.5, rangeMax: 8, active: true });
  assert.equal(buildUnitDoc({ ...good, active: false }, { sites }).active, false);
  const form = formFromUnit({ id: "u1", name: "Deep freezer", siteId: "branch_a", type: "freezer", range: { min: -45, max: -35 }, active: true });
  assert.deepEqual([form.id, form.type, form.min, form.max], ["u1", "freezer20", "-45", "-35"]);
});

t("who can set fridges up: admins, the Practice Manager, and any role ticked for alerts, nobody else", () => {
  assert.ok(canSetUpFridges({ isAdmin: true }));
  assert.ok(canSetUpFridges({ capabilities: ["practiceAdmin.write"] }));
  assert.ok(canSetUpFridges({ role: "Nurse Manager", alertRoles: ["Practice Manager", "Nurse Manager"] }));
  assert.ok(!canSetUpFridges({ role: "Nurse", alertRoles: ["Practice Manager", "Nurse Manager"] }));
  assert.ok(!canSetUpFridges({ role: "HCA", capabilities: ["temperature.write"], alertRoles: [] }));
  assert.ok(!canSetUpFridges({}));
});

t("only admins and the Practice Manager choose who is alerted, not the people being ticked", () => {
  assert.ok(canChooseAlertRoles({ isAdmin: true }));
  assert.ok(canChooseAlertRoles({ capabilities: ["practiceAdmin.write"] }));
  assert.ok(!canChooseAlertRoles({ capabilities: ["temperature.resolveIncident"] }));
});

t("the roles to tick are the built-in ones and the practice's own, without admin, read-only or cleaner roles", () => {
  const choices = roleChoices({ builtIn: ["System Admin", "Practice Manager", "Nurse", "HCA", "Reception", "Caretaker", "Cleaner", "Partner", "ReadOnly", "User"], custom: [{ name: "Nurse Manager" }, { id: "IT" }, { name: "Practice Manager" }] });
  assert.deepEqual(choices, ["Caretaker", "HCA", "IT", "Nurse", "Nurse Manager", "Partner", "Practice Manager", "Reception", "User"]);
  assert.deepEqual(cleanAlertRoles(["Nurse Manager", "Practice Manager", "Wizard"], choices), ["Nurse Manager", "Practice Manager"]);
  assert.deepEqual(cleanAlertRoles([], choices), ["Practice Manager"], "never an empty list");
  assert.deepEqual(cleanAlertRoles(["Wizard"], choices), ["Practice Manager"]);
});

console.log(`\n${n} passed`);
