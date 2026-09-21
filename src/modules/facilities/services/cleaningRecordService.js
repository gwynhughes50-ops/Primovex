import { collection, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { addDocResendSafe } from '@/lib/resendSafeWrites';
import { db } from '@/lib/firebase';

// Real, cross-device cleaning/stocking records. Previously this lived only in
// localStorage (per-device, never synced) which is why a Cleaner's phone and
// the desktop Facilities admin view never agreed on what had actually
// happened. One doc per room (current status) plus an append-only log.
const ROOM_OPERATIONAL_COLLECTION = 'room_operational';
const CLEANING_LOGS_COLLECTION = 'cleaning_logs';

function toMillis(value) {
  if (!value) return 0;
  if (value.toMillis) return value.toMillis();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

// No orderBy on either subscription: a doc missing the sort field would be
// silently dropped by Firestore rather than just sorted last, so we fetch
// everything and sort client-side instead.
export function subscribeRoomOperational(onData, onError) {
  return onSnapshot(collection(db, ROOM_OPERATIONAL_COLLECTION), (snap) => {
    const map = {};
    snap.docs.forEach((row) => { map[row.id] = row.data(); });
    onData(map);
  }, onError);
}

export function subscribeCleaningLogs(onData, onError) {
  return onSnapshot(collection(db, CLEANING_LOGS_COLLECTION), (snap) => {
    const rows = snap.docs.map((row) => ({ id: row.id, ...row.data() }));
    rows.sort((a, b) => toMillis(b.cleanedAt) - toMillis(a.cleanedAt));
    onData(rows);
  }, onError);
}

export async function markRoomStocked(roomId, actor) {
  await setDoc(doc(db, ROOM_OPERATIONAL_COLLECTION, roomId), {
    lastStockedAt: serverTimestamp(),
    lastStockedBy: actor,
  }, { merge: true });
}

export async function markRoomCleaned(roomId, roomName, actor, method = 'one-tap-confirmation') {
  await setDoc(doc(db, ROOM_OPERATIONAL_COLLECTION, roomId), {
    lastCleanedAt: serverTimestamp(),
    lastCleanedBy: actor,
    operationalStatus: 'ready',
  }, { merge: true });
  await addDocResendSafe(collection(db, CLEANING_LOGS_COLLECTION), {
    roomId,
    roomName: roomName || roomId,
    cleanedAt: serverTimestamp(),
    cleanedBy: actor,
    method,
  });
}

export function getActiveCleaningSession(roomOperationalMap, roomId) {
  return roomOperationalMap?.[roomId]?.activeCleaningSession || null;
}

// First scan of a room by a Cleaner arms a session; the matching second scan
// calls completeCleaningSession, which needs the live-subscribed
// roomOperational map (from subscribeRoomOperational) to compute duration —
// it isn't re-fetched here to avoid an extra round trip on every scan.
export async function startCleaningSession(roomId, roomName, actor) {
  await setDoc(doc(db, ROOM_OPERATIONAL_COLLECTION, roomId), {
    activeCleaningSession: { roomName: roomName || roomId, startedAt: new Date().toISOString(), startedBy: actor },
  }, { merge: true });
}

export async function completeCleaningSession(roomOperationalMap, roomId, roomName, actor) {
  const session = getActiveCleaningSession(roomOperationalMap, roomId);
  const nowIso = new Date().toISOString();
  const durationSeconds = session ? Math.max(0, Math.round((new Date(nowIso) - new Date(session.startedAt)) / 1000)) : null;

  await setDoc(doc(db, ROOM_OPERATIONAL_COLLECTION, roomId), {
    lastCleanedAt: serverTimestamp(),
    lastCleanedBy: actor,
    operationalStatus: 'ready',
    activeCleaningSession: null,
  }, { merge: true });

  await addDocResendSafe(collection(db, CLEANING_LOGS_COLLECTION), {
    roomId,
    roomName: roomName || session?.roomName || roomId,
    cleanedAt: serverTimestamp(),
    cleanedBy: actor,
    method: 'nfc-session',
    startedAt: session?.startedAt || null,
    startedBy: session?.startedBy || actor,
    durationSeconds,
  });

  return { durationSeconds };
}
