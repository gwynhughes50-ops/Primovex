// A "this concern is overdue" or "this SAR is due soon" notification is written by the daily job while the case is open. Once the
// case has been dealt with, or the deadline it names has been met or moved, the notification is out of date, but nothing took it
// away, so it kept appearing (for example "acknowledgement due in 2 days" twelve days after it was due, for a case that had been
// acknowledged). These decide which of a person's notifications are out of date. Pure (no Firestore, no screens).

// the collection each kind of automated notification points at, and the statuses that mean it has been dealt with
export const DUE_SOURCES = {
  governance: { collection: "governance_concerns", done: ["closed", "archived"] },
  sar: { collection: "governance_sars", done: ["completed", "archived"] },
  laptop: { collection: "it_laptops", done: ["decommissioned"] },
};

const FINISHED = ["completed", "archived"];

// The daily job puts the deadline it is about at the end of each notification's id: "...-acknowledgement-20261022" for a concern, "...-20261022" for a SAR
const CONCERN_ID = /-(acknowledgement|early-resolution|final-response)-(\d{8}|nodate)$/;
const SAR_ID = /-(\d{8})$/;
const CONCERN_DEADLINE_FIELD = { acknowledgement: "acknowledgementDueAt", "early-resolution": "earlyResolutionDueAt", "final-response": "finalResponseDueAt" };

const toDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

// the calendar day a moment falls on in London, as YYYYMMDD (the same key the daily job uses)
export function londonDayKey(value) {
  const date = toDate(value);
  if (!date) return "nodate";
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get("year")}${get("month")}${get("day")}`;
}

// which deadline a notification is about: { label, key } for a concern ("acknowledgement" ...), { key } for a SAR, or null
export function deadlineOf(note) {
  const id = String(note?.id || "");
  if (note?.module === "governance") {
    const m = CONCERN_ID.exec(id);
    return m ? { label: m[1], key: m[2] } : null;
  }
  const m = SAR_ID.exec(id);
  return m ? { key: m[1] } : null;
}

// an automated due notification that has not been dealt with yet
export function isOpenDueNotification(note) {
  if (!note || note.automated !== true || !note.sourceId) return false;
  if (!DUE_SOURCES[note.module]) return false;
  return !FINISHED.includes(note.status || "open");
}

// the records to look at: [{ collection, id }], each once
export function sourcesToCheck(notes = []) {
  const seen = new Map();
  for (const note of notes) {
    if (!isOpenDueNotification(note)) continue;
    const collection = DUE_SOURCES[note.module].collection;
    seen.set(`${collection}/${note.sourceId}`, { collection, id: String(note.sourceId) });
  }
  return [...seen.values()];
}

// A laptop reminder ("laptop-update-soon-<id>-<uid>-20261120", "laptop-return-overdue-...") is out of date when the laptop is gone,
// or the update has been recorded or its date moved, or it has been returned or its return date moved, or someone else has it now.
function staleLaptopReason(note, status, data, now) {
  if (status === "gone" || status === "decommissioned") return "This laptop is no longer in use.";
  const m = /^laptop-(update|return)-(soon|overdue)-.*-(\d{8})$/.exec(String(note.id || ""));
  if (!m) return "";
  const [, what, , key] = m;
  if (note.kind === "due-soon" && key < londonDayKey(now)) return "The date has passed.";
  if (!data) return "";
  const onLoan = data.status === "on_loan" && data.loan;
  const holder = String((onLoan ? data.loan.borrowerUid : data.currentUserUid) || "");
  if (note.recipientUid && holder && holder !== note.recipientUid) return "This laptop is with someone else now.";
  if (note.recipientUid && !holder) return "This laptop is no longer with you.";
  if (what === "update") return String(data.nextUpdateDue || "").replace(/-/g, "") === key ? "" : "The update has been recorded or its date changed.";
  if (!onLoan) return "The laptop has been returned.";
  return String(data.loan.dueBackOn || "").replace(/-/g, "") === key ? "" : "The return date has been changed.";
}

// Why a notification is out of date, in words, or "" when it is still right.
// state is what was found about the case: a status word ("closed" | "gone" | an open status), or { status, data } with the case's own fields; missing = could not be read.
export function staleReason(note, state, now = new Date()) {
  if (!isOpenDueNotification(note)) return "";
  const source = DUE_SOURCES[note.module];
  const status = typeof state === "string" ? state : state?.status;
  const data = typeof state === "object" && state ? state.data : null;
  if (note.module === "laptop") return staleLaptopReason(note, status, data, now);
  if (status === "gone" || source.done.includes(status)) return source.collection === "governance_concerns" ? "The case has been closed." : "The request has been completed.";
  const deadline = deadlineOf(note);
  // "due soon" says the deadline is still ahead: once the day has passed it is untrue (the daily job writes a separate overdue notice if the case is still late)
  if (note.kind === "due-soon" && deadline && /^\d{8}$/.test(deadline.key) && deadline.key < londonDayKey(now)) return "The deadline has passed.";
  if (data && note.module === "governance" && deadline?.label) {
    if (deadline.label === "acknowledgement" && data.acknowledgedAt) return "The concern has been acknowledged.";
    if (deadline.label === "early-resolution" && status !== "early_resolution") return "The concern is no longer in early resolution.";
    if (deadline.label === "final-response" && data.finalResponseSentAt) return "The final response has been sent.";
    const field = CONCERN_DEADLINE_FIELD[deadline.label];
    if (field && /^\d{8}$/.test(deadline.key) && data[field] && londonDayKey(data[field]) !== deadline.key) return "The deadline has been changed.";
  }
  return "";
}

// [{ id, why }] for every notification that is out of date
export function staleNotifications(notes = [], states = {}, now = new Date()) {
  const out = [];
  for (const note of notes) {
    const source = DUE_SOURCES[note?.module];
    const why = staleReason(note, source ? states[`${source.collection}/${note.sourceId}`] : undefined, now);
    if (why) out.push({ id: note.id, why });
  }
  return out;
}

// just the ids
export const staleNotificationIds = (notes = [], states = {}, now = new Date()) => staleNotifications(notes, states, now).map((row) => row.id);

export const RETIRE_PATCH_NOTE = "The case has been closed.";
