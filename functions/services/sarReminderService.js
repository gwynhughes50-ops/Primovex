const { FieldValue } = require("firebase-admin/firestore");
const { HttpsError } = require("firebase-functions/v2/https");
const { daysUntil, formatDate } = require("./dueNotificationService");

// The reminder bell on a SAR. The Practice Manager, and the line manager of the person a SAR is assigned to,
// can send that person a reminder that the SAR is getting close to (or past) its due date and needs
// prioritising. Nothing here is free text: the wording is fixed and built from the SAR itself.
//
// Who may send one is decided here, on the server, every time: the Practice Manager for any SAR, and
// otherwise someone the assignee "reports to" on the organisation chart. The list the app shows (listSarsToChase)
// and the send (sendSarReminder) use the same rule, so a bell the person can see is a bell that works.
//
// A line manager who is not on the SAR team cannot read the SAR records (they hold patient details), so what
// they are shown is built here: the reference, the kind of request, the due date, the status, who has it and the
// last reminder. No patient name, initials, EMIS number or details of the request.

const TIME_ZONE = "Europe/London";
const SAR_CLOSED = ["completed", "archived"];
const MANAGER_ROLE = "Practice Manager";

const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

// reportsTo may be a single older string, a list, or missing (the organisation chart reads it the same way).
function reportsToList(user) {
  return asArray(user?.reportsTo).map((id) => String(id || "")).filter(Boolean);
}

