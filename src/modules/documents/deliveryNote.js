import { resolveStockItem } from "../../ai/stock/stockAsk.js";

// Delivery notes, the app's side: turn what the server read from a supplier's delivery note into a review the person checks, and from that review the stock to book in and what to tick off on the
// purchase order. Pure (no Firestore, no screens) so it can be tested.
//
// The rules this keeps:
//  - nothing is booked in by the reader. Every row is shown for the person to check, and only rows they leave ticked are booked, after they say they have checked the note.
//  - a row is ticked for you only when the product is certain (it is on the purchase order, or its supplier code or barcode is one of your stock's) AND its quantity is confirmed against the words on the page.
//    A product matched by its name alone is shown with "check the match" and is not ticked: a wrong match puts stock on the wrong product.
//  - a product that is not in the stock list is never created. It is shown as not matched, for the person to pick the right item or add the new one first.
//  - the same delivery note cannot be booked in twice without the person being told, and it is not ticked for them.

export const OPEN_ORDER_STATUSES = ["sent", "awaiting_delivery", "part_delivered"];
export const PACK_WORDS = /^(box|boxes|bx|pack|packs|pk|pkt|packet|packets|case|cases|carton|cartons|tray|trays|outer|outers|ctn|cs)$/i;

const compact = (value) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const text = (value) => String(value ?? "").trim();
const qty = (value) => { const n = Number(value); return Number.isFinite(n) ? n : 0; };
const round = (n) => Math.round(n * 1000) / 1000;
export const ukDay = (key) => (/^\d{4}-\d{2}-\d{2}$/.test(String(key || "")) ? String(key).split("-").reverse().join("/") : "");

// ---- the supplier ----
// the ONE supplier on the practice's own list that this name is; none if there are none or several. "Ltd", "Limited", "plc" and the like are left out of the comparison, so "MedSupply UK Limited" is "MedSupply UK Ltd".
const COMPANY_WORDS = new Set(["ltd", "limited", "plc", "llp", "co", "company", "inc", "the", "and"]);
const core = (value) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter((w) => w && !COMPANY_WORDS.has(w)).join(" ");
export function matchSupplier(name, suppliers = []) {
  const live = (suppliers || []).filter((s) => s && s.active !== false && text(s.name));
  const wanted = core(name);
  if (wanted.length < 3) return null;
  const exact = live.filter((s) => core(s.name) === wanted);
  if (exact.length === 1) return exact[0];
  const near = live.filter((s) => { const c = core(s.name); return c.length >= 3 && (wanted.includes(c) || c.includes(wanted)); });
  return near.length === 1 ? near[0] : null;
}

// ---- the purchase order ----
// The order this note is for. By the order number written on the note when it is one of the open orders; otherwise by supplier: one open order is "likely", several are offered for the person to choose.
// Only orders that are out with the supplier are considered (sent, awaiting delivery, part delivered).
export function findOrder(orders = [], { orderReference = "", supplier = null, supplierName = "" } = {}) {
  const open = (orders || []).filter((o) => o && OPEN_ORDER_STATUSES.includes(o.status || ""));
  const ref = compact(orderReference);
  if (ref.length >= 4) {
    const byRef = open.filter((o) => [o.po_number, o.external_order_reference].some((value) => { const v = compact(value); return v.length >= 4 && (v === ref || v.includes(ref) || ref.includes(v)); }));
    if (byRef.length === 1) return { status: "exact", order: byRef[0], orders: byRef };
    if (byRef.length > 1) return { status: "choose", order: null, orders: byRef };
  }
  const sameSupplier = open.filter((o) => (supplier?.id && o.supplier_id === supplier.id) || (!supplier && compact(supplierName) && compact(o.supplier_name) === compact(supplierName)));
  if (sameSupplier.length === 1) return { status: "likely", order: sameSupplier[0], orders: sameSupplier };
  if (sameSupplier.length > 1) return { status: "choose", order: null, orders: sameSupplier };
  return { status: "none", order: null, orders: [] };
}

const lineOutstanding = (line) => Math.max(0, qty(line?.approved_qty ?? line?.requested_qty) - qty(line?.received_qty));

// ---- one row of the note ----
// Which stock item a row is, and how sure that is: "order" (it is a line on the purchase order), "code" (the supplier's code is the item's), "barcode", "name" (only the words match: check it),
// "choose" (several items fit: pick one) or "none" (not in the stock list).
export function matchDeliveryLine(line, { items = [], order = null } = {}) {
  const live = (items || []).filter((i) => i && !i.archived_at);
  const byId = (id) => live.find((i) => i.id === id) || null;
  const code = compact(line?.code);
  const description = text(line?.description);

  if (order && Array.isArray(order.items)) {
    const lines = order.items.map((poLine, index) => ({ poLine, index }));
    const hit = (code.length >= 3 && lines.find(({ poLine }) => compact(poLine.supplier_sku) === code || compact(poLine.barcode) === code))
      || (() => {
        const asItems = lines.map(({ poLine, index }) => ({ id: `po:${index}`, name: poLine.item_name, strength: poLine.item_strength, form: poLine.item_form }));
        const found = resolveStockItem(description, asItems);
        return found.status === "one" ? lines[Number(String(found.item.id).slice(3))] : null;
      })();
    if (hit) {
      const item = hit.poLine.item_id ? byId(hit.poLine.item_id) : null;
      if (item) return { how: "order", item, candidates: [], orderLineIndex: hit.index };
      // a line on the order that is not tied to a stock item: fall through to find the item itself, but remember the order line
      const found = findInStock(code, description, live);
      return { ...found, orderLineIndex: hit.index };
    }
  }
  return { ...findInStock(code, description, live), orderLineIndex: -1 };
}

