// Builds ClinFlow's medicines list from the NHS dm+d download (NHSBSA, from NHS TRUD).
//
//   1. On TRUD, download "NHSBSA dictionary of medicines and devices (dm+d)" and unzip it (right-click, Extract All).
//   2. npm run dmd:index -- "C:\path\to\the\unzipped\folder"
//   3. In ClinFlow, open a letter's SNOMED tab and choose the file this makes (work\dmd-index.json.gz) under "NHS dm+d medicines list".
//
// Like the SNOMED release, dm+d is licensed: keep it on your own computers and never commit or publish it (work/ is ignored by git).
// --release 20261005 says which release it is (it is shown beside the list); --out "<file>" says where to write it.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { buildDmdIndex, parseAmps, parseVmps, parseVtms } from "../src/modules/clinflow/dmdIndex.js";

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

const release = flag("--release") || (folder.match(/_(\d{8})/) || [])[1] || "";
const index = buildDmdIndex({ vtms, vmps, amps, release });
const out = flag("--out") || path.join("work", "dmd-index.json.gz");
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(out, zlib.gzipSync(JSON.stringify(index), { level: 9 }));
console.log(`\nBuilt a list of ${index.concepts.length.toLocaleString("en-GB")} medicines${release ? ` (release ${release})` : ""}.\nWritten to ${path.resolve(out)} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB).`);
