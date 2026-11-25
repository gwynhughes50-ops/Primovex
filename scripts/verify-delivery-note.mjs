// Delivery notes (src/modules/documents/deliveryNote.js): matching a read note to the supplier, the purchase order and the stock, deciding what is ticked for the person, and what booking it in does.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { withDerivedCapabilities } from "../src/core/identity/capabilities.js";
import {
  bookingProblems, buildDeliveryReview, deliveryRecord, doneWords, findOrder, findPreviousDelivery, lineProblem, matchDeliveryLine, matchSupplier, orderAfter, stockQuantity, toBook, tracksExpiry,
} from "../src/modules/documents/deliveryNote.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };

const suppliers = [{ id: "s1", name: "MedSupply UK Ltd" }, { id: "s2", name: "Clinical Direct" }, { id: "s3", name: "Old Supplier", active: false }];
const items = [
  { id: "i1", name: "Gauze swabs sterile 10x10cm", supplier_sku: "SG1002", unit: "pack", current_stock: 10, batches: [{ batch_number: "A", expiry_date: "2028-01-31", quantity: 10 }] },
  { id: "i2", name: "Needles 21G green", barcode: "5012345678900", unit: "each", units_per_box: 100, current_stock: 200 },
  { id: "i3", name: "Adrenaline 1mg/ml ampoules", unit: "ampoule", units_per_box: 10, current_stock: 30, expiry_date: "2027-06-30" },
  { id: "i4", name: "Blue needles 23G", unit: "each" },
  { id: "i5", name: "Orange needles 25G", unit: "each" },
  { id: "i6", name: "Gauze swabs sterile 10x10cm (old)", archived_at: "2026-01-01" },
];
const order = {
  id: "po1", po_number: "PO-2026-0412", supplier_id: "s1", supplier_name: "MedSupply UK Ltd", status: "awaiting_delivery",
  items: [
    { item_id: "i1", item_name: "Gauze swabs sterile 10x10cm", supplier_sku: "SG1002", approved_qty: 6, received_qty: 0 },
    { item_id: "i2", item_name: "Needles 21G green", approved_qty: 1000, received_qty: 0 },
    { item_id: "i3", item_name: "Adrenaline 1mg/ml ampoules", approved_qty: 20, received_qty: 10 },
  ],
};
const orders = [order, { id: "po2", po_number: "PO-2026-0399", supplier_id: "s2", supplier_name: "Clinical Direct", status: "sent", items: [] }, { id: "po3", po_number: "PO-2026-0300", supplier_id: "s1", status: "completed", items: [] }];

const row = (extra = {}) => ({ description: "Sterile gauze swabs 10x10cm 5s", code: "SG1002", quantity: 4, unit: "pack", batch: "LOT7781A", expiry: "2029-03-31", evidence: "SG1002 Sterile gauze swabs 4 pack", rowFound: true, verified: { description: true, code: true, quantity: true, batch: true, expiry: true }, ...extra });
const result = (lines, fields = {}) => ({ kind: "delivery", fileName: "dn.pdf", fileSha256: "abc123", warnings: [], fields: { supplier: { value: "MedSupply UK Ltd" }, noteNumber: { value: "DN-77120" }, deliveryDate: { value: "2026-11-18" }, orderReference: { value: "PO-2026-0412" }, ...fields }, lines });

t("a supplier is matched to your own list only when it is plainly one of them", () => {
  assert.equal(matchSupplier("MedSupply UK Ltd", suppliers).id, "s1");
  assert.equal(matchSupplier("MEDSUPPLY UK LIMITED", suppliers)?.id, "s1", "a near name on the same word is the same supplier");
  assert.equal(matchSupplier("Somebody Else Ltd", suppliers), null);
  assert.equal(matchSupplier("Old Supplier", suppliers), null, "an inactive supplier is not offered");
  assert.equal(matchSupplier("", suppliers), null);
});

