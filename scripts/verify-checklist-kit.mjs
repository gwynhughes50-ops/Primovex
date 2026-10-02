// Covers the pure helpers behind the emergency kit / anaphylaxis box editor
// (src/lib/checklistKitHelpers.js). Bundled with esbuild, like the other
// scripts that import project modules.
import assert from "node:assert/strict";
import {
  blankItem,
  formatExpiry,
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

console.log(`\n${n} passed`);
