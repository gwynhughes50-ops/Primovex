// Covers batches within a stock item (src/lib/stockBatches.js): receiving into
// the right batch, using the soonest-expiring first, undoing a use, adjusting,
// and the summary kept on the item.
import assert from "node:assert/strict";
import {
  adjustBatches, batchKey, batchSummary, currentBatches, describeBatches, findBatch,
  hasExplicitBatches, receiveIntoBatches, restoreToBatches, useFromBatches,
} from "../src/lib/stockBatches.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };
const total = (list) => list.reduce((s, b) => s + b.quantity, 0);

// The adrenaline example: 12 from lot A (expires Feb 2027) and 40 from lot B (2031).
const adrenaline = () => ({
  current_stock: 52,
  batch_number: "A", expiry_date: "2027-02-28",
  batches: [
    { batch_number: "B", expiry_date: "2031-02-28", quantity: 40 },
    { batch_number: "A", expiry_date: "2027-02-28", quantity: 12 },
  ],
});

t("batches are listed soonest-expiring first and add up to the stock", () => {
  const list = currentBatches(adrenaline());
  assert.deepEqual(list.map((b) => b.batch_number), ["A", "B"]);
  assert.equal(total(list), 52);
});

t("an item from before batches existed has one implied batch", () => {
  const old = { current_stock: 10, batch_number: "OLD", expiry_date: "2026-12-31" };
  assert.equal(hasExplicitBatches(old), false);
  assert.deepEqual(currentBatches(old), [{ batch_number: "OLD", expiry_date: "2026-12-31", quantity: 10 }]);
  assert.deepEqual(currentBatches({ current_stock: 0, batch_number: "X" }), []);
});

t("receiving into a new batch adds a second batch and keeps the first", () => {
  const next = receiveIntoBatches(adrenaline(), { qty: 25, batch_number: "C", expiry_date: "2029-06-30" });
  assert.deepEqual(next.map((b) => [b.batch_number, b.quantity]), [["A", 12], ["C", 25], ["B", 40]]);
  assert.equal(total(next), 77);
});

t("receiving more of an existing batch joins it, ignoring case in the batch number", () => {
  const next = receiveIntoBatches(adrenaline(), { qty: 10, batch_number: "b", expiry_date: "2031-02-28" });
  assert.equal(next.length, 2);
  assert.equal(next.find((b) => b.batch_number === "B").quantity, 50);
});

t("same batch number with a different expiry is a different batch", () => {
  const next = receiveIntoBatches(adrenaline(), { qty: 5, batch_number: "B", expiry_date: "2032-01-01" });
  assert.equal(next.length, 3);
});

t("the first delivery to an old item turns its implied batch into a real one beside the new one", () => {
  const old = { current_stock: 10, batch_number: "OLD", expiry_date: "2026-12-31" };
  const next = receiveIntoBatches(old, { qty: 100, batch_number: "NEW", expiry_date: "2031-02-28" });
  assert.deepEqual(next.map((b) => [b.batch_number, b.quantity]), [["OLD", 10], ["NEW", 100]]);
});

t("a delivery with no batch or expiry goes into an unlabelled batch", () => {
  const next = receiveIntoBatches({ current_stock: 0 }, { qty: 6 });
  assert.deepEqual(next, [{ batch_number: "", expiry_date: "", quantity: 6 }]);
});

t("using stock takes the soonest-expiring first, across batches, and says what it took", () => {
  const { batches, allocations } = useFromBatches(adrenaline(), 15);
  assert.deepEqual(batches, [{ batch_number: "B", expiry_date: "2031-02-28", quantity: 37 }]);
  assert.deepEqual(allocations, [
    { batch_number: "A", expiry_date: "2027-02-28", quantity: 12 },
    { batch_number: "B", expiry_date: "2031-02-28", quantity: 3 },
  ]);
});

t("using less than the first batch leaves the rest of it", () => {
  const { batches } = useFromBatches(adrenaline(), 5);
  assert.deepEqual(batches.map((b) => [b.batch_number, b.quantity]), [["A", 7], ["B", 40]]);
});

t("a batch with no expiry date is used last", () => {
  const item = { current_stock: 8, batches: [{ batch_number: "", expiry_date: "", quantity: 5 }, { batch_number: "Z", expiry_date: "2030-01-01", quantity: 3 }] };
  assert.deepEqual(useFromBatches(item, 3).allocations, [{ batch_number: "Z", expiry_date: "2030-01-01", quantity: 3 }]);
});

