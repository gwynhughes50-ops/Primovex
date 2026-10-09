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
]);

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
export function buildMedicineNames({ vtms = [], vmps = [], amps = [] }) {
  const lc = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const genericNames = [...new Set(vtms.map((v) => lc(v.name)))].sort();
  const indexOf = new Map(genericNames.map((n, i) => [n, i]));
  const vtmById = new Map(vtms.map((v) => [v.id, lc(v.name)]));
  const vmpToVtm = new Map(vmps.filter((v) => v.vtmId).map((v) => [v.id, v.vtmId]));
  const brands = {};
  for (const amp of amps) {
    const brand = brandOf(amp.name);
    if (!brand || brand.length < 3 || indexOf.has(brand)) continue; // an unbranded product is just its substance
    const vtmId = vmpToVtm.get(amp.vmpId);
    const generic = vtmId ? vtmById.get(vtmId) : null;
    if (!generic || brand.startsWith(`${generic} `)) continue;
    if (brands[brand] === undefined) brands[brand] = indexOf.get(generic);
  }
  return { generics: genericNames, brands };
}
