const { FieldValue } = require("firebase-admin/firestore");
const { HttpsError } = require("firebase-functions/v2/https");
const { countRequest } = require("./orbRouterService");

// When a compliance check fails (a water outlet out of range, a fire door that will not close) the caretaker and the
// practice manager are told straight away, with a card on their screen to take action. Built here, on the server,
// because clients can never create notifications.
//
// Safeguards: only the person who opened the incident can ask, and only once per incident; the people told come
// from this list, never from the request; the message holds the asset name and reading, nothing typed; limited per
// person.

const HOURLY_LIMIT = 30;
const DAILY_LIMIT = 150;
const ALERT_ROLES = ["Caretaker", "Practice Manager"];
const BATCH = 400;

const tidy = (value, max) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

function buildComplianceAlert({ incident, incidentId, recipientUid }) {
  const name = tidy(incident.assetLabel || incident.assetCode, 80) || "A compliance asset";
  const where = tidy(incident.location, 80);
  // a fault the fire alarm panel showed during the weekly test; what the person typed about it (faultNote) is never in the alert
  const panelFault = incident.kind === "panel_fault";
  const patFail = incident.kind === "pat_fail";
  return {
    recipientUid,
    module: "compliance",
    kind: "compliance-alert",
    title: panelFault ? "Fire alarm panel fault" : patFail ? "Appliance failed its PAT test" : `${name} failed its check`,
    message: `${tidy(incident.summary, 220) || "A check failed."}${where ? ` Location: ${where}.` : ""} Recorded by ${tidy(incident.openedBy, 80) || "a colleague"}. Open this to say what was done.`,
    priority: incident.severity === "high" ? "critical" : "high",
    read: false,
    status: "open",
    actionUrl: "/compliance",
    automated: true,
    createdByName: "Primovex",
    incidentId,
    assetId: tidy(incident.assetId, 128),
    assetLabel: name,
  };
}

async function raiseComplianceAlert({ db, callerUid, data = {}, now = new Date() }) {
  const incidentId = tidy(data.incidentId, 128);
  if (!incidentId) throw new HttpsError("invalid-argument", "Say which incident to alert about.");
  const ref = db.collection("compliance_incidents").doc(incidentId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError("not-found", "That incident isn't there.");
  const incident = snapshot.data() || {};
  if (incident.openedByUid !== callerUid) throw new HttpsError("permission-denied", "Only the person who recorded the check can raise the alert for it.");
  if (String(incident.status || "open") !== "open") throw new HttpsError("failed-precondition", "That incident is already closed.");
  if (incident.alertedAt) return { sent: 0, alreadyAlerted: true, roles: [] };

  await countRequest({ db, uid: callerUid, now, prefix: "ca_", hourlyLimit: HOURLY_LIMIT, dailyLimit: DAILY_LIMIT });

  const seen = new Set();
  const recipients = [];
  for (const role of ALERT_ROLES) {
    const people = await db.collection("users").where("role", "==", role).get();
    for (const person of people.docs) {
      if (seen.has(person.id) || person.data()?.active === false) continue;
      seen.add(person.id);
      recipients.push(person.id);
    }
  }

  for (let i = 0; i < recipients.length; i += BATCH) {
    const batch = db.batch();
    recipients.slice(i, i + BATCH).forEach((uid) => {
      batch.set(db.collection("users").doc(uid).collection("notifications").doc(), {
        ...buildComplianceAlert({ incident, incidentId, recipientUid: uid }),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
  }
  await ref.update({ alertedAt: FieldValue.serverTimestamp(), alertedCount: recipients.length, alertedRoles: ALERT_ROLES });
  return { sent: recipients.length, roles: ALERT_ROLES };
}

module.exports = { ALERT_ROLES, HOURLY_LIMIT, buildComplianceAlert, raiseComplianceAlert };
