// Each person's working pattern: which days, which times, how long the unpaid break is, whether it repeats every week or over
// a cycle of weeks, and when it starts. From a pattern Primovex works out what a person is expected to work on any date, which
// is what a timesheet starts from. Pure (no Firestore, no screens) so it can be tested and shared.
//
//   day:      { blocks: [{ start: "08:30", end: "17:00" }, ...], breakMin: 60 }      no blocks = not working that day
//             a split shift is two blocks (7.30-10.30, then 1-5.30): the gap between them is not paid, so breakMin is 0
//   pattern:  { from: "YYYY-MM-DD", mode: "fixed" | "zero-hours", weeks: [ { mon: day, tue: day, ... sun: day }, ... ] }
//             weeks is the cycle (1 = the same every week, 2 = alternate weeks, up to 6); it starts on the Monday of `from`'s week
//   a person has a list of patterns; the one in force on a date is the latest whose `from` is on or before it

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const DAY_LABEL = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
export const MAX_CYCLE_WEEKS = 6;
const DAY_MS = 86400000;
const pad = (n) => String(n).padStart(2, "0");

export const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function parseKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ""));
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(date.getTime()) || date.getMonth() !== Number(m[2]) - 1 ? null : date;
}
const addDays = (key, n) => { const d = parseKey(key); d.setDate(d.getDate() + n); return dateKey(d); };
// Monday = 0 ... Sunday = 6
const dayIndex = (date) => (date.getDay() + 6) % 7;
const mondayOf = (date) => { const d = new Date(date.getFullYear(), date.getMonth(), date.getDate()); d.setDate(d.getDate() - dayIndex(d)); return d; };

export function toMinutes(time) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(time || ""));
  if (!m) return null;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  return Number(m[1]) > 24 || Number(m[2]) > 59 || minutes > 1440 ? null : minutes;
}
export const toTime = (minutes) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

// 7.5 -> "7h 30m", 8 -> "8h", 0.25 -> "15m"
export function hoursLabel(hours) {
  const minutes = Math.round((Number(hours) || 0) * 60);
  const h = Math.floor(Math.abs(minutes) / 60);
  const m = Math.abs(minutes) % 60;
  return `${minutes < 0 ? "-" : ""}${h ? `${h}h` : ""}${h && m ? " " : ""}${m || !h ? `${m}m` : ""}`.trim();
}

export const emptyDay = () => ({ blocks: [], breakMin: 0 });
export const emptyWeek = () => Object.fromEntries(DAYS.map((d) => [d, emptyDay()]));
export const newPattern = (from, weeks = 1) => ({ from, mode: "fixed", weeks: Array.from({ length: weeks }, emptyWeek) });

// minutes paid for one day
export function dayMinutes(day) {
  const span = (day?.blocks || []).reduce((sum, b) => sum + Math.max(0, (toMinutes(b.end) ?? 0) - (toMinutes(b.start) ?? 0)), 0);
  return Math.max(0, span - (Number(day?.breakMin) || 0));
}
export const dayHours = (day) => dayMinutes(day) / 60;
export const weekHours = (week) => DAYS.reduce((sum, d) => sum + dayHours(week?.[d]), 0);
// the average over the cycle: what the contract hours work out to
export const averageWeekHours = (pattern) => (pattern?.mode === "zero-hours" || !pattern?.weeks?.length ? 0 : pattern.weeks.reduce((sum, w) => sum + weekHours(w), 0) / pattern.weeks.length);

// the pattern in force on a date (or null before the first one starts)
export function patternOn(patterns, key) {
  return [...(patterns || [])].filter((p) => p.from && p.from <= key).sort((a, b) => b.from.localeCompare(a.from))[0] || null;
}

// which week of the cycle a date falls in (0-based), counted from the Monday of the week the pattern starts
export function cycleWeek(pattern, key) {
  const date = parseKey(key);
  const start = parseKey(pattern.from);
  if (!date || !start || !pattern.weeks?.length) return 0;
  const weeks = Math.round((mondayOf(date).getTime() - mondayOf(start).getTime()) / (7 * DAY_MS));
  return ((weeks % pattern.weeks.length) + pattern.weeks.length) % pattern.weeks.length;
}

// what a person is expected to do on a date: { pattern, blocks, breakMin, hours, working, zeroHours }
export function planFor(patterns, key) {
  const pattern = patternOn(patterns, key);
  if (!pattern) return { pattern: null, blocks: [], breakMin: 0, hours: 0, working: false, zeroHours: false };
  if (pattern.mode === "zero-hours") return { pattern, blocks: [], breakMin: 0, hours: 0, working: false, zeroHours: true };
  const day = pattern.weeks[cycleWeek(pattern, key)]?.[DAYS[dayIndex(parseKey(key))]] || emptyDay();
  const hours = dayHours(day);
  return { pattern, blocks: day.blocks || [], breakMin: Number(day.breakMin) || 0, hours, working: hours > 0, zeroHours: false };
}