t("the purchase order is found by the number on the note, or by the supplier, and only while it is still to be delivered", () => {
  assert.equal(findOrder(orders, { orderReference: "PO-2026-0412" }).order.id, "po1");
  assert.equal(findOrder(orders, { orderReference: "po 2026 0412" }).status, "exact", "spacing and case do not matter");
  assert.equal(findOrder(orders, { orderReference: "2026-0412" }).order?.id, "po1", "part of the number is enough when it is only one order");
  assert.equal(findOrder(orders, { orderReference: "PO-2026-0300" }).status === "exact", false, "a completed order is not offered");
  const likely = findOrder(orders, { orderReference: "", supplier: suppliers[0] });
  assert.equal(likely.status, "likely");
  assert.equal(likely.order.id, "po1");
  const two = findOrder([order, { ...order, id: "po9", po_number: "PO-2026-0500" }], { orderReference: "", supplier: suppliers[0] });
  assert.equal(two.status, "choose");
  assert.equal(two.orders.length, 2);
  assert.equal(findOrder(orders, { orderReference: "", supplier: { id: "s9", name: "Nobody" } }).status, "none");
  assert.equal(findOrder(orders, { supplierName: "clinical direct" }).order.id, "po2", "by name when the supplier is not on your list");
});

t("a row is matched to a stock item by the order, the supplier's code, a barcode or its name, and says which", () => {
  assert.deepEqual([matchDeliveryLine(row(), { items, order }).how, matchDeliveryLine(row(), { items, order }).item.id], ["order", "i1"]);
  assert.equal(matchDeliveryLine(row(), { items, order }).orderLineIndex, 0);
  const byCode = matchDeliveryLine(row(), { items });
  assert.deepEqual([byCode.how, byCode.item.id], ["code", "i1"]);
  const byBarcode = matchDeliveryLine(row({ code: "5012345678900", description: "Hypodermic needle" }), { items });
  assert.deepEqual([byBarcode.how, byBarcode.item.id], ["barcode", "i2"]);
  const byName = matchDeliveryLine(row({ code: "", description: "Needles 21G green 100" }), { items });
  assert.deepEqual([byName.how, byName.item.id], ["name", "i2"]);
  assert.equal(matchDeliveryLine(row({ code: "", description: "Quantum flux capacitor" }), { items }).how, "none");
  assert.equal(matchDeliveryLine(row({ code: "", description: "Needles" }), { items }).how, "choose", "blue or orange: the person picks");
  assert.deepEqual(matchDeliveryLine(row({ code: "", description: "Needles" }), { items }).candidates.length >= 2, true);
});

t("an archived item is never matched, and a row on the order that is not tied to a stock item still finds its item", () => {
  assert.notEqual(matchDeliveryLine(row({ code: "", description: "Gauze swabs sterile 10x10cm (old)" }), { items: [items[5]] }).item?.id, "i6");
  const loose = { ...order, items: [{ item_name: "Gauze swabs sterile 10x10cm", supplier_sku: "SG1002", approved_qty: 6, received_qty: 0 }] };
  const m = matchDeliveryLine(row(), { items, order: loose });
  assert.deepEqual([m.how, m.item.id, m.orderLineIndex], ["code", "i1", 0]);
});

t("boxes against single units: converted only when the note says box or pack, the item has a box size and is counted in units", () => {
  assert.deepEqual(stockQuantity({ quantity: 2, unit: "box" }, items[2]), { qty: 20, converted: true, note: "2 box x 10 in a box = 20" });
  assert.equal(stockQuantity({ quantity: 2, unit: "boxes" }, items[2]).qty, 20);
  assert.equal(stockQuantity({ quantity: 4, unit: "pack" }, items[0]).converted, false, "the gauze is counted in packs already");
  assert.equal(stockQuantity({ quantity: 5, unit: "each" }, items[2]).converted, false, "each is each");
  assert.equal(stockQuantity({ quantity: 3, unit: "box" }, { ...items[2], units_per_box: 0 }).converted, false, "no box size on the item, so nothing is worked out");
  assert.equal(stockQuantity({ quantity: 3, unit: "box" }, null).qty, 3);
});

t("a product that normally has an expiry date is known", () => {
  assert.equal(tracksExpiry(items[0]), true);
  assert.equal(tracksExpiry(items[2]), true);
  assert.equal(tracksExpiry(items[1]), false);
  assert.equal(tracksExpiry(null), false);
});

