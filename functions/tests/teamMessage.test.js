const test = require("node:test");
const assert = require("node:assert/strict");
const { sendTeamMessage, buildTeamNotification, findColleagues, RECIPIENT_MAX, HOURLY_LIMIT } = require("../services/teamMessageService");

const NOW = new Date(Date.UTC(2026, 9, 7, 14, 0, 0));
const WRITER = ["inventory.read", "inventory.write"];

function fakeDb(users = {}) {
  const notifications = [];
  const store = new Map();
  return {
    notifications,
    store,
    collection: (name) => ({
      get: async () => ({ docs: Object.entries(users).map(([id, data]) => ({ id, data: () => data })) }),
      where: (field, op, value) => ({
        get: async () => ({ docs: Object.entries(users).filter(([, u]) => u[field] === value).map(([id, data]) => ({ id, data: () => data })) }),
      }),
      doc: (id) => ({
        path: `${name}/${id}`,
        get: async () => (name === "users" ? { exists: id in users, data: () => users[id] } : { exists: store.has(`${name}/${id}`), data: () => store.get(`${name}/${id}`) }),
        collection: (sub) => ({ doc: () => ({ path: `${name}/${id}/${sub}/n${notifications.length + store.size}`, uid: id, sub }) }),
      }),
    }),
    batch: () => {
      const ops = [];
      return { set: (ref, data) => ops.push([ref, data]), commit: async () => ops.forEach(([ref, data]) => notifications.push({ uid: ref.uid, ...data })) };
    },
    runTransaction: async (fn) => fn({
      get: async (r) => ({ exists: store.has(r.path), data: () => store.get(r.path) }),
      set: (r, value) => store.set(r.path, value),
    }),
  };
}
const team = () => ({
  me: { role: "Nurse", displayName: "Me" },
  h1: { role: "HCA", displayName: "Hayley" },
  h2: { role: "HCA", displayName: "Hannah" },
  h3: { role: "HCA", displayName: "Gone", active: false },
  n1: { role: "Nurse", displayName: "Nina" },
});
const send = (over = {}) => sendTeamMessage({ db: fakeDb(team()), callerUid: "me", callerName: "Me", capabilities: WRITER, data: { role: "HCA", text: "BD blue needles need ordering" }, now: NOW, ...over });

test("everyone with the role who is active gets the message, and the sender does not", async () => {
  const db = fakeDb(team());
  const result = await sendTeamMessage({ db, callerUid: "h1", callerName: "Hayley", capabilities: WRITER, data: { role: "HCA", text: "BD blue needles need ordering" }, now: NOW });
  assert.deepEqual(result, { sent: 1, role: "HCA" }); // Hannah only: Hayley is the sender, the other is inactive
  assert.deepEqual(db.notifications.map((n) => n.uid), ["h2"]);
  assert.equal(db.notifications[0].kind, "team-message");
  assert.equal(db.notifications[0].title, "Hayley sent a message to the HCA team");
  assert.equal(db.notifications[0].message, "BD blue needles need ordering");
  assert.equal(db.notifications[0].read, false);
  assert.equal(db.notifications[0].createdByUid, "h1");
});

test("a whole team is reached", async () => {
  const db = fakeDb(team());
  const r = await sendTeamMessage({ db, callerUid: "me", callerName: "Me", capabilities: WRITER, data: { role: "HCA", text: "Order blue needles" }, now: NOW });
  assert.equal(r.sent, 2);
  assert.deepEqual(db.notifications.map((n) => n.uid).sort(), ["h1", "h2"]);
});

test("only someone who can update stock can message a team", async () => {
  await assert.rejects(() => send({ capabilities: ["inventory.read"] }), /permission/);
  assert.equal((await send({ capabilities: ["*"] })).sent, 2);
});

test("a message with a number, date, email or phone number is refused so no patient detail goes out", async () => {
  for (const text of ["ring 07700 900123", "NHS 943 476 5919", "email me@example.org", "born 03/04/1975", "EMIS 1234567"]) {
    await assert.rejects(() => send({ data: { role: "HCA", text } }), /patient details/, text);
  }
  assert.equal((await send({ data: { role: "HCA", text: "Box 3 is missing 2 ampoules" } })).sent, 2);
});

test("an empty, over-long or team-less message is refused", async () => {
  await assert.rejects(() => send({ data: { role: "HCA", text: "   " } }), /Write the message/);
  await assert.rejects(() => send({ data: { role: "HCA", text: "x".repeat(301) } }), /300 characters/);
  await assert.rejects(() => send({ data: { role: "", text: "hello" } }), /Choose which team/);
});

test("a team with nobody else in it says so, and sends nothing", async () => {
  const db = fakeDb(team());
  await assert.rejects(() => sendTeamMessage({ db, callerUid: "me", callerName: "Me", capabilities: WRITER, data: { role: "Wizard", text: "hello" }, now: NOW }), /nobody to tell/);
  assert.equal(db.notifications.length, 0);
});

