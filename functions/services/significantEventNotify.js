const { FieldValue } = require("firebase-admin/firestore");
const { HttpsError } = require("firebase-functions/v2/https");
const { getEffectiveCapabilities, hasCapability } = require("./roleCapabilities");

// Tells the right people about a significant event. Clients can never write notifications, so the
// app asks this server code; it builds the content from the real records and checks the caller is
// allowed to ask for that kind of notification. Titles come from what the reporter wrote (the form
// tells them never to name anyone); nothing about the patient is ever included.

const KINDS = ["reported", "lead_assigned", "review_requested", "action_assigned"];
const ACTION_URL = "/governance/significant-events";

const tidy = (value, max) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

function buildSeNotification({ kind, seId, event = {}, action = null, recipientUid, callerUid, callerName }) {
  const ref = tidy(event.reference || seId, 40);
  const title = tidy(event.title, 120);
  const base = {
    recipientUid,
    module: "significant-events",
    kind: `significant-event-${kind}`,
    priority: event.harm === "severe" || event.harm === "moderate" ? "high" : "routine",
    read: false,
    status: "open",
    actionUrl: `${ACTION_URL}?open=${encodeURIComponent(seId)}`,
    automated: false,
    createdByUid: callerUid || null,
    createdByName: callerName || "Primovex",
  };
  if (kind === "reported") return { id: `se-reported-${seId}-${recipientUid}`, data: { ...base, title: `New significant event reported: ${ref}`, message: title } };
  if (kind === "lead_assigned") return { id: `se-lead-${seId}-${recipientUid}`, data: { ...base, title: `You are leading the investigation: ${ref}`, message: title } };
  if (kind === "review_requested") return { id: `se-review-${seId}-${recipientUid}`, data: { ...base, title: `Your review is requested: ${ref}`, message: title } };
  return {
    id: `se-action-${action?.id || seId}-${recipientUid}`,
    data: { ...base, title: `An action is assigned to you${event.reference ? ` (${ref})` : ""}`, message: tidy(action?.title, 160), priority: "routine" },
  };
}

// Who may ask for which notification. Pure, so it can be tested.
//   reported: the person who reported it (to tell the team)
//   everything else: the significant events team
function callerMayNotify({ kind, event, callerUid, callerIsTeam }) {
  if (!KINDS.includes(kind)) return { ok: false, reason: "unknown-kind" };
  if (kind === "reported") return event?.reportedByUid === callerUid || callerIsTeam ? { ok: true } : { ok: false, reason: "not-reporter" };
  return callerIsTeam ? { ok: true } : { ok: false, reason: "not-team" };
}

// Everyone active whose role carries the significant events team permission.
async function findTeamUids({ db, capsForRole = (role) => getEffectiveCapabilities(db, role) }) {
  const snap = await db.collection("users").get();
  const cache = new Map();
  const uids = [];
  for (const doc of snap.docs) {
    const user = doc.data() || {};
    if (user.active === false || !user.role) continue;
    if (!cache.has(user.role)) cache.set(user.role, await capsForRole(user.role));
    if (hasCapability(cache.get(user.role), "governance.seTeam")) uids.push(doc.id);
  }
  return uids;
}

async function notifySignificantEvent({ db, callerUid, callerName, callerIsTeam, seId, kind, targetUids = [], actionId = "", capsForRole }) {
  const id = tidy(seId, 80);
  if (!id) throw new HttpsError("invalid-argument", "Missing event id.");
  const snap = await db.collection("governance_significant_events").doc(id).get();
  const event = snap.exists ? snap.data() : null;
  if (!event) throw new HttpsError("not-found", "That significant event no longer exists.");

  const allowed = callerMayNotify({ kind, event, callerUid, callerIsTeam });
  if (!allowed.ok) throw new HttpsError("permission-denied", "You can't send that notification.");

  let action = null;
  let recipients = [];
  if (kind === "reported") {
    recipients = await findTeamUids({ db, capsForRole });
  } else if (kind === "lead_assigned") {
    recipients = event.leadUid ? [event.leadUid] : [];
  } else if (kind === "review_requested") {
    const reviewers = new Set(event.reviewerUids || []);
    recipients = (Array.isArray(targetUids) ? targetUids : []).filter((uid) => reviewers.has(uid));
  } else if (kind === "action_assigned") {
    const actionSnap = await db.collection("governance_se_actions").doc(tidy(actionId, 80)).get();
    action = actionSnap.exists ? { id: actionSnap.id, ...actionSnap.data() } : null;
    if (!action || action.seId !== id) throw new HttpsError("not-found", "That action doesn't belong to this event.");
    recipients = action.ownerUid ? [action.ownerUid] : [];
  }

  // Not the person asking, and only real, active accounts.
  recipients = [...new Set(recipients)].filter((uid) => uid && uid !== callerUid).slice(0, 100);
  let sent = 0;
  for (const uid of recipients) {
    const user = await db.collection("users").doc(uid).get();
    if (!user.exists || user.data()?.active === false) continue;
    const { id: notificationId, data } = buildSeNotification({ kind, seId: id, event, action, recipientUid: uid, callerUid, callerName });
    await user.ref.collection("notifications").doc(notificationId).set({ ...data, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    sent += 1;
  }
  return { sent };
}

module.exports = { notifySignificantEvent, buildSeNotification, callerMayNotify, findTeamUids, KINDS };