t("a note already booked in is found by its number and supplier, or by the very same file", () => {
  const done = [{ id: "d1", supplier_id: "s1", supplier_name: "MedSupply UK Ltd", note_number: "DN-77120", file: { sha256: "zzz" } }];
  assert.equal(findPreviousDelivery(done, { supplierId: "s1", noteNumber: "dn 77120" })?.id, "d1");
  assert.equal(findPreviousDelivery(done, { supplierId: "s2", noteNumber: "DN-77120" }), null, "another supplier can use the same number");
  assert.equal(findPreviousDelivery(done, { supplierId: "s2", noteNumber: "x", sha256: "zzz" })?.id, "d1", "the same file is the same note");
  assert.equal(findPreviousDelivery(done, { supplierId: "s1", noteNumber: "1" }), null, "a very short number proves nothing");
  assert.equal(findPreviousDelivery([], { supplierId: "s1", noteNumber: "DN-1" }), null);
});

t("the review ticks a row only when the product is certain and the quantity is confirmed, and leaves the rest for the person", () => {
  const read = result([
    row(),                                                                                  // on the order, confirmed
    row({ description: "Needles 21G green 100", code: "", quantity: 10, unit: "pack", evidence: "Needles 21G green 100 10 pack", verified: { description: true, quantity: true } }), // order line by name
    row({ description: "Hypodermic needle", code: "5012345678900", quantity: 2, verified: { quantity: false } }),                    // barcode but quantity not confirmed
    row({ description: "Quantum flux capacitor", code: "QF1", quantity: 1 }),               // not in stock
    row({ description: "Gauze swabs sterile 10x10cm", code: "", quantity: null }),          // no quantity
  ]);
  const review = buildDeliveryReview(read, { items, suppliers, orders, deliveries: [] });
  assert.equal(review.supplierId, "s1");
  assert.equal(review.order.id, "po1");
  assert.equal(review.orderStatus, "exact");
  assert.deepEqual(review.lines.map((l) => l.how), ["order", "order", "barcode", "none", "order"]);
  assert.deepEqual(review.lines.map((l) => l.book), [true, true, false, false, false]);
  assert.equal(review.lines[2].itemId, "i2");
  assert.equal(review.lines[3].itemId, "");
  assert.equal(review.lines[4].quantity, "", "no quantity read, none made up");
  assert.deepEqual(toBook(review).map((l) => l.index), [0, 1]);
});

t("a row matched only by its name is shown but never ticked for you", () => {
  const read = result([row({ code: "", description: "Needles 21G green 100", quantity: 10, evidence: "Needles 21G green 100 10", verified: { quantity: true } })], { orderReference: { value: "" }, supplier: { value: "Somebody Else Ltd" } });
  const review = buildDeliveryReview(read, { items, suppliers, orders: [], deliveries: [] });
  assert.equal(review.lines[0].how, "name");
  assert.equal(review.lines[0].itemId, "i2");
  assert.equal(review.lines[0].book, false);
  assert.equal(review.orderStatus, "none");
});

t("a note that has been booked in before is flagged and nothing is ticked", () => {
  const done = [{ id: "d1", supplier_id: "s1", note_number: "DN-77120", created_by: { displayName: "Sam" } }];
  const review = buildDeliveryReview(result([row()]), { items, suppliers, orders, deliveries: done });
  assert.equal(review.previous.id, "d1");
  assert.equal(review.lines[0].book, false);
});

t("boxes are turned into the stock's units on the row, with the working shown", () => {
  const read = result([row({ description: "Adrenaline 1mg/ml ampoules 10", code: "", quantity: 2, unit: "box", evidence: "Adrenaline 1mg/ml ampoules 10 2 box", batch: "", expiry: "", verified: { quantity: true } })]);
  const review = buildDeliveryReview(read, { items, suppliers, orders, deliveries: [] });
  const l = review.lines[0];
  assert.equal(l.itemId, "i3");
  assert.equal(l.noteQuantity, 2);
  assert.equal(l.quantity, 20);
  assert.equal(l.converted, true);
  assert.equal(l.conversionNote, "2 box x 10 in a box = 20");
  assert.equal(l.expiryExpected, true, "this product normally has an expiry date, and the note gave none");
  assert.equal(l.expiry, "");
});

