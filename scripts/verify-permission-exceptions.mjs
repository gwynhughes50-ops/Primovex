import assert from "node:assert/strict";
import { cleanExceptions, describeExceptions, effectiveCapabilities, hasExceptions, permissionRows, setCapability, sourceOf } from "../src/core/identity/permissionExceptions.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const gp = ["dashboard.read", "inventory.read", "inventory.adjust"];

t("ticking something the role does not give adds it for this person; unticking something it does give removes it", () => {
  const added = setCapability("training.manage", true, gp, {});
  assert.deepEqual(added, { allow: ["training.manage"], deny: [] });
  const removed = setCapability("inventory.adjust", false, gp, added);
  assert.deepEqual(removed, { allow: ["training.manage"], deny: ["inventory.adjust"] });
  assert.deepEqual([...effectiveCapabilities(gp, removed)].sort(), ["dashboard.read", "inventory.read", "training.manage"]);
});

t("putting something back to what the role says clears the exception, so nothing is left that only repeats the role", () => {
  const removed = setCapability("inventory.adjust", false, gp, {});
  assert.deepEqual(setCapability("inventory.adjust", true, gp, removed), { allow: [], deny: [] });
  const added = setCapability("training.manage", true, gp, {});
  assert.deepEqual(setCapability("training.manage", false, gp, added), { allow: [], deny: [] });
  assert.equal(hasExceptions(setCapability("inventory.adjust", true, gp, {})), false, "already given by the role: no exception");
});

t("what is saved is tidy: real permissions only, nothing in both lists, nothing that repeats the role", () => {
  const messy = { allow: ["training.manage", "training.manage", "made.up", "inventory.read"], deny: ["inventory.adjust", "training.manage", "waste.read"] };
  assert.deepEqual(cleanExceptions(messy, gp), { allow: [], deny: ["inventory.adjust"] }, "training.manage is in both lists, so neither");
  assert.deepEqual(cleanExceptions(null, gp), { allow: [], deny: [] });
  assert.deepEqual(cleanExceptions({ allow: "all" }, gp), { allow: [], deny: [] });
});

t("a System Admin's access is never narrowed, and a permission that does not exist is ignored", () => {
  assert.deepEqual(setCapability("admin.access", false, ["*"], {}), { allow: [], deny: [] });
  assert.deepEqual(effectiveCapabilities(["*"], { deny: ["admin.access"] }), ["*"]);
  assert.deepEqual(setCapability("not.a.permission", true, gp, {}), { allow: [], deny: [] });
  assert.equal(sourceOf("admin.access", ["*"], { deny: ["admin.access"] }), "role");
});

t("each permission says where it comes from, for the label beside its tick box", () => {
  const ex = { allow: ["training.manage"], deny: ["inventory.adjust"] };
  assert.equal(sourceOf("inventory.read", gp, ex), "role");
  assert.equal(sourceOf("training.manage", gp, ex), "allowed");
  assert.equal(sourceOf("inventory.adjust", gp, ex), "removed");
  assert.equal(sourceOf("waste.read", gp, ex), "none");
  const rows = permissionRows(gp, ex);
  const inventory = rows.find((g) => g.group === "Inventory").rows;
  assert.equal(inventory.find((r) => r.id === "inventory.adjust").on, false);
  assert.equal(inventory.find((r) => r.id === "inventory.read").on, true);
  assert.ok(inventory.some((r) => r.id === "inventory.kits"), "the emergency drugs and anaphylaxis boxes permission is offered");
  assert.equal(rows.flatMap((g) => g.rows).find((r) => r.id === "training.manage").on, true);
});

t("the person's row says how many exceptions they have", () => {
  assert.equal(describeExceptions({}), "");
  assert.equal(describeExceptions({ allow: ["a"], deny: ["b", "c"] }), "1 added, 2 removed");
  assert.equal(describeExceptions({ deny: ["b"] }), "1 removed");
  assert.ok(hasExceptions({ deny: ["b"] }));
  assert.ok(!hasExceptions(undefined));
});

console.log(`\n${n} passed`);
