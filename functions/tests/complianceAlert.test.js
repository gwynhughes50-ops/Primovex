const test = require("node:test");
const assert = require("node:assert/strict");
const { raiseComplianceAlert, buildComplianceAlert, ALERT_ROLES, HOURLY_LIMIT } = require("../services/complianceAlertService");

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

const incident = (over = {}) => ({
  assetId: "a-1", assetCode: "WH-002", assetLabel: "Staff Kitchen Hot Tap", location: "Staff kitchen",
  summary: "Staff Kitchen Hot Tap read 44°C, outside its safe range (50°C to 65°C).", severity: "high", status: "open", openedByUid: "care", openedBy: "Colin", ...over,
});
const world = (over = {}) => fakeDb({
  "users/care": { role: "Caretaker", displayName: "Colin" },
  "users/care2": { role: "Caretaker", displayName: "Second", active: false },
  "users/pm": { role: "Practice Manager", displayName: "Gwyn" },
  "users/nurse": { role: "Nurse", displayName: "Nina" },
  "users/part": { role: "Partner", displayName: "Pat" },
  "compliance_incidents/inc-1": incident(),
  ...over,
});
const raise = (db, over = {}) => raiseComplianceAlert({ db, callerUid: "care", data: { incidentId: "inc-1" }, now: NOW, ...over });
const toWho = (db) => db.sent.map((n) => n.path.split("/")[1]).sort();

test("the caretaker and the practice manager are told, with the asset and what was found", async () => {
  const db = world();
  const result = await raise(db);
  assert.deepEqual(result, { sent: 2, roles: ALERT_ROLES });
  assert.deepEqual(toWho(db), ["care", "pm"], "not the inactive caretaker, the nurse or the partner");
  const note = db.sent.find((n) => n.path.includes("users/pm/"));
  assert.equal(note.kind, "compliance-alert");
  assert.equal(note.priority, "critical");
  assert.equal(note.automated, true);
  assert.equal(note.title, "Staff Kitchen Hot Tap failed its check");
  assert.match(note.message, /read 44°C, outside its safe range \(50°C to 65°C\)\. Location: Staff kitchen\. Recorded by Colin\./);
  assert.equal(note.incidentId, "inc-1");
  assert.equal(note.recipientUid, "pm");
  assert.equal(note.read, false);
});

test("a less serious failure is high priority rather than critical", async () => {
  const db = world({ "compliance_incidents/inc-1": incident({ severity: "medium" }) });
  await raise(db);
  assert.equal(db.sent[0].priority, "high");
});

test("the incident is marked as alerted and a second request does nothing", async () => {
  const db = world();
  await raise(db);
  const stored = db.store.get("compliance_incidents/inc-1");
  assert.ok(stored.alertedAt);
  assert.equal(stored.alertedCount, 2);
  assert.deepEqual(await raise(db), { sent: 0, alreadyAlerted: true, roles: [] });
  assert.equal(db.sent.length, 2);
});

test("only the person who recorded the check can raise the alert, and only for an open incident that exists", async () => {
  await assert.rejects(() => raise(world(), { callerUid: "nurse" }), /Only the person who recorded/);
  await assert.rejects(() => raise(world({ "compliance_incidents/inc-1": incident({ status: "resolved" }) })), /already closed/);
  await assert.rejects(() => raise(world(), { data: { incidentId: "nope" } }), /isn.t there/);
  await assert.rejects(() => raise(world(), { data: {} }), /which incident/);
});

test("nobody to tell is reported, not an error", async () => {
  const db = fakeDb({ "users/care": { role: "Nurse" }, "compliance_incidents/inc-1": incident() });
  assert.deepEqual(await raise(db), { sent: 0, roles: ALERT_ROLES });
});

test("each person has an hourly limit", async () => {
  const db = world();
  for (let i = 0; i < HOURLY_LIMIT; i += 1) {
    db.store.set("compliance_incidents/inc-1", incident());
    await raise(db);
  }
  db.store.set("compliance_incidents/inc-1", incident());
  await assert.rejects(() => raise(db), /this hour/);
});

test("the message is built from the incident and tidied, with nothing the caller typed in the request", () => {
  const n = buildComplianceAlert({ incident: incident({ summary: "x\u0000y   z", location: "" }), incidentId: "i", recipientUid: "u" });
  assert.match(n.message, /^x y z Recorded by Colin\./);
  assert.equal(buildComplianceAlert({ incident: { openedBy: "A" }, incidentId: "i", recipientUid: "u" }).title, "A compliance asset failed its check");
});
