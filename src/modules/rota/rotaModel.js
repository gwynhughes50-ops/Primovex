// The reception rota: what a shift, a person's rules and an absence look like, and the choices the rules page offers.
// Nothing here is typed freely: shifts, days, times and absence reasons are all picked from lists, and people are picked from the practice's real accounts.

export const DAYS = ["mon", "tue", "wed", "thu", "fri"];
export const DAY_LABELS = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday" };
export const DAY_SHORT = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri" };

// How a person takes part in the rota.
export const MODES = {
  pool: "Rotates through the shifts",
  fixed: "Always the same shift on the days they work",
  usual: "Has a usual shift, and covers other shifts when needed",
  only: "Only works particular shifts",
};

// Only "leave" or "off" is kept. Why someone is off sick is health information and the rota does not need it, so there is no "sickness" choice: sickness is entered as "Off (any other reason)".
export const ABSENCE_REASONS = { leave: "Annual leave", toil: "Time off in lieu (TOIL)", other: "Off (sickness or any other reason)" };

// "08:30" to minutes, so times can be compared.
export const toMinutes = (hhmm) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "")); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
export const timeLabel = (hhmm) => { const t = toMinutes(hhmm); if (t === null) return ""; const h = Math.floor(t / 60); const mm = t % 60; return mm ? `${h}.${String(mm).padStart(2, "0")}` : `${h}`; };
export const TIME_CHOICES = (() => { const out = []; for (let t = 6 * 60; t <= 21 * 60; t += 15) out.push(`${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`); return out; })();

// The shifts on the current reception rota. `group` is what the shift counters add together (Early 1 and Early 2 both count as Early). `essential` shifts must be covered every day:
// if they can't be, the rota says so instead of leaving a quiet gap. `priority` is the order the non-essential shifts are given up: the highest number goes first.
export const DEFAULT_SHIFTS = [
  { id: "early1", label: "Early 1", group: "early", start: "08:00", end: "16:30", essential: true, count: 1, days: DAYS },
  { id: "early2", label: "Early 2", group: "early", start: "08:00", end: "16:30", essential: true, count: 1, days: DAYS },
  { id: "mid", label: "Mid", group: "mid", start: "09:30", end: "18:00", essential: true, count: 1, days: DAYS },
  { id: "late", label: "Late", group: "late", start: "10:00", end: "18:30", essential: true, count: 1, days: DAYS },
  { id: "admin1", label: "Admin 1", group: "admin1", start: "09:00", end: "17:30", essential: true, count: 1, days: DAYS },
  { id: "admin2", label: "Admin 2", group: "admin2", start: "08:30", end: "17:00", essential: false, count: 1, days: DAYS, dropOrder: 2 },
  { id: "admin3", label: "Admin 3", group: "admin3", start: "08:30", end: "17:00", essential: false, count: 1, days: DAYS, dropOrder: 1 },
  { id: "desk", label: "Desk/phones", group: "desk", start: "08:30", end: "17:00", essential: false, count: 1, days: DAYS, dropOrder: 3 },
  { id: "desk2", label: "Desk/phones (morning)", group: "desk", start: "08:30", end: "10:00", essential: false, count: 2, days: DAYS, dropOrder: 4 },
  { id: "tyelan", label: "Ty Elan", group: "tyelan", start: "08:30", end: "17:00", essential: true, count: 1, days: DAYS },
];

// The shifts in the usual order of the reception rota (the order of DEFAULT_SHIFTS). A shift that is not one of the usual ones keeps its place relative to the others and goes after them.
export const inStandardOrder = (shifts = []) => {
  const rank = new Map(DEFAULT_SHIFTS.map((s, i) => [s.id, i]));
  return shifts.map((s, i) => ({ s, i })).sort((a, b) => ((rank.has(a.s.id) ? rank.get(a.s.id) : 1000 + a.i) - (rank.has(b.s.id) ? rank.get(b.s.id) : 1000 + b.i))).map((x) => x.s);
};

export const DEFAULT_SETTINGS = {
  avoidLateThenEarly: true, // not an early shift the morning after a late
  rollFridayLate: true, // the Friday late goes round the team in turn
};

export const emptyRules = () => ({ shifts: DEFAULT_SHIFTS.map((s) => ({ ...s })), people: [], settings: { ...DEFAULT_SETTINGS } });

