import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";

// Primovex's own temperature sensors: set up here, they report straight to Primovex (see functions/services/sensorService.js).
export const SENSOR_CONFIG_COLLECTION = "sensor_config";

export function subscribeSensors(callback, onError) {
  return onSnapshot(
    query(collection(db, SENSOR_CONFIG_COLLECTION), orderBy("name", "asc")),
    (snap) => callback(snap.docs.map((row) => ({ id: row.id, ...row.data() }))),
    (error) => { onError?.(error); callback([]); },
  );
}

const call = async (data) => (await httpsCallable(functions, "manageSensor")(data)).data;
export const createSensor = (setup) => call({ action: "create", ...setup });
export const updateSensor = (id, setup) => call({ action: "update", id, ...setup });
export const rotateSensorKey = (id) => call({ action: "rotate", id });
export const removeSensor = (id) => call({ action: "remove", id });

// Starting ranges for the kind of thing being watched; the person can change them.
export const SENSOR_TYPES = [
  { value: "fridge", label: "Fridge", min: 2, max: 8 },
  { value: "freezer", label: "Freezer", min: -25, max: -15 },
  { value: "room_sensor", label: "Room", min: 15, max: 25 },
];
export const REPORT_EVERY = [
  { value: 5, label: "Every 5 minutes" },
  { value: 15, label: "Every 15 minutes" },
  { value: 30, label: "Every 30 minutes" },
  { value: 60, label: "Every hour" },
  { value: 120, label: "Every 2 hours" },
];
export const ALERT_AFTER = [
  { value: 0, label: "Straight away" },
  { value: 10, label: "After 10 minutes" },
  { value: 15, label: "After 15 minutes" },
  { value: 30, label: "After 30 minutes" },
  { value: 60, label: "After an hour" },
];
