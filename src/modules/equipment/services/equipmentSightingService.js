// One doc per equipment item (equipment_sightings/{equipmentId}), updated
// every time any staff phone's background BLE scan passes near that item's
// tag. Deliberately separate from equipment_registry (see equipmentRegistry.js)
// — that's a single shared doc reconciled by revision number, which doesn't
// suit frequent "last seen" pings from multiple devices. Here, last write
// wins by design: there's nothing to reconcile, we only ever want the most
// recent sighting.
import { collection, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

const COLLECTION = 'equipment_sightings';

export async function recordEquipmentSighting(equipmentId, { seenBy = '', spaceId = null, spaceName = '' } = {}) {
  if (!equipmentId || !auth.currentUser) return;
  await setDoc(doc(db, COLLECTION, equipmentId), {
    lastSeenAt: serverTimestamp(),
    lastSeenBy: seenBy,
    lastSeenSpaceId: spaceId,
    lastSeenSpaceName: spaceName,
  }, { merge: true });
}

// onData receives a Map<equipmentId, {lastSeenAt, lastSeenBy, lastSeenSpaceId, lastSeenSpaceName}>.
export function subscribeToEquipmentSightings(onData) {
  if (!auth.currentUser) return () => {};
  return onSnapshot(collection(db, COLLECTION), (snapshot) => {
    const next = new Map();
    snapshot.forEach((docSnap) => next.set(docSnap.id, docSnap.data()));
    onData(next);
  }, (error) => {
    console.error('Equipment sightings subscription failed', error);
    onData(new Map());
  });
}
