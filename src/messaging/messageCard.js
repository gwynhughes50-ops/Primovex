// The message card: what counts as a message from a colleague, which ones are waiting for this person, and
// what a reply may say. Pure, so it can be tested. Alerts and reminders from the system keep the small
// corner pop-up; this card is only for "a person wrote to you".

export const PERSON_KINDS = ["team-message", "staff-message", "message-reply"];

// Fixed phrases the server also knows (functions/services/messageReplyService.js QUICK_REPLIES).
export const QUICK_REPLIES = [
  { key: "done", label: "Done" },
  { key: "on_it", label: "On it" },
  { key: "will_do", label: "Will do" },
  { key: "thanks", label: "Thanks" },
  { key: "cant_today", label: "Can't today" },
];

// Option names understood by getSnoozeDate in notificationCentreService.
export const SNOOZE_CHOICES = [
  { option: "one_hour", label: "1 hour" },
  { option: "later_today", label: "Later today" },
  { option: "tomorrow", label: "Tomorrow morning" },
];

export const REPLY_MAX = 300;

const toDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export function isPersonMessage(note) {
  return Boolean(note && PERSON_KINDS.includes(note.kind) && note.createdByUid && note.automated !== true);
}

const isSnoozedNow = (note, now) => { const until = toDate(note.snoozedUntil || note.snoozed_until); return Boolean(until && until > now); };
const createdMs = (note) => toDate(note.createdAt)?.getTime() || 0;

// The messages waiting for this person.
//   default: unread, not snoozed, and not put aside this session (oldest first, so they are read in order)
//   everything: also the snoozed and put-aside ones (newest first), for "my messages"
export function messageQueue(rows = [], { now = new Date(), hidden = new Set(), everything = false } = {}) {
  const waiting = rows
    .filter((note) => isPersonMessage(note) && note.read !== true && note.status !== "completed")
    .filter((note) => everything || (!isSnoozedNow(note, now) && !hidden.has(note.id)));
  return waiting.sort((a, b) => (everything ? createdMs(b) - createdMs(a) : createdMs(a) - createdMs(b)));
}

export const senderOf = (note) => String(note?.createdByName || "A colleague").trim() || "A colleague";

export function whenLabel(createdAt, now = new Date()) {
  const date = toDate(createdAt);
  if (!date) return "";
  const minutes = Math.round((now - date) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const days = Math.round((new Date(now).setHours(0, 0, 0, 0) - new Date(date).setHours(0, 0, 0, 0)) / 86400000);
  if (days === 0) return `today at ${time}`;
  if (days === 1) return `yesterday at ${time}`;
  return `${date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} at ${time}`;
}

// Same rule the server applies, so a reply that would be refused is caught before it is sent.
const IDENTIFYING = /[^\s@]+@[^\s@]+\.[^\s@]+|\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b|(?:\+44|\b0)[\d\s()-]{9,}\d|\b\d{3}[\s-]?\d{3}[\s-]?\d{4}\b|\b\d{6,}\b/;
export function validateReply(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return { ok: false, error: "Write your reply first." };
  if (clean.length > REPLY_MAX) return { ok: false, error: `Keep it to ${REPLY_MAX} characters.` };
  if (IDENTIFYING.test(clean)) return { ok: false, error: "Please take out any numbers, dates, email addresses or phone numbers. Don't put patient details in a reply." };
  return { ok: true, text: clean };
}
