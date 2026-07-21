const admin = require("firebase-admin");

const EVENTS_COLLECTION = "connect_events";

async function publishEvent(type, payload = {}) {
  const db = admin.firestore();
  const event = {
    type,
    provider: payload.provider || payload.providerId || "system",
    deviceId: payload.deviceId || null,
    severity: payload.severity || "info",
    summary: payload.summary || type,
    payload,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  const ref = await db.collection(EVENTS_COLLECTION).add(event);
  return { id: ref.id, ...event };
}

module.exports = { publishEvent, EVENTS_COLLECTION };
