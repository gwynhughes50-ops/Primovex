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
    const nowDate = now.toDate();
    const dateKey = nowDate.toISOString().slice(0, 10);
    const slot = nowDate.getHours() < 12 ? "AM" : "PM";
    const unitId = device.fridgeId || id;
    const unitRange = { min: device.min, max: device.max };
    const siteId = device.site || "";

    await db.collection(TEMPERATURE_UNITS_COLLECTION).doc(unitId).set({
      name: device.equipment || device.name,
      unitName: device.equipment || device.name,
      deviceId: id,
      provider: doc.provider,
      type: device.type,
      unitType: device.type,
      site: siteId,
      siteId,
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

    // Field names below deliberately mirror what TemperatureLog.jsx's manual
    // save path writes (created_at/measured_at, unitRange, dateKey/slot) so
    // device-sourced readings show up in the same query/table without the
    // frontend needing to know two different schemas.
    await db.collection(TEMPERATURE_LOGS_COLLECTION).doc(readingId(device)).set({
      unitId,
      unitName: device.equipment || device.name,
      unitType: device.type,
      deviceId: id,
      provider: doc.provider,
      temp: probeValue,
      temperature: probeValue,
      ambientTemperature: device.ambientTemperature ?? null,
      humidity: device.humidity ?? null,
      batteryState: device.batteryState ?? null,
      siteId,
      siteName: siteId,
      spaceId: device.spaceId ?? null,
      equipmentId: device.equipmentId ?? null,
      fridgeId: device.fridgeId ?? null,
      unitRange,
      min: device.min,
      max: device.max,
      dateKey,
      slot,
      recordedBy: "Automated · Connect sync",
      notes: "",
      source: "tuya-external-probe",
      measured_at: recordedAt,
      created_at: recordedAt,
      recordedAt,
    });

    const delayMinutes = Math.max(0, Number(device.alertDelayMinutes ?? 15));
    const outsideDurationMs = outside && excursionStartedAt?.toMillis
      ? now.toMillis() - excursionStartedAt.toMillis()
      : 0;

    // Incidents are opened automatically once an excursion has been sustained
    // for alertDelayMinutes, but are never auto-resolved: a human must review
    // and resolve via the Incidents tab, even if the reading recovers on its
    // own. Each excursion episode gets its own incident document (tracked via
    // openIncidentId on the device doc) so a resolved incident's notes are
    // never overwritten by a later, separate excursion.
    if (outside && device.alertsEnabled !== false && outsideDurationMs >= delayMinutes * 60 * 1000) {
      let incidentRef = null;
      const trackedId = existing.openIncidentId;
      if (trackedId) {
        const trackedSnap = await db.collection(TEMPERATURE_INCIDENTS_COLLECTION).doc(trackedId).get();
        if (trackedSnap.exists && trackedSnap.data()?.status === "open") incidentRef = trackedSnap.ref;
      }

      if (incidentRef) {
        await incidentRef.set({
          observedTemp: probeValue,
          updatedAt: recordedAt,
        }, { merge: true });
      } else {
        incidentRef = db.collection(TEMPERATURE_INCIDENTS_COLLECTION).doc();
        await incidentRef.set({
          unitId,
          unitName: device.equipment || device.name,
          unitType: device.type,
          siteId,
          deviceId: id,
          spaceId: device.spaceId ?? null,
          equipmentId: device.equipmentId ?? null,
          fridgeId: device.fridgeId ?? null,
          expectedRange: unitRange,
          observedTemp: probeValue,
          summary: `Automatic excursion alert: ${device.equipment || device.name} reading ${probeValue}°C, outside the ${device.min}–${device.max}°C safe range`,
          details: `Opened automatically after the connected probe stayed outside its safe range for at least ${delayMinutes} minutes. Review the device history, decide on affected stock, and resolve once investigated.`,
          actionsTaken: "",
          affectedStock: { quarantined: false, discarded: false, movedToBackupUnit: false, stockNotes: "" },
          status: "open",
          source: "tuya-external-probe",
          openedAt: recordedAt,
          openedBy: "Automated · Connect sync",
          resolvedAt: null,
          resolvedBy: null,
          resolutionNotes: "",
        });
        await deviceRef.set({ openIncidentId: incidentRef.id }, { merge: true });
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
