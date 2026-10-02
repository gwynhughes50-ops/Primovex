// Covers the pure logic for moving stock between places (store -> kit etc.),
// src/lib/stockLocations.js.
import assert from "node:assert/strict";
import { kitLocationId, mainStoreName, planTransfer, unassignedQty } from "../src/lib/stockLocations.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };

const adrenaline = () => ({ name: "Adrenaline 1mg/1ml", site: "Main Surgery", location: "Store Room", current_stock: 10, locations: [] });
const box = { locationId: kitLocationId("anaphylaxis_boxes", "box_1"), locationName: "Anaphylaxis Box 1", locationType: "kit" };

t("kitLocationId: namespaced by collection", () => {
  assert.equal(kitLocationId("anaphylaxis_boxes", "box_1"), "kit:anaphylaxis_boxes:box_1");
  assert.notEqual(kitLocationId("emergency_assets", "x"), kitLocationId("anaphylaxis_boxes", "x"));
});

t("main store: everything not placed elsewhere", () => {
  assert.equal(unassignedQty(adrenaline()), 10);
  assert.equal(unassignedQty({ current_stock: 10, locations: [{ quantity: 3 }, { quantity: 2 }] }), 5);
  assert.equal(mainStoreName(adrenaline()), "Main Surgery - Store Room");
  assert.equal(mainStoreName({}), "Main store");
});

t("store -> kit: store loses it, kit gains it, total untouched", () => {
  const item = adrenaline();
  const p = planTransfer(item, { to: box, quantity: 2 });
  assert.deepEqual(p.nextLocations, [{ ...box, quantity: 2 }]);
  const after = { ...item, locations: p.nextLocations };
  assert.equal(unassignedQty(after), 8);       // store now holds 8
  assert.equal(after.current_stock, 10);       // total unchanged
  assert.equal(p.fromName, "Main Surgery - Store Room");
  assert.equal(p.toName, "Anaphylaxis Box 1");
});

t("a second move adds to the kit rather than duplicating it", () => {
  const item = { ...adrenaline(), locations: [{ ...box, quantity: 2 }] };
  const p = planTransfer(item, { to: box, quantity: 1 });
  assert.equal(p.nextLocations.length, 1);
  assert.equal(p.nextLocations[0].quantity, 3);
});

t("kit -> another place: source reduced, emptied source removed", () => {
  const item = { ...adrenaline(), locations: [{ ...box, quantity: 2 }] };
  const p = planTransfer(item, { fromLocationId: box.locationId, to: { locationId: "bag", locationName: "Emergency Bag", locationType: "kit" }, quantity: 2 });
  assert.deepEqual(p.nextLocations, [{ locationId: "bag", locationName: "Emergency Bag", locationType: "kit", quantity: 2 }]);
});

t("kit -> main store returns it", () => {
  const item = { ...adrenaline(), locations: [{ ...box, quantity: 2 }] };
  const p = planTransfer(item, { fromLocationId: box.locationId, to: null, quantity: 1 });
  assert.equal(p.nextLocations[0].quantity, 1);
  assert.equal(p.toName, "Main Surgery - Store Room");
});

t("can't move more than the source holds", () => {
  assert.throws(() => planTransfer(adrenaline(), { to: box, quantity: 11 }), /Only 10 units/);
  const item = { ...adrenaline(), locations: [{ ...box, quantity: 2 }] };
  assert.throws(() => planTransfer(item, { fromLocationId: box.locationId, to: null, quantity: 3 }), /Only 2/);
});

t("main store only counts what isn't already placed elsewhere", () => {
  const item = { ...adrenaline(), locations: [{ ...box, quantity: 9 }] };
  assert.throws(() => planTransfer(item, { to: { locationId: "bag", locationName: "Bag" }, quantity: 2 }), /Only 1 unit/);
});

t("rejects nonsense", () => {
  assert.throws(() => planTransfer(adrenaline(), { to: box, quantity: 0 }), /greater than 0/);
  assert.throws(() => planTransfer(adrenaline(), { to: null, quantity: 1 }), /different place/);
  assert.throws(() => planTransfer(adrenaline(), { fromLocationId: "nowhere", to: box, quantity: 1 }), /no recorded stock/);
  assert.throws(() => planTransfer(adrenaline(), { to: box, quantity: "abc" }), /greater than 0/);
});

t("planTransfer doesn't mutate the item", () => {
  const item = { ...adrenaline(), locations: [{ ...box, quantity: 2 }] };
  const snapshot = JSON.stringify(item);
  planTransfer(item, { to: { locationId: "x", locationName: "X" }, quantity: 1 });
  assert.equal(JSON.stringify(item), snapshot);
});

console.log(`\n${n} passed`);
