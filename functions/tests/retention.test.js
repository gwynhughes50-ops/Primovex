const test = require("node:test");
const assert = require("node:assert/strict");
const { runRetention, deleteOlderThan, USAGE_SESSION_DAYS, ORB_USAGE_DAYS } = require("../services/retentionService");

const NOW = new Date(Date.UTC(2026, 9, 7, 3, 30, 0));
const DAY = 86400000;
const ts = (ms) => ({ toMillis: () => ms, ms });

// a small in-memory database that understands where(field, "<", value).limit(n)
function fakeDb(collections) {
  const deleted = [];
  const read = (v) => (v && typeof v.toMillis === "function" ? v.toMillis() : v);
  return {
    deleted,
    collection: (name) => ({
      where: (field, op, value) => ({
        limit: (n) => ({
          get: async () => {
            const docs = Object.entries(collections[name] || {})
              .filter(([, data]) => read(data[field]) < read(value))
              .slice(0, n)
              .map(([id]) => ({ id, ref: { name, id } }));
            return { empty: docs.length === 0, size: docs.length, docs };
          },
        }),
      }),
    }),
    batch: () => {
      const refs = [];
      return { delete: (ref) => refs.push(ref), commit: async () => { refs.forEach((r) => { deleted.push(`${r.name}/${r.id}`); delete collections[r.name][r.id]; }); } };
    },
  };
}

test("sign-in sessions older than twelve months are deleted, newer ones kept", async () => {
  const db = fakeDb({
    usage_sessions: {
      old: { startedAt: ts(NOW.getTime() - (USAGE_SESSION_DAYS + 5) * DAY) },
      recent: { startedAt: ts(NOW.getTime() - 30 * DAY) },
      almost: { startedAt: ts(NOW.getTime() - (USAGE_SESSION_DAYS - 1) * DAY) },
    },
  });
  const result = await runRetention({ db, now: NOW });
  assert.equal(result.usageSessionsDeleted, 1);
  assert.deepEqual(db.deleted, ["usage_sessions/old"]);
});

test("the Orb's request counters are kept only for 60 days", async () => {
  const db = fakeDb({
    orb_ai_usage: {
      stale: { updatedAtMs: NOW.getTime() - (ORB_USAGE_DAYS + 1) * DAY },
      fresh: { updatedAtMs: NOW.getTime() - 3 * DAY },
    },
  });
  const result = await runRetention({ db, now: NOW });
  assert.equal(result.orbUsageDeleted, 1);
  assert.deepEqual(db.deleted, ["orb_ai_usage/stale"]);
});

test("the governed audit ledger is never touched", async () => {
  const db = fakeDb({ audit_events: { ancient: { startedAt: ts(0), updatedAtMs: 0 } }, usage_sessions: {}, orb_ai_usage: {} });
  await runRetention({ db, now: NOW });
  assert.deepEqual(db.deleted, []);
});

test("a large backlog is cleared in batches, and an empty collection is fine", async () => {
  const many = {};
  for (let i = 0; i < 1000; i += 1) many[`d${i}`] = { startedAt: ts(0) };
  const db = fakeDb({ usage_sessions: many });
  const n = await deleteOlderThan({ db, collection: "usage_sessions", field: "startedAt", cutoff: ts(1), batchSize: 400, maxBatches: 10 });
  assert.equal(n, 1000);
  assert.equal((await runRetention({ db: fakeDb({}), now: NOW })).usageSessionsDeleted, 0);
});
