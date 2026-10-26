// Turns the UK SNOMED CT release (the RF2 files from NHS TRUD) into the small searchable list ClinFlow uses. Pure (no files, no screens) so it can be
// tested; scripts/build-snomed-index.mjs reads the real files and calls this.
//
// The release is a terminology, not patient data, and is licensed for use in the UK. ClinFlow keeps the list only on the computer it was loaded on.

export const FSN_TYPE = "900000000000003001";
export const SYNONYM_TYPE = "900000000000013009";
export const PREFERRED = "900000000000548007";
// the language lists, best first: the NHS clinical one, then GB English, then whichever the release has
export const LANGUAGE_REFSETS = ["999001261000000100", "900000000000508004"];

// What a letter's codes are made from: things a clinician finds, does or measures. (Body parts, qualifiers, organisms and so on are left out.)
export const KEEP_TAGS = ["disorder", "finding", "procedure", "situation", "observable entity", "regime/therapy", "medicinal product", "medicinal product form", "product"];
const MAX_SYNONYMS = 12;

const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
export const semanticTag = (fsn) => { const m = /\(([^()]+)\)\s*$/.exec(clean(fsn)); return m ? m[1].toLowerCase() : ""; };
const withoutTag = (fsn) => clean(fsn).replace(/\s*\([^()]+\)\s*$/, "");

// concepts:     [{ id, active }]
// descriptions: [{ id, active, conceptId, typeId, term }]
// language:     [{ refsetId, active, descriptionId, acceptabilityId }]
// only:         optional Set of concept ids to keep (for example a primary care reference set); omit to keep every concept with a wanted tag
export function buildIndex({ concepts = [], descriptions = [], language = [], only = null, release = "", edition = "UK Clinical Edition", now = new Date() } = {}) {
  const active = new Set(concepts.filter((c) => c.active).map((c) => c.id));
  const byConcept = new Map();
  for (const d of descriptions) {
    if (!d.active || !active.has(d.conceptId)) continue;
    if (!byConcept.has(d.conceptId)) byConcept.set(d.conceptId, { fsn: "", synonyms: [] });
    const entry = byConcept.get(d.conceptId);
    if (d.typeId === FSN_TYPE) entry.fsn = d.term;
    else if (d.typeId === SYNONYM_TYPE) entry.synonyms.push({ id: d.id, term: clean(d.term) });
  }
  // a description is preferred when the best language list the release has says so
  const present = new Set(language.map((l) => l.refsetId));
  const chosenRefset = LANGUAGE_REFSETS.find((r) => present.has(r)) || [...present][0] || "";
  const preferred = new Set(language.filter((l) => l.active && l.refsetId === chosenRefset && l.acceptabilityId === PREFERRED).map((l) => l.descriptionId));

  const tags = [];
  const concepts2 = [];
  for (const [conceptId, entry] of byConcept) {
    const tag = semanticTag(entry.fsn);
    if (!KEEP_TAGS.includes(tag)) continue;
    if (only && !only.has(conceptId)) continue;
    const seen = new Set();
    const terms = entry.synonyms.filter((s) => s.term && !seen.has(s.term.toLowerCase()) && seen.add(s.term.toLowerCase()));
    const lead = terms.find((s) => preferred.has(s.id)) || terms[0] || { id: "", term: withoutTag(entry.fsn) };
    if (!lead.term) continue;
    let tagIndex = tags.indexOf(tag);
    if (tagIndex < 0) { tags.push(tag); tagIndex = tags.length - 1; }
    concepts2.push([conceptId, lead.term, lead.id, tagIndex, terms.filter((s) => s !== lead).slice(0, MAX_SYNONYMS).map((s) => [s.term, s.id])]);
  }
  concepts2.sort((a, b) => a[1].localeCompare(b[1], "en", { sensitivity: "base" }));
  return { format: 1, kind: "snomed", edition, release: clean(release), built: now.toISOString(), tags, concepts: concepts2 };
}

