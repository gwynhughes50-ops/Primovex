const crypto = require("crypto");
const { FieldValue } = require("firebase-admin/firestore");
const { HttpsError } = require("firebase-functions/v2/https");
const { buildFridgeAlert, recipientUids } = require("./fridgeAlertService");

// Primovex's own temperature sensors. A sensor (a Shelly, or anything that can call a web address) calls
//   https://.../sensorReport?d=<sensor id>&k=<its key>&t=<temperature>&h=<humidity>&b=<battery>&r=<wifi dBm>
// each time it reports. No PC has to be on and no third-party cloud is involved: the call goes straight to Primovex,
// which records the reading, raises a fridge alert when it stays out of range, and tells the Practice Manager when a
// sensor goes quiet. The key is long and random, shown once when the sensor is added, and only its hash is kept.

const KEYS = "sensor_keys"; // { keyHash }: nobody can read it from the app
const CONFIG = "sensor_config"; // what the practice set up and the latest state, readable by those who see Connect
const DEVICES = "connected_devices";
const READINGS = "connect_device_readings";

const DEFAULT_EVERY_MIN = 60;
const DEFAULT_EXCURSION_MIN = 10;
const MIN_GAP_MS = 20 * 1000; // a sensor that calls twice in a breath is counted once
const SILENT_GRACE_MIN = 15;
const NAME_MAX = 80;

const tidy = (value, max = 120) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const num = (value) => (value === undefined || value === null || String(value).trim() === "" || !Number.isFinite(Number(value)) ? null : Number(value));

const newKey = () => crypto.randomBytes(24).toString("base64url");
const hashKey = (key) => crypto.createHash("sha256").update(String(key)).digest("hex");
function keyMatches(key, hash) {
  if (!key || !hash) return false;
  const a = Buffer.from(hashKey(key), "hex");
  const b = Buffer.from(String(hash), "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// How long without a report before a sensor counts as quiet: twice its usual gap, plus a grace period.
const silentAfterMin = (everyMin) => Math.max(30, 2 * (Number(everyMin) || DEFAULT_EVERY_MIN) + SILENT_GRACE_MIN);

// What a sensor sends. Anything unusable is dropped rather than recorded as a reading.
function parseReport(params = {}) {
  const id = String(params.d ?? "").trim();
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(id)) return { ok: false, error: "Unknown sensor." };
  const key = String(params.k ?? "");
  if (!key || key.length > 128) return { ok: false, error: "Unknown sensor." };
  const t = num(params.t);
  if (t === null || t < -70 || t > 150) return { ok: false, error: "No usable temperature." };
  const h = num(params.h);
  const b = num(params.b);
  const r = num(params.r);
  return {
    ok: true,
    id,
    key,
    value: {
      tempC: Math.round(t * 10) / 10,
      humidity: h !== null && h >= 0 && h <= 100 ? Math.round(h) : null,
      battery: b !== null && b >= 0 && b <= 100 ? Math.round(b) : null,
      rssi: r !== null && r >= -120 && r <= 0 ? Math.round(r) : null,
    },
  };
}

// a stored time as milliseconds, whether it is a Firestore timestamp, a Date or a number
const toMs = (value) => (value?.toMillis ? value.toMillis() : value instanceof Date ? value.getTime() : typeof value === "number" ? value : null);

const rssiToPercent = (rssi) => (rssi == null ? null : Math.max(0, Math.min(100, Math.round(2 * (rssi + 100)))));

// ---- setting a sensor up --------------------------------------------------------------------------------------------

function validateSetup(data = {}) {
  const name = tidy(data.name, NAME_MAX);
  if (!name) throw new HttpsError("invalid-argument", "Give the sensor a name.");
  const min = num(data.min);
  const max = num(data.max);
  if (min === null || max === null || min >= max) throw new HttpsError("invalid-argument", "Set a safe range: the minimum must be below the maximum.");
  const everyMin = Math.round(num(data.expectedEveryMin) ?? DEFAULT_EVERY_MIN);
  if (everyMin < 1 || everyMin > 1440) throw new HttpsError("invalid-argument", "Say how often it reports, between 1 minute and 24 hours.");
  const excursionMin = Math.round(num(data.excursionDelayMin) ?? DEFAULT_EXCURSION_MIN);
  if (excursionMin < 0 || excursionMin > 240) throw new HttpsError("invalid-argument", "How long out of range before alerting must be between 0 and 240 minutes.");
  const type = ["fridge", "freezer", "room_sensor"].includes(data.type) ? data.type : "fridge";
  return { name, type, room: tidy(data.room, 80) || "Unassigned", site: tidy(data.site, 80) || "Main Branch", min, max, everyMin, excursionMin };
}

// Add a sensor, or change one's settings, or give it a new key, or remove it.
async function manageSensor({ db, callerUid, callerName = "", data = {}, now = new Date(), makeId = () => `sensor-${crypto.randomBytes(5).toString("hex")}` }) {
  const action = String(data.action || "");
  if (action === "create") {
    const setup = validateSetup(data);
    const id = makeId();
    const key = newKey();
    await db.collection(KEYS).doc(id).set({ keyHash: hashKey(key), createdAt: FieldValue.serverTimestamp(), createdBy: callerUid });
    await db.collection(CONFIG).doc(id).set({
      name: setup.name, type: setup.type, room: setup.room, site: setup.site, min: setup.min, max: setup.max,
      expectedEveryMin: setup.everyMin, excursionDelayMin: setup.excursionMin,
      createdAt: FieldValue.serverTimestamp(), createdBy: callerUid, createdByName: tidy(callerName, 80),
      lastReportAt: null, outSinceMs: null, openIncidentId: null, silentAlertedAt: null,
    });
    return { id, key };
  }
  const id = String(data.id || "").trim();
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(id)) throw new HttpsError("invalid-argument", "Say which sensor.");
  const ref = db.collection(CONFIG).doc(id);
  const existing = await ref.get();
  if (!existing.exists) throw new HttpsError("not-found", "That sensor isn't there.");
  if (action === "rotate") {
    const key = newKey();
    await db.collection(KEYS).doc(id).set({ keyHash: hashKey(key), rotatedAt: FieldValue.serverTimestamp(), rotatedBy: callerUid }, { merge: true });
    return { id, key };
  }
  if (action === "update") {
    const setup = validateSetup({ ...existing.data(), expectedEveryMin: existing.data().expectedEveryMin, excursionDelayMin: existing.data().excursionDelayMin, ...data });
    await ref.update({ name: setup.name, type: setup.type, room: setup.room, site: setup.site, min: setup.min, max: setup.max, expectedEveryMin: setup.everyMin, excursionDelayMin: setup.excursionMin });
    await db.collection(DEVICES).doc(id).set({ name: setup.name, type: setup.type, room: setup.room, site: setup.site, min: setup.min, max: setup.max, expectedEveryMin: setup.everyMin }, { merge: true });
    return { id };
  }
  if (action === "remove") {
    await db.collection(KEYS).doc(id).delete();
    await ref.delete();
    await db.collection(DEVICES).doc(id).delete();
    return { id, removed: true };
  }
  throw new HttpsError("invalid-argument", "Unknown action.");
}

