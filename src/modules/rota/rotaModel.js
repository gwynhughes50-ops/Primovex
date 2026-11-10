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
export const ABSENCE_REASONS = { leave: "Annual leave", other: "Off (sickness or any other reason)" };

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
  { id: "tyelan", label: "Ty Elan", group: "tyelan", start: "08:30", end: "17:00", essential: true, count: 1, days: DAYS },
  { id: "admin2", label: "Admin 2", group: "admin2", start: "08:30", end: "17:00", essential: false, count: 1, days: DAYS, dropOrder: 2 },
  { id: "desk", label: "Desk/phones", group: "desk", start: "08:30", end: "17:00", essential: false, count: 1, days: DAYS, dropOrder: 3 },
  { id: "desk2", label: "Desk/phones (morning)", group: "desk", start: "08:30", end: "10:00", essential: false, count: 2, days: DAYS, dropOrder: 4 },
  { id: "admin3", label: "Admin 3", group: "admin3", start: "08:30", end: "17:00", essential: false, count: 1, days: DAYS, dropOrder: 1 },
];

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

export const shiftById = (rules, id) => (rules?.shifts || []).find((s) => s.id === id) || null;
export const groupsOf = (rules) => [...new Set((rules?.shifts || []).map((s) => s.group))];
export const groupLabel = (rules, group) => { const first = (rules?.shifts || []).find((s) => s.group === group); return first ? first.label.replace(/ \d$/, "").replace(/ \(.*\)$/, "") : group; };

// ---- dates (Monday-based weeks, in the practice's own calendar days) ----
const pad = (n) => String(n).padStart(2, "0");
export const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const dateOf = (iso) => { const [y, m, d] = String(iso).split("-").map(Number); return new Date(y, m - 1, d, 12, 0, 0); };
export const addDays = (iso, n) => { const d = dateOf(iso); d.setDate(d.getDate() + n); return isoOf(d); };
export const mondayOf = (isoOrDate) => { const d = typeof isoOrDate === "string" ? dateOf(isoOrDate) : new Date(isoOrDate.getTime()); const back = (d.getDay() + 6) % 7; d.setDate(d.getDate() - back); d.setHours(12, 0, 0, 0); return isoOf(d); };
export const weekDates = (mondayIso) => DAYS.map((day, i) => ({ day, iso: addDays(mondayIso, i) }));
export const weekLabel = (mondayIso) => dateOf(mondayIso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

// Is this person off on this date?
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
      if (dr && !shiftById(rules, dr.shift)) problems.push(`${p.name} on ${DAY_LABELS[d]}: choose the shift.`);
    }
  }
  return problems;
}
