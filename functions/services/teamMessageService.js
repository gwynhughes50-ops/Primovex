const { FieldValue } = require("firebase-admin/firestore");
const { HttpsError } = require("firebase-functions/v2/https");
const { hasCapability } = require("./roleCapabilities");
const { scrubQuestion, countRequest } = require("./orbRouterService");

// A short message from one member of staff to everyone with a role (for example "the HCA team"),
// delivered into their in-app inbox. Started from the Orb ("tell the HCA team BD blue needles need
// ordering") but always confirmed by the person first. Built here, on the server, because clients
// can never create notifications.
//
// Safeguards: only someone who can write stock; a short text with no numbers, dates, emails or
// phone numbers (so a patient identifier can't be sent by mistake); a limit per person; at most 100
// recipients; the sender is never a recipient; audited by team and count, never the words.

const TEXT_MAX = 300;
const RECIPIENT_MAX = 100;
const HOURLY_LIMIT = 10;
const DAILY_LIMIT = 100;
const BATCH = 400;

const tidy = (value, max) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

function buildTeamNotification({ callerUid, callerName, role, text, actionUrl, recipientUid }) {
  return {
    recipientUid,
    module: "inventory",
    kind: "team-message",
    title: `${callerName || "A colleague"} sent a message to the ${role} team`,
    message: text,
    priority: "high",
    read: false,
    status: "open",
    actionUrl: actionUrl || "/inventory",
    automated: false,
    createdByUid: callerUid,
    createdByName: callerName || "A colleague",
  };
}

async function sendTeamMessage({ db, callerUid, callerName, capabilities, data = {}, now = new Date() }) {
  if (!hasCapability(capabilities, "inventory.write")) {
    throw new HttpsError("permission-denied", "You need permission to update stock to message a team.");
  }
  const role = tidy(data.role, 60);
  if (!role) throw new HttpsError("invalid-argument", "Choose which team to message.");
  const rawText = String(data.text ?? "");
  const text = tidy(rawText, TEXT_MAX + 1);
  if (!text) throw new HttpsError("invalid-argument", "Write the message.");
  if (text.length > TEXT_MAX) throw new HttpsError("invalid-argument", `Keep it to ${TEXT_MAX} characters.`);
  if (scrubQuestion(rawText, 2000).redactions > 0) {
    throw new HttpsError("invalid-argument", "Please take out any numbers, dates, email addresses or phone numbers. Don't put patient details in a message.");
  }

  await countRequest({ db, uid: callerUid, now, prefix: "tm_", hourlyLimit: HOURLY_LIMIT, dailyLimit: DAILY_LIMIT });

  const snapshot = await db.collection("users").where("role", "==", role).get();
  const recipients = snapshot.docs.filter((doc) => doc.id !== callerUid && doc.data()?.active !== false);
  if (!recipients.length) throw new HttpsError("failed-precondition", `No one else has the role "${role}", so there is nobody to tell.`);
  if (recipients.length > RECIPIENT_MAX) throw new HttpsError("failed-precondition", `That team has more than ${RECIPIENT_MAX} people; message them another way.`);

  for (let i = 0; i < recipients.length; i += BATCH) {
    const batch = db.batch();
    recipients.slice(i, i + BATCH).forEach((doc) => {
      const ref = db.collection("users").doc(doc.id).collection("notifications").doc();
      batch.set(ref, {
        ...buildTeamNotification({ callerUid, callerName, role, text, actionUrl: data.actionUrl, recipientUid: doc.id }),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
  }
  return { sent: recipients.length, role };
}

module.exports = { TEXT_MAX, RECIPIENT_MAX, HOURLY_LIMIT, buildTeamNotification, sendTeamMessage };
