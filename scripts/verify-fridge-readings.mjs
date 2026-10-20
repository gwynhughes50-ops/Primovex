import assert from "node:assert/strict";
import { describeReading, fridgeStatuses, historyStartKey, newestFirst, readingTime, summarise } from "../src/mobile/fridgeReadings.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };

const TUE_PM = new Date(2026, 9, 20, 15, 0); // Tuesday 20 October 2026, 15:00
const TUE_AM = new Date(2026, 9, 20, 9, 0);
const SAT = new Date(2026, 9, 24, 15, 0);
const stamp = (date) => ({ toDate: () => date });
const log = (unitId, date, extra = {}) => ({ unitId, measured_at: stamp(date), dateKey: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`, temp: 4.5, minTemp: 3.8, maxTemp: 5.1, outOfRange: false, recordedBy: "Kathlyn", slot: date.getHours() < 12 ? "AM" : "PM", ...extra });
const units = [
  { id: "f1", name: "Vaccine fridge", active: true },
  { id: "f2", name: "Clinic fridge 2", active: true },
  { id: "f3", name: "Treatment room fridge", active: true },
  { id: "old", name: "Old fridge", active: false },
];

t("a reading's time comes from a Firestore timestamp, a Date or a number, and a missing one reads as none", () => {
  assert.equal(readingTime({ measured_at: stamp(TUE_AM) }).getTime(), TUE_AM.getTime());
  assert.equal(readingTime({ measured_at: TUE_AM }).getTime(), TUE_AM.getTime());
  assert.equal(readingTime({ created_at: TUE_AM.getTime() }).getTime(), TUE_AM.getTime(), "falls back to when it was saved");
  assert.equal(readingTime({}), null);
  assert.equal(readingTime({ measured_at: "nonsense" }), null);
});

t("each fridge shows today's reading, in range or out, and which have not been read", () => {
  const logs = [
    log("f1", new Date(2026, 9, 20, 9, 12)),
    log("f2", new Date(2026, 9, 20, 9, 30), { temp: 9.4, maxTemp: 9.8, outOfRange: true }),
    log("f3", new Date(2026, 9, 19, 15, 0)), // yesterday only
    log("old", new Date(2026, 9, 20, 9, 0)),
  ];
  const list = fridgeStatuses({ units, logs, now: TUE_PM });
  assert.deepEqual(list.map((s) => [s.unit.id, s.state]), [["f2", "out"], ["f3", "missing"], ["f1", "ok"]], "out of range first, then not read, then fine; a fridge no longer in use is left out");
  assert.equal(list[0].newest.temp, 9.4);
  assert.equal(list[1].newest, null);
  assert.equal(list[1].last.dateKey, "2026-10-19", "the last reading is still known");
  assert.deepEqual(summarise(list), { total: 3, checked: 2, out: 1, missing: 1, incidents: 0 });
});

t("a fridge not read yet is only 'missing' once a check is expected, and never at the weekend", () => {
  assert.equal(fridgeStatuses({ units, logs: [], now: TUE_AM })[0].state, "waiting", "a weekday morning");
  assert.equal(fridgeStatuses({ units, logs: [], now: TUE_PM })[0].state, "missing", "a weekday afternoon");
  assert.equal(fridgeStatuses({ units, logs: [], now: SAT })[0].state, "waiting", "a Saturday");
});

t("the newest reading of the day is the one shown, and the history is newest first", () => {
  const logs = [log("f1", new Date(2026, 9, 20, 9, 0), { temp: 6 }), log("f1", new Date(2026, 9, 20, 14, 0), { temp: 5 }), log("f1", new Date(2026, 9, 19, 14, 0), { temp: 4 })];
  const f1 = fridgeStatuses({ units, logs, now: TUE_PM }).find((s) => s.unit.id === "f1");
  assert.equal(f1.newest.temp, 5);
  assert.equal(f1.today.length, 2);
  assert.deepEqual(f1.history.map((l) => l.temp), [5, 6, 4]);
  assert.deepEqual(newestFirst(logs).map((l) => l.temp), [5, 6, 4]);
  assert.equal(logs[0].temp, 6, "the list passed in is not reordered");
});

t("a fridge with an open incident is marked even if today's reading was in range", () => {
  const list = fridgeStatuses({ units, logs: [log("f1", TUE_AM)], incidents: [{ unitId: "f1", status: "open" }, { unitId: "f2", status: "resolved" }], now: TUE_PM });
  assert.equal(list.find((s) => s.unit.id === "f1").incidentOpen, true);
  assert.equal(list.find((s) => s.unit.id === "f2").incidentOpen, false);
  assert.equal(summarise(list).incidents, 1);
});

t("a reading is described in plain values", () => {
  const d = describeReading(log("f1", TUE_AM));
  assert.deepEqual([d.temp, d.min, d.max, d.out, d.by, d.slot], [4.5, 3.8, 5.1, false, "Kathlyn", "AM"]);
  assert.equal(d.when.getTime(), TUE_AM.getTime());
  const blank = describeReading({ temp: "", minTemp: null });
  assert.deepEqual([blank.temp, blank.min, blank.max, blank.by], [null, null, null, ""]);
});

t("the history starts a fortnight back", () => {
  assert.equal(historyStartKey(TUE_PM), "2026-10-06");
  assert.equal(historyStartKey(TUE_PM, 30), "2026-09-20");
});

console.log(`\n${n} passed`);
