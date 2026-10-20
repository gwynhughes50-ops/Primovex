// Checking without a signal. A plant room or a basement may have none, and a check the caretaker has just done must not be
// lost, nor make him stand there watching a spinner. Two small things are kept on the phone:
//   - the list of checked assets (name, place, how often, safe range), so a tag can still be read and its check opened;
//   - the checks done while there was no signal, each with the real time it was done and who did it, waiting to be sent.
// A queued check has its own id made up front, so sending it twice (or a slow save that did land) can never make two.
// A check is only ever sent by the person who did it. Pure apart from the storage handed in, so it can be tested.

export const ASSET_CACHE_KEY = "primovex.compliance.assets.v1";
export const QUEUE_KEY = "primovex.compliance.queue.v1";
const MAX_QUEUE = 200;

const read = (storage, key, fallback) => {
  try {
    const parsed = JSON.parse(storage.getItem(key) || "null");
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (storage, key, value) => {
  try { storage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
};

const ms = (value) => {
  if (!value) return null;
  const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
};
const normCode = (value) => String(value || "").trim().replace(/\s+/g, "-").replace(/[^A-Za-z0-9_-]/g, "").toUpperCase();

// ---- the asset list ----

// Only what a check needs, with dates as plain numbers so they survive being stored.
export function slimAsset(asset = {}) {
  return {
    id: asset.id, siteId: asset.siteId || "", assetCode: asset.assetCode || "", assetType: asset.assetType || "general", label: asset.label || "",
    location: asset.location || "", department: asset.department || "", checkMode: asset.checkMode || "", frequency: asset.frequency || "",
    minTempC: asset.minTempC ?? null, maxTempC: asset.maxTempC ?? null, countdownSeconds: asset.countdownSeconds ?? null,
    active: asset.active !== false, lastCheckAt: ms(asset.lastCheckAt), lastCheckResult: asset.lastCheckResult || "",
  };
}

export function cacheAssets(storage, assets = []) {
  const slim = assets.filter((a) => a && a.id).map(slimAsset);
  return write(storage, ASSET_CACHE_KEY, { savedAt: Date.now(), assets: slim });
}

export const cachedAssets = (storage) => read(storage, ASSET_CACHE_KEY, { assets: [] }).assets || [];

// the saved asset a scan names: by its id, or by its code
export function findCachedAsset(storage, assetId) {
  const wanted = String(assetId || "").trim();
  if (!wanted) return null;
  const code = normCode(wanted);
  return cachedAssets(storage).find((a) => a.active !== false && (a.id === wanted || (code && normCode(a.assetCode) === code))) || null;
}

// ---- the waiting checks ----

export const readQueue = (storage) => {
  const list = read(storage, QUEUE_KEY, []);
  return Array.isArray(list) ? list : [];
};
export const queueSize = (storage) => readQueue(storage).length;

// Add a check to the queue. `entry` carries its own id, the asset, what was entered, who did it and when.
export function queueCheck(storage, entry) {
  if (!entry?.id || !entry?.asset?.id || !entry?.actor?.uid) throw new Error("A queued check needs an id, an asset and who did it.");
  const queue = readQueue(storage);
  if (queue.some((q) => q.id === entry.id)) return queue.length;
  if (queue.length >= MAX_QUEUE) throw new Error("There are too many checks waiting to send. Connect to the internet so they can go.");
  queue.push({ ...entry, asset: slimAsset(entry.asset), queuedAt: Date.now() });
  if (!write(storage, QUEUE_KEY, queue)) throw new Error("This phone has no room to keep the check. Connect to the internet and try again.");
  return queue.length;
}

export const removeQueued = (storage, id) => write(storage, QUEUE_KEY, readQueue(storage).filter((q) => q.id !== id));

// let checks that were refused be tried again (after the reason has been put right)
export const retryRefused = (storage) => write(storage, QUEUE_KEY, readQueue(storage).map(({ refused, ...rest }) => rest));
export const refusedCount = (storage) => readQueue(storage).filter((q) => q.refused).length;

// "no signal" as opposed to "refused": the cases where trying again later can work
export function isOfflineError(error, online = (typeof navigator === "undefined" ? true : navigator.onLine !== false)) {
  if (!online) return true;
  const code = String(error?.code || "");
  if (code === "unavailable" || code === "deadline-exceeded" || code === "network-request-failed" || code === "auth/network-request-failed") return true;
  return /offline|network|timed out|timeout|failed to fetch/i.test(String(error?.message || ""));
}

// Send what is waiting, oldest first, for the signed-in person only. `record(entry)` saves one (it is given the entry and
// must use entry.id so a repeat lands on the same record). Stops at the first "no signal"; a check that is refused for
// another reason is kept with the reason, so it is neither lost nor retried forever in a tight loop.
export async function flushQueue({ storage, record, currentUid, online = true }) {
  const result = { sent: 0, waiting: 0, otherPeople: 0, failed: 0, offline: false };
  if (!online) return { ...result, waiting: queueSize(storage), offline: true };
  const queue = readQueue(storage).sort((a, b) => (a.performedAtMs || 0) - (b.performedAtMs || 0));
  for (const entry of queue) {
    if (entry.actor.uid !== currentUid) { result.otherPeople += 1; continue; }
    if (entry.refused) { result.failed += 1; continue; }
    try {
      await record(entry);
      removeQueued(storage, entry.id);
      result.sent += 1;
    } catch (error) {
      if (isOfflineError(error, true)) { result.offline = true; break; }
      const kept = readQueue(storage).map((q) => (q.id === entry.id ? { ...q, refused: String(error?.message || error?.code || "refused").slice(0, 160) } : q));
      write(storage, QUEUE_KEY, kept);
      result.failed += 1;
    }
  }
  result.waiting = queueSize(storage);
  return result;
}

// the phone's own storage, or a stand-in that forgets when there is none (a private window can refuse)
export function deviceStorage() {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch { /* blocked */ }
  const memory = new Map();
  return { getItem: (k) => (memory.has(k) ? memory.get(k) : null), setItem: (k, v) => memory.set(k, String(v)), removeItem: (k) => memory.delete(k) };
}