// every date from..to with its plan and any bank holiday
export function expectedDays(patterns, from, to) {
  const out = [];
  const holidays = new Map();
  const years = new Set([Number(from.slice(0, 4)), Number(to.slice(0, 4))]);
  for (const year of years) for (const h of bankHolidays(year)) holidays.set(h.date, h.name);
  for (let key = from; key <= to; key = addDays(key, 1)) {
    const plan = planFor(patterns, key);
    out.push({ date: key, dow: DAYS[dayIndex(parseKey(key))], ...plan, bankHoliday: holidays.get(key) || "" });
    if (out.length > 800) break;
  }
  return out;
}

// the problems with a pattern, in words ([] when it is fine)
export function patternProblems(pattern) {
  const problems = [];
  if (!parseKey(pattern?.from)) problems.push("Say when this pattern starts.");
  if (pattern?.mode === "zero-hours") return problems;
  if (!pattern?.weeks?.length || pattern.weeks.length > MAX_CYCLE_WEEKS) problems.push(`A pattern repeats over 1 to ${MAX_CYCLE_WEEKS} weeks.`);
  (pattern?.weeks || []).forEach((week, w) => {
    for (const d of DAYS) {
      const day = week[d];
      const label = `${DAY_LABEL[d]}${pattern.weeks.length > 1 ? `, week ${w + 1}` : ""}`;
      const times = (day?.blocks || []).map((b) => [toMinutes(b.start), toMinutes(b.end)]);
      if (times.some(([s, e]) => s === null || e === null)) { problems.push(`${label}: enter both a start and an end time.`); continue; }
      if (times.some(([s, e]) => e <= s)) problems.push(`${label}: a finish time must be after its start.`);
      const sorted = [...times].sort((a, b) => a[0] - b[0]);
      if (sorted.some((t, i) => i > 0 && t[0] < sorted[i - 1][1])) problems.push(`${label}: the times overlap.`);
      const span = times.reduce((sum, [s, e]) => sum + Math.max(0, e - s), 0);
      if ((Number(day?.breakMin) || 0) < 0 || (Number(day?.breakMin) || 0) >= Math.max(span, 1) && span > 0) problems.push(`${label}: the unpaid break is longer than the day.`);
    }
  });
  return problems;
}

// "Mon-Fri 08:30-17:00 (1h break)" style summary of one week, grouping days that are the same
export function describeWeek(week) {
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const parts = [];
  let i = 0;
  while (i < DAYS.length) {
    const day = week?.[DAYS[i]] || emptyDay();
    let j = i;
    while (j + 1 < DAYS.length && same(week?.[DAYS[j + 1]] || emptyDay(), day)) j += 1;
    if (day.blocks?.length) {
      const range = i === j ? DAY_LABEL[DAYS[i]].slice(0, 3) : `${DAY_LABEL[DAYS[i]].slice(0, 3)}-${DAY_LABEL[DAYS[j]].slice(0, 3)}`;
      parts.push(`${range} ${day.blocks.map((b) => `${b.start}-${b.end}`).join(" + ")}${day.breakMin ? ` (${day.breakMin}m break)` : ""}`);
    }
    i = j + 1;
  }
  return parts.join(", ") || "No working days";
}

// ---- bank holidays (England and Wales) ----------------------------------------------------------------------------------

function easterSunday(year) {
  // Anonymous Gregorian algorithm
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}
function nthMonday(year, month, n) { const d = new Date(year, month, 1); while (d.getDay() !== 1) d.setDate(d.getDate() + 1); d.setDate(d.getDate() + 7 * (n - 1)); return d; }
function lastMonday(year, month) { const d = new Date(year, month + 1, 0); while (d.getDay() !== 1) d.setDate(d.getDate() - 1); return d; }

// the bank holidays of a year, with the substitute day when one falls on a weekend
export function bankHolidays(year) {
  const easter = easterSunday(year);
  const shift = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const list = [{ name: "Good Friday", date: shift(easter, -2) }, { name: "Easter Monday", date: shift(easter, 1) }, { name: "Early May bank holiday", date: nthMonday(year, 4, 1) }, { name: "Spring bank holiday", date: lastMonday(year, 4) }, { name: "Summer bank holiday", date: lastMonday(year, 7) }];
  const taken = new Set();
  const place = (name, date) => {
    const d = new Date(date);
    while (d.getDay() === 0 || d.getDay() === 6 || taken.has(dateKey(d))) d.setDate(d.getDate() + 1);
    taken.add(dateKey(d));
    list.push({ name: dateKey(d) === dateKey(date) ? name : `${name} (substitute day)`, date: d });
  };
  for (const h of [...list]) taken.add(dateKey(h.date));
  place("New Year's Day", new Date(year, 0, 1));
  place("Christmas Day", new Date(year, 11, 25));
  const boxing = new Date(year, 11, 26);
  // Boxing Day moves to the next free weekday (so Christmas on a Saturday gives Monday 27 and Tuesday 28)
  place("Boxing Day", boxing);
  return list.map((h) => ({ name: h.name, date: dateKey(h.date) })).sort((a, b) => a.date.localeCompare(b.date));
}