t("which order is used can be chosen, including none", () => {
  const two = [order, { ...order, id: "po9", po_number: "PO-2026-0500" }];
  const read = result([row()], { orderReference: { value: "" } });
  assert.equal(buildDeliveryReview(read, { items, suppliers, orders: two }).orderStatus, "choose");
  assert.equal(buildDeliveryReview(read, { items, suppliers, orders: two, chosenOrderId: "po9" }).order.id, "po9");
  const none = buildDeliveryReview(read, { items, suppliers, orders: two, chosenOrderId: "none" });
  assert.equal(none.order, null);
  assert.equal(none.lines[0].orderLineIndex, -1);
  assert.equal(none.lines[0].how, "code", "without the order the code still finds it");
});

t("a ticked row must name a stock item, a quantity and a real expiry date", () => {
  assert.equal(lineProblem({ itemId: "i1", quantity: 4, expiry: "2029-03-31" }), "");
  assert.equal(lineProblem({ itemId: "", quantity: 4 }), "Choose the stock item this is.");
  assert.equal(lineProblem({ itemId: "i1", quantity: 0 }), "Give how many arrived.");
  assert.equal(lineProblem({ itemId: "i1", quantity: "" }), "Give how many arrived.");
  assert.equal(lineProblem({ itemId: "i1", quantity: 1, expiry: "31/03/2029" }), "The expiry date is not a real date.");
  const review = { lines: [{ book: true, itemId: "", quantity: 1, description: "x" }, { book: false, itemId: "", quantity: 0 }, { book: true, itemId: "i1", quantity: 2 }] };
  assert.equal(bookingProblems(review).length, 1);
});

t("booking in adds to each order line, calls the order part delivered until everything has come, and says what was extra or over", () => {
  const booked = [{ itemId: "i1", quantity: 6, orderLineIndex: 0, description: "Gauze" }, { itemId: "i3", quantity: 5, orderLineIndex: 2, description: "Adrenaline" }];
  const after = orderAfter(order, booked);
  assert.deepEqual(after.items.map((l) => l.received_qty), [6, 0, 15]);
  assert.equal(after.status, "part_delivered");
  assert.equal(after.complete, false);
  assert.deepEqual(after.outstanding.map((o) => [o.itemName, o.outstanding]), [["Needles 21G green", 1000], ["Adrenaline 1mg/ml ampoules", 5]]);
  assert.equal(order.items[0].received_qty, 0, "the order passed in is not changed");
  const rest = orderAfter(after && { ...order, items: after.items }, [{ itemId: "i2", quantity: 1000, orderLineIndex: 1 }, { itemId: "i3", quantity: 5, orderLineIndex: 2 }]);
  assert.equal(rest.status, "completed");
  assert.equal(rest.complete, true);
  const odd = orderAfter(order, [{ itemId: "i1", quantity: 9, orderLineIndex: 0, description: "Gauze" }, { itemId: "zz", quantity: 1, orderLineIndex: -1, description: "Extra thing" }]);
  assert.equal(odd.over[0].ordered, 6);
  assert.equal(odd.over[0].received, 9);
  assert.equal(odd.extras[0].description, "Extra thing");
  assert.equal(orderAfter(null, booked), null);
  const noIndex = orderAfter(order, [{ itemId: "i2", quantity: 10, orderLineIndex: -1 }]);
  assert.equal(noIndex.items[1].received_qty, 10, "found by its stock item when the row was matched another way");
});

