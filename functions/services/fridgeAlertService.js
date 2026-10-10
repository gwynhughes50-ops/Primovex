const { FieldValue } = require("firebase-admin/firestore");
const { HttpsError } = require("firebase-functions/v2/https");
const { countRequest } = require("./orbRouterService");

// When a fridge reading is out of range the person recording it must not have to go looking for someone: the
// phone saves the incident and then asks this to tell the roles ticked under Practice Admin (the Practice
// Manager unless the practice has chosen otherwise). Built here, on the server, because clients can never
// create notifications.
//
// Safeguards: only the person who opened the incident can ask for it, and only once per incident; the
// recipients come from the practice's setting, never from the request; the message holds readings and a fridge
// name, never anything typed; limited per person.

const HOURLY_LIMIT = 20;
const DAILY_LIMIT = 100;
const DEFAULT_ROLES = ["Practice Manager"];
const BATCH = 400;

const tidy = (value, max) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const degrees = (value) => (Number.isFinite(Number(value)) ? `${Number(value)}°C` : "");

function buildFridgeAlert({ incident, incidentId, recipientUid }) {
  const range = incident.expectedRange && Number.isFinite(Number(incident.expectedRange.min)) ? ` The safe range is ${degrees(incident.expectedRange.min)} to ${degrees(incident.expectedRange.max)}.` : "";
  const readings = [["now", incident.observedTemp], ["min", incident.observedMin], ["max", incident.observedMax]].filter(([, v]) => degrees(v)).map(([label, v]) => `${label} ${degrees(v)}`).join(", ");
  const unitName = tidy(incident.unitName, 80) || "A fridge";
  return {
    recipientUid,
    module: "temperature",
    kind: "fridge-alert",
    title: `${unitName} is out of range`,
    message: `${readings ? `Readings: ${readings}.` : "A reading was outside the safe range."}${range} Recorded by ${tidy(incident.openedBy, 80) || "a colleague"}. Open it to quarantine the fridge, record what happened to the stock, or clear it once it has recovered.`,
    priority: "critical",
    read: false,
    status: "open",
    actionUrl: "/temperature",
    automated: true,
    createdByName: "Primovex",
    incidentId,
    unitId: tidy(incident.unitId, 128),
    unitName,
  };
}

async function rolesToTell(db) {
  try {
    const snap = await db.collection("settings").doc("fridgeAlerts").get();
    const roles = snap.exists ? snap.data()?.roles : null;
    const clean = Array.isArray(roles) ? roles.map((role) => tidy(role, 60)).filter(Boolean).slice(0, 12) : [];
    return clean.length ? clean : DEFAULT_ROLES;
  } catch {
    return DEFAULT_ROLES;
  }
}

async function raiseFridgeAlert({ db, callerUid, data = {}, now = new Date() }) {
  const incidentId = tidy(data.incidentId, 128);
  if (!incidentId) throw new HttpsError("invalid-argument", "Say which incident to alert about.");
  const ref = db.collection("temperature_incidents").doc(incidentId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError("not-found", "That incident isn't there.");
  const incident = snapshot.data() || {};
  if (incident.openedByUid !== callerUid) throw new HttpsError("permission-denied", "Only the person who recorded the reading can raise the alert for it.");
  if (String(incident.status || "open") !== "open") throw new HttpsError("failed-precondition", "That incident is already closed.");
  if (incident.alertedAt) return { sent: 0, alreadyAlerted: true, roles: [] };

  await countRequest({ db, uid: callerUid, now, prefix: "fa_", hourlyLimit: HOURLY_LIMIT, dailyLimit: DAILY_LIMIT });

  const roles = await rolesToTell(db);
  const seen = new Set();
  const recipients = [];
  for (const role of roles) {
    const people = await db.collection("users").where("role", "==", role).get();
    for (const person of people.docs) {
      if (person.id === callerUid || seen.has(person.id) || person.data()?.active === false) continue;
      seen.add(person.id);
      recipients.push(person.id);
    }
  }

  for (let i = 0; i < recipients.length; i += BATCH) {
    const batch = db.batch();
    recipients.slice(i, i + BATCH).forEach((uid) => {
      batch.set(db.collection("users").doc(uid).collection("notifications").doc(), {
        ...buildFridgeAlert({ incident, incidentId, recipientUid: uid }),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
  }
  await ref.update({ alertedAt: FieldValue.serverTimestamp(), alertedCount: recipients.length, alertedRoles: roles });
  return { sent: recipients.length, roles };
}

module.exports = { DEFAULT_ROLES, HOURLY_LIMIT, buildFridgeAlert, raiseFridgeAlert };
