// Who is running which version of the Primovex app. Pure (no Firestore, no screens): it reads the sign-in sessions the server already
// keeps (usage_sessions: who, which device, which version, when last seen), so nothing new is collected.
//
// Only the installed apps are listed (the Windows app and the Android app), because they are the ones that can fall behind. The
// website and the iPhone Home Screen app update themselves, so they are counted but not listed.

import { compareVersions } from "../release/updateManifest.js";

export const STALE_DAYS = 30;
const DAY_MS = 86400000;

const toDate = (value) => {
  if (!value) return null;
  const date = typeof value.toDate === "function" ? value.toDate() : value.seconds ? new Date(value.seconds * 1000) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

// "0.15.61" is a version; "dev", "" and anything else is not
const isVersion = (value) => /^\d+\.\d+\.\d+/.test(String(value || "").trim());

export function deviceLabel({ client, platform } = {}) {
  if (client === "tauri") return platform === "android" ? "Android app" : platform === "windows" ? "Windows app" : platform === "ios" ? "iOS app" : "Desktop app";
  return platform === "ios" ? "iPhone (web app)" : "Website";
}

// One row for each person's each installed device, from its newest session.
//   sessions: usage_sessions rows ({ uid, displayName, role, client, platform, deviceId, appVersion, lastSeenAt, startedAt })
//   latest:   a version known to be current (the one this screen is running), so a list of only-old copies is still judged fairly
export function appVersionRows(sessions = [], { now = new Date(), latest = "" } = {}) {
  const newest = new Map();
  const web = new Set();
  for (const s of sessions) {
    if (!s?.uid) continue;
    const seen = toDate(s.lastSeenAt) || toDate(s.startedAt);
    if (s.client !== "tauri") { web.add(s.uid); continue; }
    const key = `${s.uid}|${s.deviceId || s.platform || "device"}`;
    const have = newest.get(key);
    if (!have || (seen?.getTime() || 0) > (have.seen?.getTime() || 0)) newest.set(key, { s, seen });
  }
  const rows = [...newest.entries()].map(([key, { s, seen }]) => {
    const version = isVersion(s.appVersion) ? String(s.appVersion).trim() : "";
    const daysAgo = seen ? Math.max(0, Math.floor((now.getTime() - seen.getTime()) / DAY_MS)) : null;
    return { key, uid: s.uid, name: s.displayName || "Unnamed user", role: s.role || "", device: deviceLabel(s), platform: s.platform || "", version, lastSeen: seen, daysAgo, notSeenRecently: daysAgo === null || daysAgo >= STALE_DAYS };
  });
  const newestVersion = [latest, ...rows.map((r) => r.version)].filter(isVersion).reduce((best, v) => (best && compareVersions(best, v) >= 0 ? best : v), "");
  for (const r of rows) {
    r.state = !r.version ? "unknown" : newestVersion && compareVersions(r.version, newestVersion) < 0 ? "behind" : "current";
  }
  const order = { behind: 0, unknown: 1, current: 2 };
  rows.sort((a, b) => order[a.state] - order[b.state]
    || (a.state === "behind" ? compareVersions(a.version, b.version) : 0)
    || String(a.name).localeCompare(String(b.name), "en", { sensitivity: "base" }));
  // people who have only ever used the website or the phone's Home Screen app are counted, not listed
  const appUsers = new Set(rows.map((r) => r.uid));
  return {
    rows, latest: newestVersion,
    counts: { total: rows.length, behind: rows.filter((r) => r.state === "behind").length, unknown: rows.filter((r) => r.state === "unknown").length, current: rows.filter((r) => r.state === "current").length, notSeenRecently: rows.filter((r) => r.notSeenRecently).length, webOnly: [...web].filter((uid) => !appUsers.has(uid)).length },
  };
}
