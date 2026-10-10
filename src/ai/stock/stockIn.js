import { createProposal } from "../../orb/actionProposals";
import { currentBatches } from "../../lib/stockBatches";
import { mainStoreName, toNumber } from "../../lib/stockLocations";
import { buildPlaces, itemLabel, resolvePlace, resolveStockItem, suggestStockItems } from "./stockAsk";
import { parseUseSegment } from "./stockUse";
import { plural } from "../tools/answerWording";

// "I've received two boxes of gauze, batch 4471, expires March 2028" -> the Orb works out the product, how
// many, where they go, the batch and the expiry date, asks for whatever is missing, and adds the stock
// only after the person confirms. Several products can be said at once. Pure, so it can be tested.

const QUESTION_START = /^(?:what|which|who|how|is|are|do|does|did|can|could|where|when|why|show|list|tell me)\b/i;
const MONTHS = { jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11 };
const MONTH_NAMES = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");

// ---- dates ----------------------------------------------------------------------------------------------

const pad = (n) => String(n).padStart(2, "0");
const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const lastDayOf = (y, m) => new Date(y, m + 1, 0).getDate();
const fullYear = (y) => (y < 100 ? 2000 + y : y);

// A date as people say it, to YYYY-MM-DD. A month and year alone means the last day of that month (the
// way packs are dated). Returns "" if it can't be read.
export function parseExpiryDate(text) {
  const t = String(text || "").toLowerCase().replace(/[,]/g, " ").replace(/\s+/g, " ").trim();
  let m = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return iso(+m[1], +m[2] - 1, +m[3]);
  m = t.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/);
  if (m) return iso(fullYear(+m[3]), +m[2] - 1, +m[1]);
  m = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{2,4})\b/);
  if (m) return iso(fullYear(+m[3]), MONTHS[m[2]], +m[1]);
  m = t.match(new RegExp(`\\b(${MONTH_NAMES})\\s+(\\d{2,4})\\b`));
  if (m) { const y = fullYear(+m[2]); return iso(y, MONTHS[m[1]], lastDayOf(y, MONTHS[m[1]])); }
  m = t.match(/\b(\d{1,2})[/.-](\d{4}|\d{2})\b/);
  if (m && +m[1] >= 1 && +m[1] <= 12) { const y = fullYear(+m[2]); return iso(y, +m[1] - 1, lastDayOf(y, +m[1] - 1)); }
  m = t.match(/^(?:in\s+)?(20\d{2})$/);
  if (m) return iso(+m[1], 11, 31);
  return "";
}

const formatDate = (isoDate) => (isoDate ? `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}/${isoDate.slice(0, 4)}` : "no expiry date");

// ---- understanding the sentence -----------------------------------------------------------------------

const RECEIVED = "received|got in|booked in|put away|restocked|delivered|had delivered|had in|checked in|logged in|taken delivery of|had a delivery of|had a delivery|had delivery of|had an order of";

