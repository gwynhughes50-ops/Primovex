// Covers the pure helpers behind the emergency kit / anaphylaxis box editor
// (src/lib/checklistKitHelpers.js). Bundled with esbuild, like the other
// scripts that import project modules.
import assert from "node:assert/strict";
import {
  blankItem,
  fieldsFromStock,
  findStockForItem,
  formatExpiry,
  resolveKitItem,
  resolveKitItems,
  nextItemId,
  normaliseItem,
  slugify,
  summariseItem,
  uniqueKitId,
} from "../src/lib/checklistKitHelpers.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };

t("slugify: names become tidy ids", () => {
  assert.equal(slugify("CMC Resus Trolley"), "cmc_resus_trolley");
  assert.equal(slugify("  Anaphylaxis Box #2 (Treatment)  "), "anaphylaxis_box_2_treatment");
  assert.equal(slugify(""), "");
  assert.equal(slugify(null), "");
});
t("slugify: capped at 40 characters", () => {
  assert.equal(slugify("a".repeat(80)).length, 40);
});

t("uniqueKitId: assigned from the name when free", () => {
  assert.equal(uniqueKitId("CMC Resus Trolley", []), "cmc_resus_trolley");
});
t("uniqueKitId: never reuses an existing id", () => {
  assert.equal(uniqueKitId("Box", ["box"]), "box_2");
  assert.equal(uniqueKitId("Box", ["box", "box_2", "box_3"]), "box_4");
});
t("uniqueKitId: a blank name still gets an id", () => {
  assert.equal(uniqueKitId("", []), "kit");
  assert.equal(uniqueKitId("!!!", ["kit"]), "kit_2");
});

t("nextItemId: continues the sequence", () => {
  assert.equal(nextItemId([]), "item_1");
  assert.equal(nextItemId([{ id: "item_1" }, { id: "item_2" }]), "item_3");
});
t("nextItemId: does not reuse an id after an earlier item was deleted", () => {
  // item_2 deleted from [item_1, item_2, item_3] - length-based numbering
  // would hand out item_3 again and collide with the surviving item.
  assert.equal(nextItemId([{ id: "item_1" }, { id: "item_3" }]), "item_4");
});
t("nextItemId: copes with seeded ids that aren't item_N", () => {
  assert.equal(nextItemId([{ id: "cmc_resus_trolley_item_1" }, { id: "x" }]), "item_3");
});

t("normaliseItem / blankItem: fill every field", () => {
  assert.deepEqual(blankItem(), {
    id: "", section: "General", name: "", expectedQty: "", defaultBatch: "", defaultExpiry: "", stock_barcode: "",
    stock_item_id: "", followStock: true,
  });
  assert.equal(normaliseItem({ name: "Adrenaline", expectedQty: 0 }).expectedQty, 0);
  assert.equal(normaliseItem({ name: "x", defaultBatch: null }).defaultBatch, "");
});

t("formatExpiry: ISO dates shown day-first, anything else untouched", () => {
  assert.equal(formatExpiry("2025-02-01"), "01/02/2025");
  assert.equal(formatExpiry("Jan 2026"), "Jan 2026");
  assert.equal(formatExpiry(""), "");
});

t("summariseItem: only the details that are set", () => {
  assert.equal(
    summariseItem({ expectedQty: "x2", defaultBatch: "2003001", defaultExpiry: "2025-02-01", stock_barcode: "5012345" }),
    "Qty x2 · Batch 2003001 · Expiry 01/02/2025 · Barcode 5012345"
  );
  assert.equal(summariseItem({ expectedQty: 0 }), "Qty 0");
  assert.equal(summariseItem({ expectedQty: "" }), "No quantity, batch, expiry or barcode set");
});

