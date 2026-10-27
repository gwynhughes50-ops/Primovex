const test = require("node:test");
const assert = require("node:assert/strict");
const {
  HOURLY_LIMIT, RECIPIENT_MAX, buildOpportunityNotification, cleanOpportunity, cleanPatient, listRecipients, nhsNumberValid, sendQualityOpportunity, updateQualityOpportunity,
} = require("../services/qualityOpportunityService");

const NOW = new Date(Date.UTC(2026, 9, 27, 10, 0, 0));
const SENDER_CAPS = ["clinflow.read", "clinflow.workflow"];

function fakeDb(users = {}, records = {}) {
  const written = [];
  const store = new Map(Object.entries(records).map(([id, data]) => [`quality_opportunities/${id}`, data]));
  const limits = new Map();
  let n = 0;
  return {
    written, store,
    collection: (name) => ({
      get: async () => ({ docs: Object.entries(users).map(([id, data]) => ({ id, data: () => data })) }),
      where: (field, op, value) => ({ get: async () => ({ docs: Object.entries(users).filter(([, u]) => u[field] === value).map(([id, data]) => ({ id, data: () => data })) }) }),
      doc: (id) => {
        const docId = id || `auto${(n += 1)}`;
        const path = `${name}/${docId}`;
        return {
          id: docId, path,
          get: async () => (name === "users" ? { exists: docId in users, data: () => users[docId] } : name === "quality_opportunities" ? { exists: store.has(path), data: () => store.get(path) } : { exists: limits.has(path), data: () => limits.get(path) }),
          update: async (patch) => { store.set(path, { ...store.get(path), ...patch }); written.push({ path, update: patch }); },
          collection: (sub) => ({ doc: () => ({ id: `n${(n += 1)}`, path: `${path}/${sub}/n${n}`, uid: docId, sub }) }),
        };
      },
    }),
    batch: () => {
      const ops = [];
      return { set: (ref, data) => ops.push([ref, data]), commit: async () => ops.forEach(([ref, data]) => { written.push({ path: ref.path, data }); if (ref.path.startsWith("quality_opportunities/")) store.set(ref.path, data); }) };
    },
    runTransaction: async (fn) => fn({
      get: async (ref) => ({ exists: limits.has(ref.path), data: () => limits.get(ref.path) }),
      set: (ref, value) => limits.set(ref.path, value),
    }),
    limits,
  };
}
const staff = () => ({
  me: { displayName: "Ann Admin", role: "Practice Admin" },
  b1: { displayName: "Bea Business", role: "Business Manager" },
  b2: { displayName: "Ben Business", role: "Business Manager" },
  b3: { displayName: "Gone Business", role: "Business Manager", active: false },
  g1: { displayName: "Gwen GP", role: "GP" },
});
const opportunity = (extra = {}) => ({
  title: "Asthma diagnosis and monitoring prompt", domain: "Respiratory / QAIF", rationale: "Asthma wording was detected.", nextStep: "Check the diagnostic pathway.", source: "ClinFlow letter", letterRef: "cf-azure-1", ...extra,
});
const send = (over = {}, db = fakeDb(staff())) => sendQualityOpportunity({ db, callerUid: "me", callerName: "Ann Admin", capabilities: SENDER_CAPS, data: { toUid: "b1", ...opportunity(), ...over }, now: NOW });

test("an NHS number must pass its check digit, and the patient details kept are only those that are valid", () => {
  assert.equal(nhsNumberValid("943 476 5919"), true);
  assert.equal(nhsNumberValid("9434765918"), false);
  assert.deepEqual(cleanPatient({ initials: "d.j.", birthDate: "1954-06-12", nhsNumber: "943 476 5919", name: "David Jones" }), { initials: "DJ", birthDate: "1954-06-12", nhsNumber: "9434765919" }, "no full name is ever kept");
  assert.deepEqual(cleanPatient({ initials: "DJ", birthDate: "1954-02-31", nhsNumber: "9434765918" }), { initials: "DJ", birthDate: "", nhsNumber: "" }, "an impossible date and a wrong NHS number are left out");
  assert.equal(cleanPatient({ initials: "1234" }), null);
  assert.equal(cleanPatient(null), null);
});

test("an opportunity needs a title, and long text is cut", () => {
  assert.throws(() => cleanOpportunity({ title: "  " }), /Say what the opportunity is/);
  const clean = cleanOpportunity({ title: "x".repeat(500), rationale: "y".repeat(2000), note: "z".repeat(900), source: "" });
  assert.equal(clean.title.length, 140);
  assert.equal(clean.rationale.length, 400);
  assert.equal(clean.note.length, 300);
  assert.equal(clean.source, "ClinFlow letter");
});