t("undoing a use puts each quantity back into the batch it came from", () => {
  const item = adrenaline();
  const used = useFromBatches(item, 15);
  const after = { ...item, current_stock: 37, batches: used.batches };
  const restored = restoreToBatches(after, used.allocations);
  assert.deepEqual(restored.map((b) => [b.batch_number, b.quantity]), [["A", 12], ["B", 40]]);
});

t("undoing an older use that did not record batches goes into an unlabelled batch", () => {
  const restored = restoreToBatches({ current_stock: 5, batches: [{ batch_number: "B", expiry_date: "2031-02-28", quantity: 5 }] }, [], 3);
  assert.equal(total(restored), 8);
  assert.ok(restored.some((b) => !b.batch_number && b.quantity === 3));
});

t("a stock count that finds more adds to an unlabelled batch; one that finds fewer comes off the soonest expiry", () => {
  const more = adjustBatches(adrenaline(), 55);
  assert.equal(total(more.batches), 55);
  assert.ok(more.batches.some((b) => !b.batch_number && b.quantity === 3));
  const fewer = adjustBatches(adrenaline(), 50);
  assert.deepEqual(fewer.batches.map((b) => [b.batch_number, b.quantity]), [["A", 10], ["B", 40]]);
  assert.deepEqual(adjustBatches(adrenaline(), 52).allocations, []);
});

t("if the list has drifted from the stock total it is corrected, never hiding or inventing stock", () => {
  const short = { current_stock: 60, batches: [{ batch_number: "B", expiry_date: "2031-02-28", quantity: 40 }] };
  assert.equal(total(currentBatches(short)), 60);
  const long = { current_stock: 30, batches: [{ batch_number: "A", expiry_date: "2027-02-28", quantity: 12 }, { batch_number: "B", expiry_date: "2031-02-28", quantity: 40 }] };
  const fixed = currentBatches(long);
  assert.equal(total(fixed), 30);
  assert.deepEqual(fixed.map((b) => [b.batch_number, b.quantity]), [["B", 30]]); // soonest comes off first
});

t("the item's own batch and expiry summarise the soonest-expiring batch left", () => {
  assert.deepEqual(batchSummary(adrenaline().batches), { batch_number: "A", expiry_date: "2027-02-28" });
  const { batches } = useFromBatches(adrenaline(), 12); // lot A used up
  assert.deepEqual(batchSummary(batches), { batch_number: "B", expiry_date: "2031-02-28" });
  assert.deepEqual(batchSummary([]), { batch_number: "", expiry_date: "" });
});

t("a later-dated delivery never hides older stock: the summary stays on the soonest", () => {
  const next = receiveIntoBatches(adrenaline(), { qty: 100, batch_number: "NEW", expiry_date: "2033-01-01" });
  assert.deepEqual(batchSummary(next), { batch_number: "A", expiry_date: "2027-02-28" });
});

t("the picker list has a readable label for each batch", () => {
  const list = describeBatches(adrenaline());
  assert.equal(list[0].label, "Batch A · expires 28/02/2027 · 12 in stock");
  assert.equal(list[1].key, batchKey({ batch_number: "B", expiry_date: "2031-02-28" }));
  assert.match(describeBatches({ current_stock: 4 })[0].label, /No batch number · no expiry date · 4 in stock/);
});

t("a batch can be found by number and expiry, and is gone once used up", () => {
  assert.equal(findBatch(adrenaline(), { batch_number: "a", expiry_date: "2027-02-28" }).quantity, 12);
  const { batches } = useFromBatches(adrenaline(), 12);
  assert.equal(findBatch({ current_stock: 40, batches }, { batch_number: "A", expiry_date: "2027-02-28" }), null);
});

t("the input is never mutated", () => {
  const item = adrenaline();
  const before = JSON.stringify(item);
  receiveIntoBatches(item, { qty: 3, batch_number: "Q" });
  useFromBatches(item, 20);
  adjustBatches(item, 10);
  restoreToBatches(item, [{ batch_number: "A", expiry_date: "2027-02-28", quantity: 1 }]);
  assert.equal(JSON.stringify(item), before);
});

console.log(`\n${n} passed`);
