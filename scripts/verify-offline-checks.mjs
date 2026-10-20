import assert from "node:assert/strict";
import {
  ASSET_CACHE_KEY, QUEUE_KEY, cacheAssets, cachedAssets, findCachedAsset, flushQueue, isOfflineError, queueCheck, queueSize, readQueue, refusedCount, removeQueued, retryRefused, slimAsset,
} from "../src/modules/compliance/offlineChecks.js";

let n = 0;
const t = async (name, fn) => { await fn(); n += 1; console.log(`ok  ${name}`); };
const makeStorage = (limit = Infinity) => {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => { if (String(v).length > limit) throw new Error("quota"); map.set(k, String(v)); }, removeItem: (k) => map.delete(k), map };
};
const stamp = (ms) => ({ toDate: () => new Date(ms) });
const asset = (id, extra = {}) => ({ id, assetCode: `WH-0${id}`, assetType: "water_hot", label: `Tap ${id}`, location: "Plant room", frequency: "monthly", lastCheckAt: stamp(1_000_000), lastCheckResult: "pass", ...extra });
const actor = { uid: "u1", displayName: "Caretaker" };
const entry = (id, over = {}) => ({ id, asset: asset("1"), payload: { tempC: "55" }, actor, performedAtMs: 5000, identificationMethod: "qr", scanRaw: "x", ...over });

await t("an asset is kept as only what a check needs, with its date as a plain number", () => {
  const slim = slimAsset({ ...asset("1"), secret: "no", createdAt: stamp(1) });
  assert.equal(slim.lastCheckAt, 1_000_000);
  assert.equal(slim.secret, undefined);
  assert.equal(slim.createdAt, undefined);
  assert.equal(slim.label, "Tap 1");
  assert.equal(slimAsset({ id: "z" }).lastCheckAt, null);
  assert.doesNotThrow(() => JSON.stringify(slim));
});

await t("the saved list finds a scanned asset by id or by code, and never a retired one", () => {
  const storage = makeStorage();
  assert.equal(cacheAssets(storage, [asset("1"), asset("2"), asset("3", { active: false }), { assetCode: "no-id" }]), true);
  assert.equal(cachedAssets(storage).length, 3, "the one with no id is not kept");
  assert.equal(findCachedAsset(storage, "1").label, "Tap 1");
  assert.equal(findCachedAsset(storage, "wh-02").id, "2", "by code, any case");
  assert.equal(findCachedAsset(storage, "WH 02").id, "2", "a space reads as a dash");
  assert.equal(findCachedAsset(storage, "3"), null, "retired");
  assert.equal(findCachedAsset(storage, "nope"), null);
  assert.equal(findCachedAsset(storage, ""), null);
  assert.deepEqual(cachedAssets(makeStorage()), [], "nothing saved yet");
  const broken = makeStorage(); broken.map.set(ASSET_CACHE_KEY, "{not json");
  assert.deepEqual(cachedAssets(broken), [], "damaged storage reads as empty");
});

await t("a waiting check needs an id, an asset and who did it; the same id is kept once", () => {
  const storage = makeStorage();
  assert.throws(() => queueCheck(storage, { id: "a" }), /needs an id/);
  assert.throws(() => queueCheck(storage, { ...entry("a"), actor: {} }), /needs an id/);
  assert.equal(queueCheck(storage, entry("a")), 1);
  assert.equal(queueCheck(storage, entry("a")), 1, "the same check queued twice is still one");
  assert.equal(queueCheck(storage, entry("b")), 2);
  assert.equal(queueSize(storage), 2);
  assert.equal(readQueue(storage)[0].asset.lastCheckAt, 1_000_000, "the asset is stored slim");
  assert.ok(readQueue(storage)[0].queuedAt > 0);
  assert.equal(removeQueued(storage, "a"), true);
  assert.deepEqual(readQueue(storage).map((q) => q.id), ["b"]);
});

await t("a phone with no room, or too many waiting, says so rather than losing the check", () => {
  assert.throws(() => queueCheck(makeStorage(10), entry("a")), /no room/);
  const storage = makeStorage();
  for (let i = 0; i < 200; i += 1) queueCheck(storage, entry(`c${i}`));
  assert.throws(() => queueCheck(storage, entry("one-more")), /too many/);
});

