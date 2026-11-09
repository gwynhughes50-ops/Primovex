const test = require("node:test");
const assert = require("node:assert/strict");
const { cleanPath, mergePages, applyUsageReport, recordUsage, MAX_PAGES } = require("../services/usageService");

const T0 = new Date(2026, 9, 5, 9, 0, 0);
const at = (seconds) => new Date(T0.getTime() + seconds * 1000);
const profile = { displayName: "Hayley", role: "HCA", email: "h@example.org", siteId: "SITE-A" };

function fakeDb() {
  const docs = {};
  return {
    docs,
    collection: () => ({ doc: (id) => ({ id, get: async () => ({ exists: id in docs, data: () => docs[id] }) }) }),
    runTransaction: async (fn) => fn({
      get: async (ref) => ref.get(),
      set: (ref, value) => { docs[ref.id] = value; },
    }),
  };
}

test("only areas of the app are kept: no queries, no ids, at most two levels", () => {
  assert.equal(cleanPath("/inventory?tab=emergency&asset=abc"), "/inventory");
  assert.equal(cleanPath("/Governance/SARs"), "/governance/sars");
  assert.equal(cleanPath("/governance/sars/ABCDEFGHIJ1234567890"), "/governance/sars");
  assert.equal(cleanPath("/sense/open/asset/xyz"), "/sense/open");
  assert.equal(cleanPath("/a b/<script>"), "/ab/script");
  assert.equal(cleanPath(""), "/");
  assert.equal(cleanPath(undefined), "/");
  assert.equal(cleanPath("/#/anything"), "/");
});

test("pages add up by area, most visited first", () => {
  const { pages } = mergePages(
    [{ path: "/inventory", visits: 2 }],
    [{ path: "/inventory", visits: 1 }, { path: "/alerts", visits: 5 }]
  );
  assert.deepEqual(pages, [{ path: "/alerts", visits: 5 }, { path: "/inventory", visits: 3 }]);
});

test("TIME is never kept: seconds an older app still sends are ignored, and seconds already in a stored record are dropped when it is next reported", () => {
  const { pages } = mergePages(
    [{ path: "/inventory", seconds: 4000, visits: 2 }],
    [{ path: "/inventory", seconds: 50, visits: 1 }, { path: "/alerts", seconds: 200, visits: 1 }, { path: "/time-only", seconds: 900 }]
  );
  assert.deepEqual(pages, [{ path: "/inventory", visits: 3 }, { path: "/alerts", visits: 1 }]);
  for (const row of pages) assert.deepEqual(Object.keys(row).sort(), ["path", "visits"], "nothing but the area and the number of visits");
});

test("junk in a report is neutralised: negative, fractional, huge or non-numeric values", () => {
  const { pages } = mergePages([], [{ path: "/a", visits: -3 }, { path: "/b", visits: "x" }, { path: "/c", visits: 9999 }, { path: "/d", visits: 2.9 }]);
  assert.deepEqual(pages.map((p) => [p.path, p.visits]), [["/c", 200], ["/d", 2]]);
});

test("a record can't grow without limit", () => {
  const existing = Array.from({ length: MAX_PAGES }, (_, i) => ({ path: `/p${i}`, visits: 1 }));
  const { pages } = mergePages(existing, [{ path: "/brand-new", visits: 1 }, { path: "/p0", visits: 5 }]);
  assert.equal(pages.length, MAX_PAGES);
  assert.ok(!pages.some((p) => p.path === "/brand-new"));
  assert.equal(pages.find((p) => p.path === "/p0").visits, 6);
});

test("the first report starts the session on the server clock and keeps visits only", () => {
  const { record } = applyUsageReport({ existing: null, caller: "hca", profile, now: T0, data: { client: "tauri", platform: "windows", deviceId: "pvx-1234-abcd", pages: [{ path: "/dashboard", seconds: 9999, visits: 1 }] } });
  assert.equal(record.uid, "hca");
  assert.equal(record.displayName, "Hayley");
  assert.equal(record.role, "HCA");
  assert.equal(record.startedAt.toMillis(), T0.getTime());
  assert.deepEqual(record.pages, [{ path: "/dashboard", visits: 1 }]);
  assert.equal("activeSeconds" in record, false, "no running total of time");
  assert.equal(record.endedAt, undefined);
});

