import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { UPDATE_BASE_URL, UPDATE_PLATFORM, buildLatestJson, compareVersions, installerName } from "../src/release/updateManifest.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

t("latest.json has what the installed app needs: version, notes, date, and a signed https installer", () => {
  const m = buildLatestJson({ version: "0.15.43", notes: "Fire test checklist", signature: "dW50cnVzdGVk\n", now: new Date("2026-10-21T09:00:00Z") });
  assert.equal(m.version, "0.15.43");
  assert.equal(m.notes, "Fire test checklist");
  assert.equal(m.pub_date, "2026-10-21T09:00:00.000Z");
  const p = m.platforms[UPDATE_PLATFORM];
  assert.equal(p.signature, "dW50cnVzdGVk", "the signature is the .sig file's text, trimmed");
  assert.equal(p.url, `${UPDATE_BASE_URL}/Primovex_0.15.43_x64-setup.exe`);
  assert.equal(p.url, `${UPDATE_BASE_URL}/${installerName("0.15.43")}`);
  assert.equal(buildLatestJson({ version: "1.0.0", signature: "x" }).notes, "Primovex 1.0.0", "notes default to the version");
});

t("a release without a signature, or with a bad version or address, is refused", () => {
  assert.throws(() => buildLatestJson({ version: "0.15.43", signature: "  " }), /no signature/);
  assert.throws(() => buildLatestJson({ version: "0.15", signature: "x" }), /not valid/);
  assert.throws(() => buildLatestJson({ version: "0.15.43", signature: "x", baseUrl: "http://example.com" }), /https/);
});

t("versions compare as numbers, so 0.15.100 is newer than 0.15.43", () => {
  assert.equal(compareVersions("0.15.100", "0.15.43"), 1);
  assert.equal(compareVersions("0.15.41", "0.15.42"), -1);
  assert.equal(compareVersions("0.15.42", "0.15.42"), 0);
  assert.equal(compareVersions("1.0.0", "0.99.99"), 1);
});

t("the desktop app is set up to read, verify and install updates", () => {
  const conf = JSON.parse(read("src-tauri/tauri.conf.json"));
  assert.equal(conf.bundle.createUpdaterArtifacts, true, "the build must produce a signed installer");
  const u = conf.plugins.updater;
  assert.ok(/^[A-Za-z0-9+/=]{100,}$/.test(u.pubkey), "the public key the app checks signatures against");
  assert.deepEqual(u.endpoints, [`${UPDATE_BASE_URL}/latest.json`]);
  assert.ok(u.endpoints.every((e) => e.startsWith("https://")));
  assert.equal(conf.version, JSON.parse(read("package.json")).version, "the app reports the version package.json says");
  assert.ok(JSON.parse(read("src-tauri/capabilities/default.json")).permissions.includes("updater:default"));
  const lib = read("src-tauri/src/lib.rs");
  assert.match(lib, /#\[cfg\(desktop\)\]\s*let builder = builder\.plugin\(tauri_plugin_updater::Builder::new\(\)\.build\(\)\);/, "registered on the desktop only");
  assert.match(lib, /#\[cfg\(desktop\)\]\s*let builder = builder\.manage\(AlertState/, "the desktop-only alert state keeps its own attribute, or the phone build fails");
});

t("every hosting deploy carries the staged update files, and the private key is never in the project", () => {
  const firebase = JSON.parse(read("firebase.json"));
  assert.ok(firebase.hosting.predeploy.some((c) => c.includes("stage-updates.mjs")));
  assert.match(read(".gitignore"), /^release\/$/m, "the staged installer is not committed");
  const tracked = [read("src-tauri/tauri.conf.json"), read("scripts/desktop-release.mjs")].join("\n");
  assert.ok(!/untrusted comment: minisign encrypted secret key|RWRTY0Iy/.test(tracked), "no private key text");
});

t("only one Primovex runs at a time: a second launch shows the first, and the plugin is the first one registered on the desktop", () => {
  const lib = read("src-tauri/src/lib.rs");
  assert.match(lib, /#\[cfg\(desktop\)\]\s*let builder = builder\.plugin\(tauri_plugin_single_instance::init\(/, "desktop only, or the phone build fails");
  assert.ok(lib.indexOf("tauri_plugin_single_instance") < lib.indexOf("tauri_plugin_deep_link"), "it has to be registered before any other plugin");
  assert.match(read("src-tauri/Cargo.toml"), /tauri-plugin-single-instance\s*=\s*\{[^}]*"deep-link"/, "and forwards primovex:// links to the running copy");
  const cargo = read("src-tauri/Cargo.toml");
  assert.ok(cargo.indexOf("tauri-plugin-single-instance") > cargo.indexOf("cfg(any(target_os = \"macos\", windows, target_os = \"linux\"))"), "a desktop-only dependency");
});

console.log(`\n${n} passed`);
