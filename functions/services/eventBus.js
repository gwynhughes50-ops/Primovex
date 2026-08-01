const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const EVENTS_COLLECTION = "connect_events";

async function publishEvent(type, payload = {}) {
  const db = getFirestore();
  const event = {
    type,
    provider: payload.provider || payload.providerId || "system",
    deviceId: payload.deviceId || null,
    severity: payload.severity || "info",
    summary: payload.summary || type,
    payload,
    createdAt: FieldValue.serverTimestamp(),
  };
  const ref = await db.collection(EVENTS_COLLECTION).add(event);
  return { id: ref.id, ...event };
}

module.exports = { publishEvent, EVENTS_COLLECTION };