t("the record of a delivery names what was booked, what was not and why, and who did it", () => {
  const review = buildDeliveryReview(result([row(), row({ description: "Quantum flux capacitor", code: "QF1" }), row({ description: "Needles 21G green 100", code: "", quantity: 10, evidence: "Needles 21G green 100 10", verified: { quantity: false } })]), { items, suppliers, orders, deliveries: [] });
  review.lines[0].movementId = "m1";
  const rec = deliveryRecord(review, { booked: [{ ...review.lines[0], itemName: "Gauze swabs sterile 10x10cm" }], failed: [], actor: { uid: "u1", displayName: "Sam" }, order, file: { name: "dn.pdf", path: "stock_deliveries/d1/dn.pdf", bytes: 1234 } });
  assert.equal(rec.supplier_name, "MedSupply UK Ltd");
  assert.equal(rec.po_number, "PO-2026-0412");
  assert.equal(rec.note_number, "DN-77120");
  assert.deepEqual(rec.lines.map((l) => [l.item_id, l.quantity, l.batch_number, l.expiry_date, l.matched_by, l.movement_id]), [["i1", 4, "LOT7781A", "2029-03-31", "order", "m1"]]);
  assert.deepEqual(rec.not_booked.map((x) => x.reason), ["Not in the stock list", "Left unticked by the person booking in"]);
  assert.equal(rec.file.sha256, "abc123");
  assert.equal(rec.file.path, "stock_deliveries/d1/dn.pdf");
  assert.equal(rec.created_by.displayName, "Sam");
  assert.equal(JSON.stringify(rec).includes("undefined"), false, "nothing the database would refuse");
});

t("the sentence at the end says what was done", () => {
  assert.equal(doneWords([{}, {}], [], { complete: false }), "2 products booked into stock; the purchase order is part delivered.");
  assert.equal(doneWords([{}], [], { complete: true }), "1 product booked into stock; the purchase order is complete.");
  assert.equal(doneWords([{}], [{ description: "Gauze" }], null), "1 product booked into stock; 1 could not be booked (Gauze).");
});

t("whoever can change stock may book a delivery in, unless Document reading is off for them; nobody else gets it", () => {
  assert.ok(withDerivedCapabilities(["inventory.read", "inventory.write"]).includes("documents.deliveryNote"));
  assert.ok(!withDerivedCapabilities(["inventory.read"]).includes("documents.deliveryNote"), "reading stock is not enough");
  assert.ok(!withDerivedCapabilities(["inventory.write"], { blockedDomains: ["documents"] }).includes("documents.deliveryNote"), "switched off for them");
  assert.ok(!withDerivedCapabilities(["inventory.write"], { blockedDomains: new Set(["documents"]) }).includes("documents.deliveryNote"));
  assert.ok(withDerivedCapabilities(["inventory.write"], { blockedDomains: ["clinflow"] }).includes("documents.deliveryNote"), "another module being off does not matter");
  assert.deepEqual(withDerivedCapabilities(["inventory.write", "documents.deliveryNote"]), ["inventory.write", "documents.deliveryNote"], "not added twice");
});

t("the screens are wired in: a page and a phone page for whoever books deliveries in, a menu entry, a phone tile, and the reader offers delivery notes", () => {
  const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
  assert.match(read("../src/config/routeManifest.js"), /path: "\/book-in-delivery".*capability: "documents\.deliveryNote"/);
  assert.match(read("../src/apps/DesktopApp.jsx"), /book-in-delivery.*documents\.deliveryNote/);
  assert.match(read("../src/apps/MobileApp.jsx"), /!can\("documents\.deliveryNote"\)/);
  assert.match(read("../src/mobile/roleHomes.js"), /key: "book-in-delivery"/);
  assert.match(read("../src/mobile/MobileLayout.jsx"), /case "book-in-delivery"/);
  assert.match(read("../src/pages/BookInDelivery.jsx"), /onlyKind="delivery"/);
  assert.match(read("../src/components/documents/DocumentIntakePanel.jsx"), /DeliveryNoteReview/);
  const review = read("../src/components/documents/DeliveryNoteReview.jsx");
  for (const text of ["I have checked these rows against the delivery note", "already been booked in", "Not in your stock list", "Matched by its name: check it"]) assert.ok(review.includes(text), text);
  assert.match(read("../src/modules/documents/deliveryService.js"), /source: "delivery_note"/);
  assert.match(read("../src/services/stockService.js"), /delivery_note_number: cleanString\(movement\?\.delivery_note_number\)/);
});

console.log(`\n${n} checks passed`);