// ---- a report arriving ----------------------------------------------------------------------------------------------

const inRange = (temp, min, max) => temp >= min && temp <= max;

async function notify({ db, incident, incidentId, roles }) {
  const recipients = await recipientUids(db, roles);
  const batch = db.batch();
  recipients.forEach((uid) => {
    batch.set(db.collection("users").doc(uid).collection("notifications").doc(), {
      ...buildFridgeAlert({ incident, incidentId, recipientUid: uid }),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  await batch.commit();
  return recipients.length;
}

// Record a reading from a sensor whose key has already been checked.
async function applyReport({ db, id, report, now = new Date(), roles }) {
  const configRef = db.collection(CONFIG).doc(id);
  const snapshot = await configRef.get();
  if (!snapshot.exists) return { recorded: false, reason: "unknown" };
  const config = snapshot.data() || {};
  const nowMs = now.getTime();
  const lastMs = toMs(config.lastReportAt);
  if (lastMs && nowMs - lastMs < MIN_GAP_MS) return { recorded: false, reason: "too-soon" };

  const { tempC, humidity, battery, rssi } = report;
  await db.collection(DEVICES).doc(id).set({
    provider: "primovex-sensor",
    providerLabel: "Primovex sensor",
    name: config.name,
    type: config.type || "fridge",
    site: config.site,
    room: config.room,
    equipment: "Cold chain storage",
    currentValue: tempC,
    unit: "°C",
    min: config.min,
    max: config.max,
    humidity,
    battery,
    ...(rssi != null ? { signal: rssiToPercent(rssi), wifiRssi: rssi } : {}),
    expectedEveryMin: config.expectedEveryMin,
    lastSeen: FieldValue.serverTimestamp(),
  }, { merge: true });
  await db.collection(READINGS).add({ deviceId: id, provider: "primovex-sensor", tempC, humidity, battery, source: "sensor-webhook", recordedAt: FieldValue.serverTimestamp() });

  const patch = { lastReportAt: now, silentAlertedAt: null };
  let alerted = 0;
  let incidentId = config.openIncidentId || null;

  // an alert already raised stays open until a person resolves it; a new one only starts after that
  if (incidentId) {
    const open = await db.collection("temperature_incidents").doc(incidentId).get();
    if (!open.exists || String(open.data()?.status || "open") !== "open") { incidentId = null; patch.openIncidentId = null; }
  }

  if (inRange(tempC, config.min, config.max)) {
    patch.outSinceMs = null;
  } else {
    const since = config.outSinceMs || nowMs;
    patch.outSinceMs = since;
    const delayMs = (Number.isFinite(Number(config.excursionDelayMin)) ? Number(config.excursionDelayMin) : DEFAULT_EXCURSION_MIN) * 60000;
    if (!incidentId && nowMs - since >= delayMs) {
      const incident = {
        unitId: id,
        unitName: config.name,
        siteId: config.site || "",
        expectedRange: { min: config.min, max: config.max },
        observedTemp: tempC,
        summary: `${config.name} is out of range`,
        details: `The sensor reported ${tempC}°C, outside the safe range of ${config.min} to ${config.max}°C, and it has stayed out of range for ${Math.max(0, Math.round((nowMs - since) / 60000))} minutes.`,
        actionsTaken: "",
        affectedStock: { quarantined: false, discarded: false, movedToBackupUnit: false, stockNotes: "" },
        status: "open",
        openedAt: FieldValue.serverTimestamp(),
        openedBy: "Primovex sensor",
        openedByUid: "system",
        source: "sensor",
        resolvedAt: null,
        resolvedBy: null,
        resolutionNotes: "",
      };
      const ref = db.collection("temperature_incidents").doc();
      await ref.set(incident);
      incidentId = ref.id;
      patch.openIncidentId = incidentId;
      alerted = await notify({ db, incident, incidentId, roles });
      await ref.update({ alertedAt: FieldValue.serverTimestamp(), alertedCount: alerted });
    }
  }
  await configRef.update(patch);
  return { recorded: true, outOfRange: !inRange(tempC, config.min, config.max), incidentId, alerted };
}

// ---- noticing a sensor has gone quiet ---------------------------------------------------------------------------------

function buildSilentAlert({ config, id, recipientUid, minutes }) {
  return {
    recipientUid,
    module: "temperature",
    kind: "sensor-silent",
    title: `${tidy(config.name, 80) || "A sensor"} has stopped reporting`,
    message: `No reading for about ${minutes >= 120 ? `${Math.round(minutes / 60)} hours` : `${minutes} minutes`}. Check it has power and WiFi, and check the fridge by eye until it reports again.`,
    priority: "high",
    read: false,
    status: "open",
    actionUrl: "/connect",
    automated: true,
    createdByName: "Primovex",
    deviceId: id,
  };
}

// Run every few minutes: tell the right people once for each sensor that has gone quiet.
async function checkSilentSensors({ db, now = new Date(), roles }) {
  const all = await db.collection(CONFIG).get();
  const nowMs = now.getTime();
  let told = 0;
  for (const doc of all.docs) {
    const config = doc.data() || {};
    const lastMs = toMs(config.lastReportAt);
    if (!lastMs || config.silentAlertedAt) continue;
    const minutes = Math.round((nowMs - lastMs) / 60000);
    if (minutes < silentAfterMin(config.expectedEveryMin)) continue;
    const recipients = await recipientUids(db, roles);
    const batch = db.batch();
    recipients.forEach((uid) => {
      batch.set(db.collection("users").doc(uid).collection("notifications").doc(), {
        ...buildSilentAlert({ config, id: doc.id, recipientUid: uid, minutes }),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
    await db.collection(CONFIG).doc(doc.id).update({ silentAlertedAt: now });
    told += recipients.length;
  }
  return { told };
}

module.exports = { applyReport, buildSilentAlert, checkSilentSensors, hashKey, keyMatches, manageSensor, newKey, parseReport, rssiToPercent, silentAfterMin, DEFAULT_EVERY_MIN, DEFAULT_EXCURSION_MIN };
