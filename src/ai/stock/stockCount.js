import { createProposal } from "../../orb/actionProposals";
import { mainStoreName, toNumber } from "../../lib/stockLocations";
import { buildPlaces, itemLabel, itemPlacements, resolvePlace, resolveStockItem, suggestStockItems } from "./stockAsk";
import { plural } from "../tools/answerWording";

// "Count the nurses' room: gloves 12, syringes 40" -> one card showing, for each product, what was counted
// against what was recorded there; confirming sets the recorded figure for that place to what was counted.
// The items can come in several goes ("gloves 12" ... "syringes 40"): the card is rebuilt each time. Pure.

const QUESTION_START = /^(?:what|which|who|how|is|are|do|does|did|can|could|where|when|why|show|list|tell me)\b/i;
const WORDS = { zero: 0, none: 0, nothing: 0, no: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100 };
const NUMBER = `\\d{1,5}|${Object.keys(WORDS).join("|")}`;
const MAIN_STORE = /\b(main store|store ?room|stock ?room|the store|stores|storeroom|store cupboard)\b/i;

const toCount = (word) => (/^\d+$/.test(word) ? Number(word) : WORDS[String(word).toLowerCase()]);

// ---- understanding the sentence -----------------------------------------------------------------------------

const COUNT_VERB = "(?:(?:i|we)(?:\\s*['’]?\\s*(?:ve|re|m)|\\s+have|\\s+are|\\s+am)?\\s+)?(?:(?:just|now|also)\\s+)?(?:counted|counting|count|recounted|recount|stock\\s*count(?:ed)?(?:\\s+of|\\s+for)?|stock\\s*take|stocktake|doing\\s+a\\s+(?:stock\\s*)?count\\s+(?:of|for|in|on)|do\\s+a\\s+(?:stock\\s*)?count\\s+(?:of|for|in|on))";

