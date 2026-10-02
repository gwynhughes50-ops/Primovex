// Type-ahead for putting a delivery on the system: as someone types
// "eclipse" or "BD ecl", Primovex suggests the products it already knows (every
// stock item, including archived ones), so a repeat delivery is a couple of
// taps - pick the product, then say how many, the batch and the expiry -
// instead of retyping the name, strength, brand and so on. Pure, so it can be
// tested.

const norm = (value) => String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const isArchived = (item) => Boolean(item?.archived_at);

// Everything about an item a person might type to find it.
function haystack(item) {
  return norm([item.name, item.strength, item.form, item.brand, item.barcode, item.supplier_sku].filter(Boolean).join(" "));
}

// 0 = best. Typing the start of the name beats a word inside it, which beats
// matching the strength/brand/barcode.
function score(item, query, tokens) {
  const name = norm(item.name);
  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  if (name.split(/[\s(),/-]+/).some((word) => word.startsWith(tokens[0]))) return 2;
  if (name.includes(query)) return 3;
  if (norm(item.barcode) === query) return 0;
  return 4;
}

// Products matching what was typed, best first. Every word typed must appear
// somewhere in the item (so "eclipse orange" finds "BD Eclipse Needle (Orange)"),
// active items come before archived ones, and the list is capped.
export function suggestStock(items = [], text, { limit = 8 } = {}) {
  const query = norm(text);
  if (query.length < 2) return [];
  const tokens = query.split(" ");
  return items
    .filter((item) => item && item.name)
    .filter((item) => {
      const text = haystack(item);
      return tokens.every((token) => text.includes(token));
    })
    .map((item) => ({ item, rank: score(item, query, tokens) }))
    .sort((a, b) =>
      Number(isArchived(a.item)) - Number(isArchived(b.item)) ||
      a.rank - b.rank ||
      String(a.item.name).localeCompare(String(b.item.name), "en", { sensitivity: "base" }))
    .slice(0, limit)
    .map(({ item }) => item);
}

// The second line under a suggestion: what tells similar items apart.
export function suggestionDetail(item) {
  const place = [item.site, item.location].filter(Boolean).join(" - ");
  const stock = Number.isFinite(Number(item.current_stock)) ? `${Number(item.current_stock)} in stock` : "";
  return [[item.strength, item.form].filter(Boolean).join(" "), item.brand, place, stock, isArchived(item) ? "archived" : ""]
    .filter(Boolean)
    .join(" · ");
}

// What a delivery usually needs from the receiver: a quantity pre-filled from
// what the practice normally orders (the item's order quantity, else its box
// size, else 1), and blanks for the details that change every delivery.
export function receiveDefaults(item) {
  const orderQty = Number(item?.order_quantity);
  const box = Number(item?.units_per_box);
  const qty = orderQty > 0 ? orderQty : box > 0 ? box : 1;
  return { qty: String(Math.floor(qty)), batch_number: "", expiry_date: "", barcode: "" };
}

// The live item that is the same product at the same place, if any - the thing
// "add a new item" would duplicate. A product is its name + strength + form
// (see stockService); the same product at another site or in another room is a
// separate record by design, so only an exact place match counts.
export function findSameProduct(items = [], { name, strength, form, site, location } = {}) {
  const key = [name, strength, form].map(norm).join("|");
  if (!norm(name)) return null;
  return (
    items.find((item) =>
      !isArchived(item) &&
      [item.name, item.strength, item.form].map(norm).join("|") === key &&
      norm(item.site) === norm(site) &&
      norm(item.location) === norm(location)
    ) || null
  );
}

// New stock level after receiving (for the "40 now -> 80" preview).
export function stockAfterReceive(item, qty) {
  const current = Number(item?.current_stock);
  const add = Math.floor(Number(qty));
  if (!Number.isFinite(add) || add <= 0) return Number.isFinite(current) ? current : 0;
  return (Number.isFinite(current) ? current : 0) + add;
}
