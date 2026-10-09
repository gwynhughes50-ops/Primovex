// Turns the NHS dm+d (Dictionary of Medicines and Devices) XML files into the compact list of
// medicine names the Orb uses. Pure (text in, data out) so it can be tested without the real files.
//
// dm+d, as the NHS publishes it on TRUD:
//   VTM  a virtual therapeutic moiety: the substance ("Chlorphenamine")
//   VMP  a virtual medicinal product: the generic product ("Chlorphenamine 10mg/1ml solution for
//        injection ampoules"), pointing at its VTM
//   AMP  an actual medicinal product: a branded or supplier product ("Piriton 10mg/1ml solution for
//        injection ampoules"), pointing at its VMP
// So a brand name leads to its substance by AMP -> VMP -> VTM.

const block = (xml, tag) => [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g"))].map((m) => m[1]);
const field = (inner, tag) => {
  const m = inner.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? decode(m[1].trim()) : "";
};
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
const invalid = (inner) => /<INVALID>\s*1\s*<\/INVALID>/.test(inner);

export const parseVtms = (xml) => block(xml, "VTM").filter((b) => !invalid(b)).map((b) => ({ id: field(b, "VTMID"), name: field(b, "NM") })).filter((v) => v.id && v.name);
export const parseVmps = (xml) => block(xml, "VMP").filter((b) => !invalid(b)).map((b) => ({ id: field(b, "VPID"), vtmId: field(b, "VTMID"), name: field(b, "NM") })).filter((v) => v.id);
export const parseAmps = (xml) => block(xml, "AMP").filter((b) => !invalid(b)).map((b) => ({ id: field(b, "APID"), vmpId: field(b, "VPID"), name: field(b, "NM") })).filter((a) => a.id && a.name);

const FORM_WORDS = new Set([
  "tablets", "tablet", "capsules", "capsule", "solution", "suspension", "oral", "injection", "cream", "ointment", "gel", "drops", "inhaler", "spray", "powder", "patches", "patch",
  "suppositories", "pessaries", "lotion", "syrup", "elixir", "liquid", "granules", "sachets", "vial", "ampoules", "ampoule", "pre-filled", "prefilled", "infusion", "concentrate", "emulsion",
  "shampoo", "paste", "foam", "enema", "lozenges", "chewable", "dispersible", "effervescent", "modified-release", "gastro-resistant", "film-coated",
  "vaccine", "vaccines", "suspension", "for", "and", "with", "in", "sugar", "free", "sublingual", "intramuscular", "subcutaneous", "powder", "solvent", "pre-filled",
  "adjuvanted", "recombinant", "inactivated", "live", "nasal", "eye", "ear", "pump", "auto-injector", "pen", "cartridges", "dressing", "tablets",
]);

// "Human papillomavirus vaccine suspension for injection 0.5ml pre-filled syringes" -> "human papillomavirus vaccine"
export function vaccineNameOf(vmpName) {
  const words = String(vmpName || "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim().split(" ");
  const lead = [];
  for (const w of words) {
    lead.push(w.toLowerCase());
    if (/^vaccines?$/i.test(w)) return lead.join(" ").replace(/[^a-z0-9 \-]/g, "").trim();
    if (/^\d/.test(w) || lead.length >= 7) break;
  }
  return "";
}

import { NEVER_BRAND } from "../../src/ai/stock/medicineStoplist.js";

// "Piriton 10mg/1ml solution for injection ampoules (GSK)" -> "piriton"; "Chlorphenamine 10mg/..." -> "chlorphenamine"
export function brandOf(ampName) {
  const words = String(ampName || "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim().split(" ");
  const lead = [];
  for (const w of words) {
    if (/^\d/.test(w) || FORM_WORDS.has(w.toLowerCase())) break;
    lead.push(w);
    if (lead.length >= 3) break;
  }
  return lead.join(" ").toLowerCase().replace(/[^a-z0-9 \-']/g, "").trim();
}

// vtms, vmps, amps as parsed above. Returns { generics: [name], brands: { brand: genericIndex } }.
export function buildMedicineNames({ vtms = [], vmps = [], amps = [], curated = {} }) {
  const lc = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
  // vaccines have no substance of their own in dm+d: name them from their generic product ("pneumococcal polysaccharide vaccine")
  const vmpGeneric = new Map();
  for (const vmp of vmps) {
    const viaVtm = vmp.vtmId ? vtms.find((v) => v.id === vmp.vtmId) : null;
    if (viaVtm) continue;
    const vaccine = vaccineNameOf(vmp.name);
    if (vaccine) vmpGeneric.set(vmp.id, vaccine);
  }
  const vtmById = new Map(vtms.map((v) => [v.id, lc(v.name)]));
  const genericNames = [...new Set([...vtms.map((v) => lc(v.name)), ...vmpGeneric.values(), ...Object.values(curated).map(lc)])].sort();
  const indexOf = new Map(genericNames.map((n, i) => [n, i]));
  const vmpToVtm = new Map(vmps.filter((v) => v.vtmId).map((v) => [v.id, v.vtmId]));
  const brands = {};
  for (const amp of amps) {
    const brand = brandOf(amp.name);
    if (!brand || brand.length < 3 || indexOf.has(brand)) continue; // an unbranded product is just its substance
    const vtmId = vmpToVtm.get(amp.vmpId);
    const generic = vtmId ? vtmById.get(vtmId) : vmpGeneric.get(amp.vmpId);
    if (!generic || brand.startsWith(`${generic} `)) continue;
    if (brands[brand] === undefined) brands[brand] = indexOf.get(generic);
  }
  // people say "calpol", not "calpol six plus": the first word counts too when it means one substance only
  const byFirst = new Map();
  for (const [brand, idx] of Object.entries(brands)) {
    const first = brand.split(" ")[0];
    if (first === brand) continue;
    const set = byFirst.get(first) || new Set();
    set.add(idx);
    byFirst.set(first, set);
  }
  const words = new Set(genericNames.flatMap((g) => g.split(/[^a-z]+/)));
  for (const [first, set] of byFirst) {
    if (set.size === 1 && first.length >= 5 && brands[first] === undefined && !indexOf.has(first) && !words.has(first) && !FORM_WORDS.has(first)) brands[first] = [...set][0];
  }
  // never a word that is also ordinary English or stock talk, nor a very short one
  for (const key of Object.keys(brands)) {
    if (NEVER_BRAND.has(key) || (!key.includes(" ") && key.length <= 3)) delete brands[key];
  }
  // the practice's own additions (brands dm+d gives no substance for)
  for (const [brand, generic] of Object.entries(curated)) {
    const idx = indexOf.get(lc(generic));
    if (idx !== undefined && brands[brand.toLowerCase()] === undefined) brands[brand.toLowerCase()] = idx;
  }
  return { generics: genericNames, brands };
}