function findInStock(code, description, live) {
  if (code.length >= 3) {
    const bySku = live.filter((i) => compact(i.supplier_sku) === code);
    if (bySku.length === 1) return { how: "code", item: bySku[0], candidates: [] };
    const byBarcode = live.filter((i) => compact(i.barcode) === code);
    if (byBarcode.length === 1) return { how: "barcode", item: byBarcode[0], candidates: [] };
  }
  const found = resolveStockItem(description, live);
  if (found.status === "one") return { how: "name", item: found.item, candidates: [] };
  if (found.status === "many") return { how: "choose", item: null, candidates: found.items };
  return { how: "none", item: null, candidates: [] };
}

// How many the stock counts for what the note says: "2 boxes" of something the stock counts in single units, with a box size on the item, is 2 x that size. Only suggested when it is plain: the note's
// unit is a box or pack word, the item has a box size, and the item itself is not counted in boxes. The person sees both numbers and can use either.
export function stockQuantity(line, item) {
  const noteQty = qty(line?.quantity);
  const perBox = qty(item?.units_per_box);
  if (!item || noteQty <= 0) return { qty: noteQty, converted: false, note: "" };
  const noteUnit = text(line?.unit);
  const stockUnit = text(item?.unit);
  if (perBox > 1 && PACK_WORDS.test(noteUnit) && !PACK_WORDS.test(stockUnit)) {
    return { qty: round(noteQty * perBox), converted: true, note: `${noteQty} ${noteUnit} x ${perBox} in a ${noteUnit.replace(/es$|s$/i, "") || "box"} = ${round(noteQty * perBox)}` };
  }
  return { qty: noteQty, converted: false, note: "" };
}

// does this product normally have an expiry date? (it already has dated batches)
export const tracksExpiry = (item) => Boolean(item && (text(item.expiry_date) || (Array.isArray(item.batches) && item.batches.some((b) => text(b?.expiry_date)))));

// ---- a delivery already booked in ----
// The same note from the same supplier (by its number), or the very same file, already booked in.
export function findPreviousDelivery(deliveries = [], { supplierId = "", supplierName = "", noteNumber = "", sha256 = "" } = {}) {
  const note = compact(noteNumber);
  return (deliveries || []).find((d) => d && ((sha256 && d.file?.sha256 === sha256)
    || (note.length >= 3 && compact(d.note_number) === note && ((supplierId && d.supplier_id === supplierId) || (!supplierId && compact(d.supplier_name) === compact(supplierName)))))) || null;
}

// ---- the review ----
const isDay = (value) => /^\d{4}-\d{2}-\d{2}$/.test(text(value));

export function buildDeliveryReview(result, { items = [], suppliers = [], orders = [], deliveries = [], chosenOrderId = "" } = {}) {
  const f = result?.fields || {};
  const supplierRead = text(f.supplier?.value);
  const supplier = matchSupplier(supplierRead, suppliers);
  const noteNumber = text(f.noteNumber?.value);
  const orderReference = text(f.orderReference?.value);
  let found = findOrder(orders, { orderReference, supplier, supplierName: supplierRead });
  if (chosenOrderId) { const chosen = (orders || []).find((o) => o.id === chosenOrderId); found = chosen ? { status: "chosen", order: chosen, orders: found.orders } : { ...found }; }
  if (chosenOrderId === "none") found = { status: "none", order: null, orders: found.orders };
  const order = found.order;
  const previous = findPreviousDelivery(deliveries, { supplierId: supplier?.id || "", supplierName: supplierRead, noteNumber, sha256: result?.fileSha256 || "" });

  const lines = (result?.lines || []).map((raw, index) => {
    const matched = matchDeliveryLine(raw, { items, order });
    const item = matched.item;
    const conv = stockQuantity(raw, item);
    const quantityOk = raw.quantity !== null && raw.quantity !== undefined && qty(raw.quantity) > 0;
    const sure = ["order", "code", "barcode"].includes(matched.how);
    const confirmed = Boolean(raw.verified?.quantity);
    return {
      index,
      description: text(raw.description), code: text(raw.code), unit: text(raw.unit), evidence: raw.evidence || "",
      noteQuantity: quantityOk ? qty(raw.quantity) : null,
      quantity: quantityOk ? conv.qty : "",
      converted: conv.converted, conversionNote: conv.note,
      batch: text(raw.batch), expiry: isDay(raw.expiry) ? raw.expiry : "",
      verified: raw.verified || {},
      itemId: item?.id || "", how: matched.how, candidates: matched.candidates || [], orderLineIndex: matched.orderLineIndex,
      expiryExpected: tracksExpiry(item),
      // ticked for you only when the product is certain and the quantity is confirmed against the page, and this note has not been booked in before
      book: Boolean(item) && sure && quantityOk && confirmed && !previous,
    };
  });
  const warnings = [...(result?.warnings || [])];
  return {
    supplier, supplierRead, supplierId: supplier?.id || "", supplierName: supplier?.name || supplierRead,
    noteNumber, deliveryDate: isDay(f.deliveryDate?.value) ? f.deliveryDate.value : "", orderReference,
    orderStatus: found.status, order, orders: found.orders || [],
    previous, lines, warnings, fileName: result?.fileName || "", fileSha256: result?.fileSha256 || "",
  };
}

