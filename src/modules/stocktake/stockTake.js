// Stock take: the rules (no Firestore, no screens). A stock take covers a set of places (a room or cupboard's own
// stock, or a kit/trolley/box). Team members claim a place on their phone, count what is physically there, and the
// differences wait for a manager to review before any stock figure changes.

import { toNumber, unassignedQty, mainStoreName } from "../../lib/stockLocations.js";
import { findSameProduct } from "../../lib/stockSuggestions.js";

export const TAKE_STATUS = { open: "open", review: "review", closed: "closed", cancelled: "cancelled" };
export const PLACE_STATUS = { free: "free", claimed: "claimed", done: "done" };

const norm = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
const trim = (value) => String(value || "").trim();

export const itemLabel = (item) => [item?.name, item?.strength, item?.form].map(trim).filter(Boolean).join(" ") || "Unnamed item";

const live = (items) => (items || []).filter((item) => item && !item.archived_at);

// ---- places ------------------------------------------------------------------------------------------------

export const storeKey = (site, location) => `store:${norm(site)}|${norm(location)}`;
export const locationKey = (locationId) => `loc:${locationId}`;

// Every place stock is recorded: the main store of each room (an item's own site and room, less anything it has
// moved elsewhere) and every other place it has been moved to (a kit, a box, a piece of equipment).
// rooms: [{ site, name }] from Practice Admin (sites and spaces), so a room with nothing recorded yet can still be counted:
// the first stock take of a practice starts with no stock on the system at all.
export function buildPlaces(items, rooms = []) {
  const places = new Map();
  for (const item of live(items)) {
    if (unassignedQty(item) > 0) {
      const key = storeKey(item.site, item.location);
      const place = places.get(key) || { key, kind: "store", name: trim(item.location) ? [trim(item.site), trim(item.location)].filter(Boolean).join(" - ") : "Main store (no room set)", site: trim(item.site), location: trim(item.location), locationId: null, locationType: null, itemCount: 0 };
      place.itemCount += 1;
      places.set(key, place);
    }
    for (const loc of Array.isArray(item.locations) ? item.locations : []) {
      if (!loc?.locationId || toNumber(loc.quantity, 0) <= 0) continue;
      const key = locationKey(loc.locationId);
      const place = places.get(key) || { key, kind: "location", name: loc.locationName || loc.locationId, site: "", location: "", locationId: loc.locationId, locationType: loc.locationType || "space", itemCount: 0 };
      place.itemCount += 1;
      places.set(key, place);
    }
  }
  for (const room of rooms || []) {
    const name = trim(room?.name);
    if (!name) continue;
    const key = storeKey(room.site, name);
    if (places.has(key)) continue;
    places.set(key, { key, kind: "store", name: [trim(room.site), name].filter(Boolean).join(" - "), site: trim(room.site), location: name, locationId: null, locationType: null, itemCount: 0 });
  }
  return [...places.values()].sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true, sensitivity: "base" }));
}

// How many of an item the system expects at a place.
export function expectedAt(item, place) {
  if (!item || !place) return 0;
  if (place.kind === "location") {
    const loc = (Array.isArray(item.locations) ? item.locations : []).find((l) => l.locationId === place.locationId);
    return toNumber(loc?.quantity, 0);
  }
  return storeKey(item.site, item.location) === place.key ? unassignedQty(item) : 0;
}

// The items a place should hold, by name (no quantities: the count is blind).
export function itemsForPlace(items, place) {
  return live(items)
    .filter((item) => expectedAt(item, place) > 0)
    .sort((a, b) => itemLabel(a).localeCompare(itemLabel(b), "en", { sensitivity: "base" }));
}

// ---- a take ------------------------------------------------------------------------------------------------

// audience: { type: "everyone" }, { type: "roles", roles: [...] } (asked by role) or { type: "people", uids: [...] } (a take someone started for themselves)
export function cleanAudience(audience) {
  if (audience?.type === "roles") {
    const roles = [...new Set((audience.roles || []).map(trim).filter(Boolean))];
    if (roles.length) return { type: "roles", roles };
  }
  if (audience?.type === "people") {
    const uids = [...new Set((audience.uids || []).map(trim).filter(Boolean))];
    if (uids.length) return { type: "people", uids };
  }
  return { type: "everyone" };
}

export function validateTake({ title, places, dueDate }) {
  const problems = [];
  if (!trim(title)) problems.push("Give the stock take a name, for example \"October stock take\".");
  if (!(places || []).length) problems.push("Choose at least one place to count.");
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) problems.push("The due date isn't a date.");
  return problems;
}

