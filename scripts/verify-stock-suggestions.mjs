// Covers the delivery type-ahead helpers (src/lib/stockSuggestions.js).
import assert from "node:assert/strict";
import { findSameProduct, receiveDefaults, stockAfterReceive, suggestStock, suggestionDetail } from "../src/lib/stockSuggestions.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };

const items = [
  { id: "1", name: "BD Eclipse Needle (Orange)", strength: "25G", form: "Needle", brand: "BD", site: "Main Surgery", location: "Store Room", current_stock: 40, order_quantity: 100, units_per_box: 100 },
  { id: "2", name: "BD Eclipse Needle (Blue)", strength: "23G", form: "Needle", brand: "BD", site: "Main Surgery", location: "Store Room", current_stock: 12 },
  { id: "3", name: "Water for Injection 2ml", form: "Ampoule", barcode: "5012345", site: "Main Surgery", location: "Store Room", current_stock: 10 },
  { id: "4", name: "Eclipse Safety Syringe", brand: "BD", current_stock: 5 },
  { id: "5", name: "BD Eclipse Needle (Green)", archived_at: "2026-01-01", current_stock: 0 },
  { id: "6", name: "Adrenaline 1mg/1ml", strength: "1mg/1ml", form: "Ampoule", site: "Branch Site", location: "Treatment Room", current_stock: 4 },
];
const names = (list) => list.map((i) => i.name);

t("typing a few letters finds the product, however it's capitalised", () => {
  assert.ok(names(suggestStock(items, "eclip")).includes("BD Eclipse Needle (Orange)"));
  assert.ok(names(suggestStock(items, "ECLIP")).includes("BD Eclipse Needle (Orange)"));
});

t("every word typed must match, in any order: 'eclipse orange' and 'orange eclipse'", () => {
  assert.deepEqual(names(suggestStock(items, "eclipse orange")), ["BD Eclipse Needle (Orange)"]);
  assert.deepEqual(names(suggestStock(items, "orange eclipse")), ["BD Eclipse Needle (Orange)"]);
});

t("one letter is too little to suggest anything", () => {
  assert.deepEqual(suggestStock(items, "b"), []);
  assert.deepEqual(suggestStock(items, ""), []);
  assert.deepEqual(suggestStock(items, undefined), []);
});

t("starting the name ranks first, then a word inside it", () => {
  const r = names(suggestStock(items, "eclipse"));
  assert.equal(r[0], "Eclipse Safety Syringe"); // name starts with it
  assert.ok(r.indexOf("BD Eclipse Needle (Blue)") > 0);
});

t("matches on brand, strength, form and barcode too", () => {
  assert.ok(names(suggestStock(items, "5012345")).includes("Water for Injection 2ml"));
  assert.ok(names(suggestStock(items, "25g")).includes("BD Eclipse Needle (Orange)"));
  assert.ok(names(suggestStock(items, "ampoule")).length >= 2);
});

t("active items come before archived ones, but archived ones are still remembered", () => {
  const r = names(suggestStock(items, "bd eclipse needle"));
  assert.equal(r.at(-1), "BD Eclipse Needle (Green)");
  assert.equal(r.length, 3);
});

t("the list is capped", () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ id: String(i), name: `Needle ${i}` }));
  assert.equal(suggestStock(many, "needle").length, 8);
  assert.equal(suggestStock(many, "needle", { limit: 3 }).length, 3);
});

t("no match gives nothing, and items without a name are ignored", () => {
  assert.deepEqual(suggestStock(items, "zzzz"), []);
  assert.deepEqual(suggestStock([{ id: "x" }, null], "anything"), []);
});

t("the detail line tells similar items apart and flags archived ones", () => {
  assert.equal(suggestionDetail(items[0]), "25G Needle · BD · Main Surgery - Store Room · 40 in stock");
  assert.match(suggestionDetail(items[4]), /archived$/);
});

t("receive defaults: pre-fill the usual order quantity, then box size, then 1; details that change are blank", () => {
  assert.deepEqual(receiveDefaults(items[0]), { qty: "100", batch_number: "", expiry_date: "", barcode: "" });
  assert.equal(receiveDefaults({ units_per_box: 24 }).qty, "24");
  assert.equal(receiveDefaults({}).qty, "1");
  assert.equal(receiveDefaults(undefined).qty, "1");
});

t("adding a product that's already at that place is spotted; another site or room is not a duplicate", () => {
  assert.equal(findSameProduct(items, { name: "bd eclipse needle (orange)", strength: "25g", form: "needle", site: "main surgery", location: "store room" })?.id, "1");
  assert.equal(findSameProduct(items, { name: "BD Eclipse Needle (Orange)", strength: "25G", form: "Needle", site: "Branch Site", location: "Store Room" }), null);
  assert.equal(findSameProduct(items, { name: "BD Eclipse Needle (Orange)", strength: "25G", form: "Needle", site: "Main Surgery", location: "Treatment Room 1" }), null);
});

t("a different strength is a different product, and an archived match isn't a duplicate", () => {
  assert.equal(findSameProduct(items, { name: "BD Eclipse Needle (Orange)", strength: "21G", form: "Needle", site: "Main Surgery", location: "Store Room" }), null);
  assert.equal(findSameProduct(items, { name: "BD Eclipse Needle (Green)", site: "", location: "" }), null);
  assert.equal(findSameProduct(items, { name: "" }), null);
});

t("stock after receiving", () => {
  assert.equal(stockAfterReceive(items[0], 100), 140);
  assert.equal(stockAfterReceive(items[0], "abc"), 40);
  assert.equal(stockAfterReceive(items[0], 0), 40);
  assert.equal(stockAfterReceive({}, 5), 5);
  assert.equal(stockAfterReceive(items[0], 2.9), 42);
});

console.log(`\n${n} passed`);
