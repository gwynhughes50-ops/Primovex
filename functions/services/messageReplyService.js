const { FieldValue } = require("firebase-admin/firestore");
const { HttpsError } = require("firebase-functions/v2/https");
const { scrubQuestion, countRequest } = require("./orbRouterService");

// A reply to a message from a colleague, sent from the message card. Built on the server because clients
// can never create notifications. The person replied to is read from the message itself (never from the
// request), so a reply can only go back to whoever sent that message to this person.
//
// Safeguards: a short text with no numbers, dates, emails or phone numbers (so a patient identifier can't
// be sent by mistake); quick replies are fixed phrases; a limit per person; audited without the words.

const TEXT_MAX = 300;
const HOURLY_LIMIT = 30;
const DAILY_LIMIT = 200;
// The notifications that are a person writing to a person.
const PERSON_KINDS = ["team-message", "staff-message", "message-reply"];
const QUICK_REPLIES = {
  done: "Done",
  on_it: "On it",
  will_do: "Will do",
  thanks: "Thanks",
  understood: "OK, understood",
  cant_today: "Can't do that today",
};

const tidy = (value, max) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

function buildReplyNotification({ callerUid, callerName, text, toUid, replyToNotificationId }) {
  return {
    recipientUid: toUid,
    module: "inventory",
    kind: "message-reply",
    title: `${callerName || "A colleague"} replied`,
    message: text,
    priority: "high",
    read: false,
    status: "open",
    actionUrl: "/notifications",
    automated: false,
    createdByUid: callerUid,
    createdByName: callerName || "A colleague",
    replyToNotificationId,
  };
}

async function replyToMessage({ db, callerUid, callerName, data = {}, now = new Date() }) {
  const notificationId = tidy(data.notificationId, 128);
  if (!notificationId) throw new HttpsError("invalid-argument", "Choose which message you are replying to.");

  const quick = tidy(data.quick, 30);
  let text;
  if (quick) {
    text = QUICK_REPLIES[quick];
    if (!text) throw new HttpsError("invalid-argument", "That quick reply isn't one I know.");
  } else {
    const raw = String(data.text ?? "");
    text = tidy(raw, TEXT_MAX + 1);
    if (!text) throw new HttpsError("invalid-argument", "Write your reply.");
    if (text.length > TEXT_MAX) throw new HttpsError("invalid-argument", `Keep it to ${TEXT_MAX} characters.`);
    if (scrubQuestion(raw, 2000).redactions > 0) {
      throw new HttpsError("invalid-argument", "Please take out any numbers, dates, email addresses or phone numbers. Don't put patient details in a reply.");
    }
  }

  await countRequest({ db, uid: callerUid, now, prefix: "rp_", hourlyLimit: HOURLY_LIMIT, dailyLimit: DAILY_LIMIT });

  const ref = db.collection("users").doc(callerUid).collection("notifications").doc(notificationId);
  const original = await ref.get();
  if (!original.exists) throw new HttpsError("not-found", "That message isn't there any more.");
  const message = original.data() || {};
  const toUid = tidy(message.createdByUid, 128);
  if (!PERSON_KINDS.includes(message.kind) || !toUid || message.automated === true) {
    throw new HttpsError("failed-precondition", "That isn't a message from a colleague, so it can't be replied to.");
  }
  if (toUid === callerUid) throw new HttpsError("failed-precondition", "That message is from you.");

  const sender = await db.collection("users").doc(toUid).get();
  if (!sender.exists || sender.data()?.active === false) throw new HttpsError("failed-precondition", "That person can't be messaged.");

  await db.collection("users").doc(toUid).collection("notifications").doc().set({
    ...buildReplyNotification({ callerUid, callerName, text, toUid, replyToNotificationId: notificationId }),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await ref.update({ read: true, readAt: FieldValue.serverTimestamp(), repliedAt: FieldValue.serverTimestamp(), replyText: text, updatedAt: FieldValue.serverTimestamp() });
  return { sent: 1, toName: tidy(sender.data()?.displayName, 80) };
}

module.exports = { TEXT_MAX, HOURLY_LIMIT, PERSON_KINDS, QUICK_REPLIES, buildReplyNotification, replyToMessage };
