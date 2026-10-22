import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { failureText, withRetries } from "../src/release/updateService.js";
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
  assert.match(read(".gitignore"), /^\/release\/$/m, "the staged installer is not committed, but only the top-level release folder is ignored (not src/release)");
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

t("everyone can check for updates in the desktop app, not only people who can open the Security Centre", () => {
  const sidebar = read("src/components/navigation/DesktopSidebar.jsx");
  assert.match(sidebar, /<DesktopUpdateLink collapsed=\{collapsed\} \/>/, "in the sidebar footer, for every user");
  const link = read("src/components/navigation/DesktopUpdateLink.jsx");
  assert.match(link, /isDesktopApp\(\)/, "only in the installed Windows app");
  assert.ok(!/can\(|capabilit|isAdmin|useAuth/.test(link), "no permission is needed to see it");
  assert.match(link, /<ReleaseUpdateCard autoCheck \/>/, "it checks as soon as it opens");
  assert.match(read("src/release/ReleaseUpdateCard.jsx"), /if \(autoCheck\) check\(\)/);
  assert.match(read("src/release/ReleaseUpdateCard.jsx"), /autoCheck = false/, "the card in the Security Centre and on the phone still waits to be pressed");
});

// a connection that drops now and then must not stop an update being found or downloaded
{
  const waits = [];
  const wait = async (ms) => { waits.push(ms); };
  let calls = 0;
  const found = await withRetries(async () => { calls += 1; if (calls < 3) throw new Error("tls handshake"); return "update"; }, { delayMs: 10, wait });
  assert.deepEqual([found, calls, waits], ["update", 3, [10, 20]], "the third attempt works, with a longer pause each time");
  let tried = 0;
  await assert.rejects(() => withRetries(async () => { tried += 1; throw new Error("still down"); }, { tries: 4, delayMs: 1, wait }), /still down/);
  assert.equal(tried, 4, "then the last failure is reported");
  assert.equal(await withRetries(async () => "first time", { wait }), "first time");
  const lib = readFileSync(new URL("../src/release/updateService.js", import.meta.url), "utf8");
  assert.match(lib, /withRetries\(\(\) => check\(/, "the check retries");
  assert.match(lib, /withRetries\(async \(\) => \{[\s\S]*downloadAndInstall/, "the download retries");
  assert.match(readFileSync(new URL("../src/components/system/DesktopUpdateBanner.jsx", import.meta.url), "utf8"), /AFTER_FAILURE_MS/, "and a failed check looks again soon, not hours later");
  assert.equal(failureText(new Error("error sending request")), "error sending request");
  assert.equal(failureText("tls handshake eof"), "tls handshake eof", "the updater often rejects with plain text");
  assert.equal(failureText(undefined), "");
  assert.ok(failureText("x".repeat(500)).length <= 160);
  assert.match(lib, /tries: 10/, "the download tries up to ten times");
  n += 1; console.log("ok  a dropped connection is retried, for the check and the download, and a failed check is repeated soon");
}

console.log(`\n${n} passed`);