// The licence (SNOMED CT UK National Release Affiliate Licence, clause 8.3) requires this notice, word for word, wherever the product is
// distributed, and the version and date of the release in use (clause 8.3.2, which describeIndex gives).
export const SNOMED_NOTICE = "This material includes SNOMED Clinical Terms® (SNOMED CT®) which is used by permission of the International Health Terminology Standards Development Organisation (IHTSDO). All rights reserved. SNOMED CT®, was originally created by The College of American Pathologists. \"SNOMED\" and \"SNOMED CT\" are registered trademarks of the IHTSDO.";

// The licence (clause 6.2) says a new version must be taken up within 180 days of being made available. Releases come out regularly, so a list
// older than this is flagged for replacing, well before the limit could be reached.
export const REPLACE_AFTER_DAYS = 120;
export function indexAgeDays(index, now = new Date()) {
  const r = /^(\d{4})(\d{2})(\d{2})$/.exec(index?.release || "");
  if (!r) return null;
  return Math.floor((now.getTime() - Date.UTC(Number(r[1]), Number(r[2]) - 1, Number(r[3]))) / 86400000);
}
export const indexIsOld = (index, now = new Date()) => { const days = indexAgeDays(index, now); return days !== null && days > REPLACE_AFTER_DAYS; };

// What a loaded list says about itself, for the screen: "UK Clinical Edition 14 Oct 2026: 187,402 codes"
export function describeIndex(index) {
  if (!index?.concepts) return "";
  const r = /^(\d{4})(\d{2})(\d{2})$/.exec(index.release || "");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const when = r ? ` ${Number(r[3])} ${months[Number(r[2]) - 1]} ${r[1]}` : "";
  return `${index.edition || "UK SNOMED"}${when}: ${index.concepts.length.toLocaleString("en-GB")} ${index.kind === "dmd" ? "medicines" : "codes"}`;
}

// Is this a list this version of ClinFlow can use?
// kind: "snomed" (the clinical codes) or "dmd" (the medicines). A list built before lists had a kind is a SNOMED one.
export const indexProblem = (index, kind = "snomed") => {
  if (!index || index.format !== 1 || !Array.isArray(index.concepts) || !Array.isArray(index.tags)) return kind === "dmd" ? "That is not a ClinFlow medicines list. Build one with the dm+d list builder from the TRUD download." : "That is not a ClinFlow SNOMED list. Build one with the SNOMED list builder from the TRUD download.";
  if ((index.kind || "snomed") !== kind) return kind === "dmd" ? "That is the SNOMED clinical list. Choose it under the SNOMED list, and choose the medicines list here." : "That is the medicines (dm+d) list. Choose it under the dm+d medicines list, and choose the SNOMED list here.";
  return index.concepts.length < 1 ? "That list has no codes in it." : "";
};

// ---- reading the release's files ----
// Each RF2 file is tab-separated with a header row. These turn lines into the rows buildIndex wants (null for a line to skip).
export const parseConceptLine = (line) => { const c = line.split("\t"); return c.length >= 5 && /^\d+$/.test(c[0]) ? { id: c[0], active: c[2] === "1" } : null; };
export const parseDescriptionLine = (line) => { const c = line.split("\t"); return c.length >= 9 && /^\d+$/.test(c[0]) ? { id: c[0], active: c[2] === "1", conceptId: c[4], typeId: c[6], term: c[7] } : null; };
export const parseLanguageLine = (line) => { const c = line.split("\t"); return c.length >= 7 && /^[0-9a-f-]{20,}$/i.test(c[0]) ? { refsetId: c[4], active: c[2] === "1", descriptionId: c[5], acceptabilityId: c[6] } : null; };
export const parseMemberLine = (line) => { const c = line.split("\t"); return c.length >= 6 && /^[0-9a-f-]{20,}$/i.test(c[0]) && c[2] === "1" ? c[5] : null; };
