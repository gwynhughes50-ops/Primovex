import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isSafeSyntheticMode } from "@/config/platformMode";
import { RETIRE_PATCH_NOTE, sourcesToCheck, staleNotificationIds } from "@/services/staleDueNotifications";

// Looks at the case behind each of this person's due and overdue notifications, and completes the ones whose case has been closed
// (or deleted), so they stop appearing in the bell and the pop-up. Returns the ids it completed. A case this person cannot read
// is left alone. Never throws: a notification that stays a little longer is better than a broken sign-in.
export async function retireStaleDueNotifications(uid, notes = []) {
  if (!uid || isSafeSyntheticMode()) return [];
  const sources = sourcesToCheck(notes);
  if (!sources.length) return [];
  const states = {};
  await Promise.all(sources.map(async ({ collection, id }) => {
    try {
      const snap = await getDoc(doc(db, collection, id));
      states[`${collection}/${id}`] = snap.exists() ? String(snap.data()?.status || "") : "gone";
    } catch {
      /* not allowed to read it, or offline: leave its notification alone */
    }
  }));
  const ids = staleNotificationIds(notes, states);
  await Promise.all(ids.map((nid) => updateDoc(doc(db, "users", uid, "notifications", nid), {
    status: "completed", read: true, completedAt: serverTimestamp(), completedNote: RETIRE_PATCH_NOTE, updatedAt: serverTimestamp(),
  }).catch(() => {})));
  return ids;
}
