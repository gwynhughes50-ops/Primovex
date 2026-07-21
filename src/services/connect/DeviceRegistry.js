import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";

export const CONNECTED_DEVICES_COLLECTION = "connected_devices";
export const CONNECT_PROVIDER_SETTINGS_COLLECTION = "connect_provider_settings";
export const CONNECT_DEVICE_READINGS_COLLECTION = "connect_device_readings";
export const CONNECT_DEVICE_ALERTS_COLLECTION = "connect_device_alerts";

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
