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
// A shift that people on "only these shifts" work is theirs alone: nobody else is put on it (the morning desk, which is a short shift, would not show anyone else's full day).
export const onlyOwnersOf = (rules, shift) => (rules?.people || []).filter((p) => p.mode === "only" && (p.onlyShifts || []).includes(shift?.id));
export const mayTakeShift = (rules, person, shift) => { const owners = onlyOwnersOf(rules, shift); return !owners.length || owners.some((o) => o.uid === person?.uid); };
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

// ---- surgery closures ----
// The practice has a main surgery and a branch surgery. A closure is a surgery (or both) shut for a stretch of days (a bank holiday, a training afternoon, a burst pipe), with the same first-day and
// last-day times as an absence: blank means the whole day. The rota is built around it: a shift at a closed surgery is not staffed, and a shift that runs into a closure is cut to the open hours.
export const ROTA_SITES = { main: "Main surgery", branch: "Branch surgery" };
export const CLOSURE_SITES = { main: "Main surgery", branch: "Branch surgery", both: "Both surgeries" };
export const CLOSURE_REASONS = { bank: "Bank holiday", training: "Training or protected learning", building: "Building, power or other problem", other: "Other reason" };

// Which surgery a shift is at. A shift says so in the rules ("main" or "branch"); the Ty Elan shift is the branch's, and everything else the main surgery's, until the rules say otherwise.
export const siteOfShift = (shift) => (shift?.site === "main" || shift?.site === "branch" ? shift.site : shift?.id === "tyelan" ? "branch" : "main");

export const absenceProblem = ({ uid, from, to, fromTime = "", toTime = "", reason }) => {
  if (!uid || !from) return "Choose who is off and the first day.";
  if (to && to < from) return "The last day cannot be before the first day.";
  if ((fromTime && !CLOSURE_TIME.test(fromTime)) || (toTime && !CLOSURE_TIME.test(toTime))) return "Choose the times from the list.";
  if ((to || from) === from && fromTime && toTime && toTime <= fromTime) return "The time they are back must be after the time they go.";
  if (!["leave", "toil", "other"].includes(reason)) return "Choose a reason.";
  return "";
};

// What is wrong with a closure about to be saved ("" when nothing is): everything is picked from a list, so this only catches a combination that makes no sense.
const CLOSURE_TIME = /^[0-9]{2}:[0-9]{2}$/;
export const closureProblem = ({ site, from, to, fromTime = "", toTime = "", reason }) => {
  if (!CLOSURE_SITES[site]) return "Choose which surgery is closed.";
  if (!from) return "Choose the first day.";
  if (to && to < from) return "The last day cannot be before the first day.";
  if ((fromTime && !CLOSURE_TIME.test(fromTime)) || (toTime && !CLOSURE_TIME.test(toTime))) return "Choose the times from the list.";
  if ((to || from) === from && fromTime && toTime && toTime <= fromTime) return "The time it reopens must be after the time it closes.";
  if (!CLOSURE_REASONS[reason]) return "Choose a reason.";
  return "";
};

// A closure's stretches on this date as { site, from, until, reason } (minutes), one for each surgery it shuts. Sorted so the same closures always give the same answer.
export function dayClosures(closures, iso) {
  const out = [];
  for (const c of closures || []) {
    const last = c.to || c.from;
    if (!c.from || c.from > iso || iso > last) continue;
    const start = iso === c.from && c.fromTime ? toMinutes(c.fromTime) : 0;
    const end = iso === last && c.toTime ? toMinutes(c.toTime) : 1440;
    if (start === null || end === null || end <= start) continue;
    for (const site of c.site === "both" ? ["main", "branch"] : [c.site]) if (ROTA_SITES[site]) out.push({ from: start, reason: CLOSURE_REASONS[c.reason] ? c.reason : "other", site, until: end });
  }
  return out.sort((x, y) => x.site.localeCompare(y.site) || x.from - y.from || x.until - y.until);
}

