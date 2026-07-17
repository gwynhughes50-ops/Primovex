import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  getDocs,
  query,
  where,
  limit,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

const DEVICE_ID_KEY = "primovex.device.id.v1";
async function closeActiveSenseSessionsForDevice(deviceId, reason) {
  const q = query(collection(db, "sense_sessions"), where("deviceId", "==", deviceId), limit(20));
  const snapshot = await getDocs(q);
  await Promise.all(snapshot.docs
    .filter((item) => item.data()?.status === "active")
    .map((item) => updateDoc(item.ref, {
      status: "ended",
      endedAt: serverTimestamp(),
      endReason: reason,
      updatedAt: serverTimestamp(),
    })));
}

export const ABSOLUTE_SESSION_MS = 12 * 60 * 60 * 1000;

export function getDeviceId() {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = `pvx-${crypto.randomUUID()}`;
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

function asMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return new Date(value).getTime() || 0;
}

export async function startOrResumeDeviceSession({ user, displayName }) {
  const deviceId = getDeviceId();
  const ref = doc(db, "device_sessions", deviceId);
  const snapshot = await getDoc(ref);
  const now = Date.now();
  const existing = snapshot.exists() ? snapshot.data() : null;
  const existingExpiry = asMillis(existing?.expiresAt);

  if (
    existing?.status === "active" &&
    existing?.userId === user.uid &&
    existingExpiry > now
  ) {
    await updateDoc(ref, { lastActivityAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return { id: deviceId, ...existing, expiresAtMs: existingExpiry };
  }

  if (existing?.status === "active" && existing?.userId && existing.userId !== user.uid) {
    await closeActiveSenseSessionsForDevice(deviceId, "replaced_by_new_login");
    await addDoc(collection(db, "device_session_events"), {
      deviceId,
      previousUserId: existing.userId,
      previousUserDisplayName: existing.userDisplayName || "",
      replacementUserId: user.uid,
      replacementUserDisplayName: displayName || user.displayName || user.email || "",
      eventType: "replaced_by_new_login",
      occurredAt: serverTimestamp(),
    });
  }

  const startedAt = new Date(now);
  const expiresAt = new Date(now + ABSOLUTE_SESSION_MS);
  const data = {
    deviceId,
    userId: user.uid,
    userDisplayName: displayName || user.displayName || user.email || "",
    status: "active",
    startedAt,
    expiresAt,
    lastActivityAt: serverTimestamp(),
    activeSenseSessionId: null,
    activeSenseObjectId: null,
    activeSenseObjectName: null,
    endReason: null,
    updatedAt: serverTimestamp(),
  };
  await setDoc(ref, data, { merge: true });
  return { id: deviceId, ...data, expiresAtMs: expiresAt.getTime() };
}

export async function touchDeviceSession(deviceId) {
  if (!deviceId) return;
  await updateDoc(doc(db, "device_sessions", deviceId), {
    lastActivityAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateDeviceSenseContext(deviceId, context = {}) {
  if (!deviceId) return;
  await updateDoc(doc(db, "device_sessions", deviceId), {
    activeSenseSessionId: context.sessionId || null,
    activeSenseObjectId: context.senseObjectId || null,
    activeSenseObjectName: context.senseObjectName || null,
    updatedAt: serverTimestamp(),
  });
}

export async function endDeviceSession(deviceId, reason = "signed_out") {
  if (!deviceId) return;
  const ref = doc(db, "device_sessions", deviceId);
  const snap = await getDoc(ref);
  if (!snap.exists() || snap.data()?.status !== "active") return;
  await closeActiveSenseSessionsForDevice(deviceId, reason);
  await updateDoc(ref, {
    status: "ended",
    endedAt: serverTimestamp(),
    endReason: reason,
    activeSenseSessionId: null,
    activeSenseObjectId: null,
    activeSenseObjectName: null,
    updatedAt: serverTimestamp(),
  });
}
