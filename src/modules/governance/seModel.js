// Significant events (SEs): what the stages are and what can happen next. No Firebase in here, so
// it can be tested on its own; seService.js does the reading and writing.
//
// The flow every practice shares:  reported -> (investigate, or "no investigation needed") ->
// review -> significant event meeting -> actions -> closed.
// What differs from practice to practice is who reviews: a practice sets default reviewer roles,
// and the person leading an event can add or remove people for that event.

export const SE_COLLECTION = "governance_significant_events";
export const SE_REVIEWS_COLLECTION = "governance_se_reviews";
export const SE_MEETINGS_COLLECTION = "governance_se_meetings";
export const SE_ACTIONS_COLLECTION = "governance_se_actions";
export const SE_TIMELINE_COLLECTION = "governance_se_timeline";
export const SE_SETTINGS_DOC = "significantEvents"; // settings/significantEvents

export const SE_STATUSES = {
  reported: "reported",
  investigating: "investigating",
  in_review: "in_review",
  awaiting_meeting: "awaiting_meeting",
  actions_open: "actions_open",
  closed: "closed",
};

export const SE_STAGES = [
  { key: SE_STATUSES.reported, label: "Reported", hint: "Waiting for a decision on whether to investigate" },
  { key: SE_STATUSES.investigating, label: "Investigating", hint: "Finding out what happened and why" },
  { key: SE_STATUSES.in_review, label: "In review", hint: "Reviewers are giving their view" },
  { key: SE_STATUSES.awaiting_meeting, label: "Awaiting meeting", hint: "Ready to discuss at a significant event meeting" },
  { key: SE_STATUSES.actions_open, label: "Actions open", hint: "Discussed; actions still to finish" },
  { key: SE_STATUSES.closed, label: "Closed", hint: "Done" },
];

export const SE_CATEGORIES = [
  "clinical_care", "medication", "diagnosis_or_results", "communication", "access_or_appointments",
  "information_governance", "safeguarding", "infection_control", "equipment_or_premises", "staffing", "other",
];

export const SE_HARM_LEVELS = [
  { key: "none", label: "No harm", hint: "Happened but nobody was harmed (a near miss)" },
  { key: "low", label: "Low harm", hint: "Minor harm, needed no more than simple treatment or reassurance" },
  { key: "moderate", label: "Moderate harm", hint: "Needed extra treatment or caused more than short-term harm" },
  { key: "severe", label: "Severe harm", hint: "Serious or permanent harm, or a death" },
];

export const SE_INVESTIGATION = { pending: "pending", required: "required", not_required: "not_required" };
export const REVIEW_STATUSES = { requested: "requested", submitted: "submitted" };
export const MEETING_STATUSES = { planned: "planned", held: "held" };
export const ACTION_STATUSES = { open: "open", done: "done" };

