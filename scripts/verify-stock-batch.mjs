// Covers the batch / expiry rule applied when a delivery is received
// (src/lib/stockBatch.js).
import assert from "node:assert/strict";
import { nextBatchAndExpiry } from "../src/lib/stockBatch.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };

t("nothing on hand: the delivery's batch and expiry become the item's", () => {
  assert.deepEqual(
    nextBatchAndExpiry({ stockBefore: 0, existing: { batch_number: "OLD", expiry_date: "2026-01-01" }, receipt: { batch_number: "NEW", expiry_date: "2028-05-31" } }),
    { batch_number: "NEW", expiry_date: "2028-05-31", changed: true }
  );
});

t("a new item with no expiry yet takes the delivery's, even if stock is on hand", () => {
  assert.deepEqual(
    nextBatchAndExpiry({ stockBefore: 5, existing: {}, receipt: { batch_number: "B1", expiry_date: "2027-03-01" } }),
    { batch_number: "B1", expiry_date: "2027-03-01", changed: true }
  );
});

t("older stock still on hand that expires first is protected: a later delivery doesn't replace it", () => {
  const r = nextBatchAndExpiry({ stockBefore: 40, existing: { batch_number: "OLD", expiry_date: "2026-12-31" }, receipt: { batch_number: "NEW", expiry_date: "2028-06-30" } });
  assert.deepEqual(r, { batch_number: "OLD", expiry_date: "2026-12-31", changed: false });
});

t("a delivery that expires SOONER than what's on hand becomes the item's", () => {
  const r = nextBatchAndExpiry({ stockBefore: 40, existing: { batch_number: "OLD", expiry_date: "2028-12-31" }, receipt: { batch_number: "SHORT", expiry_date: "2027-01-15" } });
  assert.deepEqual(r, { batch_number: "SHORT", expiry_date: "2027-01-15", changed: true });
});

t("the same expiry is not a change", () => {
  const r = nextBatchAndExpiry({ stockBefore: 10, existing: { batch_number: "A", expiry_date: "2027-01-01" }, receipt: { batch_number: "B", expiry_date: "2027-01-01" } });
  assert.equal(r.changed, false);
  assert.equal(r.batch_number, "A");
});

t("receiving with no batch and no expiry leaves the item alone", () => {
  for (const receipt of [{}, { batch_number: "", expiry_date: "" }, { expiry_date: "not-a-date" }, undefined]) {
    const r = nextBatchAndExpiry({ stockBefore: 0, existing: { batch_number: "X", expiry_date: "2027-01-01" }, receipt });
    assert.equal(r.changed, false);
    assert.equal(r.batch_number, "X");
    assert.equal(r.expiry_date, "2027-01-01");
  }
});

t("only a batch number: recorded when nothing older is protected, otherwise ignored", () => {
  assert.deepEqual(nextBatchAndExpiry({ stockBefore: 0, existing: { expiry_date: "2027-01-01" }, receipt: { batch_number: "N" } }), { batch_number: "N", expiry_date: "2027-01-01", changed: true });
  assert.equal(nextBatchAndExpiry({ stockBefore: 9, existing: { batch_number: "OLD" }, receipt: { batch_number: "N" } }).changed, false);
  assert.equal(nextBatchAndExpiry({ stockBefore: 9, existing: {}, receipt: { batch_number: "N" } }).batch_number, "N");
});

t("an expiry given with no batch keeps the old batch only when old stock is on hand", () => {
  const withStock = nextBatchAndExpiry({ stockBefore: 4, existing: { batch_number: "OLD", expiry_date: "2028-01-01" }, receipt: { expiry_date: "2027-01-01" } });
  assert.equal(withStock.batch_number, "OLD");
  assert.equal(withStock.expiry_date, "2027-01-01");
  const empty = nextBatchAndExpiry({ stockBefore: 0, existing: { batch_number: "OLD", expiry_date: "2028-01-01" }, receipt: { expiry_date: "2027-01-01" } });
  assert.equal(empty.batch_number, "");
});

t("junk existing values are treated as missing, and stock given as text works", () => {
  const r = nextBatchAndExpiry({ stockBefore: "12", existing: { expiry_date: "tomorrow" }, receipt: { expiry_date: "2027-02-02", batch_number: " B " } });
  assert.deepEqual(r, { batch_number: "B", expiry_date: "2027-02-02", changed: true });
});

console.log(`\n${n} passed`);
