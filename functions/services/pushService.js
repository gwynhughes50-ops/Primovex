// Alerts on a person's phone. Whenever something new arrives in someone's notifications (written only by the server),
// an alert is sent to each phone they have turned alerts on for. What shows on a lock screen is kept short and free of
// anything about a patient: the title of an operational alert (a fridge out of range), who a message is from, and a
// generic line for everything else.

const OPEN_MODULES = new Set(["temperature", "compliance", "connect", "inventory", "facilities", "operations"]);
const PERSON_KINDS = new Set(["team-message", "staff-message", "message-reply"]);

const tidy = (value, max) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

// the safe-to-show title, body and place to open for a notification
function buildPush(notification = {}, notificationId = "") {
  const url = typeof notification.actionUrl === "string" && notification.actionUrl.startsWith("/") ? notification.actionUrl : "/notifications";
  if (PERSON_KINDS.has(notification.kind)) {
    const from = tidy(notification.createdByName, 60) || "a colleague";
    return { title: notification.kind === "message-reply" ? `${from} replied` : `Message from ${from}`, body: "Open Primovex to read it.", url: "/notifications", tag: notificationId };
  }
  if (OPEN_MODULES.has(String(notification.module || "").toLowerCase())) {
    return { title: tidy(notification.title, 90) || "Primovex alert", body: tidy(notification.message, 120) || "Open Primovex to take action.", url, tag: notificationId };
  }
  // governance and anything unknown: the fact that there is something, never what it is about
  return { title: "Primovex", body: "You have a new notification.", url: "/notifications", tag: notificationId };
}

// tokens whose phone has gone (the app removed, alerts switched off) so they can be deleted
// (a malformed message is not a reason to forget a phone, so invalid-argument is not here)
const GONE = new Set(["messaging/registration-token-not-registered", "messaging/invalid-registration-token"]);

// Send the alert for one new notification to every phone the person has registered. Returns what happened.
async function sendPushForNotification({ db, messaging, uid, notificationId, notification }) {
  if (!notification || notification.read === true) return { sent: 0, removed: 0 };
  const tokenDocs = (await db.collection("users").doc(uid).collection("push_tokens").get()).docs;
  const tokens = tokenDocs.map((d) => ({ id: d.id, token: d.data()?.token })).filter((t) => typeof t.token === "string" && t.token);
  if (!tokens.length) return { sent: 0, removed: 0 };
  const push = buildPush(notification, notificationId);
  const response = await messaging.sendEachForMulticast({
    tokens: tokens.map((t) => t.token),
    data: { title: push.title, body: push.body, url: push.url, tag: push.tag },
    webpush: { headers: { Urgency: String(notification.priority) === "critical" ? "high" : "normal", TTL: "86400" } },
  });
  let removed = 0;
  for (let i = 0; i < response.responses.length; i += 1) {
    const result = response.responses[i];
    if (!result.success && GONE.has(result.error?.code)) {
      await db.collection("users").doc(uid).collection("push_tokens").doc(tokens[i].id).delete();
      removed += 1;
    }
  }
  return { sent: response.successCount, removed };
}

// An administrator checking that one person's phone gets alerts: a harmless notification that says so. Returns how many phones
// the person has registered (0 means they have not turned alerts on yet, and nothing would arrive).
async function sendTestAlert({ db, FieldValue, uid, callerName = "" }) {
  const id = tidy(uid, 128);
  if (!id) throw new Error("Say whose phone to test.");
  const user = await db.collection("users").doc(id).get();
  if (!user.exists) throw new Error("That person's account isn't there.");
  const profile = user.data() || {};
  const phones = (await db.collection("users").doc(id).collection("push_tokens").get()).size;
  if (!phones) return { phones: 0, sent: false, name: tidy(profile.displayName || profile.email, 80) };
  await db.collection("users").doc(id).collection("notifications").add({
    recipientUid: id,
    module: "connect",
    kind: "test-alert",
    title: "Primovex test alert",
    message: `Sent by ${tidy(callerName, 60) || "an administrator"}. If you can see this on your phone, alerts are working.`,
    priority: "high",
    read: false,
    status: "open",
    actionUrl: "/notifications",
    automated: true,
    createdByName: "Primovex",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { phones, sent: true, name: tidy(profile.displayName || profile.email, 80) };
}

module.exports = { buildPush, sendPushForNotification, sendTestAlert };
