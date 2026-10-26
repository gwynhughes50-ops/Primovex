// Builds ClinFlow's SNOMED list from the UK SNOMED CT release downloaded from NHS TRUD.
//
//   1. On TRUD (https://isd.digital.nhs.uk) download "SNOMED CT UK Clinical Edition, RF2" and unzip it (right-click, Extract All).
//   2. npm run snomed:index -- "C:\path\to\the\unzipped\folder"
//   3. In ClinFlow, open a letter's SNOMED tab and choose the file this makes (work\snomed-uk-index.json.gz).
//
// The release and the list are licensed under the UK National Release Affiliate Licence: keep them on your own computers, and never commit or
// publish them (work/ and the SNOMED file names are in .gitignore for that reason).
//
// Optional: --refset "<path to a simple reference set file>" keeps only the codes in that set (for example the primary care one), which
// makes the list smaller and the suggestions more relevant. --out "<file>" says where to write it.

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import zlib from "node:zlib";
import { FSN_TYPE, KEEP_TAGS, PREFERRED, SYNONYM_TYPE, buildIndex, describeIndex, parseConceptLine, parseDescriptionLine, parseLanguageLine, parseMemberLine, semanticTag } from "../src/modules/clinflow/snomedIndex.js";

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : ""; };
const folder = args.find((a, i) => !a.startsWith("--") && (i === 0 || !args[i - 1].startsWith("--")));
if (!folder || !fs.existsSync(folder)) { console.error('Say where the unzipped TRUD folder is, e.g.  npm run snomed:index -- "C:\\Downloads\\SnomedCT_UKClinicalRF2_PRODUCTION_20261014"'); process.exit(1); }

function find(dir, test, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) find(full, test, out); else if (test(entry.name, full)) out.push(full);
  }
  return out;
}
const snapshot = (name, full) => name.endsWith(".txt") && /snapshot/i.test(full);
const files = {
  concepts: find(folder, (n, f) => snapshot(n, f) && /^sct2_Concept_/i.test(n)),
  descriptions: find(folder, (n, f) => snapshot(n, f) && /^sct2_Description_/i.test(n) && /-en/i.test(n)),
  language: find(folder, (n, f) => snapshot(n, f) && /^der2_cRefset_Language/i.test(n) && /-en/i.test(n)),
};
const deltaOnly = !files.concepts.length && find(folder, (n, f) => /delta/i.test(f) && /^sct2_Concept_/i.test(n)).length > 0;
if (deltaOnly) {
  console.error("This is the Delta package: it only holds what changed in the latest release, not the whole list.\nOn TRUD, download the full release instead (its file name starts uk_sct2cl_ and does not say delta; it is much larger).");
  process.exit(1);
}
for (const [kind, list] of Object.entries(files)) {
  if (!list.length) { console.error(`I could not find the ${kind} files in that folder. Is it the unzipped Clinical Edition (it has a Snapshot folder inside)?`); process.exit(1); }
  console.log(`${kind}: ${list.map((f) => path.basename(f)).join(", ")}`);
}

// Reads one file a line at a time, keeping only the rows `keep` accepts (the whole release is gigabytes; only a small part is wanted)
async function rows(file, parse, keep = () => true) {
  const out = [];
  const reader = readline.createInterface({ input: fs.createReadStream(file, "utf8"), crlfDelay: Infinity });
  let first = true;
  for await (const line of reader) {
    if (first) { first = false; continue; }
    const row = parse(line);
    if (row && keep(row)) out.push(row);
  }
  return out;
}
const all = async (list, parse, keep) => { const out = []; for (const f of list) for (const row of await rows(f, parse, keep)) out.push(row); return out; };

const concepts = await all(files.concepts, parseConceptLine, (c) => c.active);
console.log(`${concepts.length.toLocaleString("en-GB")} active concepts`);
const activeIds = new Set(concepts.map((c) => c.id));
// first pass: which concepts are the kind a letter's codes are made of (from the tag at the end of the full name)
const wanted = new Set((await all(files.descriptions, parseDescriptionLine, (d) => d.active && d.typeId === FSN_TYPE && activeIds.has(d.conceptId) && KEEP_TAGS.includes(semanticTag(d.term)))).map((d) => d.conceptId));
console.log(`${wanted.size.toLocaleString("en-GB")} concepts of the wanted kinds`);
// second pass: their names and synonyms
const descriptions = await all(files.descriptions, parseDescriptionLine, (d) => d.active && wanted.has(d.conceptId) && (d.typeId === FSN_TYPE || d.typeId === SYNONYM_TYPE));
const language = await all(files.language, parseLanguageLine, (l) => l.active && l.acceptabilityId === PREFERRED);
console.log(`${descriptions.length.toLocaleString("en-GB")} terms, ${language.length.toLocaleString("en-GB")} preferred-term marks`);
let only = null;
if (flag("--refset")) only = new Set(await rows(flag("--refset"), parseMemberLine));
// the newest date among the files (the International part is older than the UK part)
const release = files.concepts.map((f) => (f.match(/_(\d{8})\.txt$/) || [])[1] || "").sort().pop() || "";

const index = buildIndex({ concepts, descriptions, language, only, release, edition: "UK SNOMED CT" });
const out = flag("--out") || path.join("work", "snomed-uk-index.json.gz");
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(out, zlib.gzipSync(JSON.stringify(index), { level: 9 }));
console.log(`\nBuilt ${describeIndex(index)}${only ? " (limited to the reference set)" : ""}.\nWritten to ${path.resolve(out)} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB).`);
