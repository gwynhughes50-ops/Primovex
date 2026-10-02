// Pure logic for where a stock item physically is. An item keeps one
// authoritative `current_stock` total; `locations` breaks part of that total
// down by place (a room, a piece of equipment, or an emergency / anaphylaxis
// kit). Whatever isn't in `locations` is implicitly still in the item's own
// main store (item.site / item.location). Moving stock between places only
// ever shifts quantity between those buckets - the total never changes.

export function toNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function applyLocationDelta(locations, locationId, locationName, locationType, delta) {
  const list = Array.isArray(locations) ? locations.map((loc) => ({ ...loc })) : [];
  const index = list.findIndex((loc) => loc.locationId === locationId);
  if (index === -1) {
    if (delta < 0) throw new Error("This location has no recorded stock for this item.");
    if (delta === 0) return list;
    list.push({ locationId, locationName: locationName || locationId, locationType: locationType || "space", quantity: delta });
    return list;
  }
  const nextQty = toNumber(list[index].quantity, 0) + delta;
  if (nextQty < 0) throw new Error("Not enough stock recorded at this location.");
  if (nextQty === 0) {
    list.splice(index, 1);
  } else {
    list[index] = { ...list[index], quantity: nextQty, locationName: locationName || list[index].locationName };
  }
  return list;
}

// A kit's id as a stock location. Prefixed with its collection so an
// emergency kit and an anaphylaxis box can never collide with each other, or
// with a room / equipment id.
export function kitLocationId(collectionName, kitId) {
  return `kit:${collectionName}:${kitId}`;
}

// How many units are in the item's main store: the total minus everything
// assigned elsewhere.
export function unassignedQty(item) {
  const total = toNumber(item?.current_stock, 0);
  const assigned = (Array.isArray(item?.locations) ? item.locations : [])
    .reduce((sum, loc) => sum + toNumber(loc.quantity, 0), 0);
  return Math.max(0, total - assigned);
}

export function mainStoreName(item) {
  return [item?.site, item?.location].filter(Boolean).join(" - ") || "Main store";
}

// Works out the new `locations` array for moving `quantity` units. `fromLocationId`
// / `to.locationId` of null mean the item's main store. Throws a plain-English
// error for anything that doesn't add up, so nothing is half-applied.
export function planTransfer(item, { fromLocationId = null, to = null, quantity } = {}) {
  const qty = Math.abs(toNumber(quantity, 0));
  if (qty <= 0) throw new Error("Quantity must be greater than 0.");

  const from = fromLocationId || null;
  const toId = to?.locationId || null;
  if (from === toId) throw new Error("Choose a different place to move it to.");

  let locations = Array.isArray(item?.locations) ? item.locations : [];
  let fromName;

  if (from) {
    const existing = locations.find((loc) => loc.locationId === from);
    if (!existing) throw new Error("There is no recorded stock of this item at the place you're moving it from.");
    fromName = existing.locationName || from;
    if (qty > toNumber(existing.quantity, 0)) {
      throw new Error(`Only ${existing.quantity} of this item ${toNumber(existing.quantity, 0) === 1 ? "is" : "are"} at ${fromName}.`);
    }
    locations = applyLocationDelta(locations, from, fromName, existing.locationType, -qty);
  } else {
    fromName = mainStoreName(item);
    const available = unassignedQty(item);
    if (qty > available) {
      throw new Error(`Only ${available} unit${available === 1 ? "" : "s"} of this item ${available === 1 ? "is" : "are"} in ${fromName}.`);
    }
  }

  let toName;
  if (toId) {
    toName = to.locationName || toId;
    locations = applyLocationDelta(locations, toId, toName, to.locationType || "space", qty);
  } else {
    toName = mainStoreName(item);
  }

  return { nextLocations: locations, quantity: qty, fromName, toName };
}