test("later reports add visits and move last seen on; no time is ever stored, however much is claimed", () => {
  const first = applyUsageReport({ existing: null, caller: "hca", profile, now: T0, data: {} }).record;
  const second = applyUsageReport({ existing: first, caller: "hca", profile, now: at(300), data: { pages: [{ path: "/inventory", seconds: 280, visits: 2 }] } }).record;
  assert.equal(second.lastSeenAt.toMillis(), at(300).getTime());
  assert.equal(second.startedAt.toMillis(), T0.getTime());
  const greedy = applyUsageReport({ existing: second, caller: "hca", profile, now: at(600), data: { pages: [{ path: "/inventory", seconds: 3600, visits: 1 }] } }).record;
  assert.deepEqual(greedy.pages, [{ path: "/inventory", visits: 3 }]);
  assert.equal("activeSeconds" in greedy, false);
  assert.deepEqual(Object.keys(greedy).filter((k) => /second|duration|minute|active/i.test(k)), [], "no field that holds time spent");
  for (const page of greedy.pages) assert.deepEqual(Object.keys(page).sort(), ["path", "visits"]);
});

test("an older record that has time on it loses that time the next time it is reported", () => {
  const old = { startedAt: { toMillis: () => T0.getTime() }, lastSeenAt: { toMillis: () => T0.getTime() }, activeSeconds: 5400, pages: [{ path: "/inventory", seconds: 5000, visits: 4 }], reports: 9 };
  const { record } = applyUsageReport({ existing: old, caller: "hca", profile, now: at(60), data: { pages: [{ path: "/alerts", visits: 1 }] } });
  assert.equal("activeSeconds" in record, false);
  assert.deepEqual(record.pages, [{ path: "/inventory", visits: 4 }, { path: "/alerts", visits: 1 }]);
});

test("ending a session records when and why; an unknown reason becomes 'closed'", () => {
  const first = applyUsageReport({ existing: null, caller: "hca", profile, now: T0, data: {} }).record;
  const ended = applyUsageReport({ existing: first, caller: "hca", profile, now: at(60), data: { ended: true, endReason: "signed_out" } }).record;
  assert.equal(ended.endReason, "signed_out");
  assert.equal(ended.endedAt.toMillis(), at(60).getTime());
  assert.equal(applyUsageReport({ existing: first, caller: "hca", profile, now: at(60), data: { ended: true, endReason: "<b>hi</b>" } }).record.endReason, "closed");
});

test("a finished session can't be added to or re-ended", () => {
  const first = applyUsageReport({ existing: null, caller: "hca", profile, now: T0, data: {} }).record;
  const ended = applyUsageReport({ existing: first, caller: "hca", profile, now: at(60), data: { ended: true, endReason: "signed_out" } }).record;
  assert.deepEqual(applyUsageReport({ existing: ended, caller: "hca", profile, now: at(120), data: { pages: [{ path: "/x", visits: 1 }] } }), { ignored: true });
});

test("identity comes from the account, not the request", () => {
  const { record } = applyUsageReport({ existing: null, caller: "hca", profile, now: T0, data: { uid: "admin", role: "System Admin", displayName: "Boss" } });
  assert.equal(record.uid, "hca");
  assert.equal(record.role, "HCA");
  assert.equal(record.displayName, "Hayley");
});

test("recording stores one record per person per session, keyed by who they are", async () => {
  const db = fakeDb();
  await recordUsage({ db, callerUid: "hca", profile, now: T0, data: { sessionId: "sess-12345678" } });
  await recordUsage({ db, callerUid: "hca", profile, now: at(100), data: { sessionId: "sess-12345678", pages: [{ path: "/alerts", seconds: 90, visits: 1 }] } });
  assert.deepEqual(Object.keys(db.docs), ["hca_sess-12345678"]);
  assert.deepEqual(db.docs["hca_sess-12345678"].pages, [{ path: "/alerts", visits: 1 }]);
  assert.equal(db.docs["hca_sess-12345678"].reports, 2);
  assert.equal("activeSeconds" in db.docs["hca_sess-12345678"], false);
  // someone else using the same session id gets their own record, never the first person's
  await recordUsage({ db, callerUid: "liz", profile: { ...profile, displayName: "Liz" }, now: at(200), data: { sessionId: "sess-12345678", pages: [{ path: "/x", visits: 1 }] } });
  assert.deepEqual(db.docs["hca_sess-12345678"].pages, [{ path: "/alerts", visits: 1 }]);
  assert.deepEqual(db.docs["liz_sess-12345678"].pages, [{ path: "/x", visits: 1 }]);
});

test("a missing or malformed session id is refused", async () => {
  for (const sessionId of [undefined, "", "short", "has spaces in it!", "x".repeat(65)]) {
    await assert.rejects(() => recordUsage({ db: fakeDb(), callerUid: "hca", profile, now: T0, data: { sessionId } }), /valid session id/);
  }
});
