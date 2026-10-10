const test = require("node:test");
const assert = require("node:assert/strict");
const { replyToMessage, buildReplyNotification, QUICK_REPLIES, HOURLY_LIMIT, PERSON_KINDS } = require("../services/messageReplyService");

const NOW = new Date(Date.UTC(2026, 9, 10, 12, 0, 0));

// A small in-memory Firestore: documents by path, with doc(), collection(), get(), set(), update().
function fakeDb(initial = {}) {
  const store = new Map(Object.entries(initial));
  let counter = 0;
  const docRef = (path) => ({
    path,
    get: async () => ({ exists: store.has(path), data: () => store.get(path) }),
    set: async (value) => { store.set(path, value); },
    update: async (value) => { store.set(path, { ...store.get(path), ...value }); },
    collection: (sub) => collectionRef(`${path}/${sub}`),
  });
  const collectionRef = (path) => ({ doc: (id) => docRef(`${path}/${id ?? `auto${(counter += 1)}`}`) });
  return {
    store,
    collection: (name) => collectionRef(name),
    runTransaction: async (fn) => fn({ get: async (ref) => ref.get(), set: (ref, value) => store.set(ref.path, value) }),
  };
}

const message = (over = {}) => ({ kind: "team-message", createdByUid: "ben", createdByName: "Ben", automated: false, read: false, message: "The vaccine fridge needs checking", ...over });
const world = (over = {}) => fakeDb({
  "users/me": { displayName: "Gwyn", role: "Practice Manager" },
  "users/ben": { displayName: "Ben Jones", role: "Nurse" },
  "users/gone": { displayName: "Gone", active: false },
  "users/me/notifications/n1": message(),
  "users/me/notifications/n2": message({ createdByUid: "gone" }),
  "users/me/notifications/n3": message({ kind: "overdue", automated: true, createdByUid: undefined }),
  "users/me/notifications/n4": message({ createdByUid: "me" }),
  ...over,
});
const reply = (db, data, over = {}) => replyToMessage({ db, callerUid: "me", callerName: "Gwyn", data, now: NOW, ...over });
const sentTo = (db, uid) => [...db.store.entries()].filter(([path]) => path.startsWith(`users/${uid}/notifications/auto`)).map(([, value]) => value);

test("a quick reply goes back to whoever sent the message, and the message is marked read and replied to", async () => {
  const db = world();
  const result = await reply(db, { notificationId: "n1", quick: "on_it" });
  assert.deepEqual(result, { sent: 1, toName: "Ben Jones" });
  const [note] = sentTo(db, "ben");
  assert.equal(note.message, "On it");
  assert.equal(note.title, "Gwyn replied");
  assert.equal(note.kind, "message-reply");
  assert.equal(note.recipientUid, "ben");
  assert.equal(note.createdByUid, "me");
  assert.equal(note.replyToNotificationId, "n1");
  assert.equal(note.read, false);
  const original = db.store.get("users/me/notifications/n1");
  assert.equal(original.read, true);
  assert.equal(original.replyText, "On it");
  assert.ok(original.repliedAt);
});

test("who it goes to comes from the message, never from the request", async () => {
  const db = world();
  await reply(db, { notificationId: "n1", text: "Will check now", toUid: "someone-else", recipientUid: "someone-else" });
  assert.equal(sentTo(db, "someone-else").length, 0);
  assert.equal(sentTo(db, "ben").length, 1);
});

test("a typed reply works, with no numbers, dates, emails or phone numbers", async () => {
  assert.equal((await reply(world(), { notificationId: "n1", text: "Thanks, I'll check it after lunch" })).sent, 1);
  for (const text of ["ring 07700 900123", "NHS 943 476 5919", "email me@example.org", "born 03/04/1975", "EMIS 1234567"]) {
    await assert.rejects(() => reply(world(), { notificationId: "n1", text }), /patient details/, text);
  }
});

test("empty, over-long, unknown quick replies and missing messages are refused", async () => {
  await assert.rejects(() => reply(world(), { notificationId: "n1", text: "   " }), /Write your reply/);
  await assert.rejects(() => reply(world(), { notificationId: "n1", text: "x".repeat(301) }), /300 characters/);
  await assert.rejects(() => reply(world(), { notificationId: "n1", quick: "rm_rf" }), /quick reply/);
  await assert.rejects(() => reply(world(), { quick: "done" }), /which message/);
  await assert.rejects(() => reply(world(), { notificationId: "missing", quick: "done" }), /isn't there any more/);
});

test("only a message from a colleague can be replied to", async () => {
  await assert.rejects(() => reply(world(), { notificationId: "n3", quick: "done" }), /isn't a message from a colleague/);
  await assert.rejects(() => reply(world(), { notificationId: "n4", quick: "done" }), /from you/);
});

test("someone who has left can't be replied to", async () => {
  const db = world();
  await assert.rejects(() => reply(db, { notificationId: "n2", quick: "done" }), /can't be messaged/);
  assert.equal(sentTo(db, "gone").length, 0);
});

test("you can only reply to a message in your own inbox", async () => {
  const db = world({ "users/other/notifications/n9": message() });
  await assert.rejects(() => reply(db, { notificationId: "n9", quick: "done" }), /isn't there any more/);
});

test("each person has an hourly limit on replies", async () => {
  const db = world();
  for (let i = 0; i < HOURLY_LIMIT; i += 1) await reply(db, { notificationId: "n1", quick: "thanks" });
  await assert.rejects(() => reply(db, { notificationId: "n1", quick: "thanks" }), /this hour/);
});

test("the reply notification is built from the real sender", () => {
  const n = buildReplyNotification({ callerUid: "u1", callerName: "Gwyn", text: "Done", toUid: "u2", replyToNotificationId: "n1" });
  assert.deepEqual([n.createdByName, n.recipientUid, n.priority, n.automated], ["Gwyn", "u2", "high", false]);
  assert.ok(PERSON_KINDS.includes(n.kind));
  assert.equal(Object.keys(QUICK_REPLIES).length, 6);
});
