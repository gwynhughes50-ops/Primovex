import assert from "node:assert/strict";
import { QUICK_REPLIES, SNOOZE_CHOICES, isPersonMessage, messageQueue, senderOf, validateReply, whenLabel } from "../src/messaging/messageCard.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const now = new Date("2026-10-10T14:00:00");
const at = (iso) => new Date(iso);
const msg = (id, over = {}) => ({ id, kind: "team-message", createdByUid: "ben", createdByName: "Ben Jones", automated: false, read: false, createdAt: at("2026-10-10T09:00:00"), ...over });

t("only a person writing to a person counts as a message", () => {
  assert.ok(isPersonMessage(msg("a")));
  assert.ok(isPersonMessage(msg("a", { kind: "staff-message" })));
  assert.ok(isPersonMessage(msg("a", { kind: "message-reply" })));
  assert.ok(!isPersonMessage(msg("a", { kind: "overdue", automated: true })));
  assert.ok(!isPersonMessage(msg("a", { kind: "kit-reminder" })));
  assert.ok(!isPersonMessage(msg("a", { createdByUid: "" })));
  assert.ok(!isPersonMessage(msg("a", { automated: true })));
  assert.ok(!isPersonMessage(null));
});

t("the card shows unread, un-snoozed messages, oldest first", () => {
  const rows = [
    msg("late", { createdAt: at("2026-10-10T13:00:00") }),
    msg("early", { createdAt: at("2026-10-10T08:00:00") }),
    msg("read", { read: true }),
    msg("alert", { kind: "overdue", automated: true }),
    msg("done", { status: "completed" }),
    msg("snoozed", { snoozedUntil: at("2026-10-10T16:00:00") }),
    msg("woke", { snoozedUntil: at("2026-10-10T12:00:00"), createdAt: at("2026-10-10T10:00:00") }),
  ];
  assert.deepEqual(messageQueue(rows, { now }).map((m) => m.id), ["early", "woke", "late"]);
});

t("putting one aside for now hides it for the session only; 'my messages' shows everything unread, newest first", () => {
  const rows = [msg("a", { createdAt: at("2026-10-10T08:00:00") }), msg("b", { createdAt: at("2026-10-10T09:00:00") }), msg("s", { createdAt: at("2026-10-10T10:00:00"), snoozedUntil: at("2026-10-11T09:00:00") })];
  assert.deepEqual(messageQueue(rows, { now, hidden: new Set(["a"]) }).map((m) => m.id), ["b"]);
  assert.deepEqual(messageQueue(rows, { now, hidden: new Set(["a"]), everything: true }).map((m) => m.id), ["s", "b", "a"]);
});

t("firestore timestamps and plain dates both work", () => {
  const stamp = { toDate: () => at("2026-10-10T09:00:00") };
  assert.equal(messageQueue([msg("a", { createdAt: stamp, snoozedUntil: { toDate: () => at("2026-10-10T20:00:00") } })], { now }).length, 0);
  assert.equal(messageQueue([msg("a", { createdAt: stamp })], { now }).length, 1);
});

t("the sender and when it was sent read naturally", () => {
  assert.equal(senderOf(msg("a")), "Ben Jones");
  assert.equal(senderOf({ createdByName: "  " }), "A colleague");
  assert.equal(whenLabel(at("2026-10-10T13:58:30"), now), "2 min ago");
  assert.equal(whenLabel(at("2026-10-10T13:59:50"), now), "just now");
  assert.equal(whenLabel(at("2026-10-10T09:05:00"), now), "today at 09:05");
  assert.equal(whenLabel(at("2026-10-09T16:30:00"), now), "yesterday at 16:30");
  assert.equal(whenLabel(at("2026-10-05T10:00:00"), now), "Monday 5 October at 10:00");
  assert.equal(whenLabel(null, now), "");
});

t("a typed reply is checked the way the server checks it", () => {
  assert.deepEqual(validateReply("  Thanks,   I'll check after lunch "), { ok: true, text: "Thanks, I'll check after lunch" });
  assert.equal(validateReply("   ").ok, false);
  assert.equal(validateReply("x".repeat(301)).ok, false);
  for (const s of ["ring 07700 900123", "NHS 943 476 5919", "email me@example.org", "born 03/04/1975", "EMIS 1234567"]) assert.equal(validateReply(s).ok, false, s);
  assert.equal(validateReply("Box 3 is missing 2 ampoules").ok, true);
});

t("the quick replies and snooze choices are the ones the server and the app know", () => {
  assert.deepEqual(QUICK_REPLIES.map((q) => q.key), ["done", "on_it", "will_do", "thanks", "cant_today"]);
  assert.deepEqual(SNOOZE_CHOICES.map((s) => s.option), ["one_hour", "later_today", "tomorrow"]);
});

console.log(`\n${n} passed`);
