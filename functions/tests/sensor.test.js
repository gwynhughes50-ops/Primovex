const test = require("node:test");
const assert = require("node:assert/strict");
const { applyReport, checkSilentSensors, hashKey, keyMatches, manageSensor, parseReport, silentAfterMin } = require("../services/sensorService");

const NOW = new Date(Date.UTC(2026, 9, 12, 9, 0, 0));
const minutes = (n) => new Date(NOW.getTime() + n * 60000);

// A small in-memory Firestore: documents by path, whole collections, where(==), add, delete and batches.
function fakeDb(initial = {}) {
  const store = new Map(Object.entries(initial));
  const sent = [];
  let counter = 0;
  const merge = (path, value) => store.set(path, { ...(store.get(path) || {}), ...value });
  const docRef = (path) => ({
    path,
    id: path.split("/").pop(),
    get: async () => ({ exists: store.has(path), id: path.split("/").pop(), data: () => store.get(path) }),
    set: async (value, options) => { if (options?.merge) merge(path, value); else store.set(path, value); },
    update: async (value) => merge(path, value),
    delete: async () => { store.delete(path); },
    collection: (sub) => collectionRef(`${path}/${sub}`),
  });
  const children = (path) => [...store.entries()].filter(([key]) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes("/"));
  const collectionRef = (path) => ({
    doc: (id) => docRef(`${path}/${id ?? `auto${(counter += 1)}`}`),
    add: async (value) => { const ref = docRef(`${path}/auto${(counter += 1)}`); store.set(ref.path, value); return ref; },
    get: async () => ({ docs: children(path).map(([key, data]) => ({ id: key.slice(path.length + 1), data: () => data })) }),
    where: (field, op, value) => ({
      get: async () => ({ docs: children(path).filter(([, data]) => op === "==" && data[field] === value).map(([key, data]) => ({ id: key.slice(path.length + 1), data: () => data })) }),
    }),
  });
  return {
    store,
    sent,
    collection: (name) => collectionRef(name),
    batch: () => {
      const ops = [];
      return { set: (ref, data) => ops.push([ref, data]), commit: async () => ops.forEach(([ref, data]) => { store.set(ref.path, data); sent.push({ path: ref.path, ...data }); }) };
    },
  };
}

const people = {
  "users/pm": { role: "Practice Manager", displayName: "Gwyn" },
  "users/lead": { role: "Nurse Manager", displayName: "Lead" },
  "users/nurse": { role: "Nurse", displayName: "Nina" },
  "users/pm2": { role: "Practice Manager", active: false },
};
const ROLES = ["Practice Manager", "Nurse Manager"];
const setup = { name: "Room 68", room: "Managers Room", site: "Main Branch", min: 15, max: 40, expectedEveryMin: 60, excursionDelayMin: 10 };
const configDoc = (over = {}) => ({ ...setup, lastReportAt: null, outSinceMs: null, openIncidentId: null, silentAlertedAt: null, ...over });
const report = (tempC, over = {}) => ({ tempC, humidity: 35, battery: 80, rssi: -60, ...over });

test("a report is checked: the id, the key and a usable temperature; rubbish is dropped", () => {
  const good = parseReport({ d: "sensor-abc123", k: "secretkey", t: "4.26", h: "55", b: "80", r: "-62" });
  assert.deepEqual(good.value, { tempC: 4.3, humidity: 55, battery: 80, rssi: -62 });
  assert.equal(parseReport({ d: "sensor-abc123", k: "x", t: "undefined" }).ok, false, "a value the sensor could not fill in");
  assert.equal(parseReport({ d: "sensor-abc123", k: "x", t: "900" }).ok, false, "impossible temperature");
  assert.equal(parseReport({ d: "../etc", k: "x", t: "4" }).ok, false);
  assert.equal(parseReport({ d: "sensor-abc123", t: "4" }).ok, false, "no key");
  const partial = parseReport({ d: "sensor-abc123", k: "x", t: "4", h: "", b: "abc", r: "50" });
  assert.deepEqual(partial.value, { tempC: 4, humidity: null, battery: null, rssi: null });
});