const isPracticeManager = (profile) => String(profile?.role || "") === MANAGER_ROLE;

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// "2026-11-13": the calendar day in London, so "one reminder a day" follows the practice's day and not UTC.
function londonDay(date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

const sarIsLive = (sar) => !!sar && !SAR_CLOSED.includes(String(sar.status || ""));

// What the caller may remind about. Pure.
//   { all: true }                      the Practice Manager: any live SAR that has someone assigned
//   { assigneeUids: [..] }             a line manager: SARs assigned to the people who report to them
function remindScope({ uid, profile, users = [] }) {
  if (isPracticeManager(profile)) return { all: true, assigneeUids: [] };
  const mine = users
    .filter((u) => u && u.id && u.id !== uid && u.active !== false && reportsToList(u).includes(uid))
    .map((u) => u.id);
  return { all: false, assigneeUids: mine };
}

function mayRemind(scope, assigneeUid) {
  return !!assigneeUid && (scope.all || scope.assigneeUids.includes(assigneeUid));
}

// The line shown to the person being reminded, and in the list. Whole calendar days in London.
function dueText(days) {
  if (days === null || days === undefined) return "has a due date to check";
  if (days < 0) return `is overdue by ${-days} day${days === -1 ? "" : "s"}`;
  if (days === 0) return "is due today";
  if (days === 1) return "is due tomorrow";
  return `is due in ${days} days`;
}

// One row of the list: only what a manager needs to decide to chase it. Pure.
function chaseRow(sar, now) {
  const due = toDate(sar.dueDate || sar.due_date);
  const reminded = toDate(sar.lastReminderAt);
  return {
    id: sar.id,
    reference: String(sar.reference || sar.id),
    requestTypeLabel: String(sar.requestTypeLabel || "SAR"),
    status: String(sar.status || ""),
    dueDate: due ? due.toISOString() : null,
    dueLabel: due ? formatDate(due) : "",
    daysLeft: due ? daysUntil(due, now) : null,
    assignedToUid: String(sar.assignedToUid || ""),
    assignedToName: String(sar.assignedToName || ""),
    lastReminderAt: reminded ? reminded.toISOString() : null,
    lastReminderByName: reminded ? String(sar.lastReminderByName || "") : "",
    remindedToday: !!reminded && londonDay(reminded) === londonDay(now),
    reminderCount: Number(sar.reminderCount || 0),
  };
}

// Most urgent first: overdue, then soonest due; no date last.
function sortRows(rows) {
  return [...rows].sort((a, b) => {
    if (a.daysLeft === null && b.daysLeft === null) return a.reference.localeCompare(b.reference);
    if (a.daysLeft === null) return 1;
    if (b.daysLeft === null) return -1;
    return a.daysLeft - b.daysLeft || a.reference.localeCompare(b.reference);
  });
}

// The notification, built from the SAR and from the sender's own profile, never from what the app sent.
function buildReminderNotification({ sarId, sar, senderUid, senderName, now }) {
  const assignee = String(sar.assignedToUid || "");
  const days = daysUntil(sar.dueDate || sar.due_date, now);
  const reference = sar.reference || sarId;
  const due = formatDate(sar.dueDate || sar.due_date);
  return {
    id: `sar-reminder-${sarId}-${assignee}-${londonDay(now)}`,
    data: {
      recipientUid: assignee,
      title: `Reminder: SAR ${reference} needs prioritising`,
      message: `${senderName || "Your manager"} is reminding you that this ${sar.requestTypeLabel || "SAR"} request ${dueText(days)}${due ? ` (${due})` : ""}. Please prioritise it.`,
      module: "sar",
      priority: days !== null && days < 0 ? "critical" : "high",
      dueDate: sar.dueDate || sar.due_date || null,
      actionUrl: "/governance/sars",
      read: false,
      status: "open",
      kind: "sar-reminder",
      sourceId: sarId,
      createdByUid: senderUid || null,
      createdByName: senderName || "Primovex",
    },
  };
}

async function allUsers(db) {
  const snap = await db.collection("users").get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// The SARs the caller may chase, for the bell and for the "SARs to chase" list.
async function listSarsToChase({ db, uid, profile, now = new Date() }) {
  const users = isPracticeManager(profile) ? [] : await allUsers(db);
  const scope = remindScope({ uid, profile, users });
  if (!scope.all && scope.assigneeUids.length === 0) return { canChase: false, rows: [] };

  let docs = [];
  if (scope.all) {
    const snap = await db.collection("governance_sars").where("status", "not-in", SAR_CLOSED).get();
    docs = snap.docs;
  } else {
    // "in" takes at most 30 values: a line manager with more reports than that is read in batches.
    for (let i = 0; i < scope.assigneeUids.length; i += 30) {
      const snap = await db.collection("governance_sars").where("assignedToUid", "in", scope.assigneeUids.slice(i, i + 30)).get();
      docs = docs.concat(snap.docs);
    }
  }
  const rows = docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((sar) => sarIsLive(sar) && mayRemind(scope, String(sar.assignedToUid || "")))
    .map((sar) => chaseRow(sar, now));
  return { canChase: true, rows: sortRows(rows) };
}

async function sendSarReminder({ db, uid, profile, sarId, now = new Date() }) {
  const id = String(sarId || "");
  if (!id) throw new HttpsError("invalid-argument", "Missing SAR id.");

  const snap = await db.collection("governance_sars").doc(id).get();
  const sar = snap.exists ? { id, ...snap.data() } : null;
  if (!sar) throw new HttpsError("not-found", "That SAR no longer exists.");
  if (!sarIsLive(sar)) throw new HttpsError("failed-precondition", "That SAR is already completed, so it needs no reminder.");
  const assigneeUid = String(sar.assignedToUid || "");
  if (!assigneeUid) throw new HttpsError("failed-precondition", "Nobody is assigned to that SAR yet.");
  if (assigneeUid === uid) throw new HttpsError("failed-precondition", "That SAR is assigned to you.");

  // Who may send: the Practice Manager, or someone the assignee reports to. Read live from the organisation chart.
  let scope;
  if (isPracticeManager(profile)) {
    scope = { all: true, assigneeUids: [] };
  } else {
    const assigneeSnap = await db.collection("users").doc(assigneeUid).get();
    const assignee = assigneeSnap.exists ? { id: assigneeUid, ...assigneeSnap.data() } : null;
    scope = remindScope({ uid, profile, users: assignee ? [assignee] : [] });
  }
  if (!mayRemind(scope, assigneeUid)) {
    throw new HttpsError("permission-denied", "Only the Practice Manager or this person's line manager can send a reminder.");
  }

  const assigneeDoc = await db.collection("users").doc(assigneeUid).get();
  if (!assigneeDoc.exists || assigneeDoc.data()?.active === false) {
    throw new HttpsError("failed-precondition", "That person's account is not active.");
  }

  const reminded = toDate(sar.lastReminderAt);
  if (reminded && londonDay(reminded) === londonDay(now)) {
    return { sent: false, reason: "already-today", lastReminderByName: String(sar.lastReminderByName || "") };
  }

  const senderName = String(profile?.displayName || profile?.email || "").trim() || "Your manager";
  const { id: notificationId, data } = buildReminderNotification({ sarId: id, sar, senderUid: uid, senderName, now });
  await assigneeDoc.ref.collection("notifications").doc(notificationId).set({
    ...data,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await snap.ref.update({
    lastReminderAt: FieldValue.serverTimestamp(),
    lastReminderByUid: uid,
    lastReminderByName: senderName,
    reminderCount: FieldValue.increment(1),
  });

  // The SAR's own history records that a reminder went, and who sent it. It holds no patient details.
  await db.collection("governance_sar_activity").add({
    sarId: id,
    type: "reminder",
    title: "Reminder sent",
    message: `${senderName} sent ${String(sar.assignedToName || "the person it is assigned to")} a reminder to prioritise this SAR.`,
    actorUid: uid,
    actorName: senderName,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { sent: true, assigneeName: String(sar.assignedToName || "") };
}

module.exports = {
  reportsToList,
  isPracticeManager,
  remindScope,
  mayRemind,
  dueText,
  chaseRow,
  sortRows,
  londonDay,
  buildReminderNotification,
  listSarsToChase,
  sendSarReminder,
};
