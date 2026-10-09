import { tokens } from "../help/helpSearch";
import { createProposal } from "../../orb/actionProposals";
import { currentBatches } from "../../lib/stockBatches";
import { toNumber } from "../../lib/stockLocations";
import { itemLabel, itemPlacements, resolveStockItem, suggestStockItems } from "./stockAsk";
import { plural } from "../tools/answerWording";

// "I've just taken one adrenaline from room D62" -> the Orb works out the product, how many, where it
// came from and which batch, asks about whatever is missing, and records the use only after the
// person confirms. The batch is asked for by the end of its number (it's printed on the pack), as
// one tap per batch that still has stock. Several items can be said at once ("two chlorphenamine, one
// adrenaline and a box of gloves"): one card, one confirm. Pure, so it can be tested.

const NUMBER_WORDS = { one: 1, on: 1, a: 1, an: 1, single: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const NUM = "\\d{1,3}|one|on|two|three|four|five|six|seven|eight|nine|ten|a|an|single"; // "on" is a common slip for "one"
const UNITS = "ampoules?|ampules?|ampuoles?|ampouls?|vials?|boxes|box|packs?|packets?|tablets?|syringes?|pens?|doses?|bottles?|tubes?|units?|bags?|strips?|sachets?|inhalers?";
const VERBS = "taken|took|removed|used|opened|dispensed|administered|given out|pulled|signed out|grabbed|got out";
const QUESTION_START = /^(?:what|which|who|how|is|are|do|does|did|can|could|where|when|why|show|list|tell me)\b/i;
const MAIN_STORE = /\b(main store|store ?room|stock ?room|the store|stores|storeroom|store cupboard)\b/i;
const GENERIC_PLACE_WORDS = new Set(["room", "the", "area", "a"]);

const toNumberWord = (word) => (/^\d+$/.test(word) ? Number(word) : NUMBER_WORDS[String(word).toLowerCase()] || 1);

// ---- understanding the sentence ---------------------------------------------------------------------------------

// The part of a sentence that says what was taken ("one adrenaline from room D62"), or null if it isn't
// someone telling the Orb they took something.
export function extractUseRest(text) {
  let t = String(text || "").trim().replace(/\s+/g, " ").replace(/[.!?]+$/g, "");
  // "ive", "i've", "i ve" and "iv" all mean "I have"
  t = t.replace(/\b(i|we)\s*['’]?\s*ve\b/gi, "$1 have").replace(/\bive\b/gi, "i have").replace(/\biv\b/gi, "i have");
  t = t.replace(/^(?:(?:ok|okay|right|so|hi|hello|orb|please|just|also|and)[,\s]+)+/i, "");
  if (!t) return null;

  let rest = null;
  // A request rather than a statement: "remove one chlorpheniramine from stock", "can you take off 2 gloves".
  // Needs a number plus a place or "from stock", or a unit word, so ordinary requests aren't mistaken for it.
  const ask = t.match(/^(?:(?:can|could|would|will) you\s+|i(?:'d| would) like (?:you )?to\s+|i want (?:you )?to\s+)?(?:please\s+)?(?:remove|take off|take|deduct|book out|sign out|use|mark off)\s+(.+)$/i);
  if (ask) {
    const body = ask[1];
    const hasNumber = new RegExp(`^(?:${NUM})\\b`, "i").test(body);
    const hasUnit = new RegExp(`\\b(?:${UNITS})\\b`, "i").test(body);
    const fromStock = /\b(?:from|off|out of)\s+(?:the\s+)?(?:stock|stocks)\b/i.test(body);
    const fromSomewhere = /\b(?:from|off|out of)\b/i.test(body);
    if (fromStock || hasUnit || (hasNumber && fromSomewhere)) rest = body;
  }
  if (!rest && QUESTION_START.test(t)) return null;
  let m = rest ? null : t.match(new RegExp(`^(?:i|we)(?:'ve|\\s+have)?\\s+(?:(?:just|also|now|already)\\s+)*(?:${VERBS})\\s+(.+)$`, "i"));
  if (m) rest = m[1];
  if (!rest) {
    // "one adrenaline ampoule taken from room D62": needs a number or a unit, so ordinary sentences don't count
    m = t.match(new RegExp(`^(.+?)\\s+(?:(?:was|were|has been|have been)\\s+)?(?:just\\s+)?(?:${VERBS})\\b\\s*(.*)$`, "i"));
    if (m && (new RegExp(`^(?:${NUM})\\b`, "i").test(m[1]) || new RegExp(`\\b(?:${UNITS})\\b`, "i").test(m[1]))) rest = `${m[1]} ${m[2]}`.trim();
  }
  return rest || null;
}

// One item out of that: { quantity, quantityAssumed, item, place, batch }, or null.
export function parseUseSegment(input) {
  let rest = String(input || "").trim();
  if (!rest) return null;

  // the batch, if said: "batch ending 4821", "batch 4821", "lot 4821"
  let batch = null;
  const bm = rest.match(/[,;]?\s*(?:batch(?:\s+(?:number|no\.?))?|lot)\s*(?:ending(?:\s+in|\s+with)?|ends?(?:\s+in|\s+with)?|is|was|:|#)?\s*([a-z0-9-]{2,})\s*$/i);
  if (bm) { batch = bm[1]; rest = rest.slice(0, bm.index).trim(); }

  // where from: the last "from / out of / in / at"
  let place = null;
  const pm = rest.match(/^(.*)\s+(?:from|out of|off|in|at|inside)\s+(?:the\s+)?(.+)$/i);
  if (pm) { rest = pm[1].trim(); place = pm[2].trim(); }
  // "from stock" is not a place, just "off the stock"
  if (place && /^(?:stock|the stock|stocks|our stock|primovex)$/i.test(place)) place = null;

  // how many, and what
  let quantity = null;
  let unitSeen = false;
  const withUnit = rest.match(new RegExp(`\\b(${NUM})\\s+(?:x\\s+)?(?:${UNITS})\\b(?:\\s+of)?`, "i"));
  if (withUnit) { quantity = toNumberWord(withUnit[1]); unitSeen = true; rest = rest.replace(withUnit[0], " "); }
  if (quantity === null) {
    const lead = rest.match(new RegExp(`^(${NUM})\\s+(?:of\\s+)?(?=\\S)`, "i"));
    if (lead) { quantity = toNumberWord(lead[1]); rest = rest.slice(lead[0].length); }
  }
  const strayUnit = rest.match(new RegExp(`\\b(?:${UNITS})\\b`, "i"));
  if (strayUnit) { unitSeen = true; rest = rest.replace(new RegExp(`\\b(?:${UNITS})\\b`, "ig"), " "); }
  const item = rest.replace(/\b(?:the|some|of)\b/gi, " ").replace(/\s+/g, " ").trim();
  if (!item && !unitSeen) return null;
  return { quantity: quantity ?? 1, quantityAssumed: quantity === null, item, place, batch };
}

// What was said, as one item: { quantity, quantityAssumed, item, place, batch } or null.
export function parseUseRequest(text) {
  const rest = extractUseRest(text);
  return rest ? parseUseSegment(rest) : null;
}

// Several items in one sentence: "two chlorphenamine, one adrenaline and a box of gloves from the store
// cupboard". A place said once at the end applies to the items before it. Always returns the items it
// found (one item if that is all there was).
export function parseUseItems(text) {
  const rest = extractUseRest(text);
  if (!rest) return [];
  const raw = rest.split(/\s*(?:;|,|\band\b|\bplus\b|\balso\b|\bthen\b)\s*/i).map((x) => x.trim()).filter(Boolean);
  // a piece that is only a batch or a place belongs to the item before it
  const pieces = [];
  for (const part of raw) {
    if (pieces.length && /^(?:batch|lot|from|out of|off|in|at|inside)\b/i.test(part)) pieces[pieces.length - 1] += ` ${part}`;
    else pieces.push(part);
  }
  const one = () => { const seg = parseUseSegment(rest); return seg ? [seg] : []; };
  if (pieces.length < 2) return one();
  const segments = pieces.map(parseUseSegment);
  if (segments.some((seg) => !seg)) return one();
  const last = segments[segments.length - 1];
  return segments.map((seg, i) => (i === segments.length - 1 ? seg : { ...seg, place: seg.place ?? last.place }));
}

// ---- places and batches ----------------------------------------------------------------------------------------------

// Which of an item's places a phrase means ("room D62", "store cupboard", "anaphylaxis box 3").
export function resolveItemPlacement(query, item) {
  const placements = itemPlacements(item);
  const q = tokens(query).filter((tok) => !GENERIC_PLACE_WORDS.has(tok));
  if (q.length) {
    const hits = placements.filter((p) => { const have = new Set(tokens(p.name)); return q.every((tok) => have.has(tok)); });
    if (hits.length === 1) return { status: "one", placement: hits[0] };
    if (hits.length > 1) return { status: "many", placements: hits };
  }
  if (MAIN_STORE.test(String(query))) {
    const main = placements.find((p) => p.id === null);
    if (main) return { status: "one", placement: main };
  }
  return { status: "none" };
}

// The last few characters of each batch number, as short as they can be while staying different.
export function batchTails(batches) {
  const numbers = batches.map((b) => String(b.batch_number || ""));
  const result = numbers.map(() => "");
  for (let len = 3; len <= 40; len += 1) {
    const tails = numbers.map((n) => n.slice(-len));
    numbers.forEach((n, i) => {
      if (result[i]) return;
      if (!n) { result[i] = ""; return; }
      const clash = tails.filter((tail, j) => j !== i && numbers[j] && tail.toLowerCase() === tails[i].toLowerCase()).length;
      if (!clash || len >= n.length) result[i] = tails[i];
    });
    if (numbers.every((n, i) => !n || result[i])) break;
  }
  return result;
}

const formatExpiry = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "no expiry date");
const lines = (...parts) => parts.filter(Boolean).join("\n");

// One item as it is said back in a follow-up choice: "2 Chlorphenamine 10mg/1ml from Store batch ending 4821".
const piece = ({ qty, label, placeName, tail }) => `${qty} ${label}${placeName ? ` from ${placeName}` : ""}${tail ? ` batch ending ${tail}` : ""}`;
// ... and an item that has not been worked out yet, as the person said it
export const rawPiece = (seg) => `${seg.quantity} ${seg.item}${seg.place ? ` from ${seg.place}` : ""}${seg.batch ? ` batch ending ${seg.batch}` : ""}`;
const sentenceOf = (pieces) => `I've taken ${pieces.join("; ")}`;

// ---- working out one item ------------------------------------------------------------------------------------------------

// Everything needed to take one item off stock, or the one question to ask first.
// ask(o) turns { qty, label, placeName, tail } into the full sentence a follow-up choice carries.
// Returns { blocked: { text, followUps, ambiguous } } or { line }.
function resolveUseLine(parsed, { items, now, ask }) {
  if (!parsed.item) return { blocked: { text: "Which product did you take? For example \"I've taken one adrenaline ampoule from the store cupboard\".", followUps: [] } };
  const found = resolveStockItem(parsed.item, items);
  const base = { qty: parsed.quantity, placeName: null, tail: null };
  if (found.status === "none") {
    // a spelling slip: offer what it nearly is, but never pick for them
    const near = suggestStockItems(parsed.item, items);
    if (near.length) {
      return { blocked: {
        text: lines(`I couldn't find “${parsed.item}”. Did you mean:`, ...near.map((i) => `• ${itemLabel(i)}`)),
        followUps: near.map((i) => ask({ ...base, label: itemLabel(i), placeName: parsed.place })),
        ambiguous: true,
      } };
    }
    return { blocked: { text: `I couldn't find any stock matching “${parsed.item}”, so I haven't changed anything.`, followUps: [] } };
  }
  if (found.status === "many") {
    return { blocked: {
      text: lines(`More than one product fits “${parsed.item}”. Which did you take?`, ...found.items.map((i) => `• ${itemLabel(i)}`)),
      followUps: found.items.slice(0, 4).map((i) => ask({ ...base, label: itemLabel(i), placeName: parsed.place })),
      ambiguous: true,
    } };
  }
  const item = found.item;
  const label = itemLabel(item);
  const placements = itemPlacements(item);
  const total = toNumber(item.current_stock, 0);
  if (!placements.length || total <= 0) return { blocked: { text: `${label}: none is recorded in stock, so there's nothing to take off.`, followUps: [] } };

  // where from
  let placement = null;
  if (parsed.place) {
    const where = resolveItemPlacement(parsed.place, item);
    if (where.status === "one") placement = where.placement;
    else {
      const options = where.status === "many" ? where.placements : placements;
      return { blocked: {
        text: lines(where.status === "many" ? `More than one place fits “${parsed.place}”. Which did you mean?` : `No ${label} is recorded in “${parsed.place}”. It is recorded in:`, ...options.map((p) => `• ${p.name}: ${p.qty}`)),
        followUps: options.slice(0, 4).map((p) => ask({ ...base, label, placeName: p.name })),
        ambiguous: true,
      } };
    }
  } else if (placements.length === 1) {
    placement = placements[0];
  } else {
    return { blocked: {
      text: lines(`Where did you take the ${label} from? It is recorded in:`, ...placements.map((p) => `• ${p.name}: ${p.qty}`)),
      followUps: placements.slice(0, 4).map((p) => ask({ ...base, label, placeName: p.name })),
      ambiguous: true,
    } };
  }
  if (parsed.quantity > placement.qty) {
    return { blocked: { text: `Only ${plural(placement.qty, "unit")} of ${label} ${placement.qty === 1 ? "is" : "are"} recorded in ${placement.name}, so I can't take off ${parsed.quantity}. Check the number, or the place.`, followUps: [] } };
  }

  // which batch
  const batches = currentBatches(item).filter((b) => b.quantity > 0);
  const tails = batchTails(batches);
  let batch = null;
  if (parsed.batch) {
    const want = parsed.batch.toLowerCase();
    // "batch none" picks the stock that has no batch number recorded
    const hits = want === "none" ? batches.filter((b) => !b.batch_number) : batches.filter((b) => String(b.batch_number || "").toLowerCase().endsWith(want));
    if (hits.length === 1) batch = hits[0];
    else {
      const options = hits.length ? hits : batches;
      return { blocked: {
        text: hits.length ? `More than one batch ends in “${parsed.batch}”. Which one?` : `I couldn't find a batch of ${label} ending in “${parsed.batch}”. These are in stock:`,
        followUps: batchChoices(options, batches, tails, { ...base, label, placeName: placement.name }, ask),
        ambiguous: true,
      } };
    }
  } else if (batches.length > 1) {
    return { blocked: {
      text: `Which batch did the ${label} come from? Check the end of the batch number on the pack.`,
      followUps: batchChoices(batches, batches, tails, { ...base, label, placeName: placement.name }, ask),
      ambiguous: true,
    } };
  } else {
    batch = batches[0] || null; // only one batch (or none recorded): no need to ask
  }

  const expired = Boolean(batch?.expiry_date && new Date(`${batch.expiry_date}T23:59:59`) < now);
  return { line: { item, label, quantity: parsed.quantity, assumed: Boolean(parsed.quantityAssumed), placement, batch, expired, total } };
}

const paramsOf = (line) => ({
  itemId: line.item.id, itemLabel: line.label, quantity: line.quantity,
  locationId: line.placement.id, locationName: line.placement.name, locationType: line.placement.type === "store" ? "space" : line.placement.type,
  batchNumber: line.batch?.batch_number || "",
});

const NOTHING_SAID = { text: "Tell me what you took, for example \"I've just taken one adrenaline from the store cupboard\".", followUps: [] };

// ---- one item ----------------------------------------------------------------------------------------------------------------

export function buildUseDraft(input = {}, { items = [], now = new Date() } = {}) {
  // from the language assistant: the product, number, place and batch it picked out
  const heard = input.item
    ? { quantity: Math.max(1, Math.round(Number(input.quantity) || 1)), quantityAssumed: !Number(input.quantity), item: String(input.item).trim(), place: input.place ? String(input.place).trim() : null, batch: input.batch ? String(input.batch).trim() : null }
    : null;
  const parsed = heard || parseUseRequest(input.question);
  if (!parsed) return NOTHING_SAID;

  const resolved = resolveUseLine(parsed, { items, now, ask: (o) => sentenceOf([piece(o)]) });
  if (resolved.blocked) return resolved.blocked;
  const { line } = resolved;
  const after = line.total - line.quantity;
  const cardLines = [
    `Product: ${line.label}`,
    `Taking: ${line.quantity}${line.assumed ? " (assumed one; say a number if not)" : ""}`,
    `From: ${line.placement.name} (${line.placement.qty} recorded there)`,
    line.batch?.batch_number ? `Batch: ${line.batch.batch_number} · ${line.batch.expiry_date ? `expires ${formatExpiry(line.batch.expiry_date)}` : "no expiry date"}` : "Batch: not recorded for this stock",
    `Stock after: ${after} in total, ${line.placement.qty - line.quantity} in ${line.placement.name}`,
    line.expired ? "Warning: this batch is past its expiry date." : "",
  ].filter(Boolean);
  const proposal = createProposal({
    kind: "stock-use",
    title: `Record ${line.quantity} ${line.label} used`,
    lines: cardLines,
    requiredCapability: "inventory.write",
    confirmLabel: "Take it off stock",
    params: paramsOf(line),
  });
  return { text: `I'll take ${line.quantity} ${line.label} off stock once you confirm. Nothing has been changed yet.`, proposal, followUps: [] };
}

// ---- several items, one card ---------------------------------------------------------------------------------------------

export function buildUseDraftMulti(segments, { items = [], now = new Date() } = {}) {
  const resolved = [];
  for (let i = 0; i < segments.length; i += 1) {
    const ask = (o) => sentenceOf(segments.map((seg, j) => (j === i ? piece(o) : rawPiece(seg))));
    const result = resolveUseLine(segments[i], { items, now, ask });
    if (result.blocked) return { ...result.blocked, text: segments.length > 1 ? `Item ${i + 1} of ${segments.length}: ${result.blocked.text}` : result.blocked.text };
    resolved.push(result.line);
  }
  const cardLines = [];
  resolved.forEach((line) => {
    cardLines.push(`${line.quantity} × ${line.label} · from ${line.placement.name}${line.batch?.batch_number ? ` · batch ${line.batch.batch_number}` : ""} · ${line.total - line.quantity} left`);
    if (line.assumed) cardLines.push(`  (assumed one ${line.label}; say a number if not)`);
    if (line.expired) cardLines.push(`  Warning: that batch of ${line.label} is past its expiry date.`);
  });
  const count = resolved.length;
  const proposal = createProposal({
    kind: "stock-use-multi",
    title: `Record ${count} items used`,
    lines: cardLines,
    requiredCapability: "inventory.write",
    confirmLabel: "Take them off stock",
    params: { lines: resolved.map(paramsOf) },
  });
  return { text: `I'll take these ${count} items off stock once you confirm. Nothing has been changed yet. Say "and" another item to add it, or "yes" to confirm.`, proposal, followUps: [] };
}

// ---- the one the tool uses --------------------------------------------------------------------------------------------------

// One item or several: it is one product when the whole phrase names a single product ("salbutamol and
// ipratropium"), and several when each part is its own.
export function buildAnyUseDraft(input = {}, ctx = {}) {
  if (input.item) return buildUseDraft(input, ctx);
  const segments = parseUseItems(input.question);
  if (segments.length < 2) return buildUseDraft(input, ctx);
  // a semicolon or comma always separates items; only a spoken "and" might be part of one product's name
  const hardSeparator = /[;,]/.test(extractUseRest(input.question) || "");
  const whole = hardSeparator ? null : parseUseRequest(input.question);
  if (whole?.item && resolveStockItem(whole.item, ctx.items || []).status === "one") return buildUseDraft(input, ctx);
  return buildUseDraftMulti(segments, ctx);
}

// ---- adding to a card that is waiting -----------------------------------------------------------------------------------

// A card is waiting for a yes, and the person says another item ("and one more adrenaline"): the sentence
// that covers everything on the card plus what was just said, or null if they didn't name more stock.
export function mergeUseSentence(proposal, newText) {
  if (!proposal || !["stock-use", "stock-use-multi"].includes(proposal.kind)) return null;
  // "and one more adrenaline", "also two gloves", "another chlorphenamine": no "I've taken" needed
  let added = parseUseItems(newText);
  if (!added.length) {
    const body = String(newText || "").trim().replace(/[.!?]+$/g, "").replace(/^(?:(?:and|also|plus|then|ok|okay|please|just)[,\s]+)+/i, "")
      .replace(/^another\b/i, "one").replace(new RegExp(`\\b(${NUM})\\s+more\\b`, "i"), "$1");
    const looksLikeItems = !QUESTION_START.test(body) && (new RegExp(`^(?:${NUM})\\b`, "i").test(body) || new RegExp(`\\b(?:${UNITS})\\b`, "i").test(body));
    if (looksLikeItems) added = parseUseItems(`I've taken ${body}`);
  }
  if (!added.length || added.some((seg) => !seg.item)) return null;
  const lines = proposal.kind === "stock-use" ? [proposal.params] : proposal.params?.lines || [];
  const pending = lines.map((l) => `${l.quantity} ${l.itemLabel}${l.locationName ? ` from ${l.locationName}` : ""} batch ending ${l.batchNumber || "none"}`);
  return sentenceOf([...pending, ...added.map(rawPiece)]);
}

function batchChoices(options, all, tails, base, ask) {
  return options.slice(0, 4).map((b) => {
    const tail = tails[all.indexOf(b)] || b.batch_number;
    return {
      label: tail ? `Batch ending ${tail}` : "No batch number",
      hint: `${b.expiry_date ? `expires ${formatExpiry(b.expiry_date)}` : "no expiry date"} · ${b.quantity} in stock`,
      color: "#0ea5e9",
      ask: ask({ ...base, tail: tail || b.batch_number || "none" }),
    };
  });
}