test("the key is shown once and only its hash is kept; a wrong one never matches", async () => {
  const db = fakeDb();
  const { id, key } = await manageSensor({ db, callerUid: "pm", callerName: "Gwyn", data: { action: "create", ...setup }, makeId: () => "sensor-test01" });
  assert.equal(id, "sensor-test01");
  const stored = db.store.get("sensor_keys/sensor-test01");
  assert.notEqual(stored.keyHash, key, "the key itself is not stored");
  assert.ok(keyMatches(key, stored.keyHash));
  assert.ok(!keyMatches("not-the-key", stored.keyHash));
  assert.ok(!keyMatches("", stored.keyHash));
  assert.equal(db.store.get("sensor_config/sensor-test01").name, "Room 68");
  assert.ok(!db.store.has("connected_devices/sensor-test01"), "no reading yet, so no card showing 0°C");
  const rotated = await manageSensor({ db, callerUid: "pm", data: { action: "rotate", id } });
  assert.notEqual(rotated.key, key);
  assert.ok(!keyMatches(key, db.store.get("sensor_keys/sensor-test01").keyHash), "the old key stops working");
  assert.ok(keyMatches(rotated.key, db.store.get("sensor_keys/sensor-test01").keyHash));
  assert.equal(hashKey("a").length, 64);
});

