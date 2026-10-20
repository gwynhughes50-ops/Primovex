// Reading back the fridge checks (the readings people record by scanning a fridge's tag and reading its thermometer):
// today's reading for each fridge, who took it, and the recent history. Pure, so it can be tested; the screen is
// MobileFridgeReadings.jsx.

import { dateKeyOf, isCheckTime } from "./fridgeCheck.js";

export const HISTORY_DAYS = 14;

const toDate = (value) => {
  if (!value) return null;
  const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

// when a reading was taken
export const readingTime = (log) => toDate(log?.measured_at) || toDate(log?.created_at);

export const newestFirst = (logs = []) => [...logs].sort((a, b) => (readingTime(b)?.getTime() || 0) - (readingTime(a)?.getTime() || 0));

// the date key to start the history from
export const historyStartKey = (now = new Date(), days = HISTORY_DAYS) => dateKeyOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - days));

// "ok" in range today; "out" out of range today; "waiting" not read yet today and not yet time to expect it;
// "missing" not read today when one is due (a weekday afternoon onwards)
export function fridgeStatuses({ units = [], logs = [], incidents = [], now = new Date() } = {}) {
  const today = dateKeyOf(now);
  const due = isCheckTime(now);
  const open = new Set(incidents.filter((i) => String(i.status || "open") === "open").map((i) => i.unitId));
  const order = { out: 0, missing: 1, waiting: 2, ok: 3 };
  return units
    .filter((unit) => unit.active !== false)
    .map((unit) => {
      const mine = newestFirst(logs.filter((log) => log.unitId === unit.id));
      const todays = mine.filter((log) => (log.dateKey || "") === today);
      const newest = todays[0] || null;
      const state = newest ? (newest.outOfRange ? "out" : "ok") : due ? "missing" : "waiting";
      return { unit, today: todays, newest, last: mine[0] || null, history: mine, state, incidentOpen: open.has(unit.id) };
    })
    .sort((a, b) => order[a.state] - order[b.state] || String(a.unit.name).localeCompare(String(b.unit.name), undefined, { numeric: true }));
}

// the counts for the top of the screen
export function summarise(statuses = []) {
  const checked = statuses.filter((s) => s.newest).length;
  return { total: statuses.length, checked, out: statuses.filter((s) => s.state === "out").length, missing: statuses.filter((s) => s.state === "missing").length, incidents: statuses.filter((s) => s.incidentOpen).length };
}

// one reading in the words a screen shows
export function describeReading(log) {
  const when = readingTime(log);
  const number = (value) => (Number.isFinite(Number(value)) && value !== null && value !== "" ? Number(value) : null);
  return { temp: number(log?.temp), min: number(log?.minTemp), max: number(log?.maxTemp), out: log?.outOfRange === true, by: log?.recordedBy || "", when, slot: log?.slot || "", reset: log?.resetDone === true };
}
