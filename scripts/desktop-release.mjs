// Builds the Windows installer signed for the in-app updater and, unless told not to, puts it where the installed apps look for it.
//
//   npm run desktop:build            build the installer (signed for updates) and stage it in release/updates/
//   npm run desktop:build -- --no-stage   build only
//   npm run desktop:build -- --notes "What is new"
//
// The next hosting deploy (firebase deploy --only hosting) then publishes release/updates/ next to the web app, because
// firebase.json runs scripts/stage-updates.mjs first. Installed apps notice the new latest.json and offer "Update now".
//
// The signing key lives outside the project (C:\Users\<you>\.primovex\updater.key). Keep a copy somewhere safe: without it no
// further updates can be signed and everyone would have to reinstall by hand once.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildLatestJson, installerName } from "../src/release/updateManifest.js";

const root = process.cwd();
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : ""; };

const keyPath = process.env.TAURI_SIGNING_PRIVATE_KEY_PATH || path.join(os.homedir(), ".primovex", "updater.key");
if (!process.env.TAURI_SIGNING_PRIVATE_KEY && !fs.existsSync(keyPath)) {
  console.error(`The update signing key was not found at ${keyPath}.`);
  process.exit(1);
}
const env = { ...process.env, TAURI_SIGNING_PRIVATE_KEY: process.env.TAURI_SIGNING_PRIVATE_KEY || fs.readFileSync(keyPath, "utf8"), TAURI_SIGNING_PRIVATE_KEY_PASSWORD: process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? "" };

const sync = spawnSync("npm", ["run", "version:sync"], { stdio: "inherit", shell: true, env });
if (sync.status !== 0) process.exit(sync.status || 1);
const build = spawnSync("npx", ["tauri", "build"], { stdio: "inherit", shell: true, env });
if (build.status !== 0) process.exit(build.status || 1);

if (flag("--no-stage")) process.exit(0);

const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
const nsis = path.join(root, "src-tauri", "target", "release", "bundle", "nsis");
const exe = path.join(nsis, installerName(version));
const sig = `${exe}.sig`;
if (!fs.existsSync(exe) || !fs.existsSync(sig)) {
  console.error(`The build did not produce ${path.basename(exe)} and its .sig. Not staged.`);
  process.exit(1);
}

const out = path.join(root, "release", "updates");
fs.mkdirSync(out, { recursive: true });
for (const old of fs.readdirSync(out)) if (old.endsWith(".exe")) fs.rmSync(path.join(out, old));
fs.copyFileSync(exe, path.join(out, path.basename(exe)));
const manifest = buildLatestJson({ version, notes: value("--notes"), signature: fs.readFileSync(sig, "utf8") });
fs.writeFileSync(path.join(out, "latest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`\nStaged ${path.basename(exe)} for the updater in release/updates/. Deploy hosting to publish it.`);