test("setting a sensor up needs a name, a sensible range and a sensible interval", async () => {
  const db = fakeDb();
  const create = (over) => manageSensor({ db, callerUid: "pm", data: { action: "create", ...setup, ...over } });
  await assert.rejects(() => create({ name: " " }), /name/);
  await assert.rejects(() => create({ min: 8, max: 2 }), /range/);
  await assert.rejects(() => create({ min: "x" }), /range/);
  await assert.rejects(() => create({ expectedEveryMin: 0 }), /how often/);
  await assert.rejects(() => create({ excursionDelayMin: 999 }), /between 0 and 240/);
  await assert.rejects(() => manageSensor({ db, callerUid: "pm", data: { action: "rotate", id: "sensor-nothere" } }), /isn't there/);
  await assert.rejects(() => manageSensor({ db, callerUid: "pm", data: { action: "explode", id: "sensor-nothere" } }), /Unknown|isn't there/);
});

test("an in-range reading updates the card and the history, and clears nothing it shouldn't", async () => {
  const db = fakeDb({ ...people, "sensor_config/s1": configDoc() });
  const result = await applyReport({ db, id: "s1", report: report(22), now: NOW, roles: ROLES });
  assert.deepEqual([result.recorded, result.outOfRange, result.alerted], [true, false, 0]);
  const card = db.store.get("connected_devices/s1");
  assert.deepEqual([card.currentValue, card.humidity, card.battery, card.signal, card.provider, card.expectedEveryMin], [22, 35, 80, 80, "primovex-sensor", 60]);
  assert.ok([...db.store.keys()].some((k) => k.startsWith("connect_device_readings/")));
  assert.equal(db.sent.length, 0);
  assert.equal((await applyReport({ db, id: "s1", report: report(23), now: minutes(0.2), roles: ROLES })).reason, "too-soon", "two calls in a breath are one reading");
  assert.equal((await applyReport({ db, id: "nope", report: report(23), now: NOW, roles: ROLES })).reason, "unknown");
});

test("out of range only raises a fridge alert once it has stayed out for the delay, and only once", async () => {
  const db = fakeDb({ ...people, "sensor_config/s1": configDoc() });
  const first = await applyReport({ db, id: "s1", report: report(45), now: NOW, roles: ROLES });
  assert.deepEqual([first.outOfRange, first.incidentId, first.alerted], [true, null, 0], "a blip is not an incident yet");
  const second = await applyReport({ db, id: "s1", report: report(46), now: minutes(5), roles: ROLES });
  assert.equal(second.incidentId, null, "five minutes is inside the ten-minute delay");
  const third = await applyReport({ db, id: "s1", report: report(47), now: minutes(12), roles: ROLES });
  assert.ok(third.incidentId);
  assert.equal(third.alerted, 2, "the Practice Manager and the Nurse Manager, not the nurse or the inactive account");
  assert.deepEqual(db.sent.map((n) => n.path.split("/")[1]).sort(), ["lead", "pm"]);
  const incident = db.store.get(`temperature_incidents/${third.incidentId}`);
  assert.deepEqual([incident.status, incident.source, incident.observedTemp, incident.unitName, incident.openedBy], ["open", "sensor", 47, "Room 68", "Primovex sensor"]);
  assert.equal(db.sent[0].kind, "fridge-alert");
  assert.equal(db.sent[0].incidentId, third.incidentId);
  const fourth = await applyReport({ db, id: "s1", report: report(48), now: minutes(25), roles: ROLES });
  assert.equal(fourth.alerted, 0, "already raised; not again");
  assert.equal(db.sent.length, 2);
});

test("back in range restarts the clock, and a resolved incident lets the next excursion raise a new one", async () => {
  const db = fakeDb({ ...people, "sensor_config/s1": configDoc() });
  await applyReport({ db, id: "s1", report: report(45), now: NOW, roles: ROLES });
  await applyReport({ db, id: "s1", report: report(20), now: minutes(8), roles: ROLES });
  assert.equal(db.store.get("sensor_config/s1").outSinceMs, null);
  const late = await applyReport({ db, id: "s1", report: report(45), now: minutes(14), roles: ROLES });
  assert.equal(late.incidentId, null, "the clock restarted at 14 minutes, not 0");
  const raised = await applyReport({ db, id: "s1", report: report(45), now: minutes(30), roles: ROLES });
  assert.ok(raised.incidentId);
  db.store.set(`temperature_incidents/${raised.incidentId}`, { ...db.store.get(`temperature_incidents/${raised.incidentId}`), status: "resolved" });
  await applyReport({ db, id: "s1", report: report(20), now: minutes(40), roles: ROLES });
  await applyReport({ db, id: "s1", report: report(46), now: minutes(50), roles: ROLES });
  const again = await applyReport({ db, id: "s1", report: report(46), now: minutes(65), roles: ROLES });
  assert.ok(again.incidentId && again.incidentId !== raised.incidentId, "a new excursion is a new incident");
});

test("a sensor that goes quiet is reported once, and again only after it has reported in between", async () => {
  assert.equal(silentAfterMin(60), 135);
  assert.equal(silentAfterMin(5), 30, "never sooner than half an hour");
  const db = fakeDb({ ...people, "sensor_config/s1": configDoc({ lastReportAt: NOW }), "sensor_config/new": configDoc() });
  assert.equal((await checkSilentSensors({ db, now: minutes(100), roles: ROLES })).told, 0, "inside two hours and a quarter");
  const told = await checkSilentSensors({ db, now: minutes(140), roles: ROLES });
  assert.equal(told.told, 2);
  assert.equal(db.sent[0].kind, "sensor-silent");
  assert.match(db.sent[0].message, /2 hours/);
  assert.match(db.sent[0].title, /Room 68 has stopped reporting/);
  assert.equal((await checkSilentSensors({ db, now: minutes(200), roles: ROLES })).told, 0, "once per outage");
  await applyReport({ db, id: "s1", report: report(22), now: minutes(210), roles: ROLES });
  assert.equal(db.store.get("sensor_config/s1").silentAlertedAt, null);
  assert.equal((await checkSilentSensors({ db, now: minutes(400), roles: ROLES })).told, 2, "quiet again after reporting");
  assert.equal(db.sent.filter((n) => n.title.includes("new")).length, 0, "a sensor that has never reported is not 'gone quiet'");
});

test("changing a sensor's settings updates its card too, and removing it removes both", async () => {
  const db = fakeDb({ ...people, "sensor_config/sensor-s1": configDoc({ lastReportAt: NOW }), "sensor_keys/sensor-s1": { keyHash: "x" }, "connected_devices/sensor-s1": { name: "Room 68" } });
  await manageSensor({ db, callerUid: "pm", data: { action: "update", id: "sensor-s1", name: "Managers room", min: 10, max: 30 } });
  assert.deepEqual([db.store.get("sensor_config/sensor-s1").name, db.store.get("sensor_config/sensor-s1").min, db.store.get("connected_devices/sensor-s1").max], ["Managers room", 10, 30]);
  await manageSensor({ db, callerUid: "pm", data: { action: "remove", id: "sensor-s1" } });
  assert.ok(!db.store.has("sensor_config/sensor-s1") && !db.store.has("sensor_keys/sensor-s1") && !db.store.has("connected_devices/sensor-s1"));
});
