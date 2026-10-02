const test = require("node:test");
const assert = require("node:assert/strict");
const { buildKitNotification, validateReplacement, sendKitNotification, replaceKitItemBatch, checkPath } = require("../services/kitCheckService");

const NOW = new Date(2026, 9, 2, 10, 0, 0);
const kit = { id: "anaphylaxis_box_3", collection: "anaphylaxis_boxes", name: "Anaphylaxis Box 3" };

// ---- a tiny in-memory Firestore stand-in
function fakeDb({ kits = {}, users = {} }) {
  const notifications = [];
  const docRef = (collection, id) => ({
    id,
    colName: collection,
    get: async () => {
      const store = collection === "users" ? users : kits[collection] || {};
      const data = store[id];
      return { exists: data !== undefined, id, data: () => data, ref: docRef(collection, id) };
    },
    collection: (sub) => ({
      doc: () => ({
        set: async (data) => notifications.push({ uid: id, sub, data }),
      }),
    }),
  });
  return {
    notifications,
    kits,
    collection: (name) => ({ doc: (id) => docRef(name, id) }),
    runTransaction: async (fn) => {
      const tx = {
        get: async (ref) => ref.get(),
        update: (ref, patch) => { Object.assign(kits[ref.colName][ref.id], patch); },
      };
      return fn(tx);
    },
  };
}

const world = () => fakeDb({
  kits: {
    anaphylaxis_boxes: {
      anaphylaxis_box_3: {
        name: "Anaphylaxis Box 3",
        items: [
          { id: "item_1", name: "Adrenaline 1mg/1ml", defaultBatch: "C", defaultExpiry: "2026-01-31", stock_barcode: "5000001" },
          { id: "item_2", name: "Chlorphenamine", defaultBatch: "X", defaultExpiry: "2027-05-05" },
        ],
      },
    },
  },
  users: {
    hca: { displayName: "Hayley", role: "HCA" },
    liz: { displayName: "Liz Howard", role: "Practice Manager" },
    gone: { displayName: "Left", active: false },
  },
});

test("a message is built from the real kit and the sender's own name", () => {
  const d = buildKitNotification({ kind: "message", callerUid: "hca", callerName: "Hayley", toUid: "liz", text: "Please order more", kit, itemName: "Adrenaline 1mg/1ml" });
  assert.equal(d.recipientUid, "liz");
  assert.equal(d.title, "Hayley sent you a message about Adrenaline 1mg/1ml");
  assert.equal(d.message, "Please order more (Anaphylaxis Box 3)");
  assert.equal(d.priority, "high");
  assert.equal(d.read, false);
  assert.equal(d.createdByUid, "hca");
  assert.equal(d.actionUrl, "/inventory?tab=anaphylaxis&asset=anaphylaxis_box_3");
});

test("a reminder is held back until it is due, and is for the person who set it", () => {
  const remindAt = new Date(2026, 9, 3, 9, 0, 0);
  const d = buildKitNotification({ kind: "reminder", callerUid: "hca", callerName: "Hayley", toUid: "hca", text: "", kit, itemName: "Adrenaline 1mg/1ml", remindAt });
  assert.equal(d.title, "Reminder: Adrenaline 1mg/1ml - Anaphylaxis Box 3");
  assert.equal(d.message, "You flagged this to come back to during a check.");
  assert.equal(d.priority, "routine");
  assert.equal(d.snoozedUntil.toDate().getTime(), remindAt.getTime());
  assert.equal(d.recipientUid, "hca");
});

test("the link opens the right check for kits and for emergency kits", () => {
  assert.equal(checkPath("emergency_assets", "cmc resus"), "/inventory?tab=emergency&asset=cmc%20resus");
  assert.equal(checkPath("anaphylaxis_boxes", "box1"), "/inventory?tab=anaphylaxis&asset=box1");
});

test("sending a message creates a notification in the colleague's inbox", async () => {
  const db = world();
  const result = await sendKitNotification({ db, callerUid: "hca", callerName: "Hayley", now: NOW, data: { kind: "message", collection: "anaphylaxis_boxes", kitId: "anaphylaxis_box_3", toUid: "liz", text: "Can you check this with me?", itemName: "Adrenaline 1mg/1ml" } });
  assert.deepEqual(result, { sent: true, kind: "message", to: "Liz Howard" });
  assert.equal(db.notifications.length, 1);
  assert.equal(db.notifications[0].uid, "liz");
  assert.equal(db.notifications[0].sub, "notifications");
  assert.match(db.notifications[0].data.message, /Can you check this with me\?/);
});

