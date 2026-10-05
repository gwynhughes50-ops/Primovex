import { collection, limit, onSnapshot, orderBy, query, Timestamp, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { getDeviceId } from "@/services/deviceSessionService";
import { createUsageTracker } from "@/lib/usageTracker";

// Reports which area of the app the signed-in person is in, and for how long, to
// the server (the recordUsage function), so an administrator can see who signed
// in, when, what they used and for how long. Areas only: never a record, a search
// or anything typed. Failures are silent - this must never get in anyone's way.

const SESSION_KEY = "primovex.usage.session.v1";
const FLUSH_EVERY_MS = 4 * 60 * 1000;
const TICK_EVERY_MS = 15 * 1000;
const APP_VERSION = "0.15.41";

let active = null; // { uid, sessionId, tracker, timers, sending, ended }

function newSessionId() {
  return globalThis.crypto?.randomUUID?.() || `s-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function clientContext() {
  const ua = String(globalThis.navigator?.userAgent || "").toLowerCase();
  return {
    client: globalThis.__TAURI_INTERNALS__ ? "tauri" : "web",
    platform: ua.includes("android") ? "android" : ua.includes("windows") ? "windows" : ua.includes("iphone") || ua.includes("ipad") ? "ios" : "browser",
  };
}

function readStoredSession(uid) {
  try {
    const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    return stored?.uid === uid && stored.sessionId ? stored.sessionId : null;
  } catch { return null; }
}
const storeSession = (uid, sessionId) => { try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ uid, sessionId })); } catch { /* optional */ } };
const forgetSession = () => { try { sessionStorage.removeItem(SESSION_KEY); } catch { /* optional */ } };

async function send(session, { ended = false, endReason } = {}) {
  const pages = session.tracker.drain();
  try {
    const call = httpsCallable(functions, "recordUsage", { timeout: 10000 });
    await call({ sessionId: session.sessionId, pages, ended, endReason, deviceId: getDeviceId(), appVersion: APP_VERSION, ...clientContext() });
    return true;
  } catch {
    if (!ended) session.tracker.restore(pages);
    return false;
  }
}

function flush(session) {
  if (!session || session.ended || session.sending) return Promise.resolve();
  session.sending = true;
  return send(session).finally(() => { session.sending = false; });
}

// Begin (or carry on) tracking for this signed-in person. Safe to call again.
export function startUsageTracking(uid) {
  if (!uid) return;
  if (active?.uid === uid && !active.ended) return;
  stopUsageTracking();

  const sessionId = readStoredSession(uid) || newSessionId();
  storeSession(uid, sessionId);
  const tracker = createUsageTracker();
  const session = { uid, sessionId, tracker, timers: [], sending: false, ended: false, cleanup: [] };
  active = session;

  const on = (target, name, handler, options) => {
    target.addEventListener(name, handler, options);
    session.cleanup.push(() => target.removeEventListener(name, handler, options));
  };
  const interact = () => tracker.interact();
  ["pointerdown", "keydown", "touchstart", "wheel"].forEach((name) => on(window, name, interact, { passive: true }));
  on(document, "visibilitychange", () => {
    tracker.setVisible(document.visibilityState !== "hidden");
    if (document.visibilityState === "hidden") flush(session);
  });
  on(window, "pagehide", () => flush(session));

  session.timers.push(setInterval(() => tracker.tick(), TICK_EVERY_MS));
  session.timers.push(setInterval(() => flush(session), FLUSH_EVERY_MS));
  tracker.setPath(globalThis.location?.pathname || "/");
  // The first report anchors the session's start on the server clock.
  flush(session);
}

export function trackUsagePath(pathname) {
  active?.tracker.setPath(pathname);
}

function stopUsageTracking() {
  if (!active) return;
  active.timers.forEach(clearInterval);
  active.cleanup.forEach((fn) => fn());
  active = null;
}

// Close the session out (signing out, or the session timing out). Waits briefly so
// the report goes while the person is still authenticated.
export async function endUsageSession(reason = "signed_out") {
  const session = active;
  if (!session || session.ended) return;
  session.ended = true;
  stopUsageTracking();
  forgetSession();
  await Promise.race([send(session, { ended: true, endReason: reason }), new Promise((resolve) => setTimeout(resolve, 3000))]);
}

// ---- reading it back (administrators and audit readers) -------------------------

export function subscribeUsageSessions({ practiceId = "primary", since = null, until = null, max = 1000 } = {}, onData, onError) {
  const clauses = [collection(db, "usage_sessions"), where("practiceId", "==", practiceId || "primary")];
  if (since instanceof Date && !Number.isNaN(since.getTime())) clauses.push(where("startedAt", ">=", Timestamp.fromDate(since)));
  if (until instanceof Date && !Number.isNaN(until.getTime())) clauses.push(where("startedAt", "<=", Timestamp.fromDate(until)));
  clauses.push(orderBy("startedAt", "desc"), limit(Math.min(Math.max(Number(max) || 500, 1), 2000)));
  return onSnapshot(query(...clauses), (snapshot) => onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))), onError);
}
