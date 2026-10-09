import { tokens } from "../help/helpSearch";
import { kitLocationId, mainStoreName, toNumber, unassignedQty } from "../../lib/stockLocations";

// Understanding a spoken or typed stock request: which product, which place, which team, what to
// say. Pure (no Firebase, no React) so it can be tested with realistic stock. The matching is
// deliberately strict: when it isn't sure it says so and the Orb asks, rather than guessing.

const QUESTION_FILLER = new Set(["many", "much", "stock", "item", "items", "product", "products", "we", "have", "got", "do", "any", "left", "there", "box", "boxes", "pack", "packs"]);

// ---- products ----------------------------------------------------------------------------------

// The same medicine goes by different names: the stock may say chlorphenamine and a person say
// chlorpheniramine (its US name), adrenaline or epinephrine. Everything is compared by the UK name.
const DRUG_NAMES = [
  [/\bchlorpheniramine\b/gi, "chlorphenamine"], [/\bepinephrine\b/gi, "adrenaline"], [/\bacetaminophen\b/gi, "paracetamol"],
  [/\balbuterol\b/gi, "salbutamol"], [/\bglyceryl trinitrate\b/gi, "gtn"], [/\bnitroglycerin\b/gi, "gtn"], [/\bparacetemol\b/gi, "paracetamol"],
  [/\bhydrocortisone\b/gi, "hydrocortisone"],
];
export const ukDrugNames = (text) => DRUG_NAMES.reduce((t, [pattern, uk]) => t.replace(pattern, uk), String(text || ""));

const itemTokens = (item) => new Set(tokens(ukDrugNames([item?.name, item?.strength, item?.form, item?.brand].filter(Boolean).join(" "))));

// How well a product fits what was said: most of the words said must be in its name, and
// shorter, more exact names beat longer ones.
export function rankStockItems(query, items = []) {
  const q = tokens(ukDrugNames(query)).filter((t) => !QUESTION_FILLER.has(t));
  if (!q.length) return [];
  return items
    .filter((item) => item && !item.archived_at)
    .map((item) => {
      const have = itemTokens(item);
      const hits = q.filter((t) => have.has(t)).length;
      const coverage = hits / q.length;
      const precision = have.size ? hits / have.size : 0;
      return { item, hits, score: 0.75 * coverage + 0.25 * precision, coverage };
    })
    .filter((row) => row.coverage >= 0.66 && row.hits > 0)
    .sort((a, b) => b.score - a.score);
}

// How different two words are (the number of single-letter changes), for spelling slips.
function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const temp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = temp;
    }
  }
  return row[b.length];
}

// Products that nearly fit what was said (a spelling slip such as "chlorphenaimne"): never chosen
// automatically, only offered back ("did you mean...?").
export function suggestStockItems(query, items = [], limit = 3) {
  const q = tokens(ukDrugNames(query)).filter((t) => !QUESTION_FILLER.has(t) && t.length > 2);
  if (!q.length) return [];
  return items
    .filter((item) => item && !item.archived_at)
    .map((item) => {
      const have = [...itemTokens(item)];
      const close = q.filter((t) => have.some((h) => h === t || (t.length >= 5 && h.length >= 4 && editDistance(t, h) <= Math.max(2, Math.floor(t.length * 0.3))))).length;
      return { item, coverage: close / q.length };
    })
    .filter((row) => row.coverage >= 0.66)
    .sort((a, b) => b.coverage - a.coverage)
    .slice(0, limit)
    .map((row) => row.item);
}

// { status: 'one' | 'many' | 'none', item?, items? }
export function resolveStockItem(query, items = []) {
  const ranked = rankStockItems(query, items);
  if (!ranked.length) return { status: "none" };
  const top = ranked[0];
  const close = ranked.filter((row) => top.score - row.score < 0.12);
  if (close.length === 1) return { status: "one", item: top.item };
  // Several products fit equally well: the person has to choose (blue or orange needles).
  return { status: "many", items: close.slice(0, 4).map((row) => row.item) };
}

export const itemLabel = (item) => [item?.name, item?.strength, item?.form].filter(Boolean).join(" ").replace(/\s+/g, " ").trim() || "Unnamed item";

// ---- places --------------------------------------------------------------------------------------

