const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { publishEvent } = require("./eventBus");

const ALERTS_COLLECTION = "connect_device_alerts";

function classifyReading(device = {}) {
  const value = device.currentValue == null ? NaN : Number(device.currentValue);
  const min = Number(device.min);
  const max = Number(device.max);
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (value < min || value > max) {
    if (device.alertsEnabled === false) return null;
    const delayMinutes = Math.max(0, Number(device.alertDelayMinutes ?? 15));
    const startedAt = device.excursionStartedAt?.toMillis?.()
      ?? (device.excursionStartedAt ? new Date(device.excursionStartedAt).getTime() : Date.now());
    if (Date.now() - startedAt < delayMinutes * 60 * 1000) return null;
  }
  if (value < min) return { state: "low", severity: "high", summary: `${device.name} is below range at ${value}${device.unit || "°C"}.` };
  if (value > max) return { state: "high", severity: "high", summary: `${device.name} is above range at ${value}${device.unit || "°C"}.` };
  if (device.battery != null && Number(device.battery) <= 20) return { state: "battery", severity: "medium", summary: `${device.name} battery is low at ${device.battery}%.` };
  if (device.batteryState === "low") return { state: "battery", severity: "medium", summary: `${device.name} reports a low battery state.` };
  return null;
}

async function evaluateDeviceAlert(device) {
  const alert = classifyReading(device);
  if (!alert) return null;

  const db = getFirestore();
  const docId = `${device.provider || "unknown"}_${device.id}_${alert.state}`.replace(/[^A-Za-z0-9_-]/g, "_");
  const alertDoc = {
    id: docId,
    deviceId: device.id,
    provider: device.provider || "unknown",
    name: device.name,
    state: alert.state,
    severity: alert.severity,
    status: "open",
    summary: alert.summary,
    currentValue: device.currentValue,
    unit: device.unit || "°C",
    min: device.min,
    max: device.max,
    lastSeen: device.lastSeen || null,
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
  };

  await db.collection(ALERTS_COLLECTION).doc(docId).set(alertDoc, { merge: true });
  await publishEvent("connect.alert.created", {
    provider: alertDoc.provider,
    deviceId: device.id,
    severity: alert.severity,
    summary: alert.summary,
    alertId: docId,
  });
  return alertDoc;
}

module.exports = { evaluateDeviceAlert, classifyReading, ALERTS_COLLECTION };