// The part that says what arrived ("two boxes of gauze, batch 4471"), or null if it isn't someone booking stock in.
export function extractInRest(text) {
  let t = String(text || "").trim().replace(/\s+/g, " ").replace(/[.!?]+$/g, "");
  t = t.replace(/\b(i|we)\s*['’]?\s*ve\b/gi, "$1 have").replace(/\bive\b/gi, "i have").replace(/\bweve\b/gi, "we have");
  t = t.replace(/^(?:(?:ok|okay|right|so|hi|hello|orb|please|just|also|and)[,\s]+)+/i, "");
  if (!t || QUESTION_START.test(t)) return null;
  let m = t.match(new RegExp(`^(?:i|we)(?:\\s+have)?\\s+(?:(?:just|also|now|already)\\s+)*(?:${RECEIVED})\\s*(?:of|with|:|-)?\\s*(.+)$`, "i"));
  if (m) return m[1];
  // "a delivery has arrived: ...", "the order came in with ..."
  m = t.match(/^(?:a |the |our )?(?:delivery|order)\s+(?:has\s+|just\s+)?(?:arrived|come in|came in|landed)\s*(?:of|with|including|:|-|,)?\s*(.+)$/i);
  if (m) return m[1];
  // "book in 5 salbutamol", "please receive two boxes of gauze", "put away ..."
  m = t.match(/^(?:(?:can|could|would|will) you\s+|i(?:'d| would) like (?:you )?to\s+|i want (?:you )?to\s+)?(?:please\s+)?(?:book in|receive|put away|check in|log in|book)\s+(.+?)(?:\s+(?:to|into|onto)\s+(?:the\s+)?stock)?$/i);
  if (m && /^\s*(?:\d|one|two|three|four|five|six|seven|eight|nine|ten|a|an)\b/i.test(m[1])) return m[1];
  // "add 10 chlorphenamine to stock"
  m = t.match(/^(?:(?:can|could|would|will) you\s+)?(?:please\s+)?add\s+(.+?)\s+(?:to|into|onto)\s+(?:the\s+)?stock\b(.*)$/i);
  if (m) return `${m[1]}${m[2] || ""}`.trim();
  return null;
}

const KEYWORD = /^(?:batch|lot|expir|exp\b|use by|best before|bb\b|no batch|no expiry|no date|into|in\b|to\b|at\b|onto|for\b)/i;

// One product out of that: { quantity, quantityAssumed, item, place, batch, expiry, noBatch, noExpiry } or null.
export function parseInSegment(input) {
  let rest = String(input || "").trim();
  if (!rest) return null;
  const out = { noBatch: false, noExpiry: false, batch: null, expiry: "", expiryText: "", place: null };

  if (/\bno\s+(?:batch|lot)(?:\s+(?:number|no\.?))?\b/i.test(rest)) { out.noBatch = true; rest = rest.replace(/[,;]?\s*\bno\s+(?:batch|lot)(?:\s+(?:number|no\.?))?\b/ig, " "); }
  if (/\bno\s+(?:expiry|date|expiry date)\b/i.test(rest)) { out.noExpiry = true; rest = rest.replace(/[,;]?\s*\bno\s+(?:expiry(?: date)?|date)\b/ig, " "); }

  // expiry: "expires March 2028", "expiry date 31/03/2028", "use by 03/28"
  const em = rest.match(/[,;]?\s*\b(?:expir(?:y|es|ing|ation)?(?:\s+date)?|exp|use by|best before|bb)\b\s*(?:on|is|date|:|-)?\s*(.+?)(?=\s*(?:,|;|\bbatch\b|\blot\b|\binto\b|\bto\b|\bin\b|$))/i);
  if (em) {
    out.expiryText = em[1].trim();
    out.expiry = parseExpiryDate(out.expiryText);
    rest = rest.replace(em[0], " ");
  }
  // batch: "batch 4471", "batch number AB-1234", "lot 77"
  const bm = rest.match(/[,;]?\s*\b(?:batch(?:\s+(?:number|no\.?))?|lot)\b\s*(?:is|was|:|#|number)?\s*([a-z0-9][a-z0-9-]*)/i);
  if (bm) { out.batch = bm[1]; rest = rest.replace(bm[0], " "); }

  // where it goes: the last "into / in / to / at / for"
  const pm = rest.match(/^(.*?)\s+(?:into|onto|in|to|at|for)\s+(?:the\s+)?([^,;]+)$/i);
  if (pm && !/^\s*stock\s*$/i.test(pm[2])) { rest = pm[1].trim(); out.place = pm[2].trim(); }
  else if (pm) rest = pm[1].trim();

  const seg = parseUseSegment(rest.replace(/[,;]+/g, " "));
  if (!seg || !seg.item) return null;
  // a real quantity is a number or a pack word ("20", "two boxes"), not just "a"/"an" ("an email")
  const explicit = /\b(?:\d{1,4}|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(rest) || /\b(?:ampoules?|vials?|boxes|box|packs?|packets?|tablets?|syringes?|pens?|doses?|bottles?|tubes?|units?|bags?|strips?|sachets?|inhalers?)\b/i.test(rest);
  return { ...out, quantity: seg.quantity, quantityAssumed: seg.quantityAssumed || !explicit, item: seg.item };
}

// Everything the sentence names: one segment per product. A piece that is only a batch, expiry or place
// belongs to the product before it.
export function parseInItems(text) {
  const rest = extractInRest(text);
  if (!rest) return [];
  const raw = rest.split(/\s*(?:;|,|\band\b|\bplus\b|\balso\b|\bthen\b)\s*/i).map((x) => x.trim()).filter(Boolean);
  const pieces = [];
  for (const part of raw) {
    if (pieces.length && KEYWORD.test(part)) pieces[pieces.length - 1] += `, ${part}`;
    else pieces.push(part);
  }
  const segments = pieces.map(parseInSegment);
  if (!segments.length || segments.some((s) => !s)) {
    const whole = parseInSegment(rest);
    return whole ? [whole] : [];
  }
  return segments;
}

// Someone booking stock in, rather than saying "I received an email": they name a number, a batch or a date.
export const looksLikeStockIn = (text) => parseInItems(text).some((seg) => !seg.quantityAssumed || seg.batch || seg.expiry);

// ---- the details a follow-up answer can give ------------------------------------------------------------------

// "batch 4471 expires March 2028", "no batch", "into the nurses room": a reply to "what's the batch...?"
export function looksLikeInDetails(text) {
  const t = String(text || "").trim().toLowerCase();
  if (!t || t.length > 140 || QUESTION_START.test(t)) return false;
  return /\b(?:batch|lot|expir\w*|exp|use by|best before|no batch|no expiry|no date|into|onto)\b/.test(t) || (parseExpiryDate(t) !== "" && t.split(/\s+/).length <= 6);
}

// ---- working out one product -------------------------------------------------------------------------------------------

const lines = (...parts) => parts.filter(Boolean).join("\n");
const piece = (seg) => `${seg.quantity} ${seg.item}${seg.batch ? `, batch ${seg.batch}` : ""}${seg.expiryText ? `, expires ${seg.expiryText}` : ""}${seg.place ? `, into ${seg.place}` : ""}`;
const rawSentence = (segs) => `I've received ${segs.map(piece).join("; ")}`;

// What an item has always carried decides what a delivery must say: a batch number if its stock has
// batch numbers, an expiry date if its stock has expiry dates.
function history(item) {
  const batches = currentBatches(item);
  return {
    batch: Boolean(item.batch_number || batches.some((b) => b.batch_number)),
    expiry: Boolean(item.expiry_date || batches.some((b) => b.expiry_date)),
  };
}

function resolveInLine(seg, { items, kits, now, sentence }) {
  const found = resolveStockItem(seg.item, items);
  if (found.status === "none") {
    const near = suggestStockItems(seg.item, items);
    if (near.length) {
      return { blocked: { text: lines(`I couldn't find “${seg.item}”. Did you mean:`, ...near.map((i) => `• ${itemLabel(i)}`)), followUps: near.map((i) => sentence({ ...seg, item: itemLabel(i) })), ambiguous: true } };
    }
    return { blocked: { text: `I couldn't find any stock matching “${seg.item}”, so I haven't added anything. A new product has to be added under Inventory first.`, followUps: [] } };
  }
  if (found.status === "many") {
    return { blocked: { text: lines(`More than one product fits “${seg.item}”. Which did you receive?`, ...found.items.map((i) => `• ${itemLabel(i)}`)), followUps: found.items.slice(0, 4).map((i) => sentence({ ...seg, item: itemLabel(i) })), ambiguous: true } };
  }
  const item = found.item;
  const label = itemLabel(item);

  // where it goes: the main store unless a place was said
  let place = { id: null, name: mainStoreName(item), type: "store" };
  if (seg.place) {
    const where = resolvePlace(seg.place, buildPlaces({ items, kits }));
    if (where.status === "one") place = { id: where.place.id, name: where.place.name, type: where.place.type === "kit" ? "kit" : where.place.type || "space" };
    else if (where.status === "many") {
      return { blocked: { text: lines(`More than one place fits “${seg.place}”. Where should the ${label} go?`, ...where.places.map((p) => `• ${p.name}`)), followUps: where.places.map((p) => sentence({ ...seg, item: label, place: p.name })), ambiguous: true } };
    } else if (where.status === "none") {
      return { blocked: { text: `I don't know a place called “${seg.place}”. Deliveries normally go to the main store; say “into the store cupboard” or the name of a kit or room that already holds stock.`, followUps: [] } };
    }
  }

  // batch and expiry
  if (seg.expiryText && !seg.expiry) return { blocked: { text: `I couldn't read “${seg.expiryText}” as a date. Say it like “expires March 2028” or “expiry 31/03/2028”.`, followUps: [], pending: true } };
  const have = history(item);
  const missingBatch = have.batch && !seg.batch && !seg.noBatch;
  const missingExpiry = have.expiry && !seg.expiry && !seg.noExpiry;
  if (missingBatch || missingExpiry) {
    const what = missingBatch && missingExpiry ? "batch number and expiry date" : missingBatch ? "batch number" : "expiry date";
    return { blocked: { text: `${plural(seg.quantity, "unit")} of ${label}: what's the ${what}? Say, for example, ${missingBatch && missingExpiry ? "“batch 4471, expires March 2028”" : missingBatch ? "“batch 4471”" : "“expires March 2028”"}. If the pack has none, say ${missingBatch && missingExpiry ? "“no batch” or “no expiry”" : missingBatch ? "“no batch”" : "“no expiry”"}.`, followUps: [], pending: true } };
  }
  if (seg.expiry && new Date(`${seg.expiry}T23:59:59`) < now) {
    return { blocked: { text: `That expiry date (${formatDate(seg.expiry)}) has already passed, so I haven't added anything. Check the pack, and tell me the right date.`, followUps: [], pending: true } };
  }
  const existing = currentBatches(item).find((b) => seg.batch && String(b.batch_number || "").toLowerCase() === seg.batch.toLowerCase());
  const warning = existing && seg.expiry && existing.expiry_date && existing.expiry_date !== seg.expiry
    ? `Batch ${seg.batch} is already recorded with expiry ${formatDate(existing.expiry_date)}; this delivery says ${formatDate(seg.expiry)}. Check the pack.`
    : "";
  return { line: { item, label, quantity: seg.quantity, assumed: Boolean(seg.quantityAssumed), place, batch: seg.batch || "", expiry: seg.expiry || "", warning, total: toNumber(item.current_stock, 0) } };
}

const paramsOf = (line) => ({
  itemId: line.item.id, itemLabel: line.label, quantity: line.quantity,
  locationId: line.place.id, locationName: line.place.name, locationType: line.place.type === "store" ? "space" : line.place.type,
  batchNumber: line.batch, expiryDate: line.expiry,
});

const NOTHING_SAID = { text: "Tell me what arrived, for example “I've received two boxes of gauze, batch 4471, expires March 2028”.", followUps: [] };

export function buildStockInDraft(input = {}, { items = [], kits = [], now = new Date() } = {}) {
  const segments = parseInItems(input.question);
  if (!segments.length) return NOTHING_SAID;
  const resolved = [];
  for (let i = 0; i < segments.length; i += 1) {
    const sentence = (override) => rawSentence(segments.map((seg, j) => (j === i ? override : seg)));
    const result = resolveInLine(segments[i], { items, kits, now, sentence });
    if (result.blocked) return { ...result.blocked, text: segments.length > 1 ? `Item ${i + 1} of ${segments.length}: ${result.blocked.text}` : result.blocked.text };
    resolved.push(result.line);
  }
  const cardLines = [];
  resolved.forEach((line) => {
    cardLines.push(`${line.quantity} × ${line.label} · into ${line.place.name}${line.batch ? ` · batch ${line.batch}` : ""}${line.expiry ? ` · expires ${formatDate(line.expiry)}` : ""} · ${line.total + line.quantity} in stock after`);
    if (line.assumed) cardLines.push(`  (assumed ${line.quantity}; say a number if not)`);
    if (line.warning) cardLines.push(`  Warning: ${line.warning}`);
  });
  const count = resolved.length;
  const proposal = createProposal({
    kind: "stock-in",
    title: count === 1 ? `Add ${resolved[0].quantity} ${resolved[0].label} to stock` : `Add ${count} items to stock`,
    lines: cardLines,
    requiredCapability: "inventory.write",
    confirmLabel: "Add to stock",
    params: { lines: resolved.map(paramsOf) },
  });
  return { text: `I'll add ${count === 1 ? "this delivery" : `these ${count} items`} to stock once you confirm. Nothing has been changed yet.`, proposal, followUps: [] };
}

// The sentence for a follow-up reply: the delivery as first said, plus the details just given.
export function mergeInSentence(earlier, reply) {
  const first = String(earlier || "").trim().replace(/[.!?]+$/g, "");
  const more = String(reply || "").trim().replace(/[.!?]+$/g, "");
  return first && more ? `${first}, ${more}` : first || more;
}
