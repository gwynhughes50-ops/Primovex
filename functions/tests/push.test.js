const test = require("node:test");
const assert = require("node:assert/strict");
const { buildPush, sendPushForNotification } = require("../services/pushService");

function fakeDb(tokens) {
  const deleted = [];
  const docs = tokens.map(([id, token]) => ({ id, data: () => ({ token }) }));
  const db = {
    deleted,
    collection: () => ({ doc: () => ({ collection: () => ({ get: async () => ({ docs }), doc: (id) => ({ delete: async () => { deleted.push(id); } }) }) }) }),
  };
  return db;
}
const fakeMessaging = (results) => {
  const calls = [];
  return {
    calls,
    sendEachForMulticast: async (message) => {
      calls.push(message);
      const responses = results.slice(0, message.tokens.length).map((r) => (r === true ? { success: true } : { success: false, error: { code: r } }));
      return { responses, successCount: responses.filter((r) => r.success).length };
    },
  };
};

test("an operational alert shows its title and a short line, with the page to open", () => {
  const push = buildPush({ module: "temperature", title: "Vaccine fridge is out of range", message: "Readings: now 9.1°C. The safe range is 2°C to 8°C.", actionUrl: "/temperature", kind: "fridge-alert" }, "n1");
  assert.deepEqual([push.title, push.url, push.tag], ["Vaccine fridge is out of range", "/temperature", "n1"]);
  assert.match(push.body, /9\.1/);
});

test("a message from a colleague names the sender and never shows what it says", () => {
  const push = buildPush({ kind: "team-message", createdByName: "Ben Jones", message: "Please call about the thing" });
  assert.equal(push.title, "Message from Ben Jones");
  assert.ok(!/call about/i.test(push.body));
  assert.equal(buildPush({ kind: "message-reply", createdByName: "Craig" }).title, "Craig replied");
});

test("governance and unknown notifications say only that there is something", () => {
  for (const note of [{ module: "governance", title: "SAR for patient AB is overdue", message: "details" }, { title: "x" }, {}]) {
    const push = buildPush(note, "n2");
    assert.deepEqual([push.title, push.body], ["Primovex", "You have a new notification."]);
  }
});

test("a link that is not a page of the app is not followed; text is tidied and limited", () => {
  assert.equal(buildPush({ module: "temperature", title: "T", actionUrl: "https://evil.example" }).url, "/notifications");
  const long = buildPush({ module: "compliance", title: `${"a".repeat(200)}\n\n`, message: "m".repeat(400), actionUrl: "/compliance" });
  assert.ok(long.title.length <= 90 && long.body.length <= 120);
});

test("it sends to every registered phone, and removes the ones that have gone", async () => {
  const db = fakeDb([["a", "tok-a"], ["b", "tok-b"], ["c", "tok-c"]]);
  const messaging = fakeMessaging([true, "messaging/registration-token-not-registered", "messaging/internal-error"]);
  const result = await sendPushForNotification({ db, messaging, uid: "u", notificationId: "n", notification: { module: "temperature", title: "T", priority: "critical", actionUrl: "/temperature" } });
  assert.deepEqual(result, { sent: 1, removed: 1 });
  assert.deepEqual(db.deleted, ["b"], "only a token the service says is gone is deleted, not one that merely failed");
  assert.deepEqual(messaging.calls[0].tokens, ["tok-a", "tok-b", "tok-c"]);
  assert.equal(messaging.calls[0].webpush.headers.Urgency, "high");
  assert.deepEqual(Object.keys(messaging.calls[0].data).sort(), ["body", "tag", "title", "url"]);
});

test("nothing is sent for a read notification or to someone with no phone registered", async () => {
  const messaging = fakeMessaging([true]);
  assert.deepEqual(await sendPushForNotification({ db: fakeDb([["a", "t"]]), messaging, uid: "u", notificationId: "n", notification: { read: true } }), { sent: 0, removed: 0 });
  assert.deepEqual(await sendPushForNotification({ db: fakeDb([]), messaging, uid: "u", notificationId: "n", notification: { module: "temperature", title: "T" } }), { sent: 0, removed: 0 });
  assert.equal(messaging.calls.length, 0);
});
