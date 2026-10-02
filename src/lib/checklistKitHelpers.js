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
    // Link to the Inventory stock record, and whether this kit item shows that
    // record's current batch / expiry (the default) or its own saved ones.
    stock_item_id: it.stock_item_id ?? "",
    followStock: it.followStock !== false,
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

// The stock item a kit item is linked to: by id when it has one, otherwise by
// barcode (kit items set up before the id link existed).
export function findStockForItem(item, stockItems = []) {
  if (!item) return null;
  if (item.stock_item_id) {
    const byId = stockItems.find((s) => s.id === item.stock_item_id);
    if (byId) return byId;
  }
  const barcode = String(item.stock_barcode || "").trim().toLowerCase();
  if (!barcode) return null;
  return stockItems.find((s) => String(s?.barcode || "").trim().toLowerCase() === barcode) || null;
}

function isoDate(value) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

// What picking a stock item should fill in on a kit item: its name, barcode
// and link, plus the batch and expiry recorded against it in Inventory, so
// they don't have to be typed twice. Anything the stock item doesn't have
// comes through blank rather than keeping the previous item's value. Expiry
// is only carried across when it's a real YYYY-MM-DD date (what the date
// field needs); anything else is left for the person to enter.
export function fieldsFromStock(stock = {}) {
  return {
    name: stock.name || "",
    stock_barcode: stock.barcode || "",
    stock_item_id: stock.id || "",
    followStock: true,
    defaultBatch: String(stock.batch_number || "").trim(),
    defaultExpiry: isoDate(stock.expiry_date),
  };
}

// The batch / expiry a kit item should show right now. A linked item that
// follows stock takes the stock record's current values; where the stock
// record has none, the item's own saved value is kept rather than blanked.
// An item set to use its own values, or with no stock record, is returned as is.
// `fromStock` marks which values came from the stock record so the screens can
// say so. Never written back - saving a kit uses the editor's own fields.
export function resolveKitItem(item, stockItems = []) {
  if (!item || item.followStock === false) return item;
  const stock = findStockForItem(item, stockItems);
  if (!stock) return item;
  const batch = String(stock.batch_number || "").trim();
  const expiry = isoDate(stock.expiry_date);
  if (!batch && !expiry) return item;
  return {
    ...item,
    defaultBatch: batch || item.defaultBatch || "",
    defaultExpiry: expiry || item.defaultExpiry || "",
    fromStock: true,
  };
}

export function resolveKitItems(items = [], stockItems = []) {
  return items.map((item) => resolveKitItem(item, stockItems));
}
