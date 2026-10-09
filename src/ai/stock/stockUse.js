import { tokens } from "../help/helpSearch";
import { createProposal } from "../../orb/actionProposals";
import { currentBatches } from "../../lib/stockBatches";
import { toNumber } from "../../lib/stockLocations";
import { itemLabel, itemPlacements, resolveStockItem, suggestStockItems } from "./stockAsk";
import { plural } from "../tools/answerWording";

// "I've just taken one adrenaline from room D62" -> the Orb works out the product, how many, where it
// came from and which batch, asks about whatever is missing, and records the use only after the
// person confirms. The batch is asked for by the end of its number (it's printed on the pack), as
// one tap per batch that still has stock. Pure, so it can be tested.

const NUMBER_WORDS = { one: 1, on: 1, a: 1, an: 1, single: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const NUM = "\\d{1,3}|one|on|two|three|four|five|six|seven|eight|nine|ten|a|an|single"; // "on" is a common slip for "one"
const UNITS = "ampoules?|ampules?|ampuoles?|ampouls?|vials?|boxes|box|packs?|packets?|tablets?|syringes?|pens?|doses?|bottles?|tubes?|units?|bags?|strips?|sachets?|inhalers?";
const VERBS = "taken|took|removed|used|opened|dispensed|administered|given out|pulled|signed out|grabbed|got out";
const QUESTION_START = /^(?:what|which|who|how|is|are|do|does|did|can|could|where|when|why|show|list|tell me)\b/i;
const MAIN_STORE = /\b(main store|store ?room|stock ?room|the store|stores|storeroom|store cupboard)\b/i;
const GENERIC_PLACE_WORDS = new Set(["room", "the", "area", "a"]);

const toNumberWord = (word) => (/^\d+$/.test(word) ? Number(word) : NUMBER_WORDS[String(word).toLowerCase()] || 1);

// What was said: { quantity, quantityAssumed, item, place, batch } or null if it isn't someone
// telling the Orb they took something.
export function parseUseRequest(text) {
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
  let m = rest ? null : t.match(new RegExp(`^(?:i|we)(?:'ve|\\s+have)?\\s+(?:just\\s+)?(?:${VERBS})\\s+(.+)$`, "i"));
  if (m) rest = m[1];
  if (!rest) {
    // "one adrenaline ampoule taken from room D62": needs a number or a unit, so ordinary sentences don't count
    m = t.match(new RegExp(`^(.+?)\\s+(?:(?:was|were|has been|have been)\\s+)?(?:just\\s+)?(?:${VERBS})\\b\\s*(.*)$`, "i"));
    if (m && (new RegExp(`^(?:${NUM})\\b`, "i").test(m[1]) || new RegExp(`\\b(?:${UNITS})\\b`, "i").test(m[1]))) rest = `${m[1]} ${m[2]}`.trim();
  }
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
const sentence = ({ qty, label, placeName, tail }) => `I've taken ${qty} ${label}${placeName ? ` from ${placeName}` : ""}${tail ? `, batch ending ${tail}` : ""}`;

export function buildUseDraft(input = {}, { items = [], now = new Date() } = {}) {
  // from the language assistant: the product, number, place and batch it picked out
  const heard = input.item
    ? { quantity: Math.max(1, Math.round(Number(input.quantity) || 1)), quantityAssumed: !Number(input.quantity), item: String(input.item).trim(), place: input.place ? String(input.place).trim() : null, batch: input.batch ? String(input.batch).trim() : null }
    : null;
  const parsed = heard || parseUseRequest(input.question);
  if (!parsed) return { text: "Tell me what you took, for example \"I've just taken one adrenaline from the store cupboard\".", followUps: [] };
  if (!parsed.item) return { text: "Which product did you take? For example \"I've taken one adrenaline ampoule from the store cupboard\".", followUps: [] };

  const found = resolveStockItem(parsed.item, items);
  const base = { qty: parsed.quantity, placeName: null, tail: null };
  if (found.status === "none") {
    // a spelling slip: offer what it nearly is, but never pick for them
    const near = suggestStockItems(parsed.item, items);
    if (near.length) {
      return {
        text: lines(`I couldn't find “${parsed.item}”. Did you mean:`, ...near.map((i) => `• ${itemLabel(i)}`)),
        followUps: near.map((i) => sentence({ ...base, label: itemLabel(i), placeName: parsed.place })),
        ambiguous: true,
      };
    }
    return { text: `I couldn't find any stock matching “${parsed.item}”, so I haven't changed anything.`, followUps: [] };
  }
  if (found.status === "many") {
    return {
      text: lines(`More than one product fits “${parsed.item}”. Which did you take?`, ...found.items.map((i) => `• ${itemLabel(i)}`)),
      followUps: found.items.slice(0, 4).map((i) => sentence({ ...base, label: itemLabel(i), placeName: parsed.place })),
      ambiguous: true,
    };
  }
  const item = found.item;
  const label = itemLabel(item);
  const placements = itemPlacements(item);
  const total = toNumber(item.current_stock, 0);
  if (!placements.length || total <= 0) return { text: `${label}: none is recorded in stock, so there's nothing to take off.`, followUps: [] };

  // where from
  let placement = null;
  if (parsed.place) {
    const where = resolveItemPlacement(parsed.place, item);
    if (where.status === "one") placement = where.placement;
    else {
      const options = where.status === "many" ? where.placements : placements;
      return {
        text: lines(where.status === "many" ? `More than one place fits “${parsed.place}”. Which did you mean?` : `No ${label} is recorded in “${parsed.place}”. It is recorded in:`, ...options.map((p) => `• ${p.name}: ${p.qty}`)),
        followUps: options.slice(0, 4).map((p) => sentence({ ...base, label, placeName: p.name })),
        ambiguous: true,
      };
    }
  } else if (placements.length === 1) {
    placement = placements[0];
  } else {
    return {
      text: lines(`Where did you take the ${label} from? It is recorded in:`, ...placements.map((p) => `• ${p.name}: ${p.qty}`)),
      followUps: placements.slice(0, 4).map((p) => sentence({ ...base, label, placeName: p.name })),
      ambiguous: true,
    };
  }
  if (parsed.quantity > placement.qty) {
    return { text: `Only ${plural(placement.qty, "unit")} of ${label} ${placement.qty === 1 ? "is" : "are"} recorded in ${placement.name}, so I can't take off ${parsed.quantity}. Check the number, or the place.`, followUps: [] };
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
      return {
        text: hits.length ? `More than one batch ends in “${parsed.batch}”. Which one?` : `I couldn't find a batch of ${label} ending in “${parsed.batch}”. These are in stock:`,
        followUps: batchChoices(options, batches, tails, { ...base, label, placeName: placement.name }),
        ambiguous: true,
      };
    }
  } else if (batches.length > 1) {
    return {
      text: `Which batch did the ${label} come from? Check the end of the batch number on the pack.`,
      followUps: batchChoices(batches, batches, tails, { ...base, label, placeName: placement.name }),
      ambiguous: true,
    };
  } else {
    batch = batches[0] || null; // only one batch (or none recorded): no need to ask
  }

  const expired = batch?.expiry_date && new Date(`${batch.expiry_date}T23:59:59`) < now;
  const after = total - parsed.quantity;
  const cardLines = [
    `Product: ${label}`,
    `Taking: ${parsed.quantity}${parsed.quantityAssumed ? " (assumed one; say a number if not)" : ""}`,
    `From: ${placement.name} (${placement.qty} recorded there)`,
    batch?.batch_number ? `Batch: ${batch.batch_number} · ${batch.expiry_date ? `expires ${formatExpiry(batch.expiry_date)}` : "no expiry date"}` : "Batch: not recorded for this stock",
    `Stock after: ${after} in total, ${placement.qty - parsed.quantity} in ${placement.name}`,
    expired ? "Warning: this batch is past its expiry date." : "",
  ].filter(Boolean);
  const proposal = createProposal({
    kind: "stock-use",
    title: `Record ${parsed.quantity} ${label} used`,
    lines: cardLines,
    requiredCapability: "inventory.write",
    confirmLabel: "Take it off stock",
    params: {
      itemId: item.id, itemLabel: label, quantity: parsed.quantity,
      locationId: placement.id, locationName: placement.name, locationType: placement.type === "store" ? "space" : placement.type,
      batchNumber: batch?.batch_number || "",
    },
  });
  return { text: `I'll take ${parsed.quantity} ${label} off stock once you confirm. Nothing has been changed yet.`, proposal, followUps: [] };
}

function batchChoices(options, all, tails, base) {
  return options.slice(0, 4).map((b) => {
    const tail = tails[all.indexOf(b)] || b.batch_number;
    return {
      label: tail ? `Batch ending ${tail}` : "No batch number",
      hint: `${b.expiry_date ? `expires ${formatExpiry(b.expiry_date)}` : "no expiry date"} · ${b.quantity} in stock`,
      color: "#0ea5e9",
      ask: sentence({ ...base, tail: tail || b.batch_number || "none" }),
    };
  });
}

const lines = (...parts) => parts.filter(Boolean).join("\n");
