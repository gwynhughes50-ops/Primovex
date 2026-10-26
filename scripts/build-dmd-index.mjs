// Builds ClinFlow's medicines list from the NHS dm+d download (NHSBSA, from NHS TRUD).
//
//   1. On TRUD, download "NHSBSA dictionary of medicines and devices (dm+d)" and unzip it (right-click, Extract All).
//   2. npm run dmd:index -- "C:\path\to\the\unzipped\folder"
//   3. In ClinFlow, open a letter's SNOMED tab and choose the file this makes (work\dmd-index.json.gz) under "NHS dm+d medicines list".
//
// Like the SNOMED release, dm+d is licensed: keep it on your own computers and never commit or publish it (work/ is ignored by git).
// --release 20261005 says which release it is (it is shown beside the list); --out "<file>" says where to write it.
// --drug "<folder>" is the unzipped SNOMED CT UK Drug Extension (TRUD, "SNOMED CT UK Drug Extension, RF2: Full, Snapshot & Delta"). dm+d does not
// carry SNOMED's description IDs, which Docman asks for with every code; the Drug Extension does, so each medicine is given its own.

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import zlib from "node:zlib";
import { buildDmdIndex, chooseDescriptionIds, parseAmps, parseVmps, parseVtms } from "../src/modules/clinflow/dmdIndex.js";
import { parseDescriptionLine } from "../src/modules/clinflow/snomedIndex.js";

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : ""; };
const folder = args.find((a, i) => !a.startsWith("--") && (i === 0 || !args[i - 1].startsWith("--")));
if (!folder || !fs.existsSync(folder)) { console.error('Say where the unzipped dm+d folder is, e.g.  npm run dmd:index -- "C:\\Downloads\\nhsbsa_dmd_10.0.0_20261005000001"'); process.exit(1); }

function find(dir, test, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) find(full, test, out); else if (test(entry.name)) out.push(full);
  }
  return out;
}
const one = (pattern, what) => {
  const hit = find(folder, (n) => pattern.test(n))[0];
  if (!hit) { console.error(`I could not find the ${what} file in that folder. Is it the unzipped dm+d download (it has files like f_vmp2_... .xml)?`); process.exit(1); }
  console.log(`${what}: ${path.basename(hit)}`);
  return fs.readFileSync(hit, "utf8");
};

const vtms = parseVtms(one(/^f_vtm2_.*\.xml$/i, "generic medicines (VTM)"));
const vmps = parseVmps(one(/^f_vmp2_.*\.xml$/i, "generic products (VMP)"));
const amps = parseAmps(one(/^f_amp2_.*\.xml$/i, "branded products (AMP)"));
console.log(`${vtms.length.toLocaleString("en-GB")} medicines, ${vmps.length.toLocaleString("en-GB")} generic products, ${amps.length.toLocaleString("en-GB")} branded products`);

// the SNOMED description ID of each medicine's name, from the Drug Extension
let descriptionIds = new Map();
if (flag("--drug")) {
  const drugFolder = flag("--drug");
  if (!fs.existsSync(drugFolder)) { console.error(`I could not find the Drug Extension folder: ${drugFolder}`); process.exit(1); }
  const descriptionFiles = find(drugFolder, (n) => /^sct2_Description_.*Snapshot.*-en.*\.txt$/i.test(n));
  if (!descriptionFiles.length) {
    const deltaOnly = find(drugFolder, (n) => /^sct2_Description_.*Delta/i.test(n)).length > 0;
    console.error(deltaOnly ? "That is the Drug Extension Delta (changes only). Download the full release: its file name starts uk_sct2dr_ and does not say delta." : "I could not find the Drug Extension's description files (a Snapshot folder with sct2_Description files). Is it the unzipped Drug Extension?");
    process.exit(1);
  }
  const wanted = new Map([...vtms, ...vmps, ...amps].map((r) => [r.id, r.name]));
  const rows = [];
  for (const file of descriptionFiles) {
    console.log(`descriptions: ${path.basename(file)}`);
    const reader = readline.createInterface({ input: fs.createReadStream(file, "utf8"), crlfDelay: Infinity });
    let first = true;
    for await (const line of reader) {
      if (first) { first = false; continue; }
      const row = parseDescriptionLine(line);
      if (row && row.active && wanted.has(row.conceptId)) rows.push(row);
    }
  }
  const { ids, missing } = chooseDescriptionIds(wanted, rows);
  descriptionIds = ids;
  console.log(`${ids.size.toLocaleString("en-GB")} of ${wanted.size.toLocaleString("en-GB")} medicines have a SNOMED description ID${missing.length ? ` (${missing.length.toLocaleString("en-GB")} have none: brands and products not in the Drug Extension, or named differently there)` : ""}`);
}

const release = flag("--release") || (folder.match(/_(\d{8})/) || [])[1] || "";
const index = buildDmdIndex({ vtms, vmps, amps, descriptionIds, release });
const out = flag("--out") || path.join("work", "dmd-index.json.gz");
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(out, zlib.gzipSync(JSON.stringify(index), { level: 9 }));
console.log(`\nBuilt a list of ${index.concepts.length.toLocaleString("en-GB")} medicines${release ? ` (release ${release})` : ""}.\nWritten to ${path.resolve(out)} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB).`);
