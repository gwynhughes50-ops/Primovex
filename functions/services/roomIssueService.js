const { FieldValue } = require("firebase-admin/firestore");

async function findRecipients(db, practiceId) {
  const usersRef = db.collection("users");
  const caretakerSnap = await usersRef.where("role", "==", "Caretaker").get();
  let recipients = caretakerSnap.docs;
  if (practiceId) {
    const scoped = recipients.filter((userDoc) => {
      const data = userDoc.data();
      const userPracticeId = data.practiceId || data.organisationId || data.organizationId;
      return !userPracticeId || userPracticeId === practiceId;
    });
    if (scoped.length) recipients = scoped;
  }
  if (recipients.length) return recipients;

  // No Caretaker configured for this practice yet: fall back to Practice
  // Manager so a reported issue is never silently lost.
  const managerSnap = await usersRef.where("role", "==", "Practice Manager").get();
  return managerSnap.docs;
}

// Writes into each recipient's own users/{uid}/notifications subcollection —
// the same collection the app's Notifications inbox already reads live via
// onSnapshot, so this shows up immediately without any new client wiring.
// Note: this is an in-app notification only. There is no OS-level push
// notification infrastructure wired up anywhere in this project yet, so a
// recipient with the app closed will only see this next time they open it.
async function reportRoomIssue(db, { roomId, roomName, note, reporterUid, reporterName, practiceId }) {
  const recipients = await findRecipients(db, practiceId);
  if (!recipients.length) return { notifiedCount: 0, notifiedNames: [] };

  const batch = db.batch();
  const title = `Cleaning issue: ${roomName || roomId || "Room"}`;
  const createdAt = FieldValue.serverTimestamp();

  recipients.forEach((userDoc) => {
    const ref = userDoc.ref.collection("notifications").doc();
    batch.set(ref, {
      title,
      message: note,
      module: "estates",
      priority: "high",
      status: "open",
      read: false,
      actionUrl: "/facilities",
      roomId: roomId || null,
      roomName: roomName || null,
      reportedByUid: reporterUid || null,
      reportedByName: reporterName || "Cleaning team",
      createdAt,
    });
  });
  await batch.commit();

  return {
    notifiedCount: recipients.length,
    notifiedNames: recipients.map((userDoc) => userDoc.data().displayName || userDoc.data().email || userDoc.id),
  };
}

module.exports = { reportRoomIssue };
