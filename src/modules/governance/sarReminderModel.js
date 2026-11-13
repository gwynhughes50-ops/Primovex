// The reminder bell on a SAR, without anything that talks to the server: what a row of "SARs to chase" says,
// what colour the bell is, and what the person is told before they press Send. Kept plain so it can be tested.

// "overdue by 2 days", "due today", "due tomorrow", "due in 5 days"
export function dueWords(daysLeft) {
  if (daysLeft === null || daysLeft === undefined) return "no due date";
  if (daysLeft < 0) return `overdue by ${-daysLeft} day${daysLeft === -1 ? "" : "s"}`;
  if (daysLeft === 0) return "due today";
  if (daysLeft === 1) return "due tomorrow";
  return `due in ${daysLeft} days`;
}

// red when overdue, amber from a week before the due date, plain otherwise
export function bellTone(daysLeft) {
  if (daysLeft === null || daysLeft === undefined) return "plain";
  if (daysLeft < 0) return "late";
  if (daysLeft <= 7) return "soon";
  return "plain";
}

export const BELL_STYLE = {
  late: "border-rose-400/60 bg-rose-500/15 text-rose-500 hover:bg-rose-500/25",
  soon: "border-amber-400/60 bg-amber-400/20 text-amber-600 hover:bg-amber-400/30",
  plain: "border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] text-[var(--medtrak-muted)] hover:bg-[var(--medtrak-accent)]/10",
};

const two = (n) => String(n).padStart(2, "0");
function shortWhen(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  return `${two(d.getDate())}/${two(d.getMonth() + 1)} at ${two(d.getHours())}:${two(d.getMinutes())}`;
}

// "Last reminder: Lee Manager, 12/11 at 09:30 (2 sent)" or ""
export function lastReminderText(row) {
  if (!row?.lastReminderAt) return "";
  const who = row.lastReminderByName ? `${row.lastReminderByName}, ` : "";
  const count = row.reminderCount > 1 ? ` (${row.reminderCount} sent)` : "";
  return `Last reminder: ${who}${shortWhen(row.lastReminderAt)}${count}`;
}

// What the bell's label says, for hover and for a screen reader.
export function bellLabel(row) {
  if (!row) return "";
  if (row.remindedToday) return `A reminder was already sent today${row.lastReminderByName ? ` by ${row.lastReminderByName}` : ""}`;
  return `Send ${row.assignedToName || "the person it is assigned to"} a reminder: ${row.reference} is ${dueWords(row.daysLeft)}`;
}

// The question before sending. The wording the person receives is fixed on the server; this tells the sender what will go.
export function confirmText(row) {
  const who = row?.assignedToName || "the person it is assigned to";
  return `${who} will be told that ${row?.reference || "this SAR"} is ${dueWords(row?.daysLeft)} and needs prioritising, and that the reminder is from you.`;
}
