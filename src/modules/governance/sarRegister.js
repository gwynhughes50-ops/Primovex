// The SAR register's own logic, kept apart from the screens and the database so it can be tested: spotting a request that has probably been entered twice, how a completion date is checked,
// and the order the register is shown in. Pure: nothing here reads or writes anything.

const DONE = new Set(["completed", "archived"]);
export const isDone = (sar) => DONE.has(sar?.status);

const asDate = (value) => {
  if (!value) return null;
  const d = value?.toDate ? value.toDate() : value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};
const pad = (n) => String(n).padStart(2, "0");
// the calendar day as the practice sees it (the person's own day, not UTC), "yyyy-mm-dd"
export const localDay = (value) => { const d = asDate(value); return d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : ""; };
// a "yyyy-mm-dd" from a date box, as a date at midday that same day, so it never slips to the day before or after
export const dayAtNoon = (day) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || "")); return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0) : null; };

// ---- the same request entered twice ----
// An EMIS number is compared without spaces or case ("123 456" and "123456" are the same).
export const normaliseEmis = (value) => String(value ?? "").replace(/\s+/g, "").toUpperCase();

// Other SARs for the same EMIS number that were entered today, or that were received on the same day as this one. Not a block: two requests for one patient on one day can be genuine (the
// patient and a solicitor), so the person is told and says whether this is a different request. `rows` are the SARs already on the register.
export function findLikelyDuplicates(rows, { emisNumber = "", receivedDate = "", now = new Date(), excludeId = "" } = {}) {
  const emis = normaliseEmis(emisNumber);
  if (!emis) return [];
  const today = localDay(now);
  const out = [];
  for (const sar of rows || []) {
    if (!sar || sar.id === excludeId || normaliseEmis(sar.emisNumber) !== emis) continue;
    const enteredToday = localDay(sar.createdAt) === today;
    const sameReceived = Boolean(receivedDate) && localDay(sar.receivedDate) === String(receivedDate);
    if (!enteredToday && !sameReceived) continue;
    out.push({ id: sar.id, reference: sar.reference || "A SAR", enteredToday, sameReceived, requestedBy: sar.requestedBy || "", assignedToName: sar.assignedToName || "", createdByName: sar.createdByName || "" });
  }
  return out;
}

export function duplicateWords(match) {
  const when = match.enteredToday && match.sameReceived ? "was entered today and received on the same day" : match.enteredToday ? "was entered today" : "was received on the same day";
  return `${match.reference} for this EMIS number ${when}${match.createdByName ? ` (entered by ${match.createdByName})` : ""}.`;
}

// ---- the completion date ----
// What is wrong with a completion date typed on the form ("" when nothing is): a real day, not in the future, and not before the request was received. Blank is fine: it means not completed.
export function completionProblem({ completedDate = "", receivedDate = "", today = localDay(new Date()) } = {}) {
  if (!completedDate) return "";
  if (!dayAtNoon(completedDate)) return "The completion date is not a real date.";
  if (completedDate > today) return "The completion date cannot be in the future.";
  if (receivedDate && completedDate < receivedDate) return "The completion date cannot be before the date the request was received.";
  return "";
}

// ---- the order of the register ----
// "entered" is the order the register has always had (newest entry first). "due" and "completed" sort on those dates; "daysLeft" on the days remaining for a SAR still being dealt with (a late
// one has a negative number, so the most overdue comes first). A SAR with no value for the chosen sort (a completed one has no days left; an open one has no completion date) goes last, whichever way round.
export const SORT_KEYS = {
  entered: { label: "Date entered", asc: "Oldest first", desc: "Newest first" },
  due: { label: "Due date", asc: "Earliest due first", desc: "Latest due first" },
  daysLeft: { label: "Days left to complete", asc: "Fewest days left first (most urgent)", desc: "Most days left first" },
  completed: { label: "Completion date", asc: "Earliest completed first", desc: "Most recently completed first" },
};
export const DEFAULT_SORT = { key: "entered", dir: "desc" };

const dayNumber = (value) => { const d = asDate(value); return d ? Math.round(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86400000) : null; };

export function sortValue(sar, key, now = new Date()) {
  if (key === "entered") return asDate(sar.createdAt)?.getTime() ?? asDate(sar.receivedDate)?.getTime() ?? null;
  if (key === "due") return asDate(sar.dueDate || sar.due_date)?.getTime() ?? null;
  if (key === "completed") return asDate(sar.completedAt)?.getTime() ?? null;
  if (key === "daysLeft") {
    if (isDone(sar)) return null;
    const due = dayNumber(sar.dueDate || sar.due_date);
    return due === null ? null : due - dayNumber(now);
  }
  return null;
}

export function sortSars(rows, { key, dir } = DEFAULT_SORT, now = new Date()) {
  const sign = dir === "asc" ? 1 : -1;
  return (rows || [])
    .map((sar, index) => ({ sar, index, value: sortValue(sar, key, now) }))
    .sort((a, b) => {
      if (a.value === null && b.value === null) return a.index - b.index;
      if (a.value === null) return 1;
      if (b.value === null) return -1;
      return (a.value - b.value) * sign || a.index - b.index;
    })
    .map((x) => x.sar);
}

export const sortWords = ({ key, dir }) => `${SORT_KEYS[key]?.label || ""}: ${SORT_KEYS[key]?.[dir === "asc" ? "asc" : "desc"] || ""}`;
