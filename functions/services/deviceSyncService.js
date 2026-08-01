const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { getProvider } = require("../providers/providerFactory");
const { evaluateDeviceAlert } = require("./alertService");
const { publishEvent } = require("./eventBus");

const DEVICES_COLLECTION = "connected_devices";
const READINGS_COLLECTION = "connect_device_readings";
const PROVIDER_HEALTH_COLLECTION = "connect_provider_health";
const TEMPERATURE_LOGS_COLLECTION = "temperature_logs";
const TEMPERATURE_INCIDENTS_COLLECTION = "temperature_incidents";
const TEMPERATURE_UNITS_COLLECTION = "temperature_units";

function readingId(device) {
  const safeDeviceId = String(device.id || "device").replace(/[^A-Za-z0-9_-]/g, "_");
  return `${safeDeviceId}_${Date.now()}`;
}

function preservedAssignment(existing = {}) {
  if (!existing.assignmentVersion) return {};
  const fields = [
    "assignmentVersion", "name", "site", "room", "spaceId", "equipmentId",
    "equipment", "fridgeId", "type", "sensorPurpose", "min", "max",
    "alertDelayMinutes", "alertsEnabled", "integrationStatus", "assignedAt",
    "assignedByUid", "assignedByName",
  ];
  return Object.fromEntries(fields.filter((key) => existing[key] !== undefined).map((key) => [key, existing[key]]));
}

async function writeDevice(db, providerDevice) {
  const id = String(providerDevice.id);
  const deviceRef = db.collection(DEVICES_COLLECTION).doc(id);
  const existingSnapshot = await deviceRef.get();
  const existing = existingSnapshot.data() || {};
  const device = { ...providerDevice, ...preservedAssignment(existing) };

  const probeValue = Number(device.probeTemperature);
  const outside = Number.isFinite(probeValue)
    && (probeValue < Number(device.min) || probeValue > Number(device.max));
  const now = Timestamp.now();
  const excursionStartedAt = outside ? (existing.excursionStartedAt || now) : null;
  const doc = {
    ...device,
    provider: device.provider || "simulator",
    excursionStartedAt,
    lastSyncedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await deviceRef.set(doc, { merge: true });

  await db.collection(READINGS_COLLECTION).doc(readingId(device)).set({
    deviceId: id,
    provider: doc.provider,
    value: device.currentValue == null ? null : Number(device.currentValue),
    humidity: device.humidity ?? null,
    unit: device.unit || "°C",
    battery: device.battery ?? null,
    batteryState: device.batteryState ?? null,
    signal: device.signal ?? null,
    recordedAt: FieldValue.serverTimestamp(),
    source: "connect-cloud",
    probeTemperature: device.probeTemperature ?? null,
    ambientTemperature: device.ambientTemperature ?? null,
    spaceId: device.spaceId ?? null,
    equipmentId: device.equipmentId ?? null,
    fridgeId: device.fridgeId ?? null,
  });

  if (Number.isFinite(probeValue)) {
    const recordedAt = FieldValue.serverTimestamp();
    const unitId = device.fridgeId || id;
    await db.collection(TEMPERATURE_UNITS_COLLECTION).doc(unitId).set({
      name: device.equipment || device.name,
      unitName: device.equipment || device.name,
      deviceId: id,
      provider: doc.provider,
      type: device.type,
      unitType: device.type,
      site: device.site || "",
      spaceId: device.spaceId ?? null,
      equipmentId: device.equipmentId ?? null,
      fridgeId: device.fridgeId ?? null,
      min: device.min,
      max: device.max,
      rangeMin: device.min,
      rangeMax: device.max,
      alertDelayMinutes: device.alertDelayMinutes ?? 15,
      alertsEnabled: device.alertsEnabled !== false,
      sensorPurpose: device.sensorPurpose || "external-probe",
      unit: device.unit || "°C",
      integrationStatus: device.integrationStatus,
      active: true,
      updatedAt: recordedAt,
    }, { merge: true });
    await db.collection(TEMPERATURE_LOGS_COLLECTION).doc(readingId(device)).set({
      unitId,
      unitName: device.equipment || device.name,
      deviceId: id,
      provider: doc.provider,
      temp: probeValue,
      temperature: probeValue,
      ambientTemperature: device.ambientTemperature ?? null,
      humidity: device.humidity ?? null,
      batteryState: device.batteryState ?? null,
      spaceId: device.spaceId ?? null,
      equipmentId: device.equipmentId ?? null,
      fridgeId: device.fridgeId ?? null,
      min: device.min,
      max: device.max,
      source: "tuya-external-probe",
      measured_at: recordedAt,
      recordedAt,
    });

    const incidentId = `tuya_${id}_range`.replace(/[^A-Za-z0-9_-]/g, "_");
    const delayMinutes = Math.max(0, Number(device.alertDelayMinutes ?? 15));
    const outsideDurationMs = outside && excursionStartedAt?.toMillis
      ? now.toMillis() - excursionStartedAt.toMillis()
      : 0;
    if (outside && device.alertsEnabled !== false && outsideDurationMs >= delayMinutes * 60 * 1000) {
      await db.collection(TEMPERATURE_INCIDENTS_COLLECTION).doc(incidentId).set({
        deviceId: id,
        unitId,
        unitName: device.equipment || device.name,
        spaceId: device.spaceId ?? null,
        equipmentId: device.equipmentId ?? null,
        fridgeId: device.fridgeId ?? null,
        status: "open",
        source: "tuya-external-probe",
        observedTemperature: probeValue,
        min: device.min,
        max: device.max,
        alertDelayMinutes: delayMinutes,
        excursionStartedAt,
        updatedAt: recordedAt,
        createdAt: recordedAt,
      }, { merge: true });
    } else if (!outside) {
      const incidentRef = db.collection(TEMPERATURE_INCIDENTS_COLLECTION).doc(incidentId);
      const incident = await incidentRef.get();
      if (incident.exists && incident.data()?.status === "open") {
        await incidentRef.set({
          status: "resolved",
          resolvedAt: recordedAt,
          resolution: "Automatically resolved when the connected probe returned to range.",
          updatedAt: recordedAt,
        }, { merge: true });
      }
    }
  }

  return doc;
}

async function syncProvider(providerId = "simulator", options = {}) {
  const db = getFirestore();
  const provider = getProvider(providerId);
  const health = await provider.getHealth(options);
  const devices = await provider.getDevices(options);

  await db.collection(PROVIDER_HEALTH_COLLECTION).doc(providerId).set(
    {
      ...health,
      providerId,
      deviceCount: devices.length,
      lastSyncAt: FieldValue.serverTimestamp(),
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