t("fieldsFromStock: picking a stock item brings its barcode, batch and expiry", () => {
  assert.deepEqual(
    fieldsFromStock({ id: "wfi", name: "Water for Injection 2ml", barcode: "5012345", batch_number: " L2301A ", expiry_date: "2028-08-31" }),
    { name: "Water for Injection 2ml", stock_barcode: "5012345", stock_item_id: "wfi", followStock: true, defaultBatch: "L2301A", defaultExpiry: "2028-08-31" }
  );
});
t("fieldsFromStock: anything the stock item lacks comes through blank, not stale", () => {
  assert.deepEqual(fieldsFromStock({ id: "g", name: "Gloves" }), { name: "Gloves", stock_barcode: "", stock_item_id: "g", followStock: true, defaultBatch: "", defaultExpiry: "" });
});
t("fieldsFromStock: an expiry that isn't a YYYY-MM-DD date is left for the person to enter", () => {
  assert.equal(fieldsFromStock({ name: "x", expiry_date: "Aug 2028" }).defaultExpiry, "");
  assert.equal(fieldsFromStock({ name: "x", expiry_date: "31/08/2028" }).defaultExpiry, "");
});

const stock = [
  { id: "wfi", name: "Water for Injection", barcode: "5012345", batch_number: "NEW-9", expiry_date: "2029-01-31" },
  { id: "gloves", name: "Gloves", barcode: "999" },
];

t("findStockForItem: by id first, then by barcode for older kit items", () => {
  assert.equal(findStockForItem({ stock_item_id: "wfi" }, stock).id, "wfi");
  assert.equal(findStockForItem({ stock_barcode: "5012345" }, stock).id, "wfi");
  assert.equal(findStockForItem({ stock_item_id: "gone", stock_barcode: "5012345" }, stock).id, "wfi");
  assert.equal(findStockForItem({ name: "Free text" }, stock), null);
});
t("resolveKitItem: a linked item follows the stock record's current batch and expiry", () => {
  const kit = { name: "WFI", stock_item_id: "wfi", followStock: true, defaultBatch: "OLD-1", defaultExpiry: "2026-01-01" };
  const r = resolveKitItem(kit, stock);
  assert.equal(r.defaultBatch, "NEW-9");
  assert.equal(r.defaultExpiry, "2029-01-31");
  assert.equal(r.fromStock, true);
  assert.equal(kit.defaultBatch, "OLD-1"); // the saved item isn't touched
});
t("resolveKitItem: receiving a new batch changes what the kit shows", () => {
  const kit = { stock_item_id: "wfi", followStock: true };
  const before = resolveKitItem(kit, stock);
  const after = resolveKitItem(kit, [{ ...stock[0], batch_number: "NEW-10", expiry_date: "2030-02-28" }, stock[1]]);
  assert.equal(before.defaultBatch, "NEW-9");
  assert.equal(after.defaultBatch, "NEW-10");
  assert.equal(after.defaultExpiry, "2030-02-28");
});
t("resolveKitItem: an item set to use its own values keeps them", () => {
  const kit = { stock_item_id: "wfi", followStock: false, defaultBatch: "OLD-1", defaultExpiry: "2026-01-01" };
  assert.equal(resolveKitItem(kit, stock), kit);
});
t("resolveKitItem: items saved before the flag existed follow stock", () => {
  assert.equal(resolveKitItem({ stock_barcode: "5012345" }, stock).defaultBatch, "NEW-9");
});
t("resolveKitItem: no stock record, or one with no batch/expiry, keeps the kit's own values", () => {
  const own = { name: "x", stock_item_id: "gloves", followStock: true, defaultBatch: "KEEP", defaultExpiry: "2027-05-05" };
  assert.equal(resolveKitItem(own, stock), own);
  assert.equal(resolveKitItem({ ...own, stock_item_id: "missing", stock_barcode: "" }, stock).defaultBatch, "KEEP");
  const partial = resolveKitItem({ stock_item_id: "wfi", followStock: true, defaultBatch: "B" }, [{ id: "wfi", batch_number: "", expiry_date: "2029-01-31" }]);
  assert.equal(partial.defaultBatch, "B");
  assert.equal(partial.defaultExpiry, "2029-01-31");
});
t("resolveKitItems: maps every item", () => {
  const out = resolveKitItems([{ stock_item_id: "wfi" }, { name: "plain" }], stock);
  assert.equal(out[0].defaultBatch, "NEW-9");
  assert.equal(out[1].name, "plain");
});

console.log(`\n${n} passed`);