// The documents for a new take: the take itself and one document per place (so claims never fight over one record).
export function buildTake({ title, places, audience, dueDate = "", note = "", mode = "requested", creator = {} }) {
  return {
    take: {
      title: trim(title), note: trim(note), dueDate: dueDate || "", mode: mode === "self" ? "self" : "requested",
      audience: mode === "self" ? { type: "people", uids: [creator.uid] } : cleanAudience(audience),
      status: TAKE_STATUS.open, placeCount: places.length,
      createdByUid: creator.uid || "", createdByName: creator.name || "",
    },
    places: places.map((place, index) => ({
      id: `p${index + 1}`, key: place.key, kind: place.kind, name: place.name, site: place.site || "", location: place.location || "",
      locationId: place.locationId || null, locationType: place.locationType || null, status: PLACE_STATUS.free,
      claimedByUid: null, claimedByName: null,
    })),
  };
}

// Is this take asking this person to count?
export function isAskedOf(take, uid, role = "") {
  if (!take || take.status !== TAKE_STATUS.open) return false;
  if (take.createdByUid === uid) return true;
  const audience = take.audience || { type: "everyone" };
  if (audience.type === "roles") return (audience.roles || []).includes(role);
  return audience.type === "everyone" || (audience.uids || []).includes(uid);
}

export function takeProgress(places) {
  const total = places.length;
  const done = places.filter((p) => p.status === PLACE_STATUS.done).length;
  const counting = places.filter((p) => p.status === PLACE_STATUS.claimed).length;
  return { total, done, counting, free: total - done - counting, percent: total ? Math.round((done / total) * 100) : 0 };
}

// What a person can do with a place right now.
export function placeAction(place, uid) {
  if (place.status === PLACE_STATUS.free) return "claim";
  if (place.status === PLACE_STATUS.claimed) return place.claimedByUid === uid ? "continue" : "busy";
  return place.claimedByUid === uid ? "reopen" : "done";
}

export const countId = (placeId, itemId) => `${placeId}_${itemId}`;

export function buildCount({ place, item, counted, source = "search", actor = {} }) {
  const expected = expectedAt(item, place);
  return {
    id: countId(place.id, item.id),
    placeId: place.id, itemId: item.id, itemLabel: itemLabel(item), counted: Math.max(0, Math.floor(toNumber(counted, 0))),
    expected, unexpected: expected === 0, source, countedByUid: actor.uid || "", countedByName: actor.name || "", applied: false,
  };
}

// ---- finishing a place -------------------------------------------------------------------------------------

// The listed items nobody has counted yet.
export function uncounted(items, place, counts) {
  const have = new Set((counts || []).filter((c) => c.placeId === place.id).map((c) => c.itemId));
  return itemsForPlace(items, place).filter((item) => !have.has(item.id));
}

// ---- review ------------------------------------------------------------------------------------------------

// A difference worth a second look: a big swing in absolute or relative terms.
export function isBigDifference(expected, counted) {
  const diff = Math.abs(counted - expected);
  if (diff === 0) return false;
  return diff >= 10 || (diff >= 2 && diff / Math.max(expected, 1) >= 0.25);
}

// One line per counted item, plus one per listed item left uncounted in a finished place.
//   kind: "match" | "difference" | "unexpected" | "not-counted"
//   applicable: whether the review can apply it (a find in a room's main store has no clear place to put it)
export function reviewLines({ places, counts, items }) {
  const byId = new Map(live(items).map((item) => [item.id, item]));
  const lines = [];
  for (const place of places) {
    const placeCounts = counts.filter((c) => c.placeId === place.id);
    for (const count of placeCounts) {
      const item = byId.get(count.itemId);
      const current = item ? expectedAt(item, place) : 0;
      const unexpected = count.unexpected && current === 0;
      const change = count.counted - current;
      const kind = unexpected ? "unexpected" : change === 0 ? "match" : "difference";
      lines.push({
        id: count.id, placeId: place.id, placeName: place.name, placeDone: place.status === PLACE_STATUS.done, itemId: count.itemId, itemLabel: count.itemLabel,
        counted: count.counted, expectedAtCount: count.expected, current, change, kind, applied: Boolean(count.applied), countedByName: count.countedByName || "",
        big: kind !== "match" && isBigDifference(current, count.counted),
        applicable: Boolean(item) && !count.applied && kind !== "match" && (kind !== "unexpected" || place.kind === "location") && place.status === PLACE_STATUS.done,
        place,
      });
    }
    if (place.status === PLACE_STATUS.done) {
      for (const item of uncounted(items, place, counts)) {
        const current = expectedAt(item, place);
        lines.push({
          id: countId(place.id, item.id), placeId: place.id, placeName: place.name, placeDone: true, itemId: item.id, itemLabel: itemLabel(item), counted: null, expectedAtCount: current, current,
          change: -current, kind: "not-counted", applied: false, countedByName: "", big: false, applicable: true, place,
        });
      }
    }
  }
  const rank = { difference: 0, unexpected: 1, "not-counted": 2, match: 3 };
  return lines.sort((a, b) => Number(b.big) - Number(a.big) || rank[a.kind] - rank[b.kind] || a.placeName.localeCompare(b.placeName) || a.itemLabel.localeCompare(b.itemLabel));
}