// A person's rules, with sensible blanks. `uid` and `name` come from the staff list.
export const newPerson = (uid, name) => ({
  uid, name,
  days: [...DAYS], // days they work
  mode: "pool",
  shift: "", // the shift for "fixed" and "usual"
  onlyShifts: [], // for "only"
  coverShifts: [], // for "usual": what they can step in on
  cannotDo: [], // shifts they never do
  earliest: {}, // per day: "09:00" means they cannot start before 9
  latest: {}, // per day: "18:30" means they must finish by 6.30
  maxPerWeek: {}, // per shift group: { late: 1 }
  dayRules: {}, // per day: { shift: "early2", until: "12:00" } means that day they do that shift, until that time
});

// The people whose rules put them on this shift (fixed, usual, or "only these shifts") and who work on this day. An empty place on a shift like that is only worth a note when someone who
// should have been on it is not: the morning desk, for instance, is not "not staffed" on a day neither part-timer is due in.
export const ownersOnDay = (rules, shift, day) => (rules?.people || []).filter((p) => (p.days || []).includes(day) && (((p.mode === "fixed" || p.mode === "usual") && p.shift === shift.id) || (p.mode === "only" && (p.onlyShifts || []).includes(shift.id))));
export const isOwned = (rules, shift) => (rules?.people || []).some((p) => ((p.mode === "fixed" || p.mode === "usual") && p.shift === shift.id) || (p.mode === "only" && (p.onlyShifts || []).includes(shift.id)));
export const shiftById = (rules, id) => (rules?.shifts || []).find((s) => s.id === id) || null;
// A day rule names one shift ("early2") or any shift of a kind ("group:early", which is Early 1 or Early 2). These give the shifts a rule can mean.
export const GROUP_PREFIX = "group:";
export const ruleShiftsOf = (rules, spec) => (String(spec || "").startsWith(GROUP_PREFIX) ? (rules?.shifts || []).filter((s) => s.group === String(spec).slice(GROUP_PREFIX.length)) : [shiftById(rules, spec)].filter(Boolean));
export const ruleCoversShift = (spec, shift) => Boolean(spec && shift) && (spec === shift.id || spec === `${GROUP_PREFIX}${shift.group}`);
export const groupsOf = (rules) => [...new Set((rules?.shifts || []).map((s) => s.group))];
// The name of a group of shifts, for the counters. Early 1 and Early 2 are one group, "Early"; Admin 1, Admin 2 and Admin 3 are each their own, so keep their numbers.
export const groupLabel = (rules, group) => {
  const inGroup = (rules?.shifts || []).filter((s) => s.group === group);
  if (!inGroup.length) return group;
  const label = inGroup[0].label.replace(/ \(.*\)$/, "");
  return inGroup.length > 1 ? label.replace(/ \d$/, "") : label;
};