// Every place stock can be: the main store, kits and boxes, and any room or equipment an item
// has been moved to.
export function buildPlaces({ items = [], kits = [] }) {
  const places = new Map();
  kits.forEach(({ collection, kit }) => {
    const id = kitLocationId(collection, kit.id);
    places.set(id, { id, name: kit.name || kit.id, type: "kit", kit, collection });
  });
  items.forEach((item) => {
    (Array.isArray(item.locations) ? item.locations : []).forEach((loc) => {
      if (loc.locationId && !places.has(loc.locationId)) places.set(loc.locationId, { id: loc.locationId, name: loc.locationName || loc.locationId, type: loc.locationType || "space" });
    });
  });
  return [...places.values()];
}

const MAIN_STORE_WORDS = /\b(main store|store ?room|stock ?room|the store|stores|storeroom|store cupboard)\b/i;

// { status: 'one' | 'many' | 'main' | 'none', place?, places? }
export function resolvePlace(query, places = []) {
  if (MAIN_STORE_WORDS.test(String(query))) return { status: "main" };
  const q = tokens(query);
  if (!q.length) return { status: "none" };
  const matches = places
    .map((place) => {
      const have = new Set(tokens(place.name));
      const hits = q.filter((t) => have.has(t)).length;
      return { place, hits, coverage: hits / q.length, precision: have.size ? hits / have.size : 0 };
    })
    // every word said must be in the place's name ("box 3" must not match "box 13")
    .filter((row) => row.coverage === 1)
    .sort((a, b) => b.precision - a.precision);
  if (!matches.length) return { status: "none" };
  const best = matches.filter((row) => row.precision === matches[0].precision);
  return best.length === 1 ? { status: "one", place: best[0].place } : { status: "many", places: best.slice(0, 4).map((r) => r.place) };
}

// Where an item is: the main store (what isn't elsewhere) and each place it's been moved to.
export function itemPlacements(item) {
  const rows = [];
  const main = unassignedQty(item);
  if (main > 0) rows.push({ id: null, name: mainStoreName(item), qty: main, type: "store" });
  (Array.isArray(item?.locations) ? item.locations : []).forEach((loc) => {
    const qty = toNumber(loc.quantity, 0);
    if (qty > 0) rows.push({ id: loc.locationId, name: loc.locationName || loc.locationId, qty, type: loc.locationType || "space" });
  });
  return rows;
}

// What is recorded at one place: each product with a quantity there.
export function placeContents(place, items = []) {
  return items
    .map((item) => {
      const loc = (Array.isArray(item.locations) ? item.locations : []).find((l) => l.locationId === place.id);
      return loc && toNumber(loc.quantity, 0) > 0 ? { item, label: itemLabel(item), qty: toNumber(loc.quantity, 0) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }));
}

// What a kit is supposed to hold that has no stock recorded in it.
export function kitGaps(place, items = []) {
  if (place.type !== "kit" || !Array.isArray(place.kit?.items)) return [];
  const recorded = new Set(placeContents(place, items).map((row) => row.item.id));
  return place.kit.items
    .filter((kitItem) => kitItem?.name && !(kitItem.stock_item_id && recorded.has(kitItem.stock_item_id)))
    .map((kitItem) => kitItem.name);
}

// ---- a question about location -------------------------------------------------------------------------