// { place, rest } where place is the words naming the place and rest what was counted there (may be "").
export function extractCount(text) {
  let t = String(text || "").trim().replace(/\s+/g, " ").replace(/[.!?]+$/g, "");
  t = t.replace(/^(?:(?:ok|okay|right|so|hi|hello|orb|please|can you|could you|let's|lets)[,\s]+)+/i, "");
  if (!t || QUESTION_START.test(t)) return null;

  // "in the nurses room there are 12 gloves and 40 syringes"
  let m = t.match(/^(?:in|at|inside|on)\s+(?:the\s+)?(.+?),?\s+(?:there\s+(?:are|is)|we\s+have|i\s+(?:have|can see|counted)|it\s+has|has)\s+(.+)$/i);
  if (m && new RegExp(`\\b(?:${NUMBER})\\b`, "i").test(m[2])) return { place: m[1].trim(), rest: m[2].trim() };

  m = t.match(new RegExp(`^${COUNT_VERB}\\s+(?:of\\s+|for\\s+|in\\s+|on\\s+|at\\s+)?(?:the\\s+)?(.+)$`, "i"));
  if (!m) return null;
  const body = m[1].trim();
  // "the nurses room: gloves 12, syringes 40"  /  "the nurses room - gloves 12"  /  "nurses room, gloves 12"
  const split = body.match(/^(.+?)\s*(?::|\s-\s|,)\s*(.+)$/);
  if (split) return { place: split[1].trim(), rest: split[2].trim() };
  // "the nurses room gloves 12 syringes 40": the place runs to the first word that is a number or follows one
  const firstNumber = body.search(new RegExp(`\\b(?:${NUMBER})\\b`, "i"));
  if (firstNumber > 0) {
    const before = body.slice(0, firstNumber).trim();
    const words = before.split(" ");
    // the item name is the last word or two before the number: "...room gloves 12"
    if (words.length >= 3 && /\b(room|store|cupboard|box|bag|trolley|fridge|freezer|kit|unit|area|office|bay|drawer|shelf)\b/i.test(words.slice(0, -1).join(" "))) {
      const cut = words.findLastIndex((word) => /^(room|store|cupboard|box|bag|trolley|fridge|freezer|kit|unit|area|office|bay|drawer|shelf|\d+|[a-z]\d+)$/i.test(word));
      if (cut >= 0 && cut < words.length - 1) return { place: words.slice(0, cut + 1).join(" "), rest: `${words.slice(cut + 1).join(" ")} ${body.slice(firstNumber)}`.trim() };
    }
  }
  return { place: body, rest: "" };
}

// One counted product: "gloves 12", "12 gloves", "gloves: 12", "gloves are 12", "no gloves", "gloves none".
export function parseCountPiece(piece) {
  const t = String(piece || "").trim().replace(/[.!?]+$/g, "").replace(/^(?:and|also|then|plus|ok|okay)\s+/i, "");
  if (!t) return null;
  let m = t.match(new RegExp(`^no\\s+(.+)$`, "i"));
  if (m) return { item: cleanItem(m[1]), counted: 0 };
  m = t.match(new RegExp(`^(.+?)\\s*(?:[:=]|-|\\bis\\b|\\bare\\b|\\bx\\b|\\bhas\\b|\\bwe have\\b|\\bleft\\b)?\\s*(${NUMBER})\\s*(?:left|remaining|in there|here)?$`, "i"));
  if (m && cleanItem(m[1])) return { item: cleanItem(m[1]), counted: toCount(m[2]) };
  m = t.match(new RegExp(`^(${NUMBER})\\s*(?:x\\s*)?(?:of\\s+)?(?:the\\s+)?(.+)$`, "i"));
  if (m && cleanItem(m[2])) return { item: cleanItem(m[2]), counted: toCount(m[1]) };
  return null;
}

const cleanItem = (text) => String(text || "").replace(/\b(?:the|some|of|boxes|box|packs?|packets?)\b/gi, " ").replace(/\s+/g, " ").trim();

export function parseCountItems(rest) {
  const pieces = String(rest || "").split(/\s*(?:;|,|\band\b|\bplus\b|\bthen\b)\s*/i).map((x) => x.trim()).filter(Boolean);
  return pieces.map(parseCountPiece).filter(Boolean);
}

export const looksLikeStockCount = (text) => Boolean(extractCount(text));

// Is this the next batch of counted items for a count already under way? ("gloves 12 and syringes 40")
export function looksLikeCountItems(text) {
  const t = String(text || "").trim();
  if (!t || t.length > 200 || QUESTION_START.test(t)) return false;
  const pieces = t.split(/\s*(?:;|,|\band\b|\bplus\b|\bthen\b)\s*/i).map((x) => x.trim()).filter(Boolean);
  return pieces.length > 0 && pieces.every((piece) => parseCountPiece(piece));
}

export function mergeCountSentence(earlier, reply) {
  const first = String(earlier || "").trim().replace(/[.!?]+$/g, "");
  const more = String(reply || "").trim().replace(/[.!?]+$/g, "");
  if (!first) return more;
  // a count with no items yet: "count the nurses room" + "gloves 12" reads as "count the nurses room: gloves 12"
  return /[:]/.test(first) ? `${first}, ${more}` : `${first}: ${more}`;
}

// ---- the card ---------------------------------------------------------------------------------------------------

const recordedAt = (item, place) => {
  const rows = itemPlacements(item);
  const row = place.id === null ? rows.find((p) => p.id === null) : rows.find((p) => p.id === place.id);
  return row ? toNumber(row.qty, 0) : 0;
};

function contentsOf(place, items) {
  return items
    .map((item) => ({ item, qty: recordedAt(item, place) }))
    .filter((row) => row.qty > 0)
    .map((row) => ({ ...row, label: itemLabel(row.item) }));
}

export function buildStockCountDraft(input = {}, { items = [], kits = [] } = {}) {
  const found = extractCount(input.question);
  if (!found) return { text: "Tell me what to count, for example “count the nurses room: gloves 12, syringes 40”.", followUps: [] };
  const places = buildPlaces({ items, kits });
  const sentenceFor = (placeName) => `count ${placeName}: ${found.rest}`.replace(/:\s*$/, "");

  // which place
  const where = resolvePlace(found.place, places);
  let place;
  if (where.status === "main") place = { id: null, name: "the main store", type: "store" };
  else if (where.status === "one") place = { id: where.place.id, name: where.place.name, type: where.place.type === "kit" ? "kit" : where.place.type || "space" };
  else {
    const options = where.status === "many" ? where.places : places.slice(0, 4);
    return {
      text: options.length
        ? `${where.status === "many" ? `More than one place fits “${found.place}”.` : `I don't know a place called “${found.place}”.`} Which did you mean?`
        : `I don't know a place called “${found.place}”. Say “the main store”, or the name of a kit or room that already holds stock.`,
      followUps: options.map((p) => ({ label: p.name, ask: sentenceFor(p.name), color: "#0ea5e9" })),
      ambiguous: true,
    };
  }

  const counted = parseCountItems(found.rest);
  const pending = { toolId: "stock.countDraft", sentence: String(input.question || "") };
  if (!counted.length) {
    const here = contentsOf(place, items);
    return {
      text: `Counting ${place.name}. Tell me each item and how many you can see, like “gloves 12, syringes 40”.${here.length ? ` ${plural(here.length, "product")} ${here.length === 1 ? "is" : "are"} recorded there.` : ""}`,
      followUps: [], pending: true,
    };
  }

  // each counted product
  const lines = [];
  const skipped = [];
  const seen = new Set();
  for (const row of counted) {
    const hit = resolveStockItem(row.item, items);
    if (hit.status === "many") {
      return {
        text: `More than one product fits “${row.item}”. Which did you count?`,
        followUps: hit.items.slice(0, 4).map((i) => ({ label: itemLabel(i), ask: String(input.question).replace(new RegExp(row.item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), itemLabel(i)), color: "#0ea5e9" })),
        ambiguous: true, pending: true,
      };
    }
    if (hit.status === "none") {
      const near = suggestStockItems(row.item, items, 1)[0];
      skipped.push(near ? `${row.item} (did you mean ${itemLabel(near)}?)` : row.item);
      continue;
    }
    if (seen.has(hit.item.id)) continue; // the last figure said for a product wins
    seen.add(hit.item.id);
    lines.push({ item: hit.item, label: itemLabel(hit.item), counted: row.counted, recorded: recordedAt(hit.item, place) });
  }
  // the last figure said for a product wins
  const latest = new Map();
  counted.forEach((row) => { const hit = resolveStockItem(row.item, items); if (hit.status === "one") latest.set(hit.item.id, row.counted); });
  lines.forEach((line) => { line.counted = latest.get(line.item.id) ?? line.counted; });

  if (!lines.length) {
    return { text: `I couldn't match ${skipped.map((s) => `“${s}”`).join(", ")} to anything in stock, so there's nothing to count yet. Say the product names as they're written on the shelf.`, followUps: [], pending: true };
  }

  const changed = lines.filter((line) => line.counted !== line.recorded);
  const same = lines.filter((line) => line.counted === line.recorded);
  const notCounted = contentsOf(place, items).filter((row) => !seen.has(row.item.id));
  const cardLines = lines.map((line) => {
    const diff = line.counted - line.recorded;
    return `${line.label}: counted ${line.counted}, recorded ${line.recorded}${diff === 0 ? " · matches" : ` · ${diff > 0 ? `${diff} more` : `${Math.abs(diff)} fewer`}`}`;
  });
  const big = changed.filter((line) => Math.abs(line.counted - line.recorded) >= 10 && Math.abs(line.counted - line.recorded) >= line.recorded * 0.5);
  if (big.length) cardLines.push(`Check these big differences: ${big.map((l) => l.label).join(", ")}.`);
  if (notCounted.length) cardLines.push(`Recorded here but not counted yet (left as they are): ${notCounted.slice(0, 6).map((r) => r.label).join(", ")}${notCounted.length > 6 ? ` and ${notCounted.length - 6} more` : ""}.`);
  if (skipped.length) cardLines.push(`Not recognised, so not counted: ${skipped.join(", ")}.`);

  const proposal = createProposal({
    kind: "stock-count",
    title: `Stock count: ${place.name}`,
    lines: cardLines,
    requiredCapability: "inventory.write",
    confirmLabel: changed.length ? `Update ${plural(changed.length, "figure")}` : "Record the count",
    params: {
      placeName: place.name,
      lines: lines.map((line) => ({
        itemId: line.item.id, itemLabel: line.label, counted: line.counted, recorded: line.recorded,
        locationId: place.id, locationName: place.id === null ? mainStoreName(line.item) : place.name, locationType: place.type === "store" ? "space" : place.type,
      })),
    },
  });
  const summary = `${plural(lines.length, "product")} counted in ${place.name}: ${changed.length ? `${plural(changed.length, "figure")} will change` : "everything matches what's recorded"}${same.length && changed.length ? `, ${same.length} match` : ""}. Nothing has been changed yet. Keep saying items to add more, or say “yes” to confirm.`;
  return { text: summary, proposal, followUps: [], pending };
}
