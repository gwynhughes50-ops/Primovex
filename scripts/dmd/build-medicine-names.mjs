// Builds src/data/medicineNames.json from a dm+d release downloaded from NHS TRUD.
//
//   node scripts/dmd/build-medicine-names.mjs <folder or .zip of the release> [--out src/data/medicineNames.json]
//
// The release can be the TRUD zip itself, or a folder where it has been unzipped. Zips inside zips are
// opened too. Re-run it whenever a newer release is downloaded. Nothing is sent anywhere.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { buildMedicineNames, parseAmps, parseVmps, parseVtms } from "./dmdParse.mjs";

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const out = resolve(outIndex > -1 ? args[outIndex + 1] : "src/data/medicineNames.json");
const input = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--out");
if (!input || !existsSync(input)) {
  console.error("Give the path to the dm+d release (the TRUD zip, or the folder it was unzipped into).");
  process.exit(1);
}

const scratch = resolve("work/dmd-unzipped");
mkdirSync(scratch, { recursive: true });

function unzip(zipPath, into) {
  mkdirSync(into, { recursive: true });
  execFileSync("unzip", ["-o", "-q", zipPath, "-d", into], { stdio: "inherit" });
}

// every file under a folder, opening any zip found on the way
function collect(dir, depth = 0) {
  const found = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...collect(path, depth));
    else if (/\.zip$/i.test(name) && depth < 3) {
      const into = join(scratch, `${basename(name, ".zip")}-${depth}`);
      unzip(path, into);
      found.push(...collect(into, depth + 1));
    } else found.push(path);
  }
  return found;
}

const start = statSync(input).isDirectory() ? input : (() => { const into = join(scratch, "release"); unzip(input, into); return into; })();
const files = collect(start);
const pick = (pattern) => files.filter((f) => pattern.test(basename(f)));
const read = (list) => list.map((f) => readFileSync(f, "utf8")).join("\n");

const vtmFiles = pick(/^f_vtm.*\.xml$/i);
const vmpFiles = pick(/^f_vmp\d.*\.xml$/i);
const ampFiles = pick(/^f_amp\d.*\.xml$/i);
if (!vtmFiles.length || !vmpFiles.length || !ampFiles.length) {
  console.error(`Could not find the dm+d files. Found: VTM ${vtmFiles.length}, VMP ${vmpFiles.length}, AMP ${ampFiles.length}. Expected names like f_vtm2_3*.xml, f_vmp2_3*.xml, f_amp2_3*.xml.`);
  process.exit(1);
}

const curated = JSON.parse(readFileSync(new URL("./curated-names.json", import.meta.url), "utf8")).brands || {};
const names = buildMedicineNames({ vtms: parseVtms(read(vtmFiles)), vmps: parseVmps(read(vmpFiles)), amps: parseAmps(read(ampFiles)), curated });
const release = (basename(input).match(/(\d+\.\d+\.\d+_\d{8})/) || [])[1] || basename(input);
const payload = { v: 1, source: `NHS dm+d ${release}`, builtAt: new Date().toISOString().slice(0, 10), ...names };
mkdirSync(resolve(out, ".."), { recursive: true });
writeFileSync(out, JSON.stringify(payload));
console.log(`Wrote ${out}: ${names.generics.length} substances, ${Object.keys(names.brands).length} brand names (${Math.round(statSync(out).size / 1024)} KB).`);