export function reviewTotals(lines) {
  const count = (kind) => lines.filter((l) => l.kind === kind).length;
  return { matched: count("match"), differences: count("difference"), unexpected: count("unexpected"), notCounted: count("not-counted"), big: lines.filter((l) => l.big).length, applied: lines.filter((l) => l.applied).length };
}

// What to send to the stock service for a reviewed line (null when it can't be applied).
export function movementFor(line) {
  if (!line.applicable) return null;
  const counted = line.kind === "not-counted" ? 0 : line.counted;
  return {
    itemId: line.itemId,
    movement: { type: "adjust", place_count: true, set_to: counted, locationId: line.place.locationId || null, locationName: line.place.name, locationType: line.place.locationType || undefined },
  };
}

// Anyone typing a new item in: the minimum a manager needs to turn it into stock. Everything else is optional but is
// carried through, so the manager can create the item complete (name, strength, form, brand, barcode, category and
// subcategory, with the site and room taken from the place being counted) without retyping any of it.
export function validateAddition({ name, quantity }) {
  const problems = [];
  if (!trim(name)) problems.push("Enter what the item is.");
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty < 1 || !Number.isInteger(qty)) problems.push("Enter how many there are (a whole number, 1 or more).");
  return problems;
}

export function buildAddition({ place, name, brand = "", strength = "", form = "", barcode = "", category = "", subcategory = "", quantity, expiryDate = "", batchNumber = "", note = "", actor = {} }) {
  return {
    placeId: place.id, placeName: place.name, site: place.site || "", location: place.kind === "store" ? place.location : place.name,
    name: trim(name), brand: trim(brand), strength: trim(strength), form: trim(form), barcode: trim(barcode),
    category: trim(category), subcategory: trim(subcategory),
    quantity: Math.floor(Number(quantity)), expiryDate: expiryDate || "", batchNumber: trim(batchNumber), note: trim(note),
    status: "new", addedByUid: actor.uid || "", addedByName: actor.name || "",
  };
}

export const additionLabel = (addition) => [addition?.name, addition?.strength, addition?.form].map(trim).filter(Boolean).join(" ") || "Unnamed item";

// What to send to the stock service to create the item from an addition.
export function itemFromAddition(addition) {
  return {
    name: trim(addition.name), strength: trim(addition.strength), form: trim(addition.form), brand: trim(addition.brand), barcode: trim(addition.barcode),
    category: trim(addition.category), subcategory: trim(addition.subcategory),
    site: trim(addition.site), location: trim(addition.location),
    batch_number: trim(addition.batchNumber), expiry_date: addition.expiryDate || "",
    current_stock: Math.floor(toNumber(addition.quantity, 0)),
    min_stock: 1, max_stock: Math.max(10, Math.floor(toNumber(addition.quantity, 0))),
  };
}

// The item already in the system that this would duplicate (the same product at the same place), if any.
export function duplicateOfAddition(items, addition) {
  return findSameProduct(live(items), { name: addition.name, strength: addition.strength, form: addition.form, site: addition.site, location: addition.location });
}

// Which waiting additions can be created in one go: those that are new and don't repeat something already in stock or
// each other (two people finding the same thing in the same room); the rest are left for the manager to decide.
export function planAdditions(items, additions) {
  const create = [];
  const skipped = [];
  const seen = new Set();
  for (const addition of additions || []) {
    if (addition.status !== "new") continue;
    const key = [additionLabel(addition), addition.site, addition.location].map(norm).join("|");
    const duplicate = duplicateOfAddition(items, addition);
    if (duplicate) skipped.push({ addition, reason: "already-in-stock", item: duplicate });
    else if (seen.has(key)) skipped.push({ addition, reason: "repeated-in-take" });
    else { seen.add(key); create.push(addition); }
  }
  return { create, skipped };
}

export { mainStoreName };
export const STOCKTAKE_CAPABILITIES = { count: "stocktake.count", manage: "stocktake.manage" };
