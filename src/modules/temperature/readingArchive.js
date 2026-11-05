// Archiving a fridge reading. A reading is a cold-chain record, so it is never deleted: archiving takes it out of the lists, today's status, the day strip, the reports and the Orb's answers, but keeps it on record
// with who archived it, when and why, and it can be brought back. The reason is picked from a list (a typed note is for "another reason" only). Pure (no Firestore, no screens) so it can be tested.

export const ARCHIVE_REASONS = [
  { key: "wrong_fridge", label: "Recorded against the wrong fridge" },
  { key: "entered_in_error", label: "Entered in error (mistyped)" },
  { key: "duplicate", label: "Duplicate reading" },
  { key: "test", label: "Test reading" },
  { key: "other", label: "Another reason (say what)", needsNote: true },
];

// The only fields archiving or restoring may change on a reading. The database rules allow nothing else to be touched by someone who has the archive permission (checked by a test).
export const ARCHIVE_FIELDS = ["archived", "archivedAt", "archivedBy", "archivedByUid", "archiveReason", "archiveReasonKey", "archiveNote", "restoredAt", "restoredBy", "restoredByUid"];

const text = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export const isArchived = (reading) => reading?.archived === true;
// the readings that count: everything that has not been archived
export const activeReadings = (readings = []) => readings.filter((reading) => !isArchived(reading));

export function buildArchivePatch({ reasonKey, note = "", actor = {}, now = new Date() } = {}) {
  const reason = ARCHIVE_REASONS.find((r) => r.key === reasonKey);
  if (!reason) throw new Error("Choose why this reading is being archived.");
  const why = text(note, 200);
  if (reason.needsNote && !why) throw new Error("Say what the other reason is.");
  return {
    archived: true,
    archivedAt: now,
    archivedBy: text(actor.displayName || actor.email, 80) || "Unknown",
    archivedByUid: actor.uid || null,
    archiveReason: reason.label,
    archiveReasonKey: reason.key,
    archiveNote: why,
  };
}

export function buildRestorePatch({ actor = {}, now = new Date() } = {}) {
  return {
    archived: false,
    archivedAt: null,
    archivedBy: null,
    archivedByUid: null,
    archiveReason: null,
    archiveReasonKey: null,
    archiveNote: null,
    restoredAt: now,
    restoredBy: text(actor.displayName || actor.email, 80) || "Unknown",
    restoredByUid: actor.uid || null,
  };
}

// one line for the list: "Archived by Gwyn Hughes on 05/11/2026: Duplicate reading"
export function archivedLine(reading, ukDate = (d) => d.toLocaleDateString("en-GB")) {
  if (!isArchived(reading)) return "";
  const when = reading.archivedAt?.toDate ? reading.archivedAt.toDate() : reading.archivedAt instanceof Date ? reading.archivedAt : reading.archivedAt ? new Date(reading.archivedAt) : null;
  const day = when && !Number.isNaN(when.getTime()) ? ` on ${ukDate(when)}` : "";
  const why = [reading.archiveReason, reading.archiveNote].filter(Boolean).join(": ");
  return `Archived by ${reading.archivedBy || "someone"}${day}${why ? `: ${why}` : ""}`;
}
