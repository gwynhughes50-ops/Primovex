import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export async function getActiveSenseSession({ userId, deviceId }) {
  if (!userId || !deviceId) return null;
  const q = query(
    collection(db, "sense_sessions"),
    where("deviceId", "==", deviceId),
    limit(20)
  );
  const snapshot = await getDocs(q);
  const row = snapshot.docs.find((item) => {
    const data = item.data();
    return data.userId === userId && data.status === "active";
  });
  return row ? { id: row.id, ...row.data() } : null;
}

export async function closeSenseSession(sessionId, reason = "room_changed") {
  if (!sessionId) return;
  const ref = doc(db, "sense_sessions", sessionId);
  const snap = await getDoc(ref);
  if (!snap.exists() || snap.data()?.status !== "active") return;
  await updateDoc(ref, {
    status: "ended",
    endedAt: serverTimestamp(),
    endReason: reason,
    updatedAt: serverTimestamp(),
  });
}

export async function activateSenseObject({
  user,
  displayName,
  deviceId,
  currentSession,
  senseObjectId,
  senseObjectName,
  senseObjectType = "space",
  source = "nfc",
}) {
  if (!user?.uid || !deviceId || !senseObjectId) throw new Error("Missing Sense session identity.");

  if (currentSession?.id) {
    if (currentSession.senseObjectId === senseObjectId) return currentSession;
    await closeSenseSession(currentSession.id, "room_changed");
  }

  const ref = await addDoc(collection(db, "sense_sessions"), {
    userId: user.uid,
    userDisplayName: displayName || user.displayName || user.email || "",
    deviceId,
    senseObjectId,
    senseObjectName: senseObjectName || senseObjectId,
    senseObjectType,
    source,
    status: "active",
    startedAt: serverTimestamp(),
    endedAt: null,
    endReason: null,
    updatedAt: serverTimestamp(),
  });

  await addDoc(collection(db, "sense_events"), {
    eventType: currentSession ? "sense_context_changed" : "sense_context_started",
    userId: user.uid,
    userDisplayName: displayName || user.displayName || user.email || "",
    deviceId,
    fromSenseObjectId: currentSession?.senseObjectId || null,
    fromSenseObjectName: currentSession?.senseObjectName || null,
    toSenseObjectId: senseObjectId,
    toSenseObjectName: senseObjectName || senseObjectId,
    occurredAt: serverTimestamp(),
    source,
  });

  return {
    id: ref.id,
    userId: user.uid,
    userDisplayName: displayName || user.displayName || user.email || "",
    deviceId,
    senseObjectId,
    senseObjectName: senseObjectName || senseObjectId,
    senseObjectType,
    source,
    status: "active",
    startedAt: new Date(),
  };
}
