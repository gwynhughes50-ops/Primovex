import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

export const AUDIT_EVENTS_COLLECTION = "audit_events";

/**
 * Writes an immutable platform audit event. If Firestore rules block the write,
 * the app logs locally rather than interrupting the user workflow.
 */
export async function writeAuditEvent({ actor, action, module, targetType, targetId, summary, metadata = {} }) {
  const payload = {
    actorUid: actor?.uid || actor?.id || null,
    actorName: actor?.displayName || actor?.email || "Unknown user",
    action,
    module,
    targetType,
    targetId: targetId || null,
    summary,
    metadata,
    createdAt: serverTimestamp(),
  };

  try {
    await addDoc(collection(db, AUDIT_EVENTS_COLLECTION), payload);
  } catch (error) {
    console.warn("[MedTrak Audit] Unable to write audit event", error, payload);
  }
}
