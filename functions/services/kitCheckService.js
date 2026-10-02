const { FieldValue, Timestamp } = require("firebase-admin/firestore");
const { HttpsError } = require("firebase-functions/v2/https");

// The server side of the phone's kit check quick actions:
//   - a message to a colleague, or a reminder to yourself, delivered into the
//     in-app inbox (clients can't create notifications, so it's done here, with
//     the content built from the real kit and the caller's own name);
//   - replacing an item in a kit with a new batch, which updates what the kit
//     expects (kits are only editable by administrators directly, but anyone who
//     can verify stock may swap in a new one during a check).

const COLLECTIONS = ["emergency_assets", "anaphylaxis_boxes"];
const TEXT_MAX = 300;
const NAME_MAX = 120;
const REMINDER_WINDOW_DAYS = 30;

const tidy = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const isoDate = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim()) ? String(value).trim() : "");

function assertCollection(collection) {
  if (!COLLECTIONS.includes(collection)) throw new HttpsError("invalid-argument", "That isn't a kit or box.");
}

// Where the notification opens: the kit's own check.
function checkPath(collection, kitId) {
  const tab = collection === "emergency_assets" ? "emergency" : "anaphylaxis";
  return `/inventory?tab=${tab}&asset=${encodeURIComponent(kitId)}`;
}

// The notification document for a message or a reminder. Pure, so it can be tested.
function buildKitNotification({ kind, callerUid, callerName, toUid, text, kit, itemName, remindAt }) {
  const where = kit.name || kit.id;
  const item = tidy(itemName, NAME_MAX);
  const base = {
    recipientUid: toUid,
    module: "inventory",
    read: false,
    status: "open",
    actionUrl: checkPath(kit.collection, kit.id),
    automated: false,
    kitId: kit.id,
    kitCollection: kit.collection,
    createdByUid: callerUid,
    createdByName: callerName || "A colleague",
  };

  if (kind === "reminder") {
    return {
      ...base,
      kind: "kit-reminder",
      title: `Reminder: ${item ? `${item} - ` : ""}${where}`,
      message: tidy(text, TEXT_MAX) || "You flagged this to come back to during a check.",
      priority: "routine",
      // Held back until it's due: the inbox treats a notification as snoozed
      // until this time, then it appears.
      snoozedUntil: Timestamp.fromDate(remindAt),
      dueDate: Timestamp.fromDate(remindAt),
    };
  }

  return {
    ...base,
    kind: "staff-message",
    title: `${callerName || "A colleague"} sent you a message${item ? ` about ${item}` : ""}`,
    message: `${tidy(text, TEXT_MAX)} (${where})`,
    priority: "high",
  };
}

// What a replacement may be: a real batch and/or expiry, and not already expired.
// Returns the clean { batch_number, expiry_date } or throws.
function validateReplacement({ batch_number, expiry_date }, now = new Date()) {
  const batch = tidy(batch_number, 60);
  const expiry = isoDate(expiry_date);
  if (String(expiry_date || "").trim() && !expiry) throw new HttpsError("invalid-argument", "That expiry date isn't valid.");
  if (!batch && !expiry) throw new HttpsError("invalid-argument", "Choose a batch or enter an expiry date.");
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (expiry && expiry < today) throw new HttpsError("failed-precondition", "That batch has already expired, so it can't go in a kit.");
  return { batch_number: batch, expiry_date: expiry };
}

async function readKit(db, collection, kitId) {
  assertCollection(collection);
  const id = String(kitId || "");
  if (!id) throw new HttpsError("invalid-argument", "Missing kit id.");
  const snap = await db.collection(collection).doc(id).get();
  if (!snap.exists) throw new HttpsError("not-found", "That kit isn't on file any more.");
  return { snap, kit: { id, collection, name: snap.data()?.name || id } };
}