test("a very large team is not messaged in one go", async () => {
  const many = { me: { role: "Nurse" } };
  for (let i = 0; i <= RECIPIENT_MAX; i += 1) many[`u${i}`] = { role: "User" };
  await assert.rejects(() => sendTeamMessage({ db: fakeDb(many), callerUid: "me", callerName: "Me", capabilities: WRITER, data: { role: "User", text: "hello" }, now: NOW }), /more than 100/);
});

test("each person has an hourly limit on team messages", async () => {
  const db = fakeDb(team());
  for (let i = 0; i < HOURLY_LIMIT; i += 1) await sendTeamMessage({ db, callerUid: "me", callerName: "Me", capabilities: WRITER, data: { role: "HCA", text: `message ${i}` }, now: NOW });
  await assert.rejects(() => sendTeamMessage({ db, callerUid: "me", callerName: "Me", capabilities: WRITER, data: { role: "HCA", text: "one more" }, now: NOW }), /this hour/);
});

test("the notification is built from the real sender, not from the request", () => {
  const n = buildTeamNotification({ callerUid: "u1", callerName: "Hayley", role: "Nurse", text: "Hi", actionUrl: "/inventory?item=1", recipientUid: "u2" });
  assert.equal(n.createdByName, "Hayley");
  assert.equal(n.recipientUid, "u2");
  assert.equal(n.actionUrl, "/inventory?item=1");
  assert.equal(n.priority, "high");
});

test("one named colleague can be messaged, and only them", async () => {
  const db = fakeDb(team());
  const r = await sendTeamMessage({ db, callerUid: "me", callerName: "Me", capabilities: WRITER, data: { toUid: "n1", text: "The vaccine fridge needs checking" }, now: NOW });
  assert.deepEqual(r, { sent: 1, role: null, toName: "Nina" });
  assert.deepEqual(db.notifications.map((n) => n.uid), ["n1"]);
  assert.equal(db.notifications[0].title, "Me sent you a message");
  assert.equal(db.notifications[0].kind, "team-message");
});

test("a person message refuses yourself, someone who has left, someone who is not there, and patient details", async () => {
  const base = { db: fakeDb(team()), callerUid: "me", callerName: "Me", capabilities: WRITER, now: NOW };
  await assert.rejects(() => sendTeamMessage({ ...base, data: { toUid: "me", text: "hello" } }), /That is you/);
  await assert.rejects(() => sendTeamMessage({ ...base, data: { toUid: "h3", text: "hello" } }), /can.t be messaged/);
  await assert.rejects(() => sendTeamMessage({ ...base, data: { toUid: "nobody", text: "hello" } }), /can.t be messaged/);
  await assert.rejects(() => sendTeamMessage({ ...base, data: { toUid: "n1", text: "ring 07700 900123" } }), /patient details/);
  await assert.rejects(() => sendTeamMessage({ ...base, capabilities: ["inventory.read"], data: { toUid: "n1", text: "hello" } }), /permission/);
});

const staff = () => ({
  me: { role: "Practice Manager", displayName: "Me Myself" },
  c1: { role: "Nurse", displayName: "Craig Davies", email: "craig@example.org" },
  c2: { role: "HCA", displayName: "Craig Lloyd" },
  b1: { role: "Nurse", displayName: "Ben Jones" },
  b2: { role: "Reception", displayName: "Benjamin Hart" },
  g1: { role: "Nurse", displayName: "Gone Person", active: false },
});

test("a first name finds the colleagues it could mean: name, role and id only", async () => {
  const find = (words, over = {}) => findColleagues({ db: fakeDb(staff()), callerUid: "me", capabilities: WRITER, words, now: NOW, ...over });
  const ben = await find(["ben"]);
  assert.deepEqual(ben.matches.map((m) => m.name).sort(), ["Ben Jones", "Benjamin Hart"]);
  assert.ok(ben.matches.every((m) => m.consumed === 1));
  const craig = await find(["craig", "davies"]);
  assert.deepEqual(craig.matches, [{ uid: "c1", name: "Craig Davies", role: "Nurse", consumed: 2 }]);
  assert.ok(!JSON.stringify(craig).includes("example.org"), "no email address is ever returned");
  const justCraig = await find(["craig", "the"]);
  assert.equal(justCraig.matches.length, 2, "a second word that is not a surname falls back to the first name");
  assert.ok(justCraig.matches.every((m) => m.consumed === 1));
  assert.deepEqual((await find(["gone"])).matches, [], "people who have left are not offered");
  assert.deepEqual((await find(["me"])).matches, [], "you are never offered");
  assert.deepEqual((await find(["zed"])).matches, []);
});

test("finding a colleague needs permission, a name, and has a limit", async () => {
  const db = fakeDb(staff());
  await assert.rejects(() => findColleagues({ db, callerUid: "me", capabilities: ["inventory.read"], words: ["ben"], now: NOW }), /permission/);
  await assert.rejects(() => findColleagues({ db, callerUid: "me", capabilities: WRITER, words: [], now: NOW }), /Say who/);
  for (let i = 0; i < 30; i += 1) await findColleagues({ db, callerUid: "me", capabilities: WRITER, words: ["ben"], now: NOW });
  await assert.rejects(() => findColleagues({ db, callerUid: "me", capabilities: WRITER, words: ["ben"], now: NOW }), /this hour/);
});