test("a message to yourself, to nobody, to a missing or deactivated account, or with no text is refused", async () => {
  const base = { collection: "anaphylaxis_boxes", kitId: "anaphylaxis_box_3", kind: "message", text: "hi" };
  const send = (over) => sendKitNotification({ db: world(), callerUid: "hca", callerName: "Hayley", now: NOW, data: { ...base, toUid: "liz", ...over } });
  await assert.rejects(() => send({ toUid: "hca" }), /use 'Remind me later'/);
  await assert.rejects(() => send({ toUid: "" }), /Choose who to message/);
  await assert.rejects(() => send({ toUid: "nobody" }), /isn't available/);
  await assert.rejects(() => send({ toUid: "gone" }), /isn't available/);
  await assert.rejects(() => send({ text: "   " }), /Write a message/);
  await assert.rejects(() => send({ text: "x".repeat(301) }), /300 characters/);
});

test("a reminder goes to the caller only, whoever the request names", async () => {
  const db = world();
  await sendKitNotification({ db, callerUid: "hca", callerName: "Hayley", now: NOW, data: { kind: "reminder", collection: "anaphylaxis_boxes", kitId: "anaphylaxis_box_3", toUid: "liz", remindAt: new Date(2026, 9, 3, 9).toISOString(), itemName: "Adrenaline" } });
  assert.equal(db.notifications[0].uid, "hca"); // not liz
});

test("a reminder needs a real future time within a month", async () => {
  const send = (remindAt) => sendKitNotification({ db: world(), callerUid: "hca", callerName: "H", now: NOW, data: { kind: "reminder", collection: "anaphylaxis_boxes", kitId: "anaphylaxis_box_3", remindAt } });
  await assert.rejects(() => send("not a date"), /Choose when/);
  await assert.rejects(() => send(new Date(2026, 9, 1).toISOString()), /already passed/);
  await assert.rejects(() => send(new Date(2026, 11, 25).toISOString()), /30 days/);
  await assert.rejects(() => send(undefined), /Choose when/);
});

test("a notification for a kit that doesn't exist, or a collection that isn't a kit, is refused", async () => {
  const send = (data) => sendKitNotification({ db: world(), callerUid: "hca", callerName: "H", now: NOW, data: { kind: "message", toUid: "liz", text: "hi", ...data } });
  await assert.rejects(() => send({ collection: "anaphylaxis_boxes", kitId: "nope" }), /isn't on file/);
  await assert.rejects(() => send({ collection: "users", kitId: "liz" }), /isn't a kit/);
  await assert.rejects(() => sendKitNotification({ db: world(), callerUid: "hca", callerName: "H", data: { kind: "shout", collection: "anaphylaxis_boxes", kitId: "anaphylaxis_box_3" } }), /Unknown notification/);
});

test("replacement: a real batch and an in-date expiry are needed", () => {
  assert.deepEqual(validateReplacement({ batch_number: " B ", expiry_date: "2031-02-28" }, NOW), { batch_number: "B", expiry_date: "2031-02-28" });
  assert.deepEqual(validateReplacement({ batch_number: "", expiry_date: "2031-02-28" }, NOW), { batch_number: "", expiry_date: "2031-02-28" });
  assert.deepEqual(validateReplacement({ batch_number: "B", expiry_date: "" }, NOW), { batch_number: "B", expiry_date: "" });
  assert.throws(() => validateReplacement({}, NOW), /Choose a batch/);
  assert.throws(() => validateReplacement({ batch_number: "B", expiry_date: "2026-01-31" }, NOW), /already expired/);
  assert.throws(() => validateReplacement({ batch_number: "B", expiry_date: "31/01/2027" }, NOW), /isn't valid/);
  assert.deepEqual(validateReplacement({ batch_number: "B", expiry_date: "2026-10-02" }, NOW), { batch_number: "B", expiry_date: "2026-10-02" }); // expires today is still usable today
});

test("replacing an item updates that item only, pins the new batch, and says what changed", async () => {
  const db = world();
  const result = await replaceKitItemBatch({ db, callerUid: "hca", callerName: "Hayley", now: NOW, data: { collection: "anaphylaxis_boxes", kitId: "anaphylaxis_box_3", itemId: "item_1", stockBatch: { batch_number: "B", expiry_date: "2031-02-28" } } });
  assert.deepEqual(result, { updated: true, itemName: "Adrenaline 1mg/1ml", previous: { batch_number: "C", expiry_date: "2026-01-31" }, now: { batch_number: "B", expiry_date: "2031-02-28" } });
  const items = db.kits.anaphylaxis_boxes.anaphylaxis_box_3.items;
  assert.deepEqual(items[0].stock_batch, { batch_number: "B", expiry_date: "2031-02-28" });
  assert.equal(items[0].defaultBatch, "B");
  assert.equal(items[0].defaultExpiry, "2031-02-28");
  assert.equal(items[0].followStock, true);
  assert.equal(items[0].lastReplacedByName, "Hayley");
  assert.equal(items[0].stock_barcode, "5000001"); // the rest of the item is untouched
  assert.deepEqual(items[1], { id: "item_2", name: "Chlorphenamine", defaultBatch: "X", defaultExpiry: "2027-05-05" }); // other items untouched
});

test("replacing in a kit or item that doesn't exist, or with a bad batch, changes nothing", async () => {
  const db = world();
  const before = JSON.stringify(db.kits);
  const go = (data) => replaceKitItemBatch({ db, callerUid: "hca", callerName: "H", now: NOW, data: { collection: "anaphylaxis_boxes", kitId: "anaphylaxis_box_3", itemId: "item_1", stockBatch: { batch_number: "B", expiry_date: "2031-02-28" }, ...data } });
  await assert.rejects(() => go({ kitId: "nope" }), /isn't on file/);
  await assert.rejects(() => go({ itemId: "item_9" }), /isn't in the kit/);
  await assert.rejects(() => go({ itemId: "" }), /Missing item/);
  await assert.rejects(() => go({ collection: "users" }), /isn't a kit/);
  await assert.rejects(() => go({ stockBatch: { batch_number: "B", expiry_date: "2020-01-01" } }), /already expired/);
  assert.equal(JSON.stringify(db.kits), before);
});