// A message to a colleague, or a reminder to yourself.
async function sendKitNotification({ db, callerUid, callerName, data = {}, now = new Date() }) {
  const kind = data.kind;
  if (!["message", "reminder"].includes(kind)) throw new HttpsError("invalid-argument", "Unknown notification type.");
  const { kit } = await readKit(db, data.collection, data.kitId);

  let toUid = callerUid;
  let text = tidy(data.text, TEXT_MAX);
  let remindAt = null;

  if (kind === "message") {
    toUid = String(data.toUid || "");
    if (!toUid) throw new HttpsError("invalid-argument", "Choose who to message.");
    if (toUid === callerUid) throw new HttpsError("invalid-argument", "That's you - use 'Remind me later' instead.");
    if (!text) throw new HttpsError("invalid-argument", "Write a message.");
    if (String(data.text || "").replace(/\s+/g, " ").trim().length > TEXT_MAX) throw new HttpsError("invalid-argument", `Keep it to ${TEXT_MAX} characters.`);
  } else {
    remindAt = new Date(data.remindAt);
    const latest = new Date(now.getTime() + REMINDER_WINDOW_DAYS * 86400000);
    if (Number.isNaN(remindAt.getTime())) throw new HttpsError("invalid-argument", "Choose when to be reminded.");
    if (remindAt <= now) throw new HttpsError("invalid-argument", "That time has already passed.");
    if (remindAt > latest) throw new HttpsError("invalid-argument", `Reminders can be up to ${REMINDER_WINDOW_DAYS} days ahead.`);
  }

  const recipient = await db.collection("users").doc(toUid).get();
  if (!recipient.exists || recipient.data()?.active === false) {
    throw new HttpsError("failed-precondition", "That person's account isn't available.");
  }

  const doc = buildKitNotification({ kind, callerUid, callerName, toUid, text, kit, itemName: data.itemName, remindAt });
  const ref = recipient.ref.collection("notifications").doc();
  await ref.set({ ...doc, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  return { sent: true, kind, to: recipient.data()?.displayName || recipient.data()?.email || "them" };
}

// Replace an item in a kit with a new batch: the kit then expects that batch and
// expiry (and follows it in stock). Changes the kit's record only - no stock is
// moved. Runs in a transaction so two people checking at once can't overwrite
// each other's items.
async function replaceKitItemBatch({ db, callerUid, callerName, data = {}, now = new Date() }) {
  const { batch_number, expiry_date } = validateReplacement(data.stockBatch || {}, now);
  const itemId = String(data.itemId || "");
  if (!itemId) throw new HttpsError("invalid-argument", "Missing item id.");
  assertCollection(data.collection);
  const kitId = String(data.kitId || "");
  if (!kitId) throw new HttpsError("invalid-argument", "Missing kit id.");
  const ref = db.collection(data.collection).doc(kitId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "That kit isn't on file any more.");
    const items = Array.isArray(snap.data()?.items) ? snap.data().items : [];
    const index = items.findIndex((item) => item && item.id === itemId);
    if (index === -1) throw new HttpsError("not-found", "That item isn't in the kit any more.");

    const before = items[index];
    const next = items.map((item, i) =>
      i === index
        ? {
            ...item,
            stock_batch: { batch_number, expiry_date },
            followStock: true,
            defaultBatch: batch_number || null,
            defaultExpiry: expiry_date || null,
            lastReplacedAt: now.toISOString(),
            lastReplacedByUid: callerUid,
            lastReplacedByName: callerName || "",
          }
        : item
    );
    tx.update(ref, { items: next, updatedAt: FieldValue.serverTimestamp() });
    return {
      updated: true,
      itemName: before.name || "",
      previous: { batch_number: before.defaultBatch || "", expiry_date: before.defaultExpiry || "" },
      now: { batch_number, expiry_date },
    };
  });
}

module.exports = {
  COLLECTIONS,
  TEXT_MAX,
  buildKitNotification,
  validateReplacement,
  sendKitNotification,
  replaceKitItemBatch,
  checkPath,
};
