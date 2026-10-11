import assert from "node:assert/strict";
import { pickedPerson, staffChoices } from "../src/modules/staff/staffChoices.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const staff = [{ id: "u3", label: "Zoe Evans", role: "Nurse" }, { id: "u1", label: "Amy Jones", role: "HCA" }, { id: "me", label: "Gwyn Hughes", role: "Practice Manager" }];

t("the person signed in comes first, once, then everyone else by name", () => {
  const choices = staffChoices(staff, { uid: "me", name: "Gwyn Hughes" });
  assert.deepEqual(choices.map((c) => c.uid), ["me", "u1", "u3"]);
  assert.equal(choices.filter((c) => c.uid === "me").length, 1);
});

t("someone who can't read the staff list can still record themselves", () => {
  assert.deepEqual(staffChoices([], { uid: "u9", name: "Pat" }).map((c) => [c.uid, c.name]), [["u9", "Pat"]]);
  assert.deepEqual(staffChoices([], null), []);
});

t("an account with no name still appears, and nothing without an id does", () => {
  assert.equal(staffChoices([{ id: "x", label: "" }, { label: "No id" }], null)[0].name, "Unnamed user");
  assert.equal(staffChoices([{ label: "No id" }], null).length, 0);
});

t("picking gives the id and name to store, or nothing", () => {
  const choices = staffChoices(staff, null);
  assert.deepEqual(pickedPerson(choices, "u1"), { uid: "u1", name: "Amy Jones" });
  assert.deepEqual(pickedPerson(choices, "nobody"), { uid: "", name: "" });
});

console.log(`\n${n} passed`);