test("it goes to one named colleague: a record for them, and a notification that carries no patient details", async () => {
  const db = fakeDb(staff());
  const result = await send({ patient: { initials: "DJ", birthDate: "1954-06-12", nhsNumber: "9434765919" }, note: "Please check this week" }, db);
  assert.deepEqual([result.sent, result.toName, result.hadPatient], [1, "Bea Business", true]);
  const record = db.written.find((w) => w.path.startsWith("quality_opportunities/")).data;
  assert.equal(record.recipientUid, "b1");
  assert.equal(record.senderUid, "me");
  assert.equal(record.status, "new");
  assert.deepEqual(record.patient, { initials: "DJ", birthDate: "1954-06-12", nhsNumber: "9434765919" });
  assert.equal(record.note, "Please check this week");
  const notification = db.written.find((w) => w.path.includes("/notifications/")).data;
  assert.equal(notification.recipientUid, "b1");
  assert.equal(notification.kind, "quality-opportunity");
  assert.match(notification.title, /Ann Admin sent you a quality opportunity/);
  assert.equal(notification.message, "Asthma diagnosis and monitoring prompt (Respiratory / QAIF)");
  assert.ok(!/1954|9434765919|DJ/.test(JSON.stringify(notification)), "the notification never carries the patient's details");
});

test("it can go to everyone with a role: each active person gets their own record, and the sender does not", async () => {
  const db = fakeDb({ ...staff(), b4: { displayName: "Me too", role: "Business Manager" } });
  const result = await sendQualityOpportunity({ db, callerUid: "b4", callerName: "Me too", capabilities: SENDER_CAPS, data: { role: "Business Manager", ...opportunity() }, now: NOW });
  assert.deepEqual([result.sent, result.role], [2, "Business Manager"], "Bea and Ben: not the sender, not the inactive one");
  const records = db.written.filter((w) => w.path.startsWith("quality_opportunities/")).map((w) => w.data);
  assert.deepEqual(records.map((r) => r.recipientUid).sort(), ["b1", "b2"]);
  assert.equal(new Set(records.map((r) => r.groupId)).size, 1, "one group, so the sender sees them together");
});

