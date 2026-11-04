import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { failureText, installDesktopUpdate, withRetries } from "../src/release/updateService.js";
import { UPDATE_BASE_URL, UPDATE_PLATFORM, buildLatestJson, compareVersions, installerName, oldInstallersToRemove } from "../src/release/updateManifest.js";

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
  assert.match(link, /if \(!desktop\) return collapsed \|\| !WEB_VERSION \? null : <p[^>]*>Version \{WEB_VERSION\}<\/p>/, "the website shows only its version number, with no update button");
  assert.match(link, /typeof __PRIMOVEX_VERSION__ !== "undefined" \? __PRIMOVEX_VERSION__ : ""/);
  assert.match(read("src/release/ReleaseUpdateCard.jsx"), /if \(autoCheck\) check\(\)/);
  assert.match(read("src/release/ReleaseUpdateCard.jsx"), /autoCheck = false/, "the card in the Security Centre and on the phone still waits to be pressed");
});

t("only the newest three installers are kept, so an app holding an older release can still download it", () => {
  const name = (v) => installerName(v);
  const staged = [name("0.15.118"), name("0.15.119"), name("0.15.120"), name("0.15.121"), "latest.json", "notes.txt"];
  assert.deepEqual(oldInstallersToRemove(staged, 3), [name("0.15.118")], "the oldest goes, and only installers are ever touched");
  assert.deepEqual(oldInstallersToRemove([name("0.15.9"), name("0.15.10"), name("0.15.11"), name("0.15.12")], 3), [name("0.15.9")], "versions are compared as numbers, not as text");
  assert.deepEqual(oldInstallersToRemove([name("0.15.120"), name("0.15.119")], 3), [], "nothing is removed while there are three or fewer");
  assert.deepEqual(oldInstallersToRemove([name("0.15.119"), name("0.15.120")], 0), [name("0.15.119")], "the newest always stays");
  const release = read("scripts/desktop-release.mjs");
  assert.match(release, /oldInstallersToRemove\(fs\.readdirSync\(out\), KEEP_INSTALLERS\)/);
  assert.ok(release.indexOf("fs.copyFileSync(exe") < release.indexOf("oldInstallersToRemove(fs.readdirSync(out)"), "the new installer is copied in before the old ones are counted");
});

// the app asks for the current release just before it downloads, because the one it holds may be hours old
const fakeUpdate = (version, behaviour = async () => {}) => ({ version, downloadAndInstall: async (onEvent) => { onEvent({ event: "Started", data: { contentLength: 100 } }); await behaviour(); onEvent({ event: "Progress", data: { chunkLength: 100 } }); } });
const quick = { refresh: null, relaunch: async () => {} };
{
  const run = async (name, fn) => { await fn(); n += 1; console.log(`ok  ${name}`); };
  await run("the update that is downloaded is the current one, not the one found at the last check", async () => {
    const calls = [];
    const held = fakeUpdate("0.15.119", async () => { calls.push("held"); });
    const current = fakeUpdate("0.15.120", async () => { calls.push("current"); });
    await installDesktopUpdate(held, () => {}, { ...quick, refresh: async () => current });
    assert.deepEqual(calls, ["current"]);
  });
  await run("when the question cannot be asked the held update is used; when nothing newer exists the person is told so", async () => {
    const calls = [];
    const held = fakeUpdate("0.15.120", async () => { calls.push("held"); });
    await installDesktopUpdate(held, () => {}, { ...quick, refresh: async (u) => u });
    assert.deepEqual(calls, ["held"]);
    await assert.rejects(() => installDesktopUpdate(held, () => {}, { ...quick, refresh: async () => null }), /already up to date/);
  });
  await run("a signature failure is not repeated ten times; the current release is asked for once more and that one is tried", async () => {
    let first = 0;
    const bad = fakeUpdate("0.15.120", async () => { first += 1; throw new Error("signature verification failed"); });
    const good = fakeUpdate("0.15.121");
    let asked = 0;
    let relaunched = false;
    await installDesktopUpdate(bad, () => {}, { relaunch: async () => { relaunched = true; }, refresh: async () => { asked += 1; return asked === 1 ? bad : good; } });
    assert.equal(first, 1, "tried once, not ten times");
    assert.equal(asked, 2);
    assert.ok(relaunched);
  });
  await run("a signature failure with nothing newer is reported, not hidden", async () => {
    const bad = fakeUpdate("0.15.120", async () => { throw new Error("signature verification failed"); });
    await assert.rejects(() => installDesktopUpdate(bad, () => {}, { ...quick, refresh: async () => bad }), /signature/);
  });
  await run("a dropped connection is still repeated; the app restarts only after a good download", async () => {
    let tries = 0;
    let relaunched = false;
    const flaky = fakeUpdate("0.15.120", async () => { tries += 1; if (tries < 3) throw new Error("connection reset"); });
    const realWait = globalThis.setTimeout;
    globalThis.setTimeout = (fn) => realWait(fn, 0);
    try { await installDesktopUpdate(flaky, () => {}, { relaunch: async () => { relaunched = true; }, refresh: async (u) => u }); } finally { globalThis.setTimeout = realWait; }
    assert.equal(tries, 3);
    assert.ok(relaunched);
  });
  await run("the banner and the update card both go through installDesktopUpdate, so both ask for the current release", async () => {
    assert.match(read("src/components/system/DesktopUpdateBanner.jsx"), /installDesktopUpdate\(found\.update/);
    assert.match(read("src/release/updateService.js"), /const current = await refresh\(update\);/);
  });
}

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
