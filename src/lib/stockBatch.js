// What a stock item's batch number and expiry date should become when a
// delivery is received. Primovex keeps one batch/expiry on each item (the one
// that matters for expiry alerts and for kits that follow stock), not one per
// batch, so receiving needs a rule - and it has to protect the older stock:
//
//  - if nothing is on hand (or the item has no expiry recorded), the delivery's
//    batch and expiry simply become the item's;
//  - if older stock is still on hand, the item keeps whichever expires FIRST,
//    because that is the stock that needs using or removing first. A delivery
//    with a later expiry never hides it.
//
// Dates are the YYYY-MM-DD the date fields produce. Pure, so it can be tested.

const isoDate = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim()) ? String(value).trim() : "");
const clean = (value) => String(value ?? "").trim();

// Returns { batch_number, expiry_date, changed } - `changed` is false when the
// item should be left as it is.
export function nextBatchAndExpiry({ stockBefore, existing = {}, receipt = {} } = {}) {
  const oldBatch = clean(existing.batch_number);
  const oldExpiry = isoDate(existing.expiry_date);
  const newBatch = clean(receipt.batch_number);
  const newExpiry = isoDate(receipt.expiry_date);
  const unchanged = { batch_number: oldBatch, expiry_date: oldExpiry, changed: false };

  if (!newBatch && !newExpiry) return unchanged;

  const onHand = Number(stockBefore) > 0;

  // A delivery that gave an expiry date.
  if (newExpiry) {
    const takeNew = !onHand || !oldExpiry || newExpiry < oldExpiry;
    if (!takeNew) return unchanged; // older stock expires first: keep it as the item's batch and expiry
    const next = { batch_number: newBatch || (onHand ? oldBatch : ""), expiry_date: newExpiry };
    return { ...next, changed: next.batch_number !== oldBatch || next.expiry_date !== oldExpiry };
  }

  // Only a batch number was given: record it when there's nothing older to protect.
  if (!onHand || !oldBatch) {
    return { batch_number: newBatch, expiry_date: oldExpiry, changed: newBatch !== oldBatch };
  }
  return unchanged;
}
