import assert from "node:assert/strict";
import {
  buildAddition, buildCount, buildPlaces, buildTake, cleanAudience, countId, expectedAt, isAskedOf, isBigDifference, itemLabel, itemsForPlace, movementFor,
  placeAction, reviewLines, reviewTotals, takeProgress, uncounted, validateAddition, validateTake,
} from "../src/modules/stocktake/stockTake.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };

const items = [
  { id: "i1", name: "Gloves", strength: "", form: "Medium", current_stock: 50, site: "Main Surgery", location: "Store Room" },
  { id: "i2", name: "Adrenaline", strength: "1mg/ml", form: "Ampoule", current_stock: 10, site: "Main Surgery", location: "Treatment Room 1", locations: [{ locationId: "kit:emergency:k1", locationName: "Resus trolley", locationType: "kit", quantity: 4 }] },
  { id: "i3", name: "Syringes", current_stock: 100, site: "main surgery", location: "store room " },
  { id: "i4", name: "Old item", current_stock: 5, site: "Main Surgery", location: "Store Room", archived_at: 1 },
  { id: "i5", name: "Empty", current_stock: 0, site: "Main Surgery", location: "Store Room" },
  { id: "i6", name: "Loose", current_stock: 3 },
];

t("places: each room's own stock, plus every kit or box something has been moved to; archived and empty items don't count", () => {
  const places = buildPlaces(items);
  assert.deepEqual(places.map((p) => [p.name, p.kind, p.itemCount]), [
    ["Main store (no room set)", "store", 1], ["Main Surgery - Store Room", "store", 2], ["Main Surgery - Treatment Room 1", "store", 1], ["Resus trolley", "location", 1],
  ]);
  assert.equal(places.find((p) => p.name === "Main Surgery - Store Room").itemCount, 2, "site and room match without regard to case or stray spaces");
});

t("what a place should hold: the room's own share, not what has moved to a kit", () => {
  const places = buildPlaces(items);
  const store = places.find((p) => p.name === "Main Surgery - Treatment Room 1");
  const kit = places.find((p) => p.name === "Resus trolley");
  assert.equal(expectedAt(items[1], store), 6, "10 in total, 4 are in the trolley");
  assert.equal(expectedAt(items[1], kit), 4);
  assert.equal(expectedAt(items[0], store), 0);
  assert.deepEqual(itemsForPlace(items, places.find((p) => p.name === "Main Surgery - Store Room")).map(itemLabel), ["Gloves Medium", "Syringes"], "listed by name, sorted");
});

t("a new take: the take and one document per place, requests need a name and places", () => {
  const places = buildPlaces(items).slice(0, 2);
  const made = buildTake({ title: " October ", places, audience: { type: "people", uids: ["a", "a", " "] }, dueDate: "2026-10-20", creator: { uid: "pm", name: "PM" } });
  assert.equal(made.take.title, "October");
  assert.deepEqual(made.take.audience, { type: "people", uids: ["a"] });
  assert.equal(made.take.status, "open");
  assert.deepEqual(made.places.map((p) => [p.id, p.status]), [["p1", "free"], ["p2", "free"]]);
  assert.equal(buildTake({ title: "Mine", places, mode: "self", audience: { type: "everyone" }, creator: { uid: "me" } }).take.audience.uids[0], "me", "a self-started take is just for that person");
  assert.deepEqual(cleanAudience({ type: "people", uids: [] }), { type: "everyone" });
  assert.equal(validateTake({ title: "x", places }).length, 0);
  assert.equal(validateTake({ title: " ", places: [] }).length, 2);
  assert.match(validateTake({ title: "x", places, dueDate: "tomorrow" })[0], /date/);
});

t("who is asked: everyone, named people, always the person who started it, and only while it is open", () => {
  const open = { status: "open", createdByUid: "pm", audience: { type: "everyone" } };
  assert.ok(isAskedOf(open, "anyone"));
  const named = { status: "open", createdByUid: "pm", audience: { type: "people", uids: ["nurse"] } };
  assert.ok(isAskedOf(named, "nurse") && isAskedOf(named, "pm") && !isAskedOf(named, "hca"));
  assert.ok(!isAskedOf({ ...open, status: "review" }, "anyone"));
  const byRole = { status: "open", createdByUid: "pm", audience: { type: "roles", roles: ["Nurse", "HCA"] } };
  assert.ok(isAskedOf(byRole, "u1", "Nurse") && isAskedOf(byRole, "u2", "HCA") && !isAskedOf(byRole, "u3", "Reception") && isAskedOf(byRole, "pm", "Practice Manager"));
  assert.deepEqual(cleanAudience({ type: "roles", roles: [" Nurse ", "Nurse", ""] }), { type: "roles", roles: ["Nurse"] });
  assert.deepEqual(cleanAudience({ type: "roles", roles: [] }), { type: "everyone" });
});

