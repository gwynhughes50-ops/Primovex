const test = require("node:test");
const assert = require("node:assert/strict");
const { raiseFridgeAlert, buildFridgeAlert, DEFAULT_ROLES, HOURLY_LIMIT } = require("../services/fridgeAlertService");

const NOW = new Date(Date.UTC(2026, 9, 12, 9, 0, 0));

// A small in-memory Firestore: documents by path, collections you can filter with where(==), and batches.
function fakeDb(initial = {}) {
  const store = new Map(Object.entries(initial));
  const sent = [];
  let counter = 0;
  const docRef = (path) => ({
    path,
    get: async () => ({ exists: store.has(path), data: () => store.get(path) }),
    set: async (value) => { store.set(path, value); },
    update: async (value) => { store.set(path, { ...store.get(path), ...value }); },
    collection: (sub) => collectionRef(`${path}/${sub}`),
  });
  const collectionRef = (path) => ({
    doc: (id) => docRef(`${path}/${id ?? `auto${(counter += 1)}`}`),
    where: (field, op, value) => ({
      get: async () => ({
        docs: [...store.entries()]
          .filter(([key]) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes("/"))
          .filter(([, data]) => op === "==" && data[field] === value)
          .map(([key, data]) => ({ id: key.slice(path.length + 1), data: () => data })),
      }),
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
    runTransaction: async (fn) => fn({ get: async (ref) => ref.get(), set: (ref, value) => store.set(ref.path, value) }),
  };
}

const incident = (over = {}) => ({ unitId: "u-1", unitName: "Vaccine fridge", status: "open", openedByUid: "hca", openedBy: "Hayley", observedTemp: 6, observedMin: 4, observedMax: 9.5, expectedRange: { min: 2, max: 8 }, ...over });
const world = (over = {}) => fakeDb({
  "users/hca": { role: "HCA", displayName: "Hayley" },
  "users/pm": { role: "Practice Manager", displayName: "Gwyn" },
  "users/pm2": { role: "Practice Manager", displayName: "Other PM", active: false },
  "users/lead": { role: "Nurse Manager", displayName: "Lead" },
  "users/nurse": { role: "Nurse", displayName: "Nina" },
  "temperature_incidents/inc-1": incident(),
  ...over,
});
const raise = (db, over = {}) => raiseFridgeAlert({ db, callerUid: "hca", data: { incidentId: "inc-1" }, now: NOW, ...over });
const toWho = (db) => db.sent.map((n) => n.path.split("/")[1]).sort();

test("with nothing set up, the Practice Manager is told, with the readings and the fridge", async () => {
  const db = world();
  const result = await raise(db);
  assert.deepEqual(result, { sent: 1, roles: DEFAULT_ROLES });
  assert.deepEqual(toWho(db), ["pm"]);
  const note = db.sent[0];
  assert.equal(note.kind, "fridge-alert");
  assert.equal(note.priority, "critical");
  assert.equal(note.automated, true);
  assert.equal(note.title, "Vaccine fridge is out of range");
  assert.match(note.message, /Readings: now 6°C, min 4°C, max 9\.5°C\. The safe range is 2°C to 8°C\. Recorded by Hayley\./);
  assert.equal(note.incidentId, "inc-1");
  assert.equal(note.recipientUid, "pm");
  assert.equal(note.read, false);
});

test("the roles ticked under Practice Admin are the ones told, and only active people", async () => {
  const db = world({ "settings/fridgeAlerts": { roles: ["Practice Manager", "Nurse Manager"] } });
  const result = await raise(db);
  assert.equal(result.sent, 2);
  assert.deepEqual(toWho(db), ["lead", "pm"], "the inactive Practice Manager and the ordinary nurse are not told");
  assert.deepEqual(result.roles, ["Practice Manager", "Nurse Manager"]);
});

test("the person who recorded it is never told about their own reading, even if their role is ticked", async () => {
  const db = world({ "settings/fridgeAlerts": { roles: ["HCA", "Practice Manager"] } });
  await raise(db);
  assert.deepEqual(toWho(db), ["pm"]);
});

test("an empty or broken setting falls back to the Practice Manager", async () => {
  for (const setting of [{ roles: [] }, { roles: "nope" }, {}]) {
    const db = world({ "settings/fridgeAlerts": setting });
    assert.deepEqual((await raise(db)).roles, DEFAULT_ROLES);
  }
});

test("the incident is marked as alerted and a second request does nothing", async () => {
  const db = world();
  await raise(db);
  const stored = db.store.get("temperature_incidents/inc-1");
  assert.ok(stored.alertedAt);
  assert.equal(stored.alertedCount, 1);
  const again = await raise(db);
  assert.deepEqual(again, { sent: 0, alreadyAlerted: true, roles: [] });
  assert.equal(db.sent.length, 1);
});

test("only the person who recorded it can raise the alert, and only for an open incident that exists", async () => {
  await assert.rejects(() => raise(world(), { callerUid: "nurse" }), /Only the person who recorded/);
  await assert.rejects(() => raise(world({ "temperature_incidents/inc-1": incident({ status: "resolved" }) })), /already closed/);
  await assert.rejects(() => raise(world(), { data: { incidentId: "nope" } }), /isn't there/);
  await assert.rejects(() => raise(world(), { data: {} }), /which incident/);
});

test("nobody to tell is reported, not an error", async () => {
  const db = fakeDb({ "users/hca": { role: "HCA" }, "temperature_incidents/inc-1": incident() });
  assert.deepEqual(await raise(db), { sent: 0, roles: DEFAULT_ROLES });
});

test("each person has an hourly limit", async () => {
  const db = world();
  for (let i = 0; i < HOURLY_LIMIT; i += 1) {
    db.store.set("temperature_incidents/inc-1", incident());
    await raise(db);
  }
  db.store.set("temperature_incidents/inc-1", incident());
  await assert.rejects(() => raise(db), /this hour/);
});

test("the message is built from the incident, with no typed text in it", () => {
  const n = buildFridgeAlert({ incident: incident({ actionsTaken: "Told the Practice Manager", details: "free text" }), incidentId: "i", recipientUid: "u" });
  assert.ok(!n.message.includes("free text") && !n.message.includes("Told the Practice Manager"));
  assert.equal(buildFridgeAlert({ incident: { openedBy: "A" }, incidentId: "i", recipientUid: "u" }).title, "A fridge is out of range");
});
