import assert from "node:assert/strict";
import { STALE_DAYS, appVersionRows, deviceLabel } from "../src/lib/appVersions.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const NOW = new Date(2026, 9, 22, 12, 0);
const ago = (days) => ({ toDate: () => new Date(NOW.getTime() - days * 86400000) });
const session = (uid, extra = {}) => ({ uid, displayName: `Person ${uid}`, role: "Reception", client: "tauri", platform: "windows", deviceId: `dev-${uid}`, appVersion: "0.15.62", lastSeenAt: ago(0), ...extra });

t("each person's device is one row, from its newest session, and old copies are flagged behind the newest version", () => {
  const { rows, latest, counts } = appVersionRows([
    session("a"), session("a", { appVersion: "0.15.40", lastSeenAt: ago(5) }),       // the same device: its newest session wins
    session("b", { appVersion: "0.15.46", lastSeenAt: ago(1) }),
    session("c", { appVersion: "0.15.61" }),
  ], { now: NOW });
  assert.equal(latest, "0.15.62");
  assert.deepEqual(rows.map((r) => [r.uid, r.version, r.state]), [["b", "0.15.46", "behind"], ["c", "0.15.61", "behind"], ["a", "0.15.62", "current"]], "most behind first, then the rest");
  assert.deepEqual(counts, { total: 3, behind: 2, unknown: 0, current: 1, notSeenRecently: 0, webOnly: 0 });
});

t("two devices for one person are two rows, and the page's own version counts as current even when nobody has it yet", () => {
  const { rows, latest } = appVersionRows([session("a", { deviceId: "pc" }), session("a", { deviceId: "tablet", platform: "android", appVersion: "0.15.50" })], { now: NOW, latest: "0.15.63" });
  assert.equal(rows.length, 2);
  assert.equal(latest, "0.15.63");
  assert.deepEqual(rows.map((r) => r.device).sort(), ["Android app", "Windows app"]);
  assert.ok(rows.every((r) => r.state === "behind"));
});

t("a copy that never reported a version is unknown, not behind", () => {
  const { rows, counts } = appVersionRows([session("a", { appVersion: "" }), session("b", { appVersion: "dev" }), session("c")], { now: NOW });
  assert.deepEqual(rows.map((r) => [r.uid, r.state]), [["a", "unknown"], ["b", "unknown"], ["c", "current"]]);
  assert.equal(counts.unknown, 2);
});

t("only installed apps are listed; people who use only the website or the phone's Home Screen app are counted", () => {
  const { rows, counts } = appVersionRows([session("a"), { uid: "w", client: "web", platform: "browser", appVersion: "0.15.62", lastSeenAt: ago(0) }, { uid: "i", client: "web", platform: "ios", lastSeenAt: ago(0) }, { uid: "a", client: "web", platform: "browser", lastSeenAt: ago(0) }], { now: NOW });
  assert.deepEqual(rows.map((r) => r.uid), ["a"]);
  assert.equal(counts.webOnly, 2, "w and i; a also uses the app");
});

t("someone not seen for a month is marked, whatever version they have", () => {
  const { rows, counts } = appVersionRows([session("a", { lastSeenAt: ago(STALE_DAYS - 1) }), session("b", { lastSeenAt: ago(STALE_DAYS) }), session("c", { lastSeenAt: null, startedAt: null })], { now: NOW });
  const by = Object.fromEntries(rows.map((r) => [r.uid, r]));
  assert.equal(by.a.notSeenRecently, false);
  assert.equal(by.b.notSeenRecently, true);
  assert.equal(by.b.daysAgo, STALE_DAYS);
  assert.equal(by.c.notSeenRecently, true, "no date at all counts as not seen");
  assert.equal(counts.notSeenRecently, 2);
});

t("versions compare as numbers: 0.15.100 is newer than 0.15.62", () => {
  const { rows, latest } = appVersionRows([session("a", { appVersion: "0.15.100" }), session("b", { appVersion: "0.15.62" })], { now: NOW });
  assert.equal(latest, "0.15.100");
  assert.deepEqual(rows.map((r) => [r.uid, r.state]), [["b", "behind"], ["a", "current"]]);
});

t("devices are named in plain words, and nothing breaks on odd or empty input", () => {
  assert.equal(deviceLabel({ client: "tauri", platform: "windows" }), "Windows app");
  assert.equal(deviceLabel({ client: "tauri", platform: "android" }), "Android app");
  assert.equal(deviceLabel({ client: "web", platform: "ios" }), "iPhone (web app)");
  assert.equal(deviceLabel({}), "Website");
  assert.deepEqual(appVersionRows(undefined).rows, []);
  assert.deepEqual(appVersionRows([null, {}, { client: "tauri" }]).rows, []);
});

console.log(`\n${n} passed`);
