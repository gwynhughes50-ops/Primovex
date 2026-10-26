// The NHS dictionary of medicines and devices (dm+d), turned into the small searchable list ClinFlow uses for the medicines in a letter. Pure (no files,
// no screens) so it can be tested; scripts/build-dmd-index.mjs reads the real XML files and calls this.
//
// What a letter says is a name and a strength ("Bisoprolol 5 mg once daily"). dm+d has three levels, and each is a SNOMED concept:
//   VTM  the medicine itself            "Bisoprolol"
//   VMP  the generic product            "Bisoprolol 5mg tablets"
//   AMP  a branded product              "Cardicor 5mg tablets"
// The list has the same shape as the clinical SNOMED list, so the same search works on it.

const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const decode = (v) => String(v ?? "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const field = (block, name) => { const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(block); return m ? decode(m[1]) : ""; };

export const DMD_TAGS = ["virtual therapeutic moiety", "virtual medicinal product", "actual medicinal product"];

const blocks = (xml, tag) => { const out = []; const pattern = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g"); let m; while ((m = pattern.exec(xml))) out.push(m[1]); return out; };

// VTMs, VMPs and AMPs as { id, name, vtmId/vpid } (items marked invalid are left out)
export const parseVtms = (xml) => blocks(xml, "VTM").map((b) => ({ id: field(b, "VTMID"), name: clean(field(b, "NM")), invalid: field(b, "INVALID") === "1" })).filter((r) => r.id && r.name && !r.invalid);
export const parseVmps = (xml) => blocks(xml, "VMP").map((b) => ({ id: field(b, "VPID"), name: clean(field(b, "NM")), vtmId: field(b, "VTMID"), invalid: field(b, "INVALID") === "1" })).filter((r) => r.id && r.name && !r.invalid);
export const parseAmps = (xml) => blocks(xml, "AMP").map((b) => ({ id: field(b, "APID"), vpid: field(b, "VPID"), name: clean(field(b, "NM")), desc: clean(field(b, "DESC")), invalid: field(b, "INVALID") === "1" })).filter((r) => r.id && r.name && !r.invalid);

// vtms / vmps / amps: the parsed rows. Branded products are only kept when the brand has its own name: an AMP named exactly as its generic product
// (one for every supplier of the generic) adds nothing a coder could use.
export function buildDmdIndex({ vtms = [], vmps = [], amps = [], release = "", now = new Date() } = {}) {
  const genericName = new Map(vmps.map((v) => [v.id, v.name.toLowerCase()]));
  const concepts = [];
  const seen = new Set();
  const add = (id, name, tagIndex) => { if (seen.has(id)) return; seen.add(id); concepts.push([id, name, "", tagIndex, []]); };
  for (const v of vtms) add(v.id, v.name, 0);
  for (const v of vmps) add(v.id, v.name, 1);
  for (const a of amps) if (a.name.toLowerCase() !== genericName.get(a.vpid)) add(a.id, a.name, 2);
  concepts.sort((a, b) => a[1].localeCompare(b[1], "en", { sensitivity: "base" }));
  return { format: 1, kind: "dmd", edition: "NHS dm+d", release: clean(release), built: now.toISOString(), tags: DMD_TAGS, concepts };
}

// ---- looking a medicine up from the words in a letter ----
const FREQUENCY = /\bat\s+\d{1,2}[:.]\d{2}(?:\s*(?:am|pm|hrs?))?\b|\b(?:once|twice|three times|four times|daily|weekly|monthly|bd|od|tds|qds|nocte|mane|prn|at night|in the morning|in the evening|every \d+ hours?|with food|when required|as needed|to be taken|take|taken|orally|oral|increase to|increased to|increase|decrease|reduce to|reduced to|reduce|continue|continued|start|started|stop|stopped|restart|restarted|please|the|dose|dosage|to)\b/gi;

// "Bisoprolol 5 mg once daily" -> "Bisoprolol 5mg": the strength is written the way dm+d writes it, and how often it is taken goes
export function medicineLookup(value) {
  return medicineParts(value).join(" ");
}

// A line can name more than one medicine ("amoxicillin 500 mg, doxycycline 100 mg"): each is looked up on its own
export const medicineParts = (value) => String(value ?? "").split(/[;,+]|\band\b/i).map((part) => lookupOne(part)).filter(Boolean);

// the name of the medicine on its own, before any strength ("bisoprolol 5mg" -> "bisoprolol")
export const medicineName = (part) => clean(String(part ?? "").split(/\s\d/)[0]);

function lookupOne(value) {
  let t = String(value ?? "").toLowerCase();
  t = t.replace(/(\d+(?:\.\d+)?)\s*(?:mcg|µg|ug|micrograms?)\b/g, "$1micrograms").replace(/(\d+(?:\.\d+)?)\s*(mg|g|ml|units?|iu|mmol)\b/g, (m, n, u) => `${n}${u === "unit" ? "unit" : u === "units" ? "units" : u}`);
  t = t.replace(FREQUENCY, " ").replace(/[^a-z0-9.\s/+-]/g, " ");
  return clean(t);
}