// "how many adrenaline in anaphylaxis box 3" / "what's in box 3" / "where are the blue needles".
export function parseLocateQuestion(text) {
  const t = String(text || "").trim().replace(/[?!.]+$/g, "");
  let m = t.match(/\bhow many\s+(.+?)\s+(?:(?:are|do we have|have we got|have we|is there|are there)\s+)?(?:in|at|inside|on)\s+(?:the\s+)?(.+)$/i);
  if (m) return { kind: "howmany", item: m[1].trim(), place: m[2].trim() };
  m = t.match(/\b(?:what(?:'s| is| do we have| have we got| stock is)?\s+(?:in|inside)|contents of|what does)\s+(?:the\s+)?(.+?)(?:\s+(?:contain|hold|have))?$/i);
  if (m) return { kind: "contents", item: null, place: m[1].trim() };
  m = t.match(/\bwhere\s+(?:is|are|do we keep|can i find|would i find|did we put|are we keeping)\s+(?:the\s+|our\s+|any\s+)?(.+)$/i);
  if (m) return { kind: "where", item: m[1].trim(), place: null };
  m = t.match(/\bwhich\s+(?:room|box|kit|bag|cupboard|shelf|location|trolley)\s+(?:is|are|has|have)\s+(?:the\s+)?(.+?)\s+(?:in|kept)?$/i);
  if (m) return { kind: "where", item: m[1].trim(), place: null };
  return null;
}

// ---- messaging a team ---------------------------------------------------------------------------------------

const TEAM_ALIASES = {
  hca: "HCA", hcas: "HCA", "healthcare assistant": "HCA", "healthcare assistants": "HCA", "health care assistant": "HCA", "health care assistants": "HCA",
  nurse: "Nurse", nurses: "Nurse", nursing: "Nurse",
  reception: "Reception", receptionist: "Reception", receptionists: "Reception", "front desk": "Reception",
  partner: "Partner", partners: "Partner",
  "practice manager": "Practice Manager", "practice managers": "Practice Manager", management: "Practice Manager", managers: "Practice Manager",
  caretaker: "Caretaker", caretakers: "Caretaker",
  cleaner: "Cleaner", cleaners: "Cleaner", cleaning: "Cleaner",
  secretary: "Medical Secretary", secretaries: "Medical Secretary", "medical secretary": "Medical Secretary", "medical secretaries": "Medical Secretary",
  "stock controller": "Stock Controller", "stock controllers": "Stock Controller", it: "IT",
};

const cleanTeamPhrase = (phrase) => String(phrase || "").toLowerCase().replace(/\b(the|our|all|of|team|teams|staff|group|everyone in)\b/g, " ").replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();

// Which role a phrase like "the HCA team" means, among the roles that exist.
export function resolveTeam(phrase, roleNames = []) {
  const p = cleanTeamPhrase(phrase);
  if (!p) return null;
  const roles = roleNames.map((r) => [String(r).toLowerCase(), r]);
  const exact = roles.find(([lower]) => lower === p) || roles.find(([lower]) => lower === p.replace(/s$/, ""));
  if (exact) return exact[1];
  const alias = TEAM_ALIASES[p] || TEAM_ALIASES[p.replace(/s$/, "")];
  if (alias && roles.some(([lower]) => lower === alias.toLowerCase())) return roles.find(([lower]) => lower === alias.toLowerCase())[1];
  return null;
}

const MESSAGE_VERBS = /^(?:please\s+)?(?:send\s+(?:a\s+)?(?:message|note|reminder)\s+to|message|tell|let|notify|inform|alert|ask|remind|email)\s+/i;

// "tell the HCA team BD blue needles need ordering" -> { team: "HCA", message: "BD blue needles need ordering" }.
// Returns { team: null, teamPhrase, message } when it looks like a message but no known team was named.
export function parseTeamMessage(text, roleNames = []) {
  const t = String(text || "").trim().replace(/\s+/g, " ");
  if (!MESSAGE_VERBS.test(t)) return null;
  const rest = t.replace(MESSAGE_VERBS, "").trim();
  const words = rest.split(" ");
  for (let n = Math.min(4, words.length); n >= 1; n -= 1) {
    const phrase = words.slice(0, n).join(" ").replace(/[,:]$/, "");
    const team = resolveTeam(phrase, roleNames);
    if (team) {
      let message = words.slice(n).join(" ");
      let before;
      do { before = message; message = message.replace(/^(?:(?:team|staff|know|that|to|about|saying)(?:\s+|$)|[:,-]\s*)+/i, "").trim(); } while (message !== before);
      if (!message) return { team, message: "" };
      return { team, message: message.charAt(0).toUpperCase() + message.slice(1).replace(/[.!\s]+$/, "") };
    }
  }
  return { team: null, teamPhrase: words.slice(0, 2).join(" "), message: "" };
}

// Does this read like a message to a team ("tell the HCA team ...")? Used by the router, which
// doesn't know the practice's roles; the lookup itself then resolves the team.
export function looksLikeTeamMessage(text) {
  const t = String(text || "").trim();
  return MESSAGE_VERBS.test(t) && /\b(team|teams|everyone|staff|hcas?|nurses?|reception(?:ists?)?|partners?|managers?|secretar(?:y|ies)|caretakers?|cleaners?|healthcare assistants?)\b/i.test(t);
}

// Does this read like a question about where stock is, or what is in a place, that names a
// kind of place (box, room, trolley, store...)? Those are answered by the stock location lookup.
const PLACE_WORD = /\b(box|boxes|kit|kits|trolley|bag|room|store|storeroom|cupboard|shelf|drawer|bay|fridge|freezer)\b/i;
export function looksLikePlaceQuestion(text) {
  const parsed = parseLocateQuestion(text);
  return Boolean(parsed && (parsed.kind === "howmany" || parsed.kind === "contents") && PLACE_WORD.test(parsed.place || ""));
}

// Anything that looks like an identifier is refused rather than sent, so a patient's number,
// date of birth, email or phone number can't be put in a team message by mistake.
export function looksIdentifying(text) {
  return /[^\s@]+@[^\s@]+\.[^\s@]+|\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b|(?:\+44|\b0)[\d\s()-]{9,}\d|\b\d{3}[\s-]?\d{3}[\s-]?\d{4}\b|\b\d{6,}\b/.test(String(text || ""));
}

// ---- reorders and gaps -------------------------------------------------------------------------------------------

const QUESTION_START = /^(?:what|which|who|how|is|are|do|does|did|can|could|where|when|why|show|list|tell me)\b/i;

// What the person wants ordered, or what is missing.
//   { mode: 'reorder', item: "BD blue needles", quantity: 5 }
//   { mode: 'gap', item: "chlorphenamine", place: "box 3" }
export function parseStockRequest(text) {
  const parsed = parseStockRequestRaw(text);
  // "out of stock items" is a question about stock, not a request about one product.
  if (parsed && /^(?:stock|items?|anything|everything|supplies|products?|stock items?)$/i.test(parsed.item || "")) return null;
  return parsed && parsed.item ? parsed : null;
}

function parseStockRequestRaw(text) {
  const t = String(text || "").trim().replace(/\s+/g, " ").replace(/[.!?]+$/g, "");
  if (!t || QUESTION_START.test(t)) return null;
  const qty = (s) => { const q = s.match(/\b(\d{1,3})\s*(?:x\b|boxes|box|packs|pack|units|of\b)/i) || s.match(/^(\d{1,3})\s+/); return q ? Number(q[1]) : null; };
  const subject = (s) => s.replace(/^(?:\d{1,3}\s*(?:x|boxes|box|packs|pack|units)?\s*(?:of\s+)?)/i, "").replace(/^(?:some\s+|more\s+|the\s+|a\s+|an\s+)+/i, "").trim();

  let m = t.match(/^(.+?)\s+(?:is|are)\s+missing\s+(?:a\s+|an\s+|the\s+|some\s+)?(.+)$/i);
  if (m) return { mode: "gap", item: subject(m[2]), place: m[1].trim() };
  m = t.match(/^(?:the\s+)?(.+?)\s+(?:is|are)\s+(?:missing|short)\s+(?:from|in)\s+(.+)$/i);
  if (m) return { mode: "gap", item: subject(m[1]), place: m[2].trim() };
  m = t.match(/^(?:we(?:'re| are| have)?\s+|i(?:'m| am| have)?\s+)?(?:out of|run out of|ran out of|run low on|low on|running low on|short of)\s+(.+)$/i);
  if (m) return { mode: "gap", item: subject(m[1]), place: null };
  m = t.match(/^(.+?)\s+(?:has|have)\s+run out(?:\s+(?:in|from|of)\s+(.+))?$/i);
  if (m) return { mode: "gap", item: subject(m[1]), place: m[2] ? m[2].trim() : null };
  m = t.match(/^(.+?)\s+(?:needs?|need to be|has to be|have to be|should be|must be)\s+(?:re-?\s?)?order(?:ing|ed)(?:\s+please)?$/i);
  if (m) return { mode: "reorder", item: subject(m[1]), quantity: qty(m[1]) };
  m = t.match(/^(?:please\s+)?(?:can we\s+|could we\s+|can you\s+)?(?:re-?\s?order|order more|order some more|order|raise a reorder for|request a reorder for|request more|get more)\s+(?:of\s+)?(.+)$/i);
  if (m) return { mode: "reorder", item: subject(m[1]), quantity: qty(m[1]) };
  m = t.match(/^(?:we|i)\s+(?:need|want|require)\s+(?:some\s+)?(?:more\s+)?(.+)$/i);
  if (m && /\bmore\b/i.test(t)) return { mode: "reorder", item: subject(m[1]), quantity: qty(m[1]) };
  return null;
}
