// The dates and the history on the printed concern summary. Pure (no Firestore, no screens) so it can be tested.
//
// A case keeps its key dates as fields (acknowledged, listening discussion offered/completed, closed ...) and also writes a line to the
// case history every time something happens. Older cases, and cases moved on by choosing a later stage, can have the history line without the
// field, so a date missing from the case is looked for in the history before the print says it was not recorded.

const toDate = (value) => {
  if (!value) return null;
  if (value?.toDate) return value.toDate();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const pad = (n) => String(n).padStart(2, "0");
export const ukDate = (date) => (date ? `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}` : "");
export const ukDateTime = (date) => (date ? `${ukDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}` : "");

const time = (event) => toDate(event?.createdAt)?.getTime() || 0;
const sorted = (timeline) => [...(timeline || [])].sort((a, b) => time(a) - time(b));
const text = (event) => `${event?.title || ""} ${event?.message || ""}`.toLowerCase();

// the earliest history line of a kind (and, when `has` is given, whose words include it)
function firstEvent(timeline, type, has = "") {
  return sorted(timeline).find((e) => e.type === type && (!has || text(e).includes(has))) || null;
}

// One date: from the case when it has it, otherwise from the history ("(from the case history)"), otherwise nothing
function pick(field, event) {
  const own = toDate(field);
  if (own) return { date: own, from: "case" };
  const found = toDate(event?.createdAt);
  return found ? { date: found, from: "history" } : { date: null, from: "" };
}

// The key dates in the order the case goes through them: [{ label, text }]. `timeline` is null when it could not be loaded.
export function keyDates(concern = {}, timeline = []) {
  const closed = concern.status === "closed" || concern.status === "archived" || Boolean(concern.closedAt);
  const list = timeline || [];
  const rows = [
    { label: "Received", ...pick(concern.receivedAt, null), always: true },
    { label: "Acknowledgement due", date: toDate(concern.acknowledgementDueAt), from: "case", due: true },
    { label: "Acknowledged", ...pick(concern.acknowledgedAt, firstEvent(list, "acknowledged")), always: true },
    { label: "Listening discussion offered", ...pick(concern.listeningDiscussionOfferedAt, firstEvent(list, "listening", "offered")), always: true },
    { label: "Listening discussion completed", ...pick(concern.listeningDiscussionCompletedAt, firstEvent(list, "listening", "completed")), always: true },
    { label: "Early resolution due", date: toDate(concern.earlyResolutionDueAt), from: "case", due: true },
    { label: "Final response due", date: toDate(concern.finalResponseDueAt), from: "case", due: true },
    { label: "Final response letter ready", ...pick(concern.finalResponseReadyAt, firstEvent(list, "response_ready")), always: false },
    { label: "Final response sent", ...pick(concern.finalResponseSentAt, null), always: false },
    { label: "Closed", ...pick(concern.closedAt, closed ? firstEvent(list, "closed") : null), always: closed },
  ];
  return rows
    .filter((r) => r.date || r.always || r.due)
    .map((r) => ({
      label: r.label,
      text: r.date ? `${ukDate(r.date)}${r.from === "history" ? " (from the case history)" : ""}` : r.due ? "" : "Not recorded",
    }));
}

// The whole history, oldest first: [{ when, who, title, message }]
export function historyRows(timeline = []) {
  return sorted(timeline).filter((e) => e.type !== "audit").map((e) => ({ // the detailed audit lines have their own table (concernAudit.js)
    when: ukDateTime(toDate(e.createdAt)),
    who: e.actorName && e.actorName !== "Unknown" ? e.actorName : "Not recorded",
    title: e.title || "",
    message: e.message || "",
  }));
}
