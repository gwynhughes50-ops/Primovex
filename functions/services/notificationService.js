const { FieldValue } = require("firebase-admin/firestore");
const { HttpsError } = require("firebase-functions/v2/https");

// Notifications live in users/{uid}/notifications, and the Firestore rules do
// not let a browser create one (a person could otherwise write anything into
// anyone's inbox). So the app asks this server code to create them, and the
// content is built here from the real record, never taken from the caller.

const SAR_CLOSED = ["completed", "archived"];

function formatDate(value) {
  const date = typeof value?.toDate === "function" ? value.toDate() : value instanceof Date ? value : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

// Whether the person a SAR is assigned to should be told, and why not if not.
// Pure, so it can be tested.
function sarNotificationDecision({ sar, callerUid }) {
  if (!sar) return { send: false, reason: "not-found" };
  const assignee = String(sar.assignedToUid || "");
  if (!assignee) return { send: false, reason: "unassigned" };
  if (SAR_CLOSED.includes(sar.status)) return { send: false, reason: "closed" };
  // Assigning a SAR to yourself needs no notification.
  if (assignee === callerUid) return { send: false, reason: "self" };
  return { send: true, assigneeUid: assignee };
}

// The notification document. One per SAR and assignee (the id is fixed), so a
// repeat call re-saves the same one rather than piling up duplicates, and
// assigning the SAR to the same person again brings it back as unread.
function buildSarAssignmentNotification({ sarId, sar, assigneeUid, assignerUid, assignerName }) {
  const due = formatDate(sar.dueDate || sar.due_date);
  return {
    id: `sar-assigned-${sarId}-${assigneeUid}`,
    data: {
      recipientUid: assigneeUid,
      title: `SAR assigned to you: ${sar.reference || sarId}`,
      message: `${sar.requestTypeLabel || "SAR"} request${due ? ` due ${due}` : ""}.`,
      module: "sar",
      priority: sar.priority || "routine",
      dueDate: sar.dueDate || null,
      actionUrl: "/governance/sars",
      read: false,
      status: "open",
      createdByUid: assignerUid || null,
      createdByName: assignerName || "Primovex",
    },
  };
}

async function notifySarAssignment({ db, callerUid, callerName, sarId }) {
  const cleanId = String(sarId || "");
  if (!cleanId) throw new HttpsError("invalid-argument", "Missing SAR id.");

  const snap = await db.collection("governance_sars").doc(cleanId).get();
  const sar = snap.exists ? snap.data() : null;
  if (!sar) throw new HttpsError("not-found", "That SAR no longer exists.");

  const decision = sarNotificationDecision({ sar, callerUid });
  if (!decision.send) return { notified: false, reason: decision.reason };

  // Only real, active accounts are notified.
  const assignee = await db.collection("users").doc(decision.assigneeUid).get();
  if (!assignee.exists || assignee.data()?.active === false) return { notified: false, reason: "assignee-unavailable" };

  const { id, data } = buildSarAssignmentNotification({
    sarId: cleanId,
    sar,
    assigneeUid: decision.assigneeUid,
    assignerUid: callerUid,
    assignerName: callerName,
  });
  await assignee.ref.collection("notifications").doc(id).set({
    ...data,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { notified: true, assigneeUid: decision.assigneeUid };
}

module.exports = { notifySarAssignment, sarNotificationDecision, buildSarAssignmentNotification, formatDate };
