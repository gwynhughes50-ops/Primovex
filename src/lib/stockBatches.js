// Batches within one stock item: 12 ampoules of adrenaline from lot A that
// expire in February and 40 from lot B that expire in 2031 are the same
// product with two batches, and Primovex has to know which is which - when
// stock is used (the soonest-expiring goes first), when a delivery arrives
// (it joins its own batch), and when a kit is built (you choose the batch).
//
// An item keeps `batches: [{ batch_number, expiry_date, quantity }]`. Its own
// batch_number / expiry_date stay as a summary of the soonest-expiring batch
// still on hand, because the stock cards, the expiry alerts and kits read
// those. Items from before batches existed have none; their single batch is
// worked out from batch_number / expiry_date / current_stock until the first
// delivery or use turns it into a real list. Pure, so it can be tested.

const isoDate = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim()) ? String(value).trim() : "");
const clean = (value) => String(value ?? "").trim();
const qty = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export const batchKey = (batch) => `${clean(batch?.batch_number).toLowerCase()}|${isoDate(batch?.expiry_date)}`;

// Soonest expiry first; a batch with no expiry date last.
function byExpiry(a, b) {
  const ea = a.expiry_date || "9999-99-99";
  const eb = b.expiry_date || "9999-99-99";
  return ea < eb ? -1 : ea > eb ? 1 : a.batch_number.localeCompare(b.batch_number, "en", { sensitivity: "base" });
}

function normalise(list) {
  return (Array.isArray(list) ? list : [])
    .map((b) => ({ batch_number: clean(b?.batch_number), expiry_date: isoDate(b?.expiry_date), quantity: qty(b?.quantity) }))
    .filter((b) => b.quantity > 0)
    .sort(byExpiry);
}

const sum = (list) => list.reduce((total, b) => total + b.quantity, 0);

export function hasExplicitBatches(item) {
  return Array.isArray(item?.batches) && item.batches.length > 0;
}

// The batches an item has right now, soonest expiry first. Always adds up to
// current_stock: if the list has drifted (stock was changed some other way) the
// difference is added to, or taken from, so it can never hide or invent stock.
export function currentBatches(item) {
  const stock = Math.max(0, qty(item?.current_stock));
  let list;
  if (hasExplicitBatches(item)) {
    list = normalise(item.batches);
  } else {
    list = stock > 0
      ? [{ batch_number: clean(item?.batch_number), expiry_date: isoDate(item?.expiry_date), quantity: stock }]
      : [];
  }
  const total = sum(list);
  if (total < stock) return mergeIn(list, { batch_number: "", expiry_date: "", quantity: stock - total });
  if (total > stock) return takeSoonest(list, total - stock).batches;
  return list;
}

function mergeIn(list, addition) {
  const key = batchKey(addition);
  const next = list.map((b) => ({ ...b }));
  const existing = next.find((b) => batchKey(b) === key);
  if (existing) existing.quantity += addition.quantity;
  else next.push({ batch_number: clean(addition.batch_number), expiry_date: isoDate(addition.expiry_date), quantity: addition.quantity });
  return next.sort(byExpiry);
}

// Takes `amount` from the soonest-expiring batches first. Returns the batches
// left and what was taken from each, so an undo can put it back.
function takeSoonest(list, amount) {
  let remaining = Math.max(0, amount);
  const allocations = [];
  const next = [];
  for (const batch of [...list].sort(byExpiry)) {
    if (remaining <= 0) { next.push({ ...batch }); continue; }
    const take = Math.min(batch.quantity, remaining);
    if (take > 0) allocations.push({ batch_number: batch.batch_number, expiry_date: batch.expiry_date, quantity: take });
    remaining -= take;
    if (batch.quantity - take > 0) next.push({ ...batch, quantity: batch.quantity - take });
  }
  return { batches: next.sort(byExpiry), allocations };
}

// A delivery arrives: it joins the batch with the same number and expiry (or
// starts a new one). Returns the new list.
export function receiveIntoBatches(item, { qty: amount, batch_number, expiry_date } = {}) {
  const add = Math.floor(qty(amount));
  const base = currentBatches(item);
  if (add <= 0) return base;
  return mergeIn(base, { batch_number, expiry_date, quantity: add });
}

// Stock is used: the soonest-expiring batch goes first. { batches, allocations }.
//   prefer: a batch number to take from first (someone says which pack the stock came from); any
//   shortfall then comes off the soonest-expiring as usual.
export function useFromBatches(item, amount, { prefer = "" } = {}) {
  const list = currentBatches(item);
  const want = Math.floor(qty(amount));
  const key = clean(prefer).toLowerCase();
  if (!key) return takeSoonest(list, want);
  const first = list.filter((b) => b.batch_number.toLowerCase() === key);
  const rest = list.filter((b) => b.batch_number.toLowerCase() !== key);
  const a = takeSoonest(first, want);
  const taken = sum(a.allocations);
  const c = takeSoonest(rest, want - taken);
  return { batches: [...a.batches, ...c.batches].sort(byExpiry), allocations: [...a.allocations, ...c.allocations] };
}

// A use is undone: put back what was taken, batch by batch.
export function restoreToBatches(item, allocations = [], fallbackQty = 0) {
  let list = currentBatches(item);
  const given = (allocations || []).filter((a) => qty(a?.quantity) > 0);
  if (given.length) {
    for (const a of given) list = mergeIn(list, { batch_number: a.batch_number, expiry_date: a.expiry_date, quantity: qty(a.quantity) });
    return list;
  }
  // an older movement that didn't record which batch: back into an unlabelled one
  const back = Math.floor(qty(fallbackQty));
  return back > 0 ? mergeIn(list, { batch_number: "", expiry_date: "", quantity: back }) : list;
}

// The stock total is set to a new number (a count/adjustment): extra goes into
// an unlabelled batch, a shortfall comes off the soonest-expiring first.
export function adjustBatches(item, targetTotal) {
  const base = currentBatches(item);
  const diff = Math.floor(qty(targetTotal)) - sum(base);
  if (diff > 0) return { batches: mergeIn(base, { batch_number: "", expiry_date: "", quantity: diff }), allocations: [] };
  if (diff < 0) return takeSoonest(base, -diff);
  return { batches: base, allocations: [] };
}

// What the item's own batch_number / expiry_date should say: the soonest-expiring
// batch still on hand (blank when none is).
export function batchSummary(batches) {
  const first = normalise(batches)[0];
  return first ? { batch_number: first.batch_number, expiry_date: first.expiry_date } : { batch_number: "", expiry_date: "" };
}

// For lists and pickers: every batch with a readable label.
export function describeBatches(item) {
  return currentBatches(item).map((b) => ({
    ...b,
    key: batchKey(b),
    label: `${b.batch_number ? `Batch ${b.batch_number}` : "No batch number"} · ${b.expiry_date ? `expires ${b.expiry_date.split("-").reverse().join("/")}` : "no expiry date"} · ${b.quantity} in stock`,
  }));
}

// The batch an item has with this number and expiry, if it still has stock.
export function findBatch(item, wanted) {
  const key = batchKey(wanted);
  return currentBatches(item).find((b) => batchKey(b) === key) || null;
}
