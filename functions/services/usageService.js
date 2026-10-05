const { FieldValue, Timestamp } = require("firebase-admin/firestore");
const { HttpsError } = require("firebase-functions/v2/https");

// Who was signed in, when, on what, and for how long - the server side.
//
// The app reports which area the person is in and how long they spent there;
// this service is what makes those reports trustworthy enough for a security
// review. It takes the person's identity, role and name from their own account,
// takes every time from the server clock, refuses to credit more active time
// than has actually passed since the last report, and stores areas of the app
// only (never a record, search or anything typed). Clients can't read or write
// these records directly - the rules only let administrators and audit readers
// read them.

const SESSION_ID = /^[A-Za-z0-9-]{8,64}$/;
const DEVICE_ID = /^[A-Za-z0-9-]{8,64}$/;
const MAX_PAGES = 80;
const MAX_VISITS_PER_REPORT = 40;
const SLACK_SECONDS = 30;
const END_REASONS = ["signed_out", "session_timeout", "closed"];
const CLIENTS = ["tauri", "web"];
const PLATFORMS = ["android", "windows", "ios", "browser"];

const pick = (value, allowed, fallback) => (allowed.includes(String(value)) ? String(value) : fallback);
const tidy = (value, max) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

// An area of the app, never a record. Query strings and anything id-like are
// dropped, and only the first two path segments are kept, so "/inventory" and
// "/governance/sars" are recorded but a deep link to one record is not.
function cleanPath(raw) {
  const pathOnly = String(raw ?? "").split(/[?#]/)[0].toLowerCase();
  const segments = pathOnly
    .split("/")
    .map((segment) => segment.replace(/[^a-z0-9_-]/g, "").slice(0, 32))
    .filter(Boolean)
    .filter((segment) => !(segment.length >= 12 && /\d/.test(segment))) // looks like an id
    .slice(0, 2);
  return `/${segments.join("/")}`;
}

// Fold the pages reported now into the pages already stored, adding time and
// visit counts per area. Seconds are whole numbers, each report is capped, and
// the whole list is capped so a misbehaving client can't grow a record forever.
function mergePages(existing = [], incoming = [], maxSeconds = Infinity) {
  const byPath = new Map();
  (Array.isArray(existing) ? existing : []).forEach((row) => {
    if (row && typeof row.path === "string") byPath.set(row.path, { path: row.path, seconds: Number(row.seconds) || 0, visits: Number(row.visits) || 0 });
  });

  let budget = Math.max(0, Math.floor(maxSeconds));
  let credited = 0;
  (Array.isArray(incoming) ? incoming : []).slice(0, MAX_VISITS_PER_REPORT).forEach((visit) => {
    const path = cleanPath(visit?.path);
    const wanted = Math.max(0, Math.min(Math.floor(Number(visit?.seconds) || 0), 86400));
    const seconds = Math.min(wanted, budget);
    const visits = Math.max(0, Math.min(Math.floor(Number(visit?.visits) || 0), 200));
    if (!seconds && !visits) return;
    if (!byPath.has(path) && byPath.size >= MAX_PAGES) return;
    const row = byPath.get(path) || { path, seconds: 0, visits: 0 };
    row.seconds += seconds;
    row.visits += visits;
    byPath.set(path, row);
    budget -= seconds;
    credited += seconds;
  });

  const pages = [...byPath.values()].sort((a, b) => b.seconds - a.seconds || a.path.localeCompare(b.path));
  return { pages, credited };
}

function millis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return Number(value) || 0;
}

// What the stored session becomes after one report. Pure, so it can be tested.
// `existing` is the stored record (or null on the first report).
function applyUsageReport({ existing, caller, profile, data, now }) {
  const nowMs = now.getTime();
  const endedReason = data.ended ? pick(data.endReason, END_REASONS, "closed") : null;

  if (existing && existing.endedAt) return { ignored: true };

  const startedAtMs = existing ? millis(existing.startedAt) || nowMs : nowMs;
  const lastSeenMs = existing ? millis(existing.lastSeenAt) || startedAtMs : nowMs;
  // No more active time can be credited than has passed since the last report.
  const elapsedSeconds = Math.max(0, Math.round((nowMs - lastSeenMs) / 1000)) + SLACK_SECONDS;
  const { pages, credited } = mergePages(existing?.pages, data.pages, existing ? elapsedSeconds : 0);

  const record = {
    uid: caller,
    practiceId: tidy(profile.practiceId || profile.organisationId || profile.organizationId, 80) || "primary",
    siteId: tidy(profile.siteId, 80) || "SITE-MAIN",
    displayName: tidy(profile.displayName || profile.email, 120) || "Unnamed user",
    role: tidy(profile.role, 60) || "Unknown role",
    client: pick(data.client, CLIENTS, existing?.client || "web"),
    platform: pick(data.platform, PLATFORMS, existing?.platform || "browser"),
    deviceId: DEVICE_ID.test(String(data.deviceId || "")) ? String(data.deviceId) : existing?.deviceId || "",
    appVersion: tidy(data.appVersion, 20) || existing?.appVersion || "",
    startedAt: existing?.startedAt || Timestamp.fromMillis(startedAtMs),
    lastSeenAt: Timestamp.fromMillis(nowMs),
    activeSeconds: (Number(existing?.activeSeconds) || 0) + credited,
    pages,
    reports: (Number(existing?.reports) || 0) + 1,
  };
  if (endedReason) {
    record.endedAt = Timestamp.fromMillis(nowMs);
    record.endReason = endedReason;
  }
  return { record };
}

// One report from a signed-in person's own device. Their identity is the caller
// (never anything in the request), and the record is keyed by it, so nobody can
// add to, or end, another person's session.
async function recordUsage({ db, callerUid, profile, data = {}, now = new Date() }) {
  const sessionId = String(data.sessionId || "");
  if (!SESSION_ID.test(sessionId)) throw new HttpsError("invalid-argument", "A valid session id is required.");
  const ref = db.collection("usage_sessions").doc(`${callerUid}_${sessionId}`);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const existing = snap.exists ? snap.data() : null;
    const result = applyUsageReport({ existing, caller: callerUid, profile, data, now });
    if (result.ignored) return { ok: true, ended: true };
    tx.set(ref, { ...result.record, updatedAt: FieldValue.serverTimestamp() });
    return { ok: true, ended: Boolean(result.record.endedAt) };
  });
}

module.exports = { cleanPath, mergePages, applyUsageReport, recordUsage, END_REASONS, MAX_PAGES };
