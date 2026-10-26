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
import { buildIndex, describeIndex, parseConceptLine, parseDescriptionLine, parseLanguageLine, parseMemberLine } from "../src/modules/clinflow/snomedIndex.js";

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
for (const [kind, list] of Object.entries(files)) {
  if (!list.length) { console.error(`I could not find the ${kind} files in that folder. Is it the unzipped Clinical Edition (it has a Snapshot folder inside)?`); process.exit(1); }
  console.log(`${kind}: ${list.map((f) => path.basename(f)).join(", ")}`);
}

async function rows(file, parse) {
  const out = [];
  const reader = readline.createInterface({ input: fs.createReadStream(file, "utf8"), crlfDelay: Infinity });
  let first = true;
  for await (const line of reader) {
    if (first) { first = false; continue; }
    const row = parse(line);
    if (row) out.push(row);
  }
  return out;
}
const all = async (list, parse) => (await Promise.all(list.map((f) => rows(f, parse)))).flat();

const concepts = await all(files.concepts, parseConceptLine);
const descriptions = await all(files.descriptions, parseDescriptionLine);
const language = await all(files.language, parseLanguageLine);
let only = null;
if (flag("--refset")) only = new Set(await rows(flag("--refset"), parseMemberLine));
const release = (files.concepts[0].match(/_(\d{8})\.txt$/) || [])[1] || "";

const index = buildIndex({ concepts, descriptions, language, only, release, edition: "UK SNOMED CT" });
const out = flag("--out") || path.join("work", "snomed-uk-index.json.gz");
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(out, zlib.gzipSync(JSON.stringify(index), { level: 9 }));
console.log(`\nBuilt ${describeIndex(index)}${only ? " (limited to the reference set)" : ""}.\nWritten to ${path.resolve(out)} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB).`);