test("only someone with ClinFlow workflow access can send, and nobody can send to themselves, to a stranger or to nobody", async () => {
  await assert.rejects(sendQualityOpportunity({ db: fakeDb(staff()), callerUid: "g1", callerName: "Gwen", capabilities: ["clinflow.read"], data: { toUid: "b1", ...opportunity() }, now: NOW }), /ClinFlow workflow access/);
  await assert.rejects(send({ toUid: "me" }), /That is you/);
  await assert.rejects(send({ toUid: "b3" }), /can't be sent this/);
  await assert.rejects(send({ toUid: "nobody" }), /can't be sent this/);
  await assert.rejects(send({ toUid: "", role: "" }), /Choose who to send it to/);
  await assert.rejects(send({ toUid: "", role: "Astronaut" }), /No one else has the role/);
  await assert.rejects(send({ title: "" }), /Say what the opportunity is/);
});

test("a role bigger than the limit is refused, and sending is limited each hour", async () => {
  const crowd = Object.fromEntries(Array.from({ length: RECIPIENT_MAX + 1 }, (_, i) => [`c${i}`, { displayName: `Colleague ${i}`, role: "Crowd" }]));
  await assert.rejects(sendQualityOpportunity({ db: fakeDb({ me: { displayName: "Ann", role: "Admin" }, ...crowd }), callerUid: "me", callerName: "Ann", capabilities: SENDER_CAPS, data: { role: "Crowd", ...opportunity() }, now: NOW }), /more than 25 people/);
  const db = fakeDb(staff());
  for (let i = 0; i < HOURLY_LIMIT; i += 1) await send({}, db);
  await assert.rejects(send({}, db), /sent a lot this hour/);
});

test("the picker lists active colleagues and their roles, and never an email address", async () => {
  const db = fakeDb({ ...staff(), g2: { displayName: "Gus", role: "GP", email: "gus@example.nhs.uk" } });
  const { staff: people, roles } = await listRecipients({ db, callerUid: "me", capabilities: SENDER_CAPS });
  assert.deepEqual(people.map((p) => p.label), ["Bea Business", "Ben Business", "Gus", "Gwen GP"]);
  assert.ok(!JSON.stringify(people).includes("@"), "no email addresses");
  assert.deepEqual(roles, [{ role: "Business Manager", count: 2 }, { role: "GP", count: 2 }]);
  await assert.rejects(listRecipients({ db, callerUid: "me", capabilities: ["clinflow.read"] }), /ClinFlow workflow access/);
});

test("only the person it was sent to can say what happened, a decline needs a reason, and nothing else about the record changes", async () => {
  const db = fakeDb(staff());
  await send({ patient: { initials: "DJ", birthDate: "1954-06-12" } }, db);
  const id = [...db.store.keys()].find((k) => k.startsWith("quality_opportunities/")).split("/")[1];
  await assert.rejects(updateQualityOpportunity({ db, callerUid: "g1", data: { id, status: "actioned" }, now: NOW }), /Only the person it was sent to/);
  await assert.rejects(updateQualityOpportunity({ db, callerUid: "me", data: { id, status: "actioned" }, now: NOW }), /Only the person it was sent to/, "not even the sender");
  await assert.rejects(updateQualityOpportunity({ db, callerUid: "b1", data: { id, status: "new" }, now: NOW }), /Choose seen, actioned or declined/);
  await assert.rejects(updateQualityOpportunity({ db, callerUid: "b1", data: { id, status: "declined" }, now: NOW }), /Say briefly why/);
  await assert.rejects(updateQualityOpportunity({ db, callerUid: "b1", data: { id: "missing", status: "seen" }, now: NOW }), /could not be found/);
  const done = await updateQualityOpportunity({ db, callerUid: "b1", data: { id, status: "actioned", note: "Booked an asthma review" }, now: NOW });
  assert.deepEqual([done.status, done.senderUid], ["actioned", "me"]);
  const update = db.written.find((w) => w.update).update;
  assert.deepEqual(Object.keys(update).sort(), ["statusAt", "statusAtMs", "statusByUid", "statusNote", "status", "updatedAt"].sort(), "only the status fields are written");
  assert.equal(db.store.get(`quality_opportunities/${id}`).patient.initials, "DJ", "the patient details are untouched");
});

test("the notification is built without any patient information even if it is passed one", () => {
  const n = buildOpportunityNotification({ sender: { uid: "me", name: "Ann" }, recipientUid: "b1", opportunity: { title: "T", domain: "", patient: { initials: "DJ", nhsNumber: "9434765919" } } });
  assert.equal(n.message, "T");
  assert.ok(!JSON.stringify(n).includes("9434765919"));
});

test("a triage item goes the same way, with its own kind, an urgent flag, and a notification that names no patient", async () => {
  const db = fakeDb(staff());
  const result = await send({ kind: "triage", title: "Triage: Urgent, route to GP", domain: "Triage", rationale: "Urgent or safety-critical context", nextStep: "Route to GP", urgent: true, patient: { initials: "DJ", birthDate: "1954-06-12", nhsNumber: "9434765919" } }, db);
  assert.equal(result.kind, "triage");
  const record = db.written.find((w) => w.path.startsWith("quality_opportunities/")).data;
  assert.equal(record.kind, "triage");
  assert.equal(record.urgent, true);
  const notification = db.written.find((w) => w.path.includes("/notifications/")).data;
  assert.equal(notification.kind, "triage-item");
  assert.equal(notification.module, "clinflow");
  assert.equal(notification.priority, "high", "an urgent triage item is a high-priority notification");
  assert.match(notification.title, /Ann Admin sent you a letter to look at/);
  assert.equal(notification.message, "Triage: Urgent, route to GP");
  assert.ok(!/1954|9434765919|DJ/.test(JSON.stringify(notification)));
});

test("an unknown kind is treated as a quality opportunity, and only a real true makes it urgent", () => {
  const clean = cleanOpportunity({ title: "T", kind: "something-else", urgent: "yes" });
  assert.equal(clean.kind, "quality");
  assert.equal(clean.urgent, false);
  const notification = buildOpportunityNotification({ sender: { uid: "me", name: "Ann" }, recipientUid: "b1", opportunity: clean });
  assert.equal(notification.kind, "quality-opportunity");
  assert.equal(notification.priority, "normal");
});

test("a task from a letter's next steps goes the same way as its own kind", async () => {
  const db = fakeDb(staff());
  const result = await send({ kind: "task", title: "Book a blood test in 2 weeks", domain: "Task", rationale: "The letter says: repeat U&Es in 2 weeks", nextStep: "Book with the nurse", urgent: false }, db);
  assert.equal(result.kind, "task");
  const record = db.written.find((w) => w.path.startsWith("quality_opportunities/")).data;
  assert.equal(record.kind, "task");
  const notification = db.written.find((w) => w.path.includes("/notifications/")).data;
  assert.equal(notification.kind, "task-item");
  assert.equal(notification.module, "clinflow");
  assert.match(notification.title, /Ann Admin sent you a task/);
  assert.equal(notification.message, "Book a blood test in 2 weeks");
  assert.equal(notification.priority, "normal");
});
