// Covers the confirmation logic for permanently deleting a stock item
// (src/lib/stockPurge.js).
import assert from "node:assert/strict";
import { purgeConfirmMatches, purgeConsequences } from "../src/lib/stockPurge.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };

t("the typed name must match, ignoring case and surrounding spaces", () => {
  assert.equal(purgeConfirmMatches("water for injection 2ml", "Water for Injection 2ml"), true);
  assert.equal(purgeConfirmMatches("  Water for Injection 2ml ", "Water for Injection 2ml"), true);
});
t("anything else does not match", () => {
  assert.equal(purgeConfirmMatches("Water for Injection", "Water for Injection 2ml"), false);
  assert.equal(purgeConfirmMatches("", "Water"), false);
  assert.equal(purgeConfirmMatches(null, "Water"), false);
});
t("an item with no name can never be confirmed by typing nothing", () => {
  assert.equal(purgeConfirmMatches("", ""), false);
  assert.equal(purgeConfirmMatches("x", undefined), false);
});

t("consequences: stock, places and photo are called out", () => {
  const lines = purgeConsequences({ current_stock: 10, locations: [{}, {}], photo_url: "https://x" });
  assert.match(lines[0], /10 units are recorded as in stock/);
  assert.match(lines[1], /2 places/);
  assert.ok(lines.some((l) => /photo will be deleted/.test(l)));
});
t("consequences: singular wording, and an empty item still gets the history/undo warning", () => {
  assert.match(purgeConsequences({ current_stock: 1, locations: [{}] })[0], /1 unit is recorded/);
  const bare = purgeConsequences({ current_stock: 0 });
  assert.equal(bare.length, 1);
  assert.match(bare[0], /can't be brought back/);
  assert.match(bare[0], /archive it instead/);
});

console.log(`\n${n} passed`);
