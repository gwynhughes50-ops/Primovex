// Small pure helpers for building an emergency kit / anaphylaxis box in the
// Manage dialog (ChecklistManagerDialog.jsx). Kept separate so the ID and
// item logic can be tested without React.

export function normaliseItem(it = {}) {
  return {
    id: it.id || "",
    section: it.section || "General",
    name: it.name || "",
    expectedQty: it.expectedQty ?? "",
    defaultBatch: it.defaultBatch ?? "",
    defaultExpiry: it.defaultExpiry ?? "",
    stock_barcode: it.stock_barcode ?? "",
  };
}

export function blankItem() {
  return normaliseItem({});
}

// A new box's ID is assigned from its name rather than typed in by hand.
export function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export function uniqueKitId(name, existingIds = []) {
  const root = slugify(name) || "kit";
  if (!existingIds.includes(root)) return root;
  let n = 2;
  while (existingIds.includes(`${root}_${n}`)) n += 1;
  return `${root}_${n}`;
}

// Item ids key the results of every check, so they must stay unique within a
// kit. Deriving the next one from the list length would reuse an id as soon
// as an earlier item has been deleted.
export function nextItemId(items = []) {
  const used = new Set(items.map((item) => item.id));
  let n = items.length + 1;
  while (used.has(`item_${n}`)) n += 1;
  return `item_${n}`;
}

export function formatExpiry(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value || "");
}

export function summariseItem(item) {
  const bits = [];
  if (String(item.expectedQty ?? "").trim() !== "") bits.push(`Qty ${item.expectedQty}`);
  if (item.defaultBatch) bits.push(`Batch ${item.defaultBatch}`);
  if (item.defaultExpiry) bits.push(`Expiry ${formatExpiry(item.defaultExpiry)}`);
  if (item.stock_barcode) bits.push(`Barcode ${item.stock_barcode}`);
  return bits.length ? bits.join(" · ") : "No quantity, batch, expiry or barcode set";
}
