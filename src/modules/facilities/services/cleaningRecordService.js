import { collection, doc, onSnapshot, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
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

export async function completeCleaningSession(roomOperationalMap, roomId, roomName, actor, actorUid = null) {
  const session = getActiveCleaningSession(roomOperationalMap, roomId);
  const nowIso = new Date().toISOString();
  const durationSeconds = session ? Math.max(0, Math.round((new Date(nowIso) - new Date(session.startedAt)) / 1000)) : null;

  await setDoc(doc(db, ROOM_OPERATIONAL_COLLECTION, roomId), {
    lastCleanedAt: serverTimestamp(),
    lastCleanedBy: actor,
    operationalStatus: 'ready',
    activeCleaningSession: null,
  }, { merge: true });

  const logRef = await addDocResendSafe(collection(db, CLEANING_LOGS_COLLECTION), {
    roomId,
    roomName: roomName || session?.roomName || roomId,
    cleanedAt: serverTimestamp(),
    cleanedBy: actor,
    cleanedByUid: actorUid,
    method: 'nfc-session',
    startedAt: session?.startedAt || null,
    startedBy: session?.startedBy || actor,
    durationSeconds,
  });

  return { durationSeconds, logId: logRef.id };
}

// The note a cleaner adds on the "finished" screen. The log itself is saved the
// moment the second tag is tapped (so a walk-away never loses the record); the
// note is added to it afterwards, once, by the same person.
export async function addCleaningNote(logId, note, { issue = false } = {}) {
  const text = String(note || '').trim().slice(0, 1000);
  if (!logId || !text) return;
  await updateDoc(doc(db, CLEANING_LOGS_COLLECTION, logId), {
    notes: text,
    issueReported: Boolean(issue),
    notedAt: serverTimestamp(),
  });
}

// A clean that wasn't recorded with the tags (no phone, a missed tap). Saved in
// the same log, but marked as entered by hand: who says it was cleaned, who
// entered it, and why. cleanedByUid is left empty so the "note" route for the
// person who tapped can't apply to it.
export async function addManualCleaningLog({ roomId, roomName, cleanedBy, performedAt, note, reason, enteredBy, enteredByUid = null, currentLastCleanedAt = null }) {
  const when = performedAt instanceof Date && !Number.isNaN(performedAt.getTime()) ? performedAt : new Date();
  const text = String(note || '').trim().slice(0, 1000);
  const ref = await addDocResendSafe(collection(db, CLEANING_LOGS_COLLECTION), {
    roomId,
    roomName: roomName || roomId,
    cleanedAt: Timestamp.fromDate(when),
    cleanedBy: String(cleanedBy || '').trim() || enteredBy,
    cleanedByUid: null,
    method: 'manual-desktop',
    manualEntry: true,
    manualReason: String(reason || '').trim(),
    enteredBy,
    enteredByUid,
    enteredAt: serverTimestamp(),
    ...(text ? { notes: text, issueReported: false } : {}),
  });
  // Only move the room's "last cleaned" forward, never back over a newer clean.
  const current = toMillis(currentLastCleanedAt);
  if (!current || when.getTime() >= current) {
    await setDoc(doc(db, ROOM_OPERATIONAL_COLLECTION, roomId), {
      lastCleanedAt: Timestamp.fromDate(when),
      lastCleanedBy: String(cleanedBy || '').trim() || enteredBy,
      operationalStatus: 'ready',
    }, { merge: true });
  }
  return ref.id;
}
