import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export const CONNECTED_DEVICES_COLLECTION = "connected_devices";
export const CONNECT_PROVIDER_SETTINGS_COLLECTION = "connect_provider_settings";
export const CONNECT_DEVICE_READINGS_COLLECTION = "connect_device_readings";
export const CONNECT_DEVICE_ALERTS_COLLECTION = "connect_device_alerts";
export const TEMPERATURE_UNITS_COLLECTION = "temperature_units";
export const DEVICE_ASSIGNMENT_AUDIT_COLLECTION = "device_assignment_audit";

export function subscribeDeviceRegistry(callback, onError) {
  const qy = query(collection(db, CONNECTED_DEVICES_COLLECTION), orderBy("name", "asc"), limit(200));
  return onSnapshot(
    qy,
    (snap) => {
      callback(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    },
    (error) => {
      console.error("Connect device registry subscription failed", error);
      onError?.(error);
      callback([]);
    }
  );
}

function finiteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function saveDeviceAssignment(device, assignment, actor = {}) {
  if (!device?.id) throw new Error("A connected device is required.");
  if (!assignment?.spaceId) throw new Error("Select a Space.");
  if (!assignment?.equipmentId || !assignment?.equipmentName) {
    throw new Error("Select or create the equipment monitored by this device.");
  }

  const min = finiteNumber(assignment.min, 2);
  const max = finiteNumber(assignment.max, 8);
  if (min >= max) throw new Error("Maximum temperature must be greater than minimum temperature.");

  const alertDelayMinutes = Math.max(0, finiteNumber(assignment.alertDelayMinutes, 15));
  const assignedAt = serverTimestamp();
  const unitId = String(assignment.fridgeId || assignment.equipmentId || device.id).trim();
  const assignmentData = {
    assignmentVersion: 1,
    name: String(assignment.deviceName || device.name || "Temperature sensor").trim(),
    site: assignment.siteName || device.site || "Assigned",
    room: assignment.spaceName || "Assigned Space",
    spaceId: assignment.spaceId,
    equipmentId: assignment.equipmentId,
    equipment: assignment.equipmentName,
    fridgeId: unitId,
    type: assignment.equipmentType || "fridge",
    sensorPurpose: assignment.sensorPurpose || "external-probe",
    min,
    max,
    alertDelayMinutes,
    alertsEnabled: assignment.alertsEnabled !== false,
    integrationStatus: "active",
    assignedAt,
    assignedByUid: actor.uid || null,
    assignedByName: actor.displayName || actor.email || "Signed-in user",
  };

  const batch = writeBatch(db);
  batch.set(doc(db, CONNECTED_DEVICES_COLLECTION, device.id), assignmentData, { merge: true });
  batch.set(doc(db, TEMPERATURE_UNITS_COLLECTION, unitId), {
    name: assignmentData.equipment,
    unitName: assignmentData.equipment,
    deviceId: device.id,
    provider: device.provider || "tuya",
    unitType: assignmentData.type,
    type: assignmentData.type,
    site: assignmentData.site,
    siteId: assignment.siteId || "",
    spaceId: assignmentData.spaceId,
    equipmentId: assignmentData.equipmentId,
    fridgeId: unitId,
    rangeMin: min,
    rangeMax: max,
    min,
    max,
    alertDelayMinutes,
    alertsEnabled: assignmentData.alertsEnabled,
    sensorPurpose: assignmentData.sensorPurpose,
    integrationStatus: "active",
    active: true,
    updatedAt: assignedAt,
  }, { merge: true });
  batch.set(doc(collection(db, DEVICE_ASSIGNMENT_AUDIT_COLLECTION)), {
    deviceId: device.id,
    provider: device.provider || "tuya",
    previousSpaceId: device.spaceId || null,
    previousEquipmentId: device.equipmentId || null,
    ...assignmentData,
    createdAt: assignedAt,
  });
  await batch.commit();
  return { deviceId: device.id, unitId, ...assignmentData };
}
