import { createProposal } from "../../orb/actionProposals";
import { currentBatches } from "../../lib/stockBatches";
import { itemLabel, itemPlacements } from "./stockAsk";
import { plural } from "../tools/answerWording";

// "Take the expired stock off": every batch that has passed its expiry date and still has stock becomes a
// line on one card; confirming removes them from stock (recorded as expired). Pure.

const QUESTION_START = /^(?:what|which|who|how|is|are|do|does|did|can|could|where|when|why|show|list|tell me)\b/i;
const REMOVE = "(?:take|remove|clear|write|writing|dispose|bin|discard|get rid|throw|book|sign|mark|delete)";

// "take the expired stock off", "remove everything that's out of date", "write off the expired items", "do the expiry round"
export function looksLikeExpiryRemoval(text) {
  const t = String(text || "").toLowerCase().replace(/[’‘]/g, "'").trim();
  if (!t) return false;
  const expired = /\b(?:expired|out of date|out-of-date|past (?:its|their|the) (?:date|expiry)|gone off|time-?expired)\b/.test(t);
  if (expired && new RegExp(`\\b${REMOVE}\\b|\\boff (?:of )?(?:the )?stock\\b|\\bof use\\b`).test(t) && !QUESTION_START.test(t)) return true;
  if (/\b(?:take|remove|clear)\s+(?:those|them|these|the expired|all the expired|all of them|all those)\s*(?:ones)?\s*(?:off|out)?(?:\s+(?:of\s+)?(?:the\s+)?stock)?$/.test(t) && /\b(?:those|them|these|expired)\b/.test(t) && /\b(?:off|out|stock)\b/.test(t)) return true;
  return /\b(?:do|start|run)\s+(?:the|an?)\s+(?:expiry|expiry date|date)\s+(?:round|check|sweep)\b/.test(t);
}

const asDay = (iso) => new Date(`${iso}T23:59:59`);
const formatDate = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");

// Every batch past its date that still has stock: [{ item, label, batchNumber, expiry, quantity }]
export function findExpiredBatches(items = [], now = new Date()) {
  const rows = [];
  for (const item of items) {
    for (const batch of currentBatches(item)) {
      if (!(batch.quantity > 0) || !batch.expiry_date) continue;
      const date = asDay(batch.expiry_date);
      if (Number.isNaN(date.getTime()) || date >= now) continue;
      rows.push({ item, label: itemLabel(item), batchNumber: batch.batch_number || "", expiry: batch.expiry_date, quantity: batch.quantity });
    }
  }
  return rows.sort((a, b) => a.expiry.localeCompare(b.expiry) || a.label.localeCompare(b.label));
}

// Which places the stock comes out of: the main store first, then whichever place holds most. We don't
// know where a batch physically is, so the card says the place was assumed when there is a choice.
function takeFrom(item, quantity) {
  const places = itemPlacements(item).slice().sort((a, b) => (a.id === null ? -1 : b.id === null ? 1 : b.qty - a.qty));
  let left = quantity;
  const parts = [];
  for (const place of places) {
    if (left <= 0) break;
    const take = Math.min(left, place.qty);
    if (take > 0) { parts.push({ locationId: place.id, locationName: place.name, locationType: place.type === "store" ? "space" : place.type, quantity: take }); left -= take; }
  }
  if (left > 0) parts.push({ locationId: null, locationName: places[0]?.name || "Main store", locationType: "space", quantity: left });
  return { parts, assumed: places.length > 1 };
}

export function buildExpiredDraft(_input = {}, { items = [], now = new Date() } = {}) {
  const expired = findExpiredBatches(items, now);
  if (!expired.length) {
    const next = items.flatMap((item) => currentBatches(item).filter((b) => b.quantity > 0 && b.expiry_date).map((b) => ({ label: itemLabel(item), expiry: b.expiry_date }))).sort((a, b) => a.expiry.localeCompare(b.expiry))[0];
    return { text: `Nothing in stock has passed its expiry date.${next ? ` The next to expire is ${next.label}, on ${formatDate(next.expiry)}.` : ""}`, followUps: [] };
  }
  const lines = [];
  const cardLines = [];
  let assumed = false;
  for (const row of expired) {
    const taken = takeFrom(row.item, row.quantity);
    if (taken.assumed) assumed = true;
    taken.parts.forEach((part) => lines.push({ itemId: row.item.id, itemLabel: row.label, batchNumber: row.batchNumber, expiryDate: row.expiry, ...part }));
    cardLines.push(`${row.quantity} × ${row.label}${row.batchNumber ? ` · batch ${row.batchNumber}` : ""} · expired ${formatDate(row.expiry)}${taken.parts.length === 1 ? ` · from ${taken.parts[0].locationName}` : ` · from ${taken.parts.map((p) => `${p.quantity} in ${p.locationName}`).join(", ")}`}`);
  }
  if (assumed) cardLines.push("Where a product is kept in more than one place, I've taken it from the main store first. Check the place if it matters.");
  const units = expired.reduce((sum, row) => sum + row.quantity, 0);
  const proposal = createProposal({
    kind: "stock-expired",
    title: `Remove expired stock: ${plural(expired.length, "batch", "batches")}`,
    lines: cardLines,
    requiredCapability: "inventory.write",
    confirmLabel: "Take them off stock",
    params: { lines },
  });
  return { text: `${plural(expired.length, "batch", "batches")} (${plural(units, "unit")}) ${expired.length === 1 ? "has" : "have"} passed ${expired.length === 1 ? "its" : "their"} expiry date. I'll take ${expired.length === 1 ? "it" : "them"} off stock, recorded as expired, once you confirm. Nothing has been changed yet.`, proposal, followUps: [] };
}