// what is wrong with a row that has been ticked (as sentences); "" when it can be booked
export function lineProblem(line) {
  if (!line.itemId) return "Choose the stock item this is.";
  if (!(qty(line.quantity) > 0)) return "Give how many arrived.";
  if (text(line.expiry) && !isDay(line.expiry)) return "The expiry date is not a real date.";
  return "";
}

export const toBook = (review) => (review?.lines || []).filter((l) => l.book);
export const bookingProblems = (review) => toBook(review).map((l) => ({ line: l, problem: lineProblem(l) })).filter((x) => x.problem);

// ---- what the booking does to the purchase order ----
// received_qty goes up on the order's lines by what was booked in (in the stock's own units, the same as the quantity ordered). The order is complete when every line has everything it asked for; until then
// it is "part delivered". Rows booked in that are not on the order, and rows that came in over the quantity ordered, are listed so they can be said out loud.
export function orderAfter(order, booked = []) {
  if (!order || !Array.isArray(order.items)) return null;
  const items = order.items.map((line) => ({ ...line }));
  const extras = [];
  const over = [];
  for (const b of booked) {
    const target = b.orderLineIndex >= 0 ? items[b.orderLineIndex] : items.find((line) => b.itemId && line.item_id === b.itemId);
    if (!target) { extras.push(b); continue; }
    const before = qty(target.received_qty);
    target.received_qty = round(before + qty(b.quantity));
    const ordered = qty(target.approved_qty ?? target.requested_qty);
    if (ordered > 0 && target.received_qty > ordered) over.push({ itemName: target.item_name || b.description, ordered, received: target.received_qty });
  }
  const complete = items.every((line) => lineOutstanding(line) <= 0);
  return { items, status: complete ? "completed" : "part_delivered", complete, extras, over, outstanding: items.filter((line) => lineOutstanding(line) > 0).map((line) => ({ itemName: line.item_name, outstanding: lineOutstanding(line) })) };
}

// the immutable record of a delivery that was booked in
export function deliveryRecord(review, { booked = [], failed = [], actor = {}, order = null, file = null } = {}) {
  return {
    supplier_id: review.supplierId || "", supplier_name: review.supplierName || "",
    note_number: review.noteNumber || "", delivery_date: review.deliveryDate || "", order_reference: review.orderReference || "",
    purchase_order_id: order?.id || "", po_number: order?.po_number || "",
    lines: booked.map((b) => ({ item_id: b.itemId, item_name: b.itemName, description: b.description, code: b.code, quantity: qty(b.quantity), note_quantity: b.noteQuantity ?? null, unit: b.unit || "", batch_number: b.batch || "", expiry_date: b.expiry || "", matched_by: b.how, movement_id: b.movementId || "" })),
    not_booked: [
      ...failed.map((x) => ({ description: x.description, quantity: x.noteQuantity ?? null, reason: x.reason || "Could not be booked in" })),
      ...(review.lines || []).filter((l) => !l.book && !failed.some((x) => x.index === l.index)).map((l) => ({ description: l.description, quantity: l.noteQuantity ?? null, reason: l.itemId ? "Left unticked by the person booking in" : "Not in the stock list" })),
    ],
    file: file ? { name: file.name || "", path: file.path || "", sha256: review.fileSha256 || "", bytes: file.bytes || 0 } : { name: review.fileName || "", path: "", sha256: review.fileSha256 || "", bytes: 0 },
    created_by: { uid: actor.uid || null, displayName: actor.displayName || actor.email || "Unknown" },
  };
}

// a short sentence for the person once it is done
export function doneWords(booked = [], failed = [], after = null) {
  const bits = [`${booked.length} product${booked.length === 1 ? "" : "s"} booked into stock`];
  if (failed.length) bits.push(`${failed.length} could not be booked (${failed.map((x) => x.description).join(", ")})`);
  if (after) bits.push(after.complete ? "the purchase order is complete" : "the purchase order is part delivered");
  return `${bits.join("; ")}.`;
}
