import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase";

/**
 * emergency_assets/{assetId}
 * emergency_assets/{assetId}/checks/{checkId}
 *
 * anaphylaxis_boxes/{boxId}
 * anaphylaxis_boxes/{boxId}/checks/{checkId}
 */

function getUserStamp() {
  const u = auth?.currentUser;
  return {
    uid: u?.uid || null,
    name: u?.displayName || u?.name || null,
    email: u?.email || null,
  };
}

export async function listEmergencyAssets() {
  const snap = await getDocs(
    query(collection(db, "emergency_assets"), orderBy("name", "asc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listAnaphylaxisBoxes() {
  const snap = await getDocs(
    query(collection(db, "anaphylaxis_boxes"), orderBy("name", "asc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getParentDoc(parentCollection, parentId) {
  const ref = doc(db, parentCollection, parentId);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function upsertParentDoc(parentCollection, parentId, payload) {
  const ref = doc(db, parentCollection, parentId);
  await setDoc(
    ref,
    {
      ...payload,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function deleteParentDoc(parentCollection, parentId) {
  const ref = doc(db, parentCollection, parentId);
  await deleteDoc(ref);
}

export async function getLatestCheck(parentCollection, parentId) {
  const checksRef = collection(db, parentCollection, parentId, "checks");
  const snap = await getDocs(
    query(checksRef, orderBy("createdAt", "desc"), limit(1))
  );
  const d = snap.docs[0];
  return d ? { id: d.id, ...d.data() } : null;
}

export async function createMonthlyCheck(parentCollection, parentId, payload) {
  const checksRef = collection(db, parentCollection, parentId, "checks");
  return await addDoc(checksRef, {
    ...payload,
    createdAt: serverTimestamp(),
    createdBy: getUserStamp(),
  });
}

export async function fetchSeedJson() {
  const mod = await import("@/assets/seed_checklists.json");
  return mod.default || mod;
}

export async function seedFromJson(seedJson) {
  if (!auth?.currentUser) {
    throw new Error("You must be signed in to create the default emergency checklists.");
  }

  const tasks = [];
  let emergencyCount = 0;
  let anaCount = 0;

  for (const a of seedJson.emergency_assets || []) {
    emergencyCount += 1;
    const ref = doc(db, "emergency_assets", a.id);
    tasks.push(
      setDoc(
        ref,
        {
          type: a.type,
          site: a.site,
          name: a.name,
          location: a.location,
          frequency: a.frequency || "monthly",
          items: (a.items || []).map((it, idx) => ({
            id: it.id || `${a.id}_item_${idx + 1}`,
            section: it.section || "General",
            name: it.name,
            expectedQty: it.expectedQty ?? null,
            defaultBatch: it.defaultBatch ?? null,
            defaultExpiry: it.defaultExpiry ?? null,
            stock_barcode: it.stock_barcode ?? null,
          })),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
    );
  }

  for (const b of seedJson.anaphylaxis_boxes || []) {
    anaCount += 1;
    const ref = doc(db, "anaphylaxis_boxes", b.id);
    tasks.push(
      setDoc(
        ref,
        {
          type: b.type,
          site: b.site,
          name: b.name,
          location: b.location,
          frequency: b.frequency || "monthly",
          items: (b.items || []).map((it, idx) => ({
            id: it.id || `${b.id}_item_${idx + 1}`,
            name: it.name,
            expectedQty: it.expectedQty ?? null,
            defaultBatch: it.defaultBatch ?? null,
            defaultExpiry: it.defaultExpiry ?? null,
            stock_barcode: it.stock_barcode ?? null,
          })),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
    );
  }

  await Promise.all(tasks);
  return { emergencyCount, anaCount };
}
