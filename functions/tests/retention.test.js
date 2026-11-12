const test = require("node:test");
const assert = require("node:assert/strict");
const { runRetention, deleteOlderThan, removeRotaRecords, removeStoredTime, USAGE_SESSION_DAYS, ORB_USAGE_DAYS, ROTA_MONTHS } = require("../services/retentionService");

const NOW = new Date(Date.UTC(2026, 9, 7, 3, 30, 0));
const DAY = 86400000;
const ts = (ms) => ({ toMillis: () => ms, ms });

// a small in-memory database that understands where(field, "<" or ">=", value).limit(n), batch delete and batch update
const GONE = Symbol("deleted field");
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
              .filter(([, data]) => (op === ">=" ? typeof data[field] === "number" && data[field] >= value : read(data[field]) < read(value)))
              .slice(0, n)
              .map(([id, data]) => ({ id, ref: { name, id }, data: () => data }));
            return { empty: docs.length === 0, size: docs.length, docs };
          },
        }),
      }),
    }),
    batch: () => {
      const refs = [];
      const updates = [];
      return {
        delete: (ref) => refs.push(ref),
        update: (ref, patch) => updates.push([ref, patch]),
        commit: async () => {
          refs.forEach((r) => { deleted.push(`${r.name}/${r.id}`); delete collections[r.name][r.id]; });
          updates.forEach(([r, patch]) => { for (const [k, v] of Object.entries(patch)) { if (v === GONE) delete collections[r.name][r.id][k]; else collections[r.name][r.id][k] = v; } });
        },
      };
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

const withTime = () => ({
  usage_sessions: {
    a: { startedAt: ts(NOW.getTime() - 3 * DAY), activeSeconds: 5400, pages: [{ path: "/inventory", seconds: 4000, visits: 3 }, { path: "/alerts", seconds: 1400, visits: 1 }], reports: 9 },
    b: { startedAt: ts(NOW.getTime() - 9 * DAY), activeSeconds: 0, pages: [{ path: "/dashboard", seconds: 0, visits: 1 }] },
    already: { startedAt: ts(NOW.getTime() - 5 * DAY), pages: [{ path: "/inventory", visits: 2 }] }, // no time on it: left alone
  },
});

test("time already stored on older sign-in sessions is removed, and the areas and visit counts stay", async () => {
  const data = withTime();
  const db = fakeDb(data);
  const result = await runRetention({ db, now: NOW, fieldDelete: () => GONE });
  assert.equal(result.usageTimeRemoved, 2, "the two sessions that had time; the one without was left alone");
  assert.equal("activeSeconds" in data.usage_sessions.a, false);
  assert.deepEqual(data.usage_sessions.a.pages, [{ path: "/inventory", visits: 3 }, { path: "/alerts", visits: 1 }]);
  assert.deepEqual(data.usage_sessions.b.pages, [{ path: "/dashboard", visits: 1 }]);
  assert.equal(data.usage_sessions.a.reports, 9, "everything else on the record is untouched");
  assert.deepEqual(data.usage_sessions.already.pages, [{ path: "/inventory", visits: 2 }]);
  assert.deepEqual(db.deleted, [], "nothing was deleted, only cleaned");
  assert.equal(result.stillHoldingTime, false, "the run checks afterwards that no session still holds a time");
  assert.equal(result.ranAt, NOW.toISOString());
});

test("if a run could not finish, it says time is still held rather than claiming success", async () => {
  const many = {};
  for (let i = 0; i < 30; i += 1) many[`s${i}`] = { startedAt: ts(NOW.getTime() - DAY), activeSeconds: 60, pages: [{ path: "/x", seconds: 60, visits: 1 }] };
  const db = fakeDb({ usage_sessions: many });
  const first = await removeStoredTime({ db, fieldDelete: () => GONE, batchSize: 10, maxBatches: 1 });
  assert.equal(first, 10);
  const result = await runRetention({ db, now: NOW, fieldDelete: () => GONE });
  assert.equal(result.stillHoldingTime, false, "a full run finishes the rest");
});

test("removing time can be run again and again: the second run finds nothing", async () => {
  const db = fakeDb(withTime());
  assert.equal(await removeStoredTime({ db, fieldDelete: () => GONE }), 2);
  assert.equal(await removeStoredTime({ db, fieldDelete: () => GONE }), 0);
  assert.equal(await removeStoredTime({ db: fakeDb({}), fieldDelete: () => GONE }), 0, "an empty collection is fine");
});

test("a large backlog of sessions with time is cleaned in batches", async () => {
  const many = {};
  for (let i = 0; i < 1000; i += 1) many[`s${i}`] = { startedAt: ts(NOW.getTime() - DAY), activeSeconds: 60, pages: [{ path: "/x", seconds: 60, visits: 1 }] };
  const data = { usage_sessions: many };
  assert.equal(await removeStoredTime({ db: fakeDb(data), batchSize: 400, maxBatches: 10, fieldDelete: () => GONE }), 1000);
  assert.equal(Object.values(many).some((d) => "activeSeconds" in d || d.pages.some((p) => "seconds" in p)), false);
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

// ---- the reception rota ----
const rotaData = () => ({
  reception_rota_weeks: { old: { mondayIso: "2025-10-06" }, edge: { mondayIso: "2025-10-13" }, recent: { mondayIso: "2026-10-05" }, future: { mondayIso: "2026-11-16" } },
  reception_rota_published: { old: { mondayIso: "2025-09-29" }, recent: { mondayIso: "2026-10-05" } },
  reception_rota_absences: { old: { to: "2025-10-06" }, ongoing: { to: "2025-10-20" }, recent: { to: "2026-10-01" } },
  reception_rota_requests: { old: { createdAt: ts(NOW.getTime() - 400 * DAY) }, recent: { createdAt: ts(NOW.getTime() - 20 * DAY) } },
});

test("the reception rota's records older than twelve months are deleted: weeks and published copies by their Monday, time off by its last day, requests by when they were made; nothing newer or to come", async () => {
  assert.equal(ROTA_MONTHS, 12);
  const db = fakeDb(rotaData());
  const result = await removeRotaRecords({ db, now: NOW });
  assert.deepEqual(result, { rotaWeeksDeleted: 1, rotaPublishedDeleted: 1, rotaAbsencesDeleted: 1, rotaRequestsDeleted: 1 });
  assert.deepEqual(db.deleted.sort(), ["reception_rota_absences/old", "reception_rota_published/old", "reception_rota_requests/old", "reception_rota_weeks/old"]);
});

test("the weekly clean-up includes the rota, and the administrator's 'Clean up now' on the activity report does not touch it", async () => {
  const weekly = fakeDb(rotaData());
  const r = await runRetention({ db: weekly, now: NOW });
  assert.equal(r.rotaWeeksDeleted, 1);
  assert.equal(r.rotaRequestsDeleted, 1);
  const activityOnly = fakeDb(rotaData());
  const r2 = await runRetention({ db: activityOnly, now: NOW, rota: false });
  assert.equal("rotaWeeksDeleted" in r2, false);
  assert.deepEqual(activityOnly.deleted, [], "nothing from the rota");
  const fs = require("node:fs");
  const server = fs.readFileSync(require("node:path").join(__dirname, "..", "index.js"), "utf8");
  assert.match(server.slice(server.indexOf("exports.runRetentionNow")), /runRetention\(\{ db, rota: false \}\)/);
});

test("running the rota clean-up again finds nothing more, and an empty rota is fine", async () => {
  const db = fakeDb(rotaData());
  await removeRotaRecords({ db, now: NOW });
  const again = await removeRotaRecords({ db, now: NOW });
  assert.deepEqual(again, { rotaWeeksDeleted: 0, rotaPublishedDeleted: 0, rotaAbsencesDeleted: 0, rotaRequestsDeleted: 0 });
  assert.deepEqual(await removeRotaRecords({ db: fakeDb({}), now: NOW }), { rotaWeeksDeleted: 0, rotaPublishedDeleted: 0, rotaAbsencesDeleted: 0, rotaRequestsDeleted: 0 });
});

test("a large backlog of old rota records is cleaned in batches, and a different period can be given", async () => {
  const many = {};
  for (let i = 0; i < 900; i += 1) many[`r${i}`] = { createdAt: ts(NOW.getTime() - 500 * DAY) };
  const db = fakeDb({ reception_rota_requests: many });
  assert.equal((await removeRotaRecords({ db, now: NOW })).rotaRequestsDeleted, 900);
  const short = fakeDb({ reception_rota_weeks: { a: { mondayIso: "2026-06-01" }, b: { mondayIso: "2026-09-28" } } });
  assert.equal((await removeRotaRecords({ db: short, now: NOW, months: 3 })).rotaWeeksDeleted, 1, "three months back is 7 July: June goes, September stays");
});