t("progress and what a place offers each person", () => {
  const places = [{ status: "done" }, { status: "claimed" }, { status: "free" }, { status: "free" }];
  assert.deepEqual(takeProgress(places), { total: 4, done: 1, counting: 1, free: 2, percent: 25 });
  assert.equal(takeProgress([]).percent, 0);
  assert.equal(placeAction({ status: "free" }, "me"), "claim");
  assert.equal(placeAction({ status: "claimed", claimedByUid: "me" }, "me"), "continue");
  assert.equal(placeAction({ status: "claimed", claimedByUid: "you" }, "me"), "busy");
  assert.equal(placeAction({ status: "done", claimedByUid: "me" }, "me"), "reopen");
  assert.equal(placeAction({ status: "done", claimedByUid: "you" }, "me"), "done");
});

const take = buildTake({ title: "T", places: buildPlaces(items), creator: { uid: "pm" } });
const place = (name) => take.places.find((p) => p.name === name);
const store = { ...place("Main Surgery - Store Room"), status: "done" };
const kit = { ...place("Resus trolley"), status: "done" };

t("a count remembers what was expected without showing it, and is replaced by a recount", () => {
  const count = buildCount({ place: store, item: items[0], counted: "46.9", source: "scan", actor: { uid: "u", name: "Nurse" } });
  assert.equal(count.id, countId(store.id, "i1"));
  assert.deepEqual([count.counted, count.expected, count.unexpected], [46, 50, false]);
  assert.equal(buildCount({ place: store, item: items[1], counted: 2 }).unexpected, true, "not expected here");
  assert.equal(buildCount({ place: store, item: items[0], counted: -3 }).counted, 0);
});

t("finishing a place: the listed items nobody has counted", () => {
  const counts = [buildCount({ place: store, item: items[0], counted: 50 })];
  assert.deepEqual(uncounted(items, store, counts).map(itemLabel), ["Syringes"]);
  assert.equal(uncounted(items, store, [...counts, buildCount({ place: store, item: items[2], counted: 1 })]).length, 0);
});

t("big differences are the ones worth a second look", () => {
  assert.ok(!isBigDifference(50, 50));
  assert.ok(!isBigDifference(50, 49), "one off in fifty is fine");
  assert.ok(isBigDifference(50, 60), "ten or more");
  assert.ok(isBigDifference(4, 2), "half of a small stock");
  assert.ok(!isBigDifference(100, 98));
  assert.ok(isBigDifference(0, 12));
});

t("review lines: differences first, matches last, uncounted listed items called out, nothing applicable until the place is done", () => {
  const counts = [
    buildCount({ place: store, item: items[0], counted: 38 }),
    buildCount({ place: kit, item: items[1], counted: 4 }),
    buildCount({ place: store, item: items[1], counted: 2 }),
  ];
  counts[1].applied = false;
  const lines = reviewLines({ places: [store, kit], counts, items });
  assert.deepEqual(lines.map((l) => [l.itemLabel, l.kind]), [
    ["Gloves Medium", "difference"], ["Adrenaline 1mg/ml Ampoule", "unexpected"], ["Syringes", "not-counted"], ["Adrenaline 1mg/ml Ampoule", "match"],
  ]);
  assert.equal(lines[0].big, true);
  assert.equal(lines[0].change, -12);
  assert.deepEqual(reviewTotals(lines), { matched: 1, differences: 1, unexpected: 1, notCounted: 1, big: 2, applied: 0 });
  const open = reviewLines({ places: [{ ...store, status: "claimed" }], counts: [counts[0]], items });
  assert.equal(open[0].applicable, false, "provisional until the place is finished");
  assert.equal(open.length, 1, "uncounted items aren't listed until the place is finished");
});

t("applying: a counted figure sets that place; a find in a room's main store has no clear home so it is only reported", () => {
  const lines = reviewLines({ places: [store, kit], counts: [buildCount({ place: store, item: items[0], counted: 38 }), buildCount({ place: store, item: items[1], counted: 2 }), buildCount({ place: kit, item: items[1], counted: 3 })], items });
  const gloves = lines.find((l) => l.itemId === "i1");
  assert.deepEqual(movementFor(gloves), { itemId: "i1", movement: { type: "adjust", place_count: true, set_to: 38, locationId: null, locationName: "Main Surgery - Store Room", locationType: undefined } });
  const trolley = lines.find((l) => l.placeName === "Resus trolley");
  assert.equal(movementFor(trolley).movement.locationId, "kit:emergency:k1");
  assert.equal(movementFor(trolley).movement.set_to, 3);
  assert.equal(movementFor(lines.find((l) => l.kind === "unexpected")), null);
  const zero = lines.find((l) => l.kind === "not-counted");
  assert.equal(movementFor(zero).movement.set_to, 0);
  assert.equal(movementFor({ ...gloves, applied: true, applicable: false }), null);
});

t("a thing typed in because it isn't in the system needs a name and a whole-number quantity", () => {
  assert.equal(validateAddition({ name: "Spare thermometer", quantity: 2 }).length, 0);
  assert.equal(validateAddition({ name: " ", quantity: 0 }).length, 2);
  assert.equal(validateAddition({ name: "x", quantity: 1.5 }).length, 1);
  const add = buildAddition({ place: store, name: " Thermometer ", barcode: " 123 ", quantity: "3", actor: { uid: "u", name: "N" } });
  assert.deepEqual([add.name, add.barcode, add.quantity, add.status, add.location, add.site], ["Thermometer", "123", 3, "new", "Store Room", "Main Surgery"]);
});

console.log(`\n${n} passed`);
