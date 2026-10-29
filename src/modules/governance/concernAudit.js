// The detailed audit trail of a concern: every change made to the case record, who made it and when, with what it was before and after.
// Pure (no Firestore, no screens) so it can be tested. The case history says what happened in words; this says exactly which fields changed.
//
// Free text (the summary, the outcome sought, how the case was received and the final response note) and anything that identifies the patient or the person
// who raised it are recorded as "changed" only: the audit trail says that they were changed, by whom and when, but never repeats the words or the identifiers.

const toDate = (value) => {
  if (!value) return null;
  if (value?.toDate) return value.toDate();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
  return null;
};
const pad = (n) => String(n).padStart(2, "0");
const ukDate = (date) => (date ? `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}` : "");
const ukDateTime = (date) => (date ? `${ukDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}` : "");
const words = (value) => {
  const text = String(value ?? "").replaceAll("_", " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
};

// field -> [label, how to show it]. "hidden" fields are only ever recorded as changed.
export const AUDITED_FIELDS = {
  reference: ["Reference", "text"],
  status: ["Stage", "word"],
  outcome: ["Outcome", "word"],
  priority: ["Priority", "word"],
  category: ["Category", "word"],
  source: ["Raised by", "word"],
  statementOnly: ["Statement only", "bool"],
  externalReference: ["External reference", "text"],
  ownerName: ["Case owner", "text"],
  namedContactName: ["Named contact", "text"],
  earlyResolutionSuitable: ["Early resolution suitable", "bool"],
  dutyOfCandourConsidered: ["Duty of Candour considered", "bool"],
  dutyOfCandourTriggered: ["Duty of Candour triggered", "bool"],
  clinicalReviewRequired: ["Clinical review required", "bool"],
  mddusRequired: ["MDDUS involved", "bool"],
  gmpiReference: ["GMPI / solicitor reference", "text"],
  lfeReportStatus: ["Learning from Events report", "word"],
  finalResponseDueAt: ["Final response due", "date"],
  acknowledgedAt: ["Acknowledged", "date"],
  listeningDiscussionOfferedAt: ["Listening discussion offered", "date"],
  listeningDiscussionCompletedAt: ["Listening discussion completed", "date"],
  finalResponseReadyAt: ["Final response letter ready", "date"],
  closedAt: ["Closed", "date"],
  summary: ["Summary", "hidden"],
  desiredOutcome: ["Outcome sought", "hidden"],
  finalResponseReadyNote: ["Note on the final response letter", "hidden"],
  raisedByInitials: ["Initials of the person who raised it", "hidden"],
  emisNumber: ["Patient EMIS number", "hidden"],
  patientInitials: ["Patient initials", "hidden"],
  dateOfBirth: ["Patient date of birth", "hidden"],
  hasContactDetails: ["Contact details", "hidden"],
};

const isMarker = (value) => value !== null && typeof value === "object" && !Array.isArray(value) && !toDate(value); // a "set to the time of saving" marker

function show(value, kind) {
  if (value === undefined || value === null || value === "") return "";
  if (kind === "bool") return value ? "Yes" : "No";
  if (kind === "word") return words(value);
  if (kind === "date") return isMarker(value) ? "Recorded now" : ukDate(toDate(value));
  return String(value).slice(0, 160);
}

// What changed between the case as it was (`before`, null when it could not be read) and what is being saved (`patch`, only the fields being written).
// Returns [{ label, from, to, hidden }] in a stable order; fields that did not change are left out.
export function describeChanges(before, patch = {}) {
  const changes = [];
  for (const [field, [label, kind]] of Object.entries(AUDITED_FIELDS)) {
    if (!(field in patch)) continue;
    const next = patch[field];
    const known = before && typeof before === "object";
    const prev = known ? before[field] : undefined;
    const sameDate = kind === "date" && !isMarker(next) && toDate(prev)?.getTime() === toDate(next)?.getTime();
    const same = kind === "date" ? sameDate : (kind === "bool" ? Boolean(prev) === Boolean(next) : String(prev ?? "").trim() === String(next ?? "").trim());
    if (known && same) continue;
    if (kind === "hidden") { changes.push({ label, from: "", to: "", hidden: true }); continue; }
    changes.push({ label, from: known ? show(prev, kind) : "(not known)", to: show(next, kind), hidden: false });
  }
  return changes;
}

// A short line for one change, and for a list of them
export const changeText = (change) => (change.hidden ? `${change.label} changed` : `${change.label}: ${change.from || "blank"} → ${change.to || "blank"}`);
export const changesText = (changes = []) => changes.map(changeText).join("; ").slice(0, 900);

// Keeps what is stored on a timeline line small and plain
export function cleanChanges(changes) {
  if (!Array.isArray(changes)) return [];
  return changes.slice(0, 40).map((c) => ({
    label: String(c?.label || "").slice(0, 80),
    from: String(c?.from || "").slice(0, 160),
    to: String(c?.to || "").slice(0, 160),
    hidden: c?.hidden === true,
  }));
}

export const AUDIT_TYPE = "audit";
export const isAuditEvent = (event) => event?.type === AUDIT_TYPE;

// The timeline line to write for a set of changes, or null when nothing changed
export function auditEntry(before, patch) {
  const changes = describeChanges(before, patch);
  if (!changes.length) return null;
  return { type: AUDIT_TYPE, title: "Case record changed", message: changesText(changes), changes };
}

// The audit trail for the print, oldest first: one row per field changed. [{ when, who, what, from, to }]
export function auditRows(timeline = []) {
  const time = (event) => toDate(event?.createdAt)?.getTime() || 0;
  const rows = [];
  for (const event of [...(timeline || [])].filter(isAuditEvent).sort((a, b) => time(a) - time(b))) {
    const when = ukDateTime(toDate(event.createdAt));
    const who = event.actorName && event.actorName !== "Unknown" ? event.actorName : "Not recorded";
    if (Array.isArray(event.changes) && event.changes.length) {
      for (const change of event.changes) rows.push({ when, who, what: change.hidden ? `${change.label} changed` : change.label, from: change.hidden ? "not shown" : change.from, to: change.hidden ? "not shown" : change.to });
    } else {
      rows.push({ when, who, what: event.title || "Change", from: "", to: event.message || "" });
    }
  }
  return rows;
}
