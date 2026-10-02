// The quick actions on the phone's one-item-at-a-time kit check: swap an item
// for a new one, message a colleague, or flag it to come back to. The choices
// each action offers are decided here, as pure functions, so they can be tested.
import { describeBatches } from "./stockBatches";
import { findStockForItem } from "./checklistKitHelpers";

// ---- "Remind me later" ------------------------------------------------------

export const REMIND_OPTIONS = [
  { id: "later-today", label: "Later today" },
  { id: "tomorrow", label: "Tomorrow morning" },
  { id: "next-week", label: "Next week" },
];

// When a reminder should surface. Later today is three hours on (or tomorrow
// morning if that would land in the evening or night); the others are 09:00.
export function remindAtFor(optionId, now = new Date()) {
  const at = new Date(now);
  switch (optionId) {
    case "later-today": {
      at.setHours(at.getHours() + 3, 0, 0, 0);
      if (at.getHours() >= 18 || at.getDate() !== now.getDate()) {
        at.setTime(now.getTime());
        at.setDate(at.getDate() + 1);
        at.setHours(9, 0, 0, 0);
      }
      return at;
    }
    case "next-week":
      at.setDate(at.getDate() + 7);
      at.setHours(9, 0, 0, 0);
      return at;
    case "tomorrow":
    default:
      at.setDate(at.getDate() + 1);
      at.setHours(9, 0, 0, 0);
      return at;
  }
}

// ---- "Message someone" ------------------------------------------------------

export const QUICK_MESSAGES = [
  "Please replace this item.",
  "Please order more of this.",
  "Can you check this with me?",
  "Please look at this when you can.",
];

export const MESSAGE_MAX = 300;

// What can be sent: trimmed, never empty, capped. Returns { ok, text, error }.
export function prepareMessage(text) {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return { ok: false, text: "", error: "Write a message, or choose one of the quick ones." };
  if (clean.length > MESSAGE_MAX) return { ok: false, text: clean, error: `Keep it to ${MESSAGE_MAX} characters.` };
  return { ok: true, text: clean, error: "" };
}

// ---- "Replace with a new one" -----------------------------------------------

const today = (now) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

// The batches of this item that are in stock and still in date, soonest-expiring
// first (stock is used first-expiry-first), each marked if it is the one the kit
// currently has. Empty when the item isn't linked to a stock record - then the
// replacement's batch and expiry are typed.
export function replacementOptions(kitItem, stockItems = [], now = new Date()) {
  const stock = findStockForItem(kitItem, stockItems);
  if (!stock) return { stock: null, options: [] };
  const limit = today(now);
  const options = describeBatches(stock)
    .filter((b) => b.quantity > 0 && (!b.expiry_date || b.expiry_date >= limit))
    .map((b) => ({
      ...b,
      current:
        String(b.batch_number).toLowerCase() === String(kitItem.defaultBatch || "").toLowerCase() &&
        b.expiry_date === String(kitItem.defaultExpiry || ""),
    }));
  return { stock, options };
}

// The replacement as recorded on the check result and sent to update the kit.
export function buildReplacement(kitItem, { batch_number = "", expiry_date = "" } = {}) {
  return {
    batch_number: String(batch_number || "").trim(),
    expiry_date: /^\d{4}-\d{2}-\d{2}$/.test(String(expiry_date || "")) ? String(expiry_date) : "",
    previousBatch: String(kitItem?.defaultBatch || ""),
    previousExpiry: String(kitItem?.defaultExpiry || ""),
  };
}

// Whether a replacement actually changes anything.
export function isRealChange(replacement) {
  return Boolean(replacement) &&
    (replacement.batch_number !== replacement.previousBatch || replacement.expiry_date !== replacement.previousExpiry);
}
