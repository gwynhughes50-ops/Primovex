import { useEffect, useState } from "react";

// Says so, on the screen, when a change was saved but the audit line for it could not be written. The audit trail is a record people rely on, so a gap in it is never left to be found later.
// concernService.js sends the "primovex:audit-failed" event; the reason is the database's own word (for example permission-denied).
export const AUDIT_FAILED_EVENT = "primovex:audit-failed";

export default function AuditFailureNotice() {
  const [reason, setReason] = useState("");
  useEffect(() => {
    const show = (event) => setReason(String(event?.detail?.reason || "unknown").slice(0, 120));
    window.addEventListener(AUDIT_FAILED_EVENT, show);
    return () => window.removeEventListener(AUDIT_FAILED_EVENT, show);
  }, []);
  if (!reason) return null;
  return (
    <div role="alert" className="fixed inset-x-3 bottom-3 z-[500] mx-auto flex max-w-xl items-start gap-3 rounded-2xl border border-rose-400 bg-rose-50 p-3 text-sm text-rose-900 shadow-xl">
      <p className="min-w-0 flex-1"><b>Your change was saved, but its audit line could not be written</b> ({reason}). It will not appear in the audit trail. Tell whoever looks after Primovex, and quote the word in brackets.</p>
      <button type="button" onClick={() => setReason("")} className="shrink-0 rounded-lg border border-rose-300 bg-white px-2 py-1 text-xs font-semibold">Dismiss</button>
    </div>
  );
}