// ---- dates (Monday-based weeks, in the practice's own calendar days) ----
const pad = (n) => String(n).padStart(2, "0");
export const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const dateOf = (iso) => { const [y, m, d] = String(iso).split("-").map(Number); return new Date(y, m - 1, d, 12, 0, 0); };
export const addDays = (iso, n) => { const d = dateOf(iso); d.setDate(d.getDate() + n); return isoOf(d); };
export const mondayOf = (isoOrDate) => { const d = typeof isoOrDate === "string" ? dateOf(isoOrDate) : new Date(isoOrDate.getTime()); const back = (d.getDay() + 6) % 7; d.setDate(d.getDate() - back); d.setHours(12, 0, 0, 0); return isoOf(d); };
export const weekDates = (mondayIso) => DAYS.map((day, i) => ({ day, iso: addDays(mondayIso, i) }));
export const weekLabel = (mondayIso) => dateOf(mondayIso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

// ---- time off, to the minute ----
// An absence runs from a first day (and a time, blank means from the start of the day) to a last day (and a time, blank means to the end of the day). Anything in between is off all day.
// So "Kim off from Monday 14:00 to Wednesday 10:00" is: Monday from 2pm, all of Tuesday, Wednesday until 10. A single day with a start time is "finishes early"; with an end time, "starts late".
export const MIN_PART_MINUTES = 60; // someone who is in for less than an hour of a day is treated as off that day
export const hhmm = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

// the stretches of this date when the person is off, as [from, to] minutes, merged
export function offWindows(absences, uid, iso) {
  const raw = [];
  for (const a of absences || []) {
    const last = a.to || a.from;
    if (a.uid !== uid || a.from > iso || iso > last) continue;
    const start = iso === a.from && a.fromTime ? toMinutes(a.fromTime) : 0;
    const end = iso === last && a.toTime ? toMinutes(a.toTime) : 1440;
    if (start === null || end === null || end <= start) continue;
    raw.push([start, end]);
  }
  raw.sort((x, y) => x[0] - y[0]);
  const merged = [];
  for (const w of raw) { const prev = merged[merged.length - 1]; if (prev && w[0] <= prev[1]) prev[1] = Math.max(prev[1], w[1]); else merged.push([...w]); }
  return merged;
}

// When the person is in on this date: { from, until } in minutes (the longest stretch they are not off), or null when they are off for the day or in for less than an hour.
export function availabilityOn(absences, uid, iso) {
  const off = offWindows(absences, uid, iso);
  if (!off.length) return { from: 0, until: 1440 };
  const free = [];
  let cursor = 0;
  for (const [s, e] of off) { if (s > cursor) free.push([cursor, s]); cursor = Math.max(cursor, e); }
  if (cursor < 1440) free.push([cursor, 1440]);
  free.sort((x, y) => (y[1] - y[0]) - (x[1] - x[0]));
  const best = free[0];
  return best && best[1] - best[0] >= MIN_PART_MINUTES ? { from: best[0], until: best[1] } : null;
}

const shiftSpan = (shift) => [toMinutes(shift.start), toMinutes(shift.end)];
export const fitsWhole = (avail, shift) => { const [s, e] = shiftSpan(shift); return Boolean(avail) && avail.from <= s && e <= avail.until; };
export const overlapMinutes = (avail, shift) => { const [s, e] = shiftSpan(shift); return avail ? Math.max(0, Math.min(e, avail.until) - Math.max(s, avail.from)) : 0; };
// the times to put on a place when someone is in for only part of the shift: { from, until } as "HH:MM", or null where the shift is whole
export function partTimes(avail, shift) {
  const [s, e] = shiftSpan(shift);
  return { from: avail && avail.from > s ? hhmm(avail.from) : null, until: avail && avail.until < e ? hhmm(avail.until) : null };
}
// how a person's time off on a date reads: "" (not off), "all day", "from 14:00", "until 10:00" or "10:00–13:00"
export function offText(absences, uid, iso) {
  const off = offWindows(absences, uid, iso);
  if (!off.length) return "";
  if (off.length > 1) return off.map(([s, e]) => `${hhmm(s)}–${e === 1440 ? "end" : hhmm(e)}`).join(", ");
  const [s, e] = off[0];
  if (s === 0 && e === 1440) return "all day";
  if (s === 0) return `until ${hhmm(e)}`;
  if (e === 1440) return `from ${hhmm(s)}`;
  return `${hhmm(s)}–${hhmm(e)}`;
}

// Is this person off, for the whole of this date? (Part days are handled by availabilityOn.)
export const absentOn = (absences, uid, iso) => (absences || []).find((a) => a.uid === uid && a.from <= iso && iso <= (a.to || a.from)) || null;

// ---- checking what has been entered on the rules page ----
export function checkRules(rules) {
  const problems = [];
  const shifts = rules?.shifts || [];
  const ids = new Set();
  for (const s of shifts) {
    if (!s.id || ids.has(s.id)) problems.push(`Two shifts share the same name: ${s.label || s.id}.`);
    ids.add(s.id);
    if (toMinutes(s.start) === null || toMinutes(s.end) === null || toMinutes(s.end) <= toMinutes(s.start)) problems.push(`${s.label}: the finish must be after the start.`);
    if (!(Number(s.count) >= 1)) problems.push(`${s.label}: how many people is missing.`);
    if (!(s.days || []).length) problems.push(`${s.label} does not run on any day.`);
  }
  const seen = new Set();
  for (const p of rules?.people || []) {
    if (seen.has(p.uid)) problems.push(`${p.name} is on the rota twice.`);
    seen.add(p.uid);
    if (!(p.days || []).length) problems.push(`${p.name} has no working days.`);
    if ((p.mode === "fixed" || p.mode === "usual") && !shiftById(rules, p.shift)) problems.push(`${p.name}: choose their ${p.mode === "fixed" ? "fixed" : "usual"} shift.`);
    if (p.mode === "only" && !(p.onlyShifts || []).length) problems.push(`${p.name}: choose which shifts they work.`);
    for (const d of DAYS) {
      const e = p.earliest?.[d]; const l = p.latest?.[d];
      if (e && l && toMinutes(l) <= toMinutes(e)) problems.push(`${p.name} on ${DAY_LABELS[d]}: the latest finish must be after the earliest start.`);
      const dr = p.dayRules?.[d];
      if (dr && !ruleShiftsOf(rules, dr.shift).length) problems.push(`${p.name} on ${DAY_LABELS[d]}: choose the shift.`);
    }
  }
  return problems;
}
