const admin = require("firebase-admin");
const { getProvider } = require("../providers/providerFactory");
const { evaluateDeviceAlert } = require("./alertService");
const { publishEvent } = require("./eventBus");

const DEVICES_COLLECTION = "connected_devices";
const READINGS_COLLECTION = "connect_device_readings";
const PROVIDER_HEALTH_COLLECTION = "connect_provider_health";

function readingId(device) {
  const safeDeviceId = String(device.id || "device").replace(/[^A-Za-z0-9_-]/g, "_");
  return `${safeDeviceId}_${Date.now()}`;
}

async function writeDevice(db, device) {
  const id = String(device.id);
  const doc = {
    ...device,
    provider: device.provider || "simulator",
    lastSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await db.collection(DEVICES_COLLECTION).doc(id).set(doc, { merge: true });

  await db.collection(READINGS_COLLECTION).doc(readingId(device)).set({
    deviceId: id,
    provider: doc.provider,
    value: Number(device.currentValue),
    humidity: device.humidity ?? null,
    unit: device.unit || "°C",
    battery: device.battery ?? null,
    signal: device.signal ?? null,
    recordedAt: admin.firestore.FieldValue.serverTimestamp(),
    source: "connect-cloud",
  });

  return doc;
}

async function syncProvider(providerId = "simulator", options = {}) {
  const db = admin.firestore();
  const provider = getProvider(providerId);
  const health = await provider.getHealth(options);
  const devices = await provider.getDevices(options);

  await db.collection(PROVIDER_HEALTH_COLLECTION).doc(providerId).set(
    {
      ...health,
      providerId,
      deviceCount: devices.length,
      lastSyncAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const written = [];
  const alerts = [];
  for (const device of devices) {
    const saved = await writeDevice(db, device);
    written.push(saved);
    const alert = await evaluateDeviceAlert(saved);
    if (alert) alerts.push(alert);
  }

  await publishEvent("connect.provider.synced", {
    provider: providerId,
    severity: alerts.length ? "warning" : "info",
    summary: `${provider.label || providerId} synced ${written.length} device${written.length === 1 ? "" : "s"}.`,
    deviceCount: written.length,
    alertCount: alerts.length,
  });

  return {
    provider: providerId,
    health,
    deviceCount: written.length,
    alertCount: alerts.length,
    devices: written,
  };
}

module.exports = { syncProvider, DEVICES_COLLECTION, READINGS_COLLECTION, PROVIDER_HEALTH_COLLECTION };
