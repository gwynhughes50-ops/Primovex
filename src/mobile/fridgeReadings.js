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

// The recent days at a glance, one cell for each of the last `days` days (today last), so a long list is never needed to spot a gap:
//   state "ok" every reading that day was in range, "out" at least one was not, "none" nothing was read
//   a day with nothing on a Saturday or Sunday is "weekend", not a miss
export function dayStrip(history = [], now = new Date(), days = HISTORY_DAYS) {
  const byDay = new Map();
  for (const log of history) {
    const when = readingTime(log);
    const key = log?.dateKey || (when ? dateKeyOf(when) : "");
    if (key) byDay.set(key, [...(byDay.get(key) || []), log]);
  }
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1 - i));
    const key = dateKeyOf(date);
    const readings = byDay.get(key) || [];
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    const state = readings.some((r) => r.outOfRange === true) ? "out" : readings.length ? "ok" : weekend ? "weekend" : "none";
    return { key, letter: "SMTWTFS"[date.getDay()], day: date.getDate(), state, count: readings.length };
  });
}

// how many readings a card lists to begin with, how many more each press adds, and the most it will ever list: older readings are
// looked up on the desktop's Temperature log by date range
export const LIST_FIRST = 7;
export const LIST_MORE = 10;
export const LIST_MAX = 60;
