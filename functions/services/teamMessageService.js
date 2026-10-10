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
const LOOKUP_HOURLY_LIMIT = 30;
const LOOKUP_DAILY_LIMIT = 200;

const tidy = (value, max) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

function buildTeamNotification({ callerUid, callerName, role, text, actionUrl, recipientUid }) {
  return {
    recipientUid,
    module: "inventory",
    kind: "team-message",
    title: role ? `${callerName || "A colleague"} sent a message to the ${role} team` : `${callerName || "A colleague"} sent you a message`,
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
  const toUid = tidy(data.toUid, 128);
  const role = toUid ? "" : tidy(data.role, 60);
  if (!role && !toUid) throw new HttpsError("invalid-argument", "Choose which team to message.");
  const rawText = String(data.text ?? "");
  const text = tidy(rawText, TEXT_MAX + 1);
  if (!text) throw new HttpsError("invalid-argument", "Write the message.");
  if (text.length > TEXT_MAX) throw new HttpsError("invalid-argument", `Keep it to ${TEXT_MAX} characters.`);
  if (scrubQuestion(rawText, 2000).redactions > 0) {
    throw new HttpsError("invalid-argument", "Please take out any numbers, dates, email addresses or phone numbers. Don't put patient details in a message.");
  }

  await countRequest({ db, uid: callerUid, now, prefix: "tm_", hourlyLimit: HOURLY_LIMIT, dailyLimit: DAILY_LIMIT });

  let recipients;
  if (toUid) {
    // one named colleague
    if (toUid === callerUid) throw new HttpsError("invalid-argument", "That is you. Use a reminder instead.");
    const person = await db.collection("users").doc(toUid).get();
    if (!person.exists || person.data()?.active === false) throw new HttpsError("failed-precondition", "That person can't be messaged.");
    recipients = [{ id: toUid, data: () => person.data() }];
  } else {
    const snapshot = await db.collection("users").where("role", "==", role).get();
    recipients = snapshot.docs.filter((doc) => doc.id !== callerUid && doc.data()?.active !== false);
  }
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
  return toUid
    ? { sent: recipients.length, role: null, toName: tidy(recipients[0].data()?.displayName, 80) }
    : { sent: recipients.length, role };
}

// Who a first name (or first and last) means, among the active colleagues: name, role and id only, never
// an email address. Only for someone who can message a team, and limited per person.
async function findColleagues({ db, callerUid, capabilities, words = [], now = new Date() }) {
  if (!hasCapability(capabilities, "inventory.write")) {
    throw new HttpsError("permission-denied", "You need permission to update stock to message a colleague.");
  }
  const wanted = (Array.isArray(words) ? words : []).slice(0, 2).map((word) => tidy(word, 40).toLowerCase().replace(/[^a-z'-]/g, "")).filter(Boolean);
  if (!wanted.length) throw new HttpsError("invalid-argument", "Say who to message.");
  await countRequest({ db, uid: callerUid, now, prefix: "fc_", hourlyLimit: LOOKUP_HOURLY_LIMIT, dailyLimit: LOOKUP_DAILY_LIMIT });
  const snapshot = await db.collection("users").get();
  const people = snapshot.docs
    .filter((doc) => doc.id !== callerUid && doc.data()?.active !== false)
    .map((doc) => ({ uid: doc.id, name: tidy(doc.data()?.displayName, 80), role: tidy(doc.data()?.role, 60) }))
    .filter((person) => person.name);
  const tokensOf = (person) => person.name.toLowerCase().split(/[\s.]+/).filter(Boolean);
  const hits = (list) => people.filter((person) => list.every((word) => tokensOf(person).some((token) => token.startsWith(word))));
  const two = wanted.length === 2 ? hits(wanted) : [];
  const matches = two.length ? two.map((person) => ({ ...person, consumed: 2 })) : hits([wanted[0]]).map((person) => ({ ...person, consumed: 1 }));
  return { matches: matches.slice(0, 5) };
}

module.exports = { TEXT_MAX, RECIPIENT_MAX, HOURLY_LIMIT, buildTeamNotification, sendTeamMessage, findColleagues };
