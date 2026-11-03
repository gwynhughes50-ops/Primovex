import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isSafeSyntheticMode } from "@/config/platformMode";
import { sourcesToCheck, staleNotifications } from "@/services/staleDueNotifications";

// Looks at the case behind each of this person's due and overdue notifications, and completes the ones that are out of date: the case has
// been closed or deleted, the deadline has passed (for "due soon"), or the deadline it names has been met or moved (acknowledged, final
// response sent, no longer in early resolution, date changed), so they stop appearing in the bell and the pop-up. Each is completed with
// the reason. Returns the ids it completed. A case this person cannot read is left alone (apart from a "due soon" whose day has gone).
// Never throws: a notification that stays a little longer is better than a broken sign-in.
export async function retireStaleDueNotifications(uid, notes = []) {
  if (!uid || isSafeSyntheticMode()) return [];
  const sources = sourcesToCheck(notes);
  if (!sources.length) return [];
  const states = {};
  await Promise.all(sources.map(async ({ collection, id }) => {
    try {
      const snap = await getDoc(doc(db, collection, id));
      states[`${collection}/${id}`] = snap.exists() ? { status: String(snap.data()?.status || ""), data: snap.data() } : "gone";
    } catch {
      /* not allowed to read it, or offline: leave its notification alone */
    }
  }));
  const stale = staleNotifications(notes, states);
  await Promise.all(stale.map(({ id, why }) => updateDoc(doc(db, "users", uid, "notifications", id), {
    status: "completed", read: true, completedAt: serverTimestamp(), completedNote: why, updatedAt: serverTimestamp(),
  }).catch(() => {})));
  return stale.map((row) => row.id);
}
