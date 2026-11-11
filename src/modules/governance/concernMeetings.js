// Cancelling a face-to-face meeting on a concern. Pure (no Firestore, no screens) so it can be tested.
// A cancelled meeting is kept, not deleted: it stays on the case showing who cancelled it, when and why, and the reason goes into the case history, which is what the audit trail and the printed
// audit table are built from. The reason is chosen from a list: nothing is typed, so nothing a patient said or an identifier can end up in the audit trail.

export const MEETING_CANCEL_REASONS = [
  { key: "patient_cancelled", label: "The patient or their representative asked to cancel" },
  { key: "no_reply", label: "No reply from the patient or their representative" },
  { key: "staff_unavailable", label: "The staff who were to attend were not available" },
  { key: "rearranged", label: "Being rearranged for another date" },
  { key: "no_longer_needed", label: "No longer needed" },
  { key: "other", label: "Another reason" },
];

export const cancelReasonLabel = (key) => MEETING_CANCEL_REASONS.find((r) => r.key === key)?.label || "";
export const isCancelled = (meeting) => meeting?.cancelled === true;

const ukFromIso = (value) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "")); return m ? `${m[3]}/${m[2]}/${m[1]}` : ""; };
const toDate = (value) => {
  if (!value) return null;
  if (value?.toDate) return value.toDate();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
  return null;
};
const pad = (n) => String(n).padStart(2, "0");
const ukDate = (d) => (d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : "");

// "" when this meeting can be cancelled for this reason, otherwise what is wrong
export function cancelProblem(meeting, reasonKey) {
  if (!meeting?.id) return "That meeting could not be found.";
  if (isCancelled(meeting)) return "This meeting has already been cancelled.";
  if (!cancelReasonLabel(reasonKey)) return "Choose a reason for cancelling the meeting.";
  return "";
}

// The fields saved on the meeting. The time of cancelling is added by the server when it is saved.
export function cancelFields(reasonKey, actor = {}) {
  return {
    cancelled: true,
    cancelReasonKey: reasonKey,
    cancelReason: cancelReasonLabel(reasonKey),
    cancelledByUid: actor.uid || null,
    cancelledByName: actor.displayName || actor.email || "Unknown",
  };
}

// The line written to the case history (and so to the audit trail and the printed audit table)
export function cancelTimelineMessage(meeting, reasonKey) {
  const when = ukFromIso(meeting?.bookedDate);
  const booked = when ? `It was booked for ${when}${meeting.bookedTime ? ` at ${meeting.bookedTime}` : ""}. ` : "It had not been booked yet. ";
  return `${booked}Cancelled: ${cancelReasonLabel(reasonKey)}.`;
}

// How a cancelled meeting is described on the case screen and the printed summary
export function cancelledText(meeting) {
  if (!isCancelled(meeting)) return "";
  const day = ukDate(toDate(meeting.cancelledAt));
  return `Cancelled${day ? ` on ${day}` : ""} by ${meeting.cancelledByName || "not recorded"}. Reason: ${meeting.cancelReason || cancelReasonLabel(meeting.cancelReasonKey) || "not recorded"}.`;
}