// a short, stable text for a day's closures, to tell whether closures have changed since a week was built
export const closureSignature = (list) => (list || []).map((c) => `${c.site}|${c.from}|${c.until}|${c.reason}`).sort().join(";");

const mergedWindows = (list) => {
  const raw = list.map((c) => [c.from, c.until]).sort((x, y) => x[0] - y[0]);
  const merged = [];
  for (const w of raw) { const prev = merged[merged.length - 1]; if (prev && w[0] <= prev[1]) prev[1] = Math.max(prev[1], w[1]); else merged.push([...w]); }
  return merged;
};

// What a closure leaves of one shift: null when the surgery is shut for (nearly) all of it, {} when the shift is untouched, or { from, until } ("HH:MM", only the end that has moved) for the open part.
// A closure in the middle of a shift leaves two stretches: the longer one is kept.
export function openPartOf(dayClosed, shift) {
  const mine = (dayClosed || []).filter((c) => c.site === siteOfShift(shift));
  if (!mine.length) return {};
  const s = toMinutes(shift.start); const e = toMinutes(shift.end);
  let best = null; let cursor = s;
  for (const [ws, we] of mergedWindows(mine)) {
    if (ws > cursor) { const stretch = [cursor, Math.min(ws, e)]; if (stretch[1] > stretch[0] && (!best || stretch[1] - stretch[0] > best[1] - best[0])) best = stretch; }
    cursor = Math.max(cursor, we);
    if (cursor >= e) break;
  }
  if (cursor < e && (!best || e - cursor > best[1] - best[0])) best = [cursor, e];
  if (!best || best[1] - best[0] < MIN_PART_MINUTES) return null;
  return { ...(best[0] > s ? { from: hhmm(best[0]) } : {}), ...(best[1] < e ? { until: hhmm(best[1]) } : {}) };
}

// how a surgery's closure on a date reads: "all day", "from 12:30", "until 10:00" or "13:00–14:00"
export function closedText(dayClosed, site) {
  const wins = mergedWindows((dayClosed || []).filter((c) => c.site === site));
  if (!wins.length) return "";
  if (wins.length > 1) return wins.map(([a, b]) => `${hhmm(a)}–${b === 1440 ? "end" : hhmm(b)}`).join(", ");
  const [a, b] = wins[0];
  if (a === 0 && b === 1440) return "all day";
  if (a === 0) return `until ${hhmm(b)}`;
  if (b === 1440) return `from ${hhmm(a)}`;
  return `${hhmm(a)}–${hhmm(b)}`;
}
export const closedSites = (dayClosed) => [...new Set((dayClosed || []).map((c) => c.site))];

// What a day's closures did to the rota, one note for each surgery that is shut: "Monday: the branch surgery is closed all day (Bank holiday), so Ty Elan is not staffed."
export function closureNotes(rules, day, iso, dayClosed) {
  const out = [];
  for (const site of closedSites(dayClosed)) {
    const reasons = [...new Set(dayClosed.filter((c) => c.site === site).map((c) => CLOSURE_REASONS[c.reason]))].join(", ");
    const here = (rules?.shifts || []).filter((x) => (x.days || []).includes(day) && siteOfShift(x) === site);
    const shut = here.filter((x) => openPartOf(dayClosed, x) === null).map((x) => x.label);
    const cut = here.filter((x) => { const o = openPartOf(dayClosed, x); return o && (o.from || o.until); }).map((x) => x.label);
    const effect = [shut.length ? `${shut.join(", ")} ${shut.length === 1 ? "is" : "are"} not staffed` : "", cut.length ? `${cut.join(", ")} ${cut.length === 1 ? "is" : "are"} cut to the open hours` : ""].filter(Boolean).join("; ");
    out.push({ day, iso, severity: "note", text: `${DAY_LABELS[day]}: the ${ROTA_SITES[site].toLowerCase()} is closed ${closedText(dayClosed, site)} (${reasons})${effect ? `, so ${effect}` : ""}.` });
  }
  return out;
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
