// The staff training matrix: who has done which course, when it was done, when it runs out, and the traffic light for each.
// Pure (no Firestore, no screens), so it can be tested and used by the page, the phone, the reminders and the inspection pack.
//
//   course:  { id, name, group, intervalMonths (0 = once only), mode }
//   person:  { id, name, jobRole, group, uid (the Primovex account, if any), active }
//   record:  { personId, courseId, completedOn: "YYYY-MM-DD", dueOn: "YYYY-MM-DD" | "", status: "" | "not-required" | "on-leave" }

export const STATUS = {
  inDate: "in-date",
  dueSoon: "due-soon",
  overdue: "overdue",
  notRequired: "not-required",
  onLeave: "on-leave",
  none: "not-recorded",
};

export const STATUS_LABEL = {
  [STATUS.inDate]: "In date",
  [STATUS.dueSoon]: "Due soon",
  [STATUS.overdue]: "Overdue",
  [STATUS.notRequired]: "Not required",
  [STATUS.onLeave]: "Away (sick or maternity)",
  [STATUS.none]: "Not recorded",
};

// the traffic-light words for each status
export const LIGHT = { [STATUS.inDate]: "green", [STATUS.dueSoon]: "amber", [STATUS.overdue]: "red", [STATUS.notRequired]: "blue", [STATUS.onLeave]: "purple", [STATUS.none]: "grey" };

export const DUE_SOON_DAYS = 60;
export const GROUPS = [
  { key: "clinical", label: "Clinical (GPs, nurses, HCAs, other clinicians)" },
  { key: "admin", label: "Admin and management" },
  { key: "support", label: "Support (caretaker, cleaning)" },
];

const DAY = 86400000;
const pad = (n) => String(n).padStart(2, "0");

export const dateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export const parseKey = (key) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ""));
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(date.getTime()) || date.getMonth() !== Number(m[2]) - 1 ? null : date;
};

// a date plus whole months, keeping to the end of a short month (31 Jan + 1 month = 28/29 Feb)
export function addMonths(key, months) {
  const date = parseKey(key);
  if (!date) return "";
  const day = date.getDate();
  const target = new Date(date.getFullYear(), date.getMonth() + Number(months || 0), 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, last));
  return dateKey(target);
}

// Excel stores a date as the number of days since 30 December 1899. Only sensible years are accepted.
export function fromExcelSerial(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 36526 || n > 54788) return ""; // 2000 to 2049
  const date = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * DAY);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

// when a record runs out: the date given, else the completed date plus the course's interval; "" for once-only or unknown
export function dueOf(record, course) {
  if (!record) return "";
  if (parseKey(record.dueOn)) return record.dueOn;
  const months = Number(course?.intervalMonths) || 0;
  if (record.completedOn && months > 0) return addMonths(record.completedOn, months);
  return "";
}

export function daysUntil(key, now = new Date()) {
  const date = parseKey(key);
  if (!date) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((date.getTime() - today.getTime()) / DAY);
}

// The traffic light for one person and one course.
export function statusOf(record, course, now = new Date()) {
  if (record?.status === STATUS.notRequired) return STATUS.notRequired;
  if (record?.status === STATUS.onLeave) return STATUS.onLeave;
  if (!record || (!record.completedOn && !record.dueOn)) return STATUS.none;
  const due = dueOf(record, course);
  if (!due) return STATUS.inDate; // done, and it does not expire
  const days = daysUntil(due, now);
  if (days === null) return STATUS.inDate;
  if (days < 0) return STATUS.overdue;
  return days <= DUE_SOON_DAYS ? STATUS.dueSoon : STATUS.inDate;
}

export const recordKey = (personId, courseId) => `${personId}_${courseId}`;

// every person with every course: { person, cells: [{ course, record, status, due, days }] }
export function buildMatrix({ people = [], courses = [], records = [], now = new Date() }) {
  const byKey = new Map(records.map((r) => [recordKey(r.personId, r.courseId), r]));
  return people.map((person) => ({
    person,
    cells: courses.map((course) => {
      const record = byKey.get(recordKey(person.id, course.id)) || null;
      const status = statusOf(record, course, now);
      const due = dueOf(record, course);
      return { course, record, status, due, days: due ? daysUntil(due, now) : null };
    }),
  }));
}

// counts of each status over some cells
export function tally(cells) {
  const count = Object.fromEntries(Object.values(STATUS).map((s) => [s, 0]));
  for (const cell of cells) count[cell.status] += 1;
  const dated = count[STATUS.inDate] + count[STATUS.dueSoon] + count[STATUS.overdue];
  return { ...count, dated, percentInDate: dated ? Math.round(((count[STATUS.inDate] + count[STATUS.dueSoon]) / dated) * 100) : 100 };
}

// the people and courses a filter shows
export function filterMatrix(matrix, { group = "", search = "", onlyProblems = false } = {}) {
  const words = String(search || "").toLowerCase().split(/\s+/).filter(Boolean);
  return matrix.filter((row) => {
    if (group && row.person.group !== group) return false;
    if (words.length && !words.every((w) => `${row.person.name} ${row.person.jobRole}`.toLowerCase().includes(w))) return false;
    if (onlyProblems && !row.cells.some((c) => c.status === STATUS.overdue || c.status === STATUS.dueSoon)) return false;
    return true;
  });
}

// What needs saying to whom. Only dated records count (a blank is a gap to fill, not something that has expired).
//   kind "overdue": past its date; "due-soon": within the window. Sorted soonest first.
export function reminderItems({ people = [], courses = [], records = [], now = new Date() }) {
  const items = [];
  for (const row of buildMatrix({ people: people.filter((p) => p.active !== false), courses, records, now })) {
    for (const cell of row.cells) {
      if (cell.status !== STATUS.overdue && cell.status !== STATUS.dueSoon) continue;
      items.push({ personId: row.person.id, uid: row.person.uid || "", personName: row.person.name, group: row.person.group, courseId: cell.course.id, courseName: cell.course.name, due: cell.due, days: cell.days, kind: cell.status });
    }
  }
  return items.sort((a, b) => a.days - b.days || a.personName.localeCompare(b.personName));
}

// per course counts for the inspection pack: no names
export function courseSummary({ people = [], courses = [], records = [], now = new Date() }) {
  const matrix = buildMatrix({ people: people.filter((p) => p.active !== false), courses, records, now });
  return courses.map((course, index) => ({ course, ...tally(matrix.map((row) => row.cells[index])) }));
}
