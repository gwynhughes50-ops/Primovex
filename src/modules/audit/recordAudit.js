import { writeAuditEvent } from "@/core/identity/auditService";
import { isSafeSyntheticMode } from "@/config/platformMode";

// Write one of the events from auditEvents.js to the governed ledger without making the person wait, and without ever
// failing the work that was just done: the ledger keeps its own retry queue for a write that does not get through.
export function recordAudit(event) {
  if (!event || isSafeSyntheticMode()) return;
  try {
    writeAuditEvent(event).catch(() => {});
  } catch {
    /* the ledger is a record of the work, not part of it */
  }
}
