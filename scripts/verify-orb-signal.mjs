// Covers when the Pulse orb pulses faster (src/lib/orbSignal.js).
import assert from "node:assert/strict";
import { SCORE_DROP, baselineKey, detectChange, highPriorityTaskCount, nextBaseline, overdueSarCount, readBaseline, takeSnapshot, writeBaseline } from "../src/lib/orbSignal.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };

const calm = takeSnapshot({ score: 96, stockCounts: { out: 1, expired: 0 }, highTasks: 1, overdueSars: 0 });

t("nothing changed: the orb stays calm", () => {
  assert.deepEqual(detectChange(calm, calm), { changed: false, reasons: [] });
});

t("the first time ever there is nothing to compare with, so it stays calm", () => {
  assert.deepEqual(detectChange(calm, null), { changed: false, reasons: [] });
});

t("stock newly expired or run out makes it pulse, and says how many", () => {
  const worse = takeSnapshot({ score: 96, stockCounts: { out: 2, expired: 1 }, highTasks: 1 });
  const r = detectChange(worse, calm);
  assert.equal(r.changed, true);
  assert.deepEqual(r.reasons, ["2 more items have expired or run out"]);
  assert.deepEqual(detectChange(takeSnapshot({ score: 96, stockCounts: { out: 2 }, highTasks: 1 }), calm).reasons, ["1 more item has expired or run out"]);
});

t("low stock alone (not out, not expired) does not make it pulse", () => {
  assert.equal(detectChange(takeSnapshot({ score: 96, stockCounts: { out: 1, expired: 0, low: 9, soon: 4 }, highTasks: 1 }), calm).changed, false);
});

t("a sharp drop in Practice Pulse makes it pulse; a small one does not", () => {
  assert.equal(detectChange({ ...calm, score: 96 - SCORE_DROP }, calm).changed, true);
  assert.match(detectChange({ ...calm, score: 80 }, calm).reasons[0], /dropped from 96 to 80/);
  assert.equal(detectChange({ ...calm, score: 96 - SCORE_DROP + 1 }, calm).changed, false);
});

t("a new high-priority task, or a SAR newly overdue, makes it pulse", () => {
  assert.deepEqual(detectChange({ ...calm, highTasks: 3 }, calm).reasons, ["2 new high-priority tasks"]);
  assert.deepEqual(detectChange({ ...calm, overdueSars: 1 }, calm).reasons, ["1 SAR has become overdue"]);
  assert.equal(detectChange({ ...calm, overdueSars: 3 }, calm).reasons[0], "3 SARs have become overdue");
});

t("several things at once are all listed", () => {
  const r = detectChange({ score: 70, stockBad: 5, highTasks: 4, overdueSars: 2 }, calm);
  assert.equal(r.reasons.length, 4);
});

t("things getting better never make it pulse", () => {
  assert.equal(detectChange(takeSnapshot({ score: 100, stockCounts: {}, highTasks: 0 }), calm).changed, false);
});

t("opening the orb accepts how things are now", () => {
  const worse = { score: 70, stockBad: 5, highTasks: 4, overdueSars: 2 };
  const after = nextBaseline(worse, calm, { acknowledged: true });
  assert.deepEqual(after, worse);
  assert.equal(detectChange(worse, after).changed, false);
});

t("an improvement lowers the bar quietly, so the same problem returning is noticed", () => {
  const worseBaseline = { score: 80, stockBad: 5, highTasks: 3, overdueSars: 2 };
  const better = { score: 95, stockBad: 1, highTasks: 0, overdueSars: 0 };
  const moved = nextBaseline(better, worseBaseline);
  assert.deepEqual(moved, { score: 95, stockBad: 1, highTasks: 0, overdueSars: 0 });
  assert.equal(detectChange({ score: 95, stockBad: 3, highTasks: 0, overdueSars: 0 }, moved).changed, true);
  // a problem that appears is NOT absorbed into the baseline until someone looks
  const stillWorse = nextBaseline({ score: 70, stockBad: 6, highTasks: 4, overdueSars: 3 }, moved);
  assert.deepEqual(stillWorse, moved);
});

t("SARs count as overdue only if past due and not finished", () => {
  const now = new Date(2026, 9, 7, 12);
  const day = (d) => new Date(2026, 9, d);
  const sars = [
    { status: "in_progress", dueDate: day(6) },
    { status: "new", dueDate: day(7) }, // due today: not yet overdue
    { status: "completed", dueDate: day(1) },
    { status: "archived", dueDate: day(1) },
    { status: "assigned", dueDate: { toDate: () => day(2) } },
    { status: "assigned" },
    { status: "assigned", due_date: day(3) },
  ];
  assert.equal(overdueSarCount(sars, now), 3);
  assert.equal(overdueSarCount([], now), 0);
  assert.equal(overdueSarCount(undefined, now), 0);
});

t("only open critical or high tasks count", () => {
  assert.equal(highPriorityTaskCount([
    { priority: "high" }, { priority: "Critical" }, { priority: "medium" }, { priority: "high", status: "resolved" }, {},
  ]), 2);
});

t("the baseline is remembered per person, and a damaged or missing one reads as none", () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  assert.equal(readBaseline(storage, "u1"), null);
  writeBaseline(storage, "u1", calm);
  assert.deepEqual(readBaseline(storage, "u1"), calm);
  assert.equal(readBaseline(storage, "u2"), null);
  store.set(baselineKey("u3"), "not json");
  assert.equal(readBaseline(storage, "u3"), null);
  assert.equal(readBaseline(null, "u1"), null);
  assert.doesNotThrow(() => writeBaseline(null, "u1", calm));
});

console.log(`\n${n} passed`);
