import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const pkgPath = path.join(root, 'package.json');
const tauriPath = path.join(root, 'src-tauri', 'tauri.conf.json');
const cargoPath = path.join(root, 'src-tauri', 'Cargo.toml');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const version = pkg.version;
if (!/^\d+\.\d+\.\d+([+-][0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`package.json version is not valid SemVer: ${version}`);
}

const tauri = JSON.parse(fs.readFileSync(tauriPath, 'utf8'));
tauri.version = version;
fs.writeFileSync(tauriPath, `${JSON.stringify(tauri, null, 2)}\n`);

let cargo = fs.readFileSync(cargoPath, 'utf8');
cargo = cargo.replace(/(^\[package\][\s\S]*?^version\s*=\s*")[^"]+("$)/m, `$1${version}$2`);
fs.writeFileSync(cargoPath, cargo);

console.log(`Primovex version synchronised to ${version}`);
