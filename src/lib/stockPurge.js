// Permanently deleting a stock item is not undoable, so the confirmation asks
// for the item's name to be typed. Kept pure so it can be tested.

export function purgeConfirmMatches(typed, itemName) {
  const expected = String(itemName ?? "").trim().toLowerCase();
  if (!expected) return false;
  return String(typed ?? "").trim().toLowerCase() === expected;
}

// What the person should know before they confirm, drawn from the item itself.
export function purgeConsequences(item = {}) {
  const lines = [];
  const stock = Number(item.current_stock);
  if (Number.isFinite(stock) && stock > 0) {
    lines.push(`${stock} unit${stock === 1 ? " is" : "s are"} recorded as in stock. That stock record will be gone.`);
  }
  const places = Array.isArray(item.locations) ? item.locations.length : 0;
  if (places > 0) lines.push(`It is recorded in ${places} place${places === 1 ? "" : "s"} (rooms, equipment or kits).`);
  if (item.photo_url) lines.push("Its photo will be deleted.");
  lines.push("Its past movements stay in the audit history, under its name, but it can't be brought back. To keep it but hide it, archive it instead.");
  return lines;
}
