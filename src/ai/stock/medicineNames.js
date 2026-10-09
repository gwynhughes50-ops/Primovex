// Medicines go by many names: generic and brand, UK and US, and people spell them in their own way.
// The stock says "Chlorphenamine"; someone says "piriton", "chlorpheniramine" or "chlorphenaimne".
// This brings what was said and what is on the shelf to the same name (the UK generic name), so they
// can be matched. Where the names come from:
//   - a short built-in list of UK/US name differences
//   - the NHS dm+d name list, built by scripts/dmd/build-medicine-names.mjs (generics and brands)
//   - names this practice has taught the Orb (Admin > Orb)
// Pure and synchronous once the data is set, so it can be tested. Nothing here is sent anywhere.

const US_UK = [
  [/\bchlorpheniramine\b/gi, "chlorphenamine"], [/\bepinephrine\b/gi, "adrenaline"], [/\bacetaminophen\b/gi, "paracetamol"],
  [/\balbuterol\b/gi, "salbutamol"], [/\bglyceryl trinitrate\b/gi, "gtn"], [/\bnitroglycerin\b/gi, "gtn"], [/\bparacetemol\b/gi, "paracetamol"],
  [/\bcolchicin\b/gi, "colchicine"], [/\bamoxycillin\b/gi, "amoxicillin"], [/\bfrusemide\b/gi, "furosemide"], [/\bcefalexin\b/gi, "cefalexin"],
  [/\bcephalexin\b/gi, "cefalexin"], [/\bcodeine phosphate\b/gi, "codeine"],
];

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

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// data: { generics: [name], brands: { brand: genericIndexOrName } }, aliases: [{ say, means }]
export function createMedicineNormaliser({ generics = [], brands = {}, aliases = [] } = {}) {
  const genericList = generics.map((g) => String(g).toLowerCase());
  const genericSet = new Set(genericList);
  const brandMap = new Map();
  for (const [brand, target] of Object.entries(brands)) {
    const generic = typeof target === "number" ? genericList[target] : String(target || "").toLowerCase();
    if (generic) brandMap.set(brand.toLowerCase(), generic);
  }
  // the words inside generic names (for correcting a slip in one word of "glyceryl trinitrate")
  const wordsByFirst = new Map();
  for (const name of genericList) {
    for (const w of name.split(/[^a-z]+/).filter((x) => x.length >= 6)) {
      const list = wordsByFirst.get(w[0]) || new Set();
      list.add(w);
      wordsByFirst.set(w[0], list);
    }
  }
  const knownWords = new Set(genericList.flatMap((g) => g.split(/[^a-z]+/)));
  const aliasRules = aliases
    .map((a) => ({ say: String(a?.say || "").trim().toLowerCase().replace(/^(?:the|a|an|our|some)\s+/, ""), means: String(a?.means || "").trim().toLowerCase() }))
    .filter((a) => a.say && a.means)
    .sort((a, b) => b.say.length - a.say.length)
    .map((a) => ({ pattern: new RegExp(`\\b${escapeRegex(a.say)}\\b`, "g"), means: a.means }));
  const cache = new Map();

  const fix = (word) => {
    if (word.length < 7 || knownWords.has(word) || genericSet.has(word)) return word;
    const pool = wordsByFirst.get(word[0]);
    if (!pool) return word;
    const limit = word.length >= 11 ? 3 : 2;
    let best = null;
    let bestDistance = limit + 1;
    let tie = false;
    for (const candidate of pool) {
      if (Math.abs(candidate.length - word.length) > limit) continue;
      const d = editDistance(word, candidate);
      if (d < bestDistance) { best = candidate; bestDistance = d; tie = false; } else if (d === bestDistance) tie = true;
    }
    return best && !tie ? best : word;
  };

  return function normalise(text) {
    const input = String(text || "");
    if (cache.has(input)) return cache.get(input);
    let t = input.toLowerCase();
    for (const [pattern, uk] of US_UK) t = t.replace(pattern, uk);
    for (const rule of aliasRules) t = t.replace(rule.pattern, rule.means);
    if (brandMap.size || genericSet.size) {
      const parts = t.split(/([^a-z-]+)/); // words (hyphens kept: "solu-cortef") at even positions, separators at odd
      const out = [];
      for (let i = 0; i < parts.length; i += 2) {
        let replaced = false;
        for (const span of [3, 2, 1]) {
          const words = [];
          for (let k = 0; k < span; k += 1) words.push(parts[i + 2 * k]);
          if (words.some((w) => !w)) continue;
          const between = [];
          for (let k = 0; k < span - 1; k += 1) between.push(parts[i + 2 * k + 1]);
          if (between.some((b) => b !== " ")) continue;
          const brand = brandMap.get(words.join(" "));
          if (brand && !genericSet.has(words.join(" "))) {
            out.push(brand, parts[i + 2 * (span - 1) + 1] ?? "");
            i += 2 * (span - 1);
            replaced = true;
            break;
          }
        }
        if (!replaced) out.push(fix(parts[i] || ""), parts[i + 1] ?? "");
      }
      t = out.join("");
    }
    if (cache.size > 3000) cache.clear();
    cache.set(input, t);
    return t;
  };
}

// ---- what the app uses -------------------------------------------------------------------------------------------

let normaliser = createMedicineNormaliser();
let data = { generics: [], brands: {} };
let taught = [];

const rebuild = () => { normaliser = createMedicineNormaliser({ ...data, aliases: taught }); };
export function setMedicineData(next) { data = { generics: next?.generics || [], brands: next?.brands || {} }; rebuild(); }
export function setStockAliases(list) { taught = Array.isArray(list) ? list : []; rebuild(); }
export const normaliseMedicineText = (text) => normaliser(text);
export const medicineDataSize = () => ({ generics: data.generics.length, brands: Object.keys(data.brands).length, taught: taught.length });
