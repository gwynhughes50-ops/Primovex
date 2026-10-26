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
const tagOf = (fsn) => { const m = /\(([^()]+)\)\s*$/.exec(clean(fsn)); return m ? m[1].toLowerCase() : ""; };
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
    const tag = tagOf(entry.fsn);
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
  return { format: 1, edition, release: clean(release), built: now.toISOString(), tags, concepts: concepts2 };
}

// What a loaded list says about itself, for the screen: "UK Clinical Edition 14 Oct 2026: 187,402 codes"
export function describeIndex(index) {
  if (!index?.concepts) return "";
  const r = /^(\d{4})(\d{2})(\d{2})$/.exec(index.release || "");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const when = r ? ` ${Number(r[3])} ${months[Number(r[2]) - 1]} ${r[1]}` : "";
  return `${index.edition || "UK SNOMED"}${when}: ${index.concepts.length.toLocaleString("en-GB")} codes`;
}

// Is this a list this version of ClinFlow can use?
export const indexProblem = (index) => (!index || index.format !== 1 || !Array.isArray(index.concepts) || !Array.isArray(index.tags) ? "That is not a ClinFlow SNOMED list. Build one with the SNOMED list builder from the TRUD download." : index.concepts.length < 1 ? "That list has no codes in it." : "");

// ---- reading the release's files ----
// Each RF2 file is tab-separated with a header row. These turn lines into the rows buildIndex wants (null for a line to skip).
export const parseConceptLine = (line) => { const c = line.split("\t"); return c.length >= 5 && /^\d+$/.test(c[0]) ? { id: c[0], active: c[2] === "1" } : null; };
export const parseDescriptionLine = (line) => { const c = line.split("\t"); return c.length >= 9 && /^\d+$/.test(c[0]) ? { id: c[0], active: c[2] === "1", conceptId: c[4], typeId: c[6], term: c[7] } : null; };
export const parseLanguageLine = (line) => { const c = line.split("\t"); return c.length >= 7 && /^[0-9a-f-]{20,}$/i.test(c[0]) ? { refsetId: c[4], active: c[2] === "1", descriptionId: c[5], acceptabilityId: c[6] } : null; };
export const parseMemberLine = (line) => { const c = line.split("\t"); return c.length >= 6 && /^[0-9a-f-]{20,}$/i.test(c[0]) && c[2] === "1" ? c[5] : null; };
