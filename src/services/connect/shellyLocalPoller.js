import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CONNECTED_DEVICES_COLLECTION } from "./DeviceRegistry";
import { SHELLY_LOCAL_PROVIDER_ID } from "./providers/ShellyLocalProvider";

// Config for practice-owned local thermometers (name/room/local IP/safe
// range). Kept separate from connected_devices — that collection holds the
// live readings every provider writes into, this one holds only what a
// human configured, same relationship as connect_provider_settings vs
// connected_devices for Tuya.
export const SHELLY_LOCAL_THERMOMETERS_COLLECTION = "shelly_local_thermometers";

const DEFAULT_POLL_INTERVAL_MS = 3 * 60 * 1000;

function isTauriDesktop() {
  if (typeof window === "undefined" || !window.__TAURI_INTERNALS__) return false;
  const isAndroidClient = document.documentElement.dataset.primovexClient === "android"
    || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  return !isAndroidClient;
}

export function subscribeShellyLocalThermometers(callback, onError) {
  const qy = query(collection(db, SHELLY_LOCAL_THERMOMETERS_COLLECTION), orderBy("name", "asc"));
  return onSnapshot(
    qy,
    (snap) => callback(snap.docs.map((row) => ({ id: row.id, ...row.data() }))),
    (error) => {
      console.error("Local thermometer subscription failed", error);
      onError?.(error);
      callback([]);
    }
  );
}

export async function addShellyLocalThermometer({ name, room, site, ip, min, max }) {
  const trimmedName = String(name || "").trim();
  const trimmedIp = String(ip || "").trim();
  if (!trimmedName) throw new Error("Give the thermometer a name.");
  if (!trimmedIp) throw new Error("The thermometer's local IP address is required.");
  const minC = Number.isFinite(Number(min)) ? Number(min) : 2;
  const maxC = Number.isFinite(Number(max)) ? Number(max) : 8;
  if (minC >= maxC) throw new Error("Maximum temperature must be greater than minimum temperature.");

  const id = `shelly-${trimmedIp.replace(/[^a-zA-Z0-9]/g, "-")}`;
  await setDoc(doc(db, SHELLY_LOCAL_THERMOMETERS_COLLECTION, id), {
    name: trimmedName,
    room: String(room || "").trim() || "Unassigned",
    site: String(site || "").trim() || "Main Branch",
    ip: trimmedIp,
    min: minC,
    max: maxC,
    createdAt: serverTimestamp(),
  });
  return id;
}

export async function removeShellyLocalThermometer(id) {
  if (!id) return;
  await deleteDoc(doc(db, SHELLY_LOCAL_THERMOMETERS_COLLECTION, id));
  await deleteDoc(doc(db, CONNECTED_DEVICES_COLLECTION, id)).catch(() => {});
}

// Reads a Shelly (or Shelly-Add-on/DS18B20) device's built-in local web API
// directly — see Temperature.GetStatus in Shelly's Gen2+ API docs. Goes
// through the Rust side (fetch_local_device_reading) rather than a plain
// browser fetch() so it isn't subject to CORS, since these devices don't
// send CORS headers and were never meant to be called from a web page.
export async function readShellyTemperature(ip) {
  const { invoke } = await import("@tauri-apps/api/core");
  const url = `http://${ip}/rpc/Temperature.GetStatus?id=0`;
  const raw = await invoke("fetch_local_device_reading", { url });
  const parsed = JSON.parse(raw);
  const tC = parsed?.params?.tC ?? parsed?.tC;
  if (!Number.isFinite(Number(tC))) throw new Error("Device response did not include a temperature reading.");
  return Number(tC);
}

// Polls one configured thermometer and writes its reading in, or throws on
// failure (deliberately doesn't touch lastSeen on failure — the existing
// 30-minute staleness check already turns a run of misses into an "Offline"
// card without any extra error-state plumbing here). Exported so the Connect
// page can offer a "Check now" button rather than waiting for the next
// scheduled poll — handy right after adding a new thermometer.
export async function pollShellyLocalThermometerOnce(config) {
  const currentValue = await readShellyTemperature(config.ip);
  await setDoc(
    doc(db, CONNECTED_DEVICES_COLLECTION, config.id),
    {
      provider: SHELLY_LOCAL_PROVIDER_ID,
      providerLabel: "Local Thermometers",
      name: config.name,
      type: "fridge",
      site: config.site || "Main Branch",
      room: config.room || "Unassigned",
      equipment: "Cold chain storage",
      currentValue,
      unit: "°C",
      min: config.min,
      max: config.max,
      lastSeen: serverTimestamp(),
    },
    { merge: true }
  );
  return currentValue;
}

async function pollOnce() {
  const snap = await getDocs(collection(db, SHELLY_LOCAL_THERMOMETERS_COLLECTION));
  await Promise.all(
    snap.docs.map(async (row) => {
      const config = { id: row.id, ...row.data() };
      try {
        await pollShellyLocalThermometerOnce(config);
      } catch (error) {
        console.warn(`Local thermometer ${config.name || config.id} did not respond`, error);
      }
    })
  );
}

// Starts the background polling loop. No-ops (and returns a no-op cleanup)
// outside the Tauri desktop shell, since only a PC sitting on the practice's
// own WiFi can actually reach these devices — not the cloud, not mobile.
export function startShellyLocalPolling(intervalMs = DEFAULT_POLL_INTERVAL_MS) {
  if (!isTauriDesktop()) return () => {};

  let cancelled = false;
  pollOnce().catch((error) => console.warn("Initial local thermometer poll failed", error));
  const timer = setInterval(() => {
    if (!cancelled) pollOnce().catch((error) => console.warn("Local thermometer poll failed", error));
  }, intervalMs);

  return () => {
    cancelled = true;
    clearInterval(timer);
  };
}