export function friendly(value) {
  return String(value || "").replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

export function stageLabel(status) {
  return SE_STAGES.find((s) => s.key === status)?.label || friendly(status) || "Reported";
}

export function createSeReference(date = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `SE-${date.getFullYear()}-${p(date.getMonth() + 1)}${p(date.getDate())}${p(date.getHours())}${p(date.getMinutes())}`;
}

// ---- reporting an event -------------------------------------------------------------------------------

// What the person reporting types or picks. Returns a problem in plain words, or "" if fine.
export function validateReport(form = {}) {
  if (!String(form.title || "").trim()) return "Give the event a short title that doesn't name anyone.";
  if (!String(form.description || "").trim()) return "Say what happened.";
  if (!form.eventDate) return "Choose the date it happened.";
  if (new Date(form.eventDate).getTime() > Date.now() + 86400000) return "The event date can't be in the future.";
  if (form.patientInvolved && !String(form.emisNumber || "").trim() && !String(form.patientInitials || "").trim()) {
    return "A patient was involved: give their EMIS number, or initials if there isn't one. Never a name.";
  }
  return "";
}

const clean = (value, max) => String(value || "").trim().slice(0, max);

// The fields stored for a new report (timestamps are added by the service).
export function normaliseReport(form = {}) {
  const involved = Boolean(form.patientInvolved);
  return {
    title: clean(form.title, 120),
    description: clean(form.description, 4000),
    immediateAction: clean(form.immediateAction, 2000),
    eventDate: form.eventDate,
    category: SE_CATEGORIES.includes(form.category) ? form.category : "other",
    harm: SE_HARM_LEVELS.some((h) => h.key === form.harm) ? form.harm : "none",
    locationId: clean(form.locationId, 80),
    locationName: clean(form.locationName, 120),
    patientInvolved: involved,
    emisNumber: involved ? clean(form.emisNumber, 40) : "",
    patientInitials: involved ? clean(form.patientInitials, 12).toUpperCase() : "",
    dateOfBirth: involved && !clean(form.emisNumber, 40) ? clean(form.dateOfBirth, 10) : "",
  };
}

// ---- what can happen next ---------------------------------------------------------------------------------

// The moves the significant events team can make from the event's current stage.
// ctx: { openActions, reviews: [{status}] }
export function nextSteps(event = {}, ctx = {}) {
  const status = event.status || SE_STATUSES.reported;
  const openActions = Number(ctx.openActions || 0);
  const steps = [];
  if (status === SE_STATUSES.reported) {
    steps.push({ id: "investigate", label: "Investigate", to: SE_STATUSES.investigating, investigation: SE_INVESTIGATION.required });
    steps.push({ id: "no_investigation", label: "No investigation needed", to: SE_STATUSES.in_review, investigation: SE_INVESTIGATION.not_required, needsReason: true });
  }
  if (status === SE_STATUSES.investigating) steps.push({ id: "investigation_done", label: "Investigation finished", to: SE_STATUSES.in_review });
  if (status === SE_STATUSES.in_review) steps.push({ id: "ready_for_meeting", label: "Ready for the meeting", to: SE_STATUSES.awaiting_meeting });
  if (status === SE_STATUSES.actions_open) {
    steps.push({ id: "close", label: openActions ? `Close (${openActions} action${openActions === 1 ? "" : "s"} still open)` : "Close", to: SE_STATUSES.closed, blocked: openActions > 0, blockedReason: "Finish or remove the open actions first." });
  }
  if (status === SE_STATUSES.awaiting_meeting || status === SE_STATUSES.in_review || status === SE_STATUSES.investigating) {
    steps.push({ id: "close_without_meeting", label: "Close without a meeting", to: SE_STATUSES.closed, needsReason: true, blocked: openActions > 0, blockedReason: "Finish or remove the open actions first." });
  }
  if (status === SE_STATUSES.closed) steps.push({ id: "reopen", label: "Reopen", to: SE_STATUSES.in_review });
  return steps;
}

// ---- reviews -------------------------------------------------------------------------------------------------

export function reviewProgress(reviews = []) {
  const submitted = reviews.filter((r) => r.status === REVIEW_STATUSES.submitted).length;
  return { total: reviews.length, submitted, waiting: reviews.length - submitted, complete: reviews.length > 0 && submitted === reviews.length };
}

// Who is ticked to review by default: everyone in the practice's chosen roles, apart from the
// person leading the event is NOT excluded (a lead may well review). `staff`: [{ id, label, role }].
export function defaultReviewers(staff = [], reviewerRoles = [], exclude = []) {
  const roles = new Set(reviewerRoles);
  const skip = new Set(exclude);
  return staff.filter((s) => roles.has(s.role) && !skip.has(s.id));
}

export function reviewDocId(seId, uid) {
  return `${seId}_${uid}`;
}

export function validateReview(form = {}) {
  if (!String(form.summary || "").trim()) return "Say what you think happened and why.";
  return "";
}

// ---- actions ------------------------------------------------------------------------------------------------

export function actionTone(action = {}, now = Date.now()) {
  if (action.status === ACTION_STATUSES.done) return { id: "done", label: "Done" };
  const due = action.dueDate?.toDate ? action.dueDate.toDate() : action.dueDate ? new Date(action.dueDate) : null;
  if (!due || Number.isNaN(due.getTime())) return { id: "open", label: "No due date" };
  const days = Math.ceil((due.getTime() - now) / 86400000);
  if (days < 0) return { id: "overdue", label: `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}` };
  if (days <= 7) return { id: "soon", label: days === 0 ? "Due today" : `Due in ${days} day${days === 1 ? "" : "s"}` };
  return { id: "open", label: `Due in ${days} days` };
}

export function validateAction(form = {}) {
  if (!String(form.title || "").trim()) return "Say what needs to be done.";
  if (!form.ownerUid) return "Choose who will do it.";
  return "";
}

// ---- overall numbers -------------------------------------------------------------------------------------------

export function seMetrics(events = [], actions = [], now = Date.now()) {
  const open = events.filter((e) => e.status !== SE_STATUSES.closed);
  return {
    open: open.length,
    toTriage: events.filter((e) => e.status === SE_STATUSES.reported).length,
    awaitingMeeting: events.filter((e) => e.status === SE_STATUSES.awaiting_meeting).length,
    overdueActions: actions.filter((a) => actionTone(a, now).id === "overdue").length,
  };
}

// ---- minutes ------------------------------------------------------------------------------------------------------

// The minutes as plain text, to copy, print or send. Events are identified by reference and title only.
export function minutesText(meeting = {}, events = [], actions = [], formatDate = (d) => String(d)) {
  const lines = [];
  lines.push(`Significant event meeting: ${meeting.title || "Meeting"}`);
  lines.push(`Date: ${formatDate(meeting.meetingDate)}`);
  if (meeting.chairName) lines.push(`Chair: ${meeting.chairName}`);
  if ((meeting.attendeeNames || []).length) lines.push(`Present: ${meeting.attendeeNames.join(", ")}`);
  if (meeting.apologies) lines.push(`Apologies: ${meeting.apologies}`);
  lines.push("");
  if (meeting.minutes) { lines.push(meeting.minutes); lines.push(""); }
  for (const event of events) {
    lines.push(`${event.reference} ${event.title}`);
    const note = meeting.discussion?.[event.id];
    if (note) lines.push(note);
    const own = actions.filter((a) => a.seId === event.id);
    if (own.length) {
      lines.push("Actions:");
      own.forEach((a) => lines.push(`- ${a.title} (${a.ownerName || "unassigned"}${a.dueDate ? `, due ${formatDate(a.dueDate)}` : ""})`));
    }
    lines.push("");
  }
  const general = actions.filter((a) => !a.seId);
  if (general.length) {
    lines.push("Other actions:");
    general.forEach((a) => lines.push(`- ${a.title} (${a.ownerName || "unassigned"}${a.dueDate ? `, due ${formatDate(a.dueDate)}` : ""})`));
  }
  return lines.join("\n").trim();
}
