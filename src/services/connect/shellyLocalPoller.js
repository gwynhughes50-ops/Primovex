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

// Must match SHELLY_WAKE_PORT in src-tauri/src/lib.rs.
const SHELLY_WAKE_PORT = 47281;

// The exact URL to paste into the Shelly app's webhook/action setup for a
// battery sensor - this PC's own address on the practice network, so null
// outside the desktop app (nothing to point a webhook at from a phone).
export async function getShellyWakeWebhookUrl() {
  if (!isTauriDesktop()) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  const ip = await invoke("local_lan_ip");
  return `http://${ip}:${SHELLY_WAKE_PORT}/shelly-wake`;
}

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

// wakeOnly marks a battery sensor (e.g. Shelly H&T Gen3): it's asleep almost
// all the time, so the periodic poll skips it entirely and it's only ever
// read when its wake webhook fires (see startShellyLocalPolling). A
// mains-powered thermometer stays on the regular poll instead.
export async function addShellyLocalThermometer({ name, room, site, ip, min, max, wakeOnly = false }) {
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
    wakeOnly: Boolean(wakeOnly),
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
// directly, in one call — Shelly.GetStatus (Gen2+ API) returns every
// component's status together, which matters for a battery sensor that's
// only reachable for a few seconds after it wakes: one round trip beats two.
// Goes through the Rust side (fetch_local_device_reading) rather than a
// plain browser fetch() so it isn't subject to CORS, since these devices
// don't send CORS headers and were never meant to be called from a web page.
export async function readShellyStatus(ip) {
  const { invoke } = await import("@tauri-apps/api/core");
  const url = `http://${ip}/rpc/Shelly.GetStatus`;
  const raw = await invoke("fetch_local_device_reading", { url });
  const parsed = JSON.parse(raw);
  const componentKey = (prefix) => Object.keys(parsed).find((key) => key === prefix || key.startsWith(`${prefix}:`));

  const tempKey = componentKey("temperature");
  const tC = tempKey ? parsed[tempKey]?.tC : undefined;
  if (!Number.isFinite(Number(tC))) throw new Error("Device response did not include a temperature reading.");

  const humidityKey = componentKey("humidity");
  const rh = humidityKey ? parsed[humidityKey]?.rh : undefined;

  const powerKey = componentKey("devicepower");
  const batteryPercent = powerKey ? parsed[powerKey]?.battery?.percent : undefined;

  return {
    tempC: Number(tC),
    humidityPct: Number.isFinite(Number(rh)) ? Number(rh) : null,
    batteryPercent: Number.isFinite(Number(batteryPercent)) ? Number(batteryPercent) : null,
  };
}

// Polls one configured thermometer and writes its reading in, or throws on
// failure (deliberately doesn't touch lastSeen on failure — the existing
// 30-minute staleness check already turns a run of misses into an "Offline"
// card without any extra error-state plumbing here). Exported so the Connect
// page can offer a "Check now" button rather than waiting for the next
// scheduled poll — handy right after adding a new thermometer.
export async function pollShellyLocalThermometerOnce(config) {
  const { tempC, humidityPct, batteryPercent } = await readShellyStatus(config.ip);
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
      currentValue: tempC,
      unit: "°C",
      min: config.min,
      max: config.max,
      humidity: humidityPct,
      battery: batteryPercent,
      lastSeen: serverTimestamp(),
    },
    { merge: true }
  );
  return tempC;
}

// wakeOnly devices are skipped here — a battery sensor is asleep for almost
// the whole cycle, so a blind poll would just fail (and log noise) most of
// the time. Those are read instead the moment their wake webhook fires; see
// startShellyLocalPolling.
async function pollOnce() {
  const snap = await getDocs(collection(db, SHELLY_LOCAL_THERMOMETERS_COLLECTION));
  await Promise.all(
    snap.docs
      .map((row) => ({ id: row.id, ...row.data() }))
      .filter((config) => !config.wakeOnly)
      .map(async (config) => {
        try {
          await pollShellyLocalThermometerOnce(config);
        } catch (error) {
          console.warn(`Local thermometer ${config.name || config.id} did not respond`, error);
        }
      })
  );
}

// A battery sensor's own local RPC API is only reachable for a short window
// after it wakes (it made the wake call itself, so it should still be up),
// so this tries once, then once more after a short pause rather than giving
// up immediately on a reading that's about to go back to sleep.
async function readAwakeThermometer(config) {
  try {
    await pollShellyLocalThermometerOnce(config);
  } catch (error) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    try {
      await pollShellyLocalThermometerOnce(config);
    } catch (retryError) {
      console.warn(`Local thermometer ${config.name || config.id} woke but didn't respond in time`, retryError);
    }
  }
}

// Fired by the Rust side's wake listener the instant a battery sensor's own
// webhook call arrives (see start_shelly_wake_listener in lib.rs) - matched
// to a configured thermometer by the calling device's own LAN IP address, so
// nothing needs to be embedded in the webhook URL itself.
async function handleDeviceWoke(sourceIp) {
  if (!sourceIp) return;
  const snap = await getDocs(collection(db, SHELLY_LOCAL_THERMOMETERS_COLLECTION));
  const config = snap.docs.map((row) => ({ id: row.id, ...row.data() })).find((row) => row.ip === sourceIp);
  if (config) await readAwakeThermometer(config);
}

// Starts the background polling loop and the wake-webhook listener together;
// callers only need the one cleanup function. Both no-op (and return a no-op
// cleanup) outside the Tauri desktop shell, since only a PC sitting on the
// practice's own WiFi can actually reach these devices — not the cloud, not
// mobile.
export function startShellyLocalPolling(intervalMs = DEFAULT_POLL_INTERVAL_MS) {
  if (!isTauriDesktop()) return () => {};

  let cancelled = false;
  pollOnce().catch((error) => console.warn("Initial local thermometer poll failed", error));
  const timer = setInterval(() => {
    if (!cancelled) pollOnce().catch((error) => console.warn("Local thermometer poll failed", error));
  }, intervalMs);

  let unlistenWake = null;
  import("@tauri-apps/api/event")
    .then(({ listen }) => listen("shelly-device-woke", (event) => {
      if (!cancelled) handleDeviceWoke(event.payload).catch((error) => console.warn("Could not read a Shelly device that just woke", error));
    }))
    .then((fn) => {
      if (cancelled) fn();
      else unlistenWake = fn;
    })
    .catch((error) => console.warn("Could not start the Shelly wake listener", error));

  return () => {
    cancelled = true;
    clearInterval(timer);
    unlistenWake?.();
  };
}