await t("no signal is told apart from a refusal", () => {
  assert.equal(isOfflineError({ code: "unavailable" }, true), true);
  assert.equal(isOfflineError({ code: "deadline-exceeded" }, true), true);
  assert.equal(isOfflineError({ code: "auth/network-request-failed" }, true), true);
  assert.equal(isOfflineError(new Error("Failed to get document because the client is offline."), true), true);
  assert.equal(isOfflineError(new Error("The save timed out."), true), true);
  assert.equal(isOfflineError({ code: "permission-denied", message: "Missing or insufficient permissions." }, true), false);
  assert.equal(isOfflineError({ code: "not-found" }, true), false);
  assert.equal(isOfflineError({ code: "permission-denied" }, false), true, "the phone knows it is offline");
});

await t("sending: oldest first, each removed once sent, only the signed-in person's", async () => {
  const storage = makeStorage();
  queueCheck(storage, entry("late", { performedAtMs: 9000 }));
  queueCheck(storage, entry("early", { performedAtMs: 1000 }));
  queueCheck(storage, entry("theirs", { actor: { uid: "u2", displayName: "Someone" }, performedAtMs: 500 }));
  const sent = [];
  const result = await flushQueue({ storage, currentUid: "u1", record: async (e) => { sent.push(e.id); } });
  assert.deepEqual(sent, ["early", "late"]);
  assert.deepEqual(result, { sent: 2, waiting: 1, otherPeople: 1, failed: 0, offline: false });
  assert.deepEqual(readQueue(storage).map((q) => q.id), ["theirs"], "another person's check waits for them");
});

await t("sending stops at the first 'no signal' and keeps the rest", async () => {
  const storage = makeStorage();
  for (const id of ["a", "b", "c"]) queueCheck(storage, entry(id, { performedAtMs: id.charCodeAt(0) }));
  let calls = 0;
  const result = await flushQueue({ storage, currentUid: "u1", record: async () => { calls += 1; if (calls === 2) throw Object.assign(new Error("offline"), { code: "unavailable" }); } });
  assert.equal(result.sent, 1);
  assert.equal(result.offline, true);
  assert.equal(result.waiting, 2);
  assert.equal(calls, 2, "it did not carry on to the third");
  assert.deepEqual(readQueue(storage).map((q) => q.id), ["b", "c"]);
});

await t("a refused check is kept with the reason, not retried in a loop, and can be tried again", async () => {
  const storage = makeStorage();
  queueCheck(storage, entry("bad", { performedAtMs: 1 }));
  queueCheck(storage, entry("good", { performedAtMs: 2 }));
  let attempts = 0;
  const record = async (e) => { attempts += 1; if (e.id === "bad") throw Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" }); };
  let result = await flushQueue({ storage, currentUid: "u1", record });
  assert.deepEqual([result.sent, result.failed, result.waiting], [1, 1, 1]);
  assert.equal(readQueue(storage)[0].refused, "Missing or insufficient permissions.");
  assert.equal(refusedCount(storage), 1);
  attempts = 0;
  result = await flushQueue({ storage, currentUid: "u1", record });
  assert.equal(attempts, 0, "it is not tried again until asked");
  assert.equal(result.failed, 1);
  retryRefused(storage);
  assert.equal(refusedCount(storage), 0);
  result = await flushQueue({ storage, currentUid: "u1", record: async () => {} });
  assert.deepEqual([result.sent, result.waiting], [1, 0]);
});

await t("with no signal nothing is attempted", async () => {
  const storage = makeStorage();
  queueCheck(storage, entry("a"));
  let called = false;
  const result = await flushQueue({ storage, currentUid: "u1", online: false, record: async () => { called = true; } });
  assert.equal(called, false);
  assert.deepEqual(result, { sent: 0, waiting: 1, otherPeople: 0, failed: 0, offline: true });
  assert.equal(storage.map.has(QUEUE_KEY), true);
});

console.log(`\n${n} passed`);
