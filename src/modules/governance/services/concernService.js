import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { isSafeSyntheticMode } from "@/config/platformMode";
import { identityFields, identityProblems } from "@/modules/governance/patientIdentity";
import { recordAudit } from "@/modules/audit/recordAudit";
import { concernEvent } from "@/modules/audit/auditEvents";
import { AUDIT_TYPE, auditEntry, cleanChanges } from "@/modules/governance/concernAudit";
import { cleanContact, contactFromForm, hasContact, legacyContact } from "@/modules/governance/concernContact";
import { STEP_ACTIONS, WITHDRAWN, buildClosePatch, buildStep, buildWithdrawal, otherKey, partyOf, sentCount, ukDay } from "@/modules/governance/concernCase";
import { demoGovernanceCases, demoConcernTimeline, demoLearningActions } from "@/data/demoDataset";

export const CONCERNS_COLLECTION = "governance_concerns";
export const CONCERN_TIMELINE_COLLECTION = "governance_concern_timeline";
export const CONCERN_LEARNING_COLLECTION = "governance_concern_learning_actions";
export const CONCERN_CORRESPONDENCE_COLLECTION = "governance_concern_correspondence";
// The phone number and email of whoever raised the concern. Its own record, readable only by the concerns team and the
// case's owner (see firestore.rules), so it never shows in lists, search, the partner view, the Orb or a printed pack.
export const CONCERN_CONTACTS_COLLECTION = "governance_concern_contacts";
export const CONCERN_MEETINGS_COLLECTION = "governance_concern_meetings";
// What has gone back and forth with the indemnity insurer, GMPI and a solicitor: one record per step (see modules/governance/concernCase.js)
export const CONCERN_STEPS_COLLECTION = "governance_concern_steps";
export const CORRESPONDENCE_TYPES = ["letter", "meeting", "phone", "email", "other"];

export const CONCERN_PRIORITIES = {
  low: "low",
  medium: "medium",
  high: "high",
};

export const CONCERN_STATUSES = {
  received: "received",
  acknowledged: "acknowledged",
  listening: "listening",
  early_resolution: "early_resolution",
  investigation: "investigation",
  response: "response",
  learning: "learning",
  closed: "closed",
  archived: "archived",
};

export const CONCERN_STAGES = [
  { key: "received", label: "Received" },
  { key: "acknowledged", label: "Acknowledged" },
  { key: "listening", label: "Listening Discussion" },
  { key: "early_resolution", label: "Early Resolution" },
  { key: "investigation", label: "Investigate" },
  { key: "response", label: "Respond" },
  { key: "learning", label: "Learn" },
  { key: "closed", label: "Closed" },
];

// "Llais" replaced PALS and the old Community Health Councils in Wales in
// 2023 — PALS itself doesn't operate here, so it's not just a missing
// option, it was the wrong one for a BCUHB practice.
export const CONCERN_SOURCES = ["patient", "relative", "next_of_kin", "parent_guardian", "friend", "llais", "bcuhb", "mddus", "gmpi", "solicitor", "coroner", "police", "ombudsman", "staff", "other"];
export const CONCERN_RAISED_BY_CONTACT_METHODS = ["none", "email", "mobile"];
export const CONCERN_CATEGORIES = ["access", "communication", "clinical_care", "medication", "results", "confidentiality", "attitude", "records", "referral", "bereavement", "safeguarding", "other"];

// Recorded once a case is closed — the finding, not the workflow status.
// Needed so an annual return can answer "how many were upheld", which the
// workflow status (received -> ... -> closed) alone cannot answer.
export const CONCERN_OUTCOMES = ["upheld", "partially_upheld", "not_upheld", "no_case_to_answer", "statement_provided"];
export const CONCERN_OUTCOME_LABELS = {
  upheld: "Upheld",
  partially_upheld: "Partially upheld",
  not_upheld: "Not upheld",
  no_case_to_answer: "No case to answer",
  statement_provided: "Statement provided",
};

export function toDate(value) {
  if (!value) return null;
  if (value?.toDate) return value.toDate();
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDateInput(date) {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function addWorkingDays(startDate, workingDays) {
  const d = new Date(startDate || new Date());
  let added = 0;
  while (added < workingDays) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) added += 1;
  }
  return d;
}

export function addDays(startDate, days) {
  const d = new Date(startDate || new Date());
  d.setDate(d.getDate() + days);
  return d;
}

export function daysUntilDate(value, now = new Date()) {
  const due = toDate(value);
  if (!due) return null;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(due);
  end.setHours(0, 0, 0, 0);
  return Math.ceil((end.getTime() - start.getTime()) / 86400000);
}

export function friendly(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

export function createConcernReference(date = new Date()) {
  const year = date.getFullYear();
  const stamp = `${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}${String(date.getSeconds()).padStart(2, "0")}`;
  return `CN-${year}-${stamp}`;
}

export function getPriorityBadge(priority) {
  if (priority === "high") return "critical";
  if (priority === "medium") return "warning";
  return "success";
}

export function getStatusBadge(status) {
  if ([CONCERN_STATUSES.closed, CONCERN_STATUSES.archived].includes(status)) return "success";
  if ([CONCERN_STATUSES.response, CONCERN_STATUSES.learning].includes(status)) return "info";
  if ([CONCERN_STATUSES.investigation, CONCERN_STATUSES.early_resolution].includes(status)) return "warning";
  return "neutral";
}

export function getDeadlineTone(concern, now = new Date()) {
  if ([CONCERN_STATUSES.closed, CONCERN_STATUSES.archived].includes(concern?.status)) {
    return { label: "Closed", status: "success" };
  }

  const finalDays = daysUntilDate(concern?.finalResponseDueAt, now);
  const ackDays = daysUntilDate(concern?.acknowledgementDueAt, now);
  const listeningDays = daysUntilDate(concern?.earlyResolutionDueAt, now);

  if (!concern?.acknowledgedAt && ackDays !== null) {
    if (ackDays < 0) return { label: `Acknowledgement overdue by ${Math.abs(ackDays)} day${Math.abs(ackDays) === 1 ? "" : "s"}`, status: "critical" };
    if (ackDays <= 1) return { label: `Acknowledgement due ${ackDays === 0 ? "today" : "tomorrow"}`, status: "warning" };
  }

  if (concern?.status === CONCERN_STATUSES.early_resolution && listeningDays !== null) {
    if (listeningDays < 0) return { label: `Early resolution overdue by ${Math.abs(listeningDays)} day${Math.abs(listeningDays) === 1 ? "" : "s"}`, status: "critical" };
    if (listeningDays <= 2) return { label: `Early resolution ${listeningDays === 0 ? "due today" : `${listeningDays} days left`}`, status: "warning" };
  }

  if (finalDays === null) return { label: "No final response date", status: "neutral" };
  if (finalDays < 0) return { label: `Final response overdue by ${Math.abs(finalDays)} day${Math.abs(finalDays) === 1 ? "" : "s"}`, status: "critical" };
  if (finalDays === 0) return { label: "Final response due today", status: "critical" };
  if (finalDays <= 3) return { label: `${finalDays} days to final response`, status: "warning" };
  if (finalDays <= 7) return { label: `${finalDays} days to final response`, status: "info" };
  return { label: `${finalDays} days to final response`, status: "success" };
}

export function calculateCaseHealth(concern = {}) {
  if ([CONCERN_STATUSES.closed, CONCERN_STATUSES.archived].includes(concern.status)) return 100;
  let score = 100;
  const deadline = getDeadlineTone(concern);
  if (deadline.status === "critical") score -= 30;
  if (deadline.status === "warning") score -= 15;
  if (!concern.ownerUid) score -= 12;
  if (!concern.acknowledgedAt && concern.status !== CONCERN_STATUSES.received) score -= 10;
  if (!concern.listeningDiscussionOfferedAt) score -= 12;
  if (!concern.desiredOutcome) score -= 8;
  if (concern.priority === CONCERN_PRIORITIES.high && !concern.clinicalReviewRequired) score -= 8;
  if (concern.learningRequired && !concern.learningRecordedAt) score -= 10;
  return Math.max(0, Math.min(100, score));
}

export function buildConcernPayload(form, actor = {}) {
  const received = form.receivedAt ? new Date(form.receivedAt) : new Date();
  const acknowledgementDue = form.acknowledgementDueAt ? new Date(form.acknowledgementDueAt) : addWorkingDays(received, 5);
  const earlyResolutionDue = form.earlyResolutionDueAt ? new Date(form.earlyResolutionDueAt) : addWorkingDays(acknowledgementDue, 10);
  const finalResponseDue = form.finalResponseDueAt ? new Date(form.finalResponseDueAt) : addDays(received, 30);
  const identity = identityFields(form);

  return {
    reference: form.reference || createConcernReference(new Date()),
    patientIdentifierType: identity.emisNumber ? "emis" : "initials_dob",
    ...identity,
    source: form.source || "patient",
    // they only want a statement (the Health Board, say): once it has been sent the case can be closed
    statementOnly: form.statementOnly === true,
    raisedByInitials: String(form.raisedByInitials || "").trim().toUpperCase(),
    raisedByContactMethod: "none",
    raisedByContactValue: "",
    hasContactDetails: hasContact(contactFromForm(form)),
    externalReference: String(form.externalReference || "").trim(),
    receivedAt: Timestamp.fromDate(received),
    acknowledgementDueAt: Timestamp.fromDate(acknowledgementDue),
    earlyResolutionDueAt: Timestamp.fromDate(earlyResolutionDue),
    finalResponseDueAt: Timestamp.fromDate(finalResponseDue),
    category: form.category || "other",
    priority: form.priority || CONCERN_PRIORITIES.low,
    status: form.status || CONCERN_STATUSES.received,
    summary: String(form.summary || "").trim(),
    desiredOutcome: String(form.desiredOutcome || "").trim(),
    ownerUid: form.ownerUid || "",
    ownerName: form.ownerName || "Unassigned",
    namedContactName: form.namedContactName || form.ownerName || "Unassigned",
    listeningDiscussionOfferedAt: form.listeningDiscussionOfferedAt ? Timestamp.fromDate(new Date(form.listeningDiscussionOfferedAt)) : null,
    listeningDiscussionCompletedAt: form.listeningDiscussionCompletedAt ? Timestamp.fromDate(new Date(form.listeningDiscussionCompletedAt)) : null,
    earlyResolutionSuitable: !!form.earlyResolutionSuitable,
    dutyOfCandourConsidered: !!form.dutyOfCandourConsidered,
    dutyOfCandourTriggered: !!form.dutyOfCandourTriggered,
    clinicalReviewRequired: !!form.clinicalReviewRequired,
    mddusRequired: !!form.mddusRequired,
    gmpiReference: String(form.gmpiReference || "").trim(),
    lfeReportStatus: "not_required",
    lfeReportSentAt: null,
    learningRequired: form.learningRequired !== false,
    learningRecordedAt: null,
    involvedUserIds: Array.isArray(form.involvedUserIds) ? form.involvedUserIds : [],
    createdByUid: actor.uid || null,
    createdByName: actor.displayName || actor.email || "Unknown",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

export function validateConcernForm(form) {
  const errors = [];
  errors.push(...identityProblems(form));
  if (!String(form.summary || "").trim()) errors.push("Add a short anonymised summary.");
  return errors;
}

export async function addConcernTimeline(concernId, event = {}) {
  if (isSafeSyntheticMode()) return `demo-timeline-${Date.now()}`;
  if (!concernId) return null;
  try {
    const ref = await addDoc(collection(db, CONCERN_TIMELINE_COLLECTION), {
      concernId,
      type: event.type || "note",
      title: event.title || "Timeline event",
      message: event.message || "",
      ...(Array.isArray(event.changes) && event.changes.length ? { changes: cleanChanges(event.changes) } : {}),
      actorUid: event.actor?.uid || null,
      actorName: event.actor?.displayName || event.actor?.email || "Unknown",
      createdAt: serverTimestamp(),
    });
    return ref.id;
  } catch (err) {
    // The id is generated on this device, so "already exists" can only mean
    // our own earlier send landed and the client re-sent it after a dropped
    // connection — the entry is there, so the write worked.
    if (err?.code === "already-exists") return null;
    throw err;
  }
}

export async function createConcern(form, actor = {}) {
  if (isSafeSyntheticMode()) {
    const errors = validateConcernForm(form);
    if (errors.length) throw new Error(errors.join(" "));
    return `demo-created-${Date.now()}`;
  }
  const errors = validateConcernForm(form);
  if (errors.length) throw new Error(errors.join(" "));
  const payload = buildConcernPayload(form, actor);
  // Made-up-front id + setDoc rather than addDoc, so a client re-send after a
  // dropped connection re-saves the same case instead of being refused as
  // "already exists" (which reads as a failed save and invites a duplicate).
  const ref = doc(collection(db, CONCERNS_COLLECTION));
  await setDoc(ref, payload);
  recordAudit(concernEvent("created", { concern: { id: ref.id, reference: payload.reference, source: payload.source || form?.source || "" } }));
  const contact = contactFromForm(form);
  if (hasContact(contact)) await saveConcernContact(ref.id, contact, actor);
  await addConcernTimeline(ref.id, {
    type: "created",
    title: "Concern received",
    message: `${payload.reference} created using anonymised identifiers.`,
    actor,
  });
  return ref.id;
}

// Writes the detailed audit line for a change: which fields, from what to what, who and when. It is a record of the work, never part of it, so it can never stop the work.
async function recordCaseChange(concernId, before, patch, actor) {
  try {
    const entry = auditEntry(before, patch);
    if (entry) await addConcernTimeline(concernId, { ...entry, actor });
  } catch (err) {
    console.error("The audit line for a concern change could not be written", err);
  }
}

export async function updateConcern(concernId, patch = {}, actor = {}) {
  if (isSafeSyntheticMode()) return;
  if (!concernId) return;
  let before = null;
  try {
    const snap = await getDoc(doc(db, CONCERNS_COLLECTION, concernId));
    before = snap.exists() ? snap.data() : null;
  } catch { /* the change is still recorded, with the old values marked as not known */ }
  await updateDoc(doc(db, CONCERNS_COLLECTION, concernId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
  await recordCaseChange(concernId, before, patch, actor);
  if (patch.status) {
    await addConcernTimeline(concernId, {
      type: "status",
      title: `Moved to ${friendly(patch.status)}`,
      message: "Case workflow status updated.",
      actor,
    });
  }
}

// Deliberately whitelisted to the intake fields only — never touches status,
// ownerUid/ownerName, involvedUserIds, createdAt/createdByUid or the
// listening/learning timestamps, all of which have their own dedicated
// controls already (assign owner, move-to-stage buttons, etc.).
// Save (or, when everything is blank, clear) the contact details for a case. Never part of the case record itself.
// The contact details themselves are never copied into the audit trail: it says that they changed, by whom and when
async function recordContactChange(concernId, title, actor) {
  try {
    await addConcernTimeline(concernId, { type: AUDIT_TYPE, title, message: "The details themselves are not shown here.", actor });
  } catch (err) {
    console.error("The audit line for a contact change could not be written", err);
  }
}

// Printing the summary goes in the governed audit ledger for everyone, and is a line in the audit trail too when the person is on the concerns team
export async function recordCasePrinted(concern, actor = {}, { inTrail = false } = {}) {
  if (isSafeSyntheticMode() || !concern?.id) return;
  recordAudit(concernEvent("printed", { concern }));
  if (!inTrail) return;
  try {
    await addConcernTimeline(concern.id, { type: AUDIT_TYPE, title: "Case summary printed", message: "", actor });
  } catch (err) {
    console.error("The audit line for printing could not be written", err);
  }
}

export async function saveConcernContact(concernId, contact, actor = {}) {
  if (isSafeSyntheticMode() || !concernId) return;
  const clean = cleanContact(contact);
  const before = await getConcernContact(concernId);
  const changed = JSON.stringify(cleanContact(before || {})) !== JSON.stringify(clean);
  if (!hasContact(clean)) {
    await deleteDoc(doc(db, CONCERN_CONTACTS_COLLECTION, concernId)).catch(() => {});
    if (changed && before) await recordContactChange(concernId, "Contact details removed", actor);
    return;
  }
  if (changed) await recordContactChange(concernId, before ? "Contact details changed" : "Contact details added", actor);
  await setDoc(doc(db, CONCERN_CONTACTS_COLLECTION, concernId), {
    concernId,
    ...clean,
    updatedByUid: actor.uid || null,
    updatedByName: actor.displayName || actor.email || "Unknown",
    updatedAt: serverTimestamp(),
  });
}

// The contact details for a case, live. Calls back with null when none are recorded or the person may not see them
// (the concerns team and the owner can; for an older case the value kept on the case itself is used as a fallback).
export function subscribeConcernContact(concern, callback) {
  if (isSafeSyntheticMode() || !concern?.id) { callback(null); return () => {}; }
  return onSnapshot(
    doc(db, CONCERN_CONTACTS_COLLECTION, concern.id),
    (snap) => {
      if (snap.exists()) return callback(cleanContact(snap.data()));
      const old = legacyContact(concern);
      callback(hasContact(old) ? old : null);
    },
    () => { const old = legacyContact(concern); callback(hasContact(old) ? old : null); },
  );
}

export async function getConcernContact(concernId) {
  if (isSafeSyntheticMode() || !concernId) return null;
  try {
    const snap = await getDoc(doc(db, CONCERN_CONTACTS_COLLECTION, concernId));
    return snap.exists() ? cleanContact(snap.data()) : null;
  } catch {
    return null;
  }
}

export async function updateConcernDetails(concernId, form, actor = {}) {
  const identity = identityFields(form);
  await updateConcern(concernId, {
    reference: form.reference,
    patientIdentifierType: identity.emisNumber ? "emis" : "initials_dob",
    ...identity,
    source: form.source || "patient",
    statementOnly: form.statementOnly === true,
    raisedByInitials: String(form.raisedByInitials || "").trim().toUpperCase(),
    raisedByContactMethod: "none",
    raisedByContactValue: "",
    ...(form.contactLoaded ? { hasContactDetails: hasContact(contactFromForm(form)) } : {}),
    externalReference: String(form.externalReference || "").trim(),
    category: form.category || "other",
    priority: form.priority || CONCERN_PRIORITIES.low,
    summary: String(form.summary || "").trim(),
    desiredOutcome: String(form.desiredOutcome || "").trim(),
    namedContactName: String(form.namedContactName || "").trim(),
    earlyResolutionSuitable: !!form.earlyResolutionSuitable,
    dutyOfCandourConsidered: !!form.dutyOfCandourConsidered,
    dutyOfCandourTriggered: !!form.dutyOfCandourTriggered,
    clinicalReviewRequired: !!form.clinicalReviewRequired,
    mddusRequired: !!form.mddusRequired,
    gmpiReference: String(form.gmpiReference || "").trim(),
  }, actor);
  // only when the existing details were read first, so a read that failed can never wipe them
  if (form.contactLoaded) await saveConcernContact(concernId, contactFromForm(form), actor);
  await addConcernTimeline(concernId, { type: "edited", title: "Case details updated", message: "Intake details were edited.", actor });
}

// Firestore rules restrict this to isAdmin (stricter than the general
// isConcernsTeam write access) — deleting a case is meant to correct a
// mistake (wrong case created entirely), not a routine action. Timeline/
// learning-action/correspondence sub-documents are left behind as orphans;
// Firestore has no cascading delete, and since they're only ever queried by
// concernId they simply stop being reachable once the parent's gone.
export async function deleteConcern(concernId, actor = {}) {
  if (isSafeSyntheticMode() || !concernId) return;
  await deleteDoc(doc(db, CONCERNS_COLLECTION, concernId));
  recordAudit(concernEvent("deleted", { concern: { id: concernId } }));
}

// dueDateBefore is the concern's current finalResponseDueAt (pass the raw
// Firestore value/Date in from the caller) so the timeline entry can record
// what changed, not just the new value.
export async function extendConcernDeadline(concernId, dueDateBefore, newDueDate, reason, actor = {}) {
  await updateConcern(concernId, { finalResponseDueAt: Timestamp.fromDate(new Date(newDueDate)) }, actor);
  recordAudit(concernEvent("extended", { concern: { id: concernId } }));
  const before = toDate(dueDateBefore);
  const beforeLabel = before ? before.toLocaleDateString("en-GB") : "unknown";
  const afterLabel = new Date(newDueDate).toLocaleDateString("en-GB");
  await addConcernTimeline(concernId, {
    type: "extended",
    title: "Response deadline extended",
    message: `Extended from ${beforeLabel} to ${afterLabel}.${reason ? ` Reason: ${reason}` : ""}`,
    actor,
  });
}

// A step recorded for a day that has passed ("2026-10-22") is stored as that day; with no day it is stored as now.
const stampFor = (day) => (/^\d{4}-\d{2}-\d{2}$/.test(String(day || "")) ? Timestamp.fromDate(new Date(`${day}T12:00:00`)) : serverTimestamp());
const ukOf = (day) => String(day).split("-").reverse().join("/");
// Recording a step that has already happened must never move a case back: it keeps the stage it has reached if that is further on.
export function stageAfter(current, target) {
  const order = CONCERN_STAGES.map((s) => s.key);
  if (current === "archived") return null;
  const at = order.indexOf(current);
  return at >= order.indexOf(target) ? null : target;
}

export async function acknowledgeConcern(concern, actor = {}, day = "") {
  const stage = stageAfter(concern.status, CONCERN_STATUSES.acknowledged);
  await updateConcern(concern.id, { ...(stage ? { status: stage } : {}), acknowledgedAt: stampFor(day) }, actor);
  await addConcernTimeline(concern.id, { type: "acknowledged", title: "Acknowledgement recorded", message: day ? `Acknowledged on ${ukOf(day)}.` : "Acknowledgement sent/recorded within the case timeline.", actor });
}

export const LFE_REPORT_STATUSES = ["not_required", "in_progress", "sent"];

// Welsh Risk Pool "Learning from Events" report — distinct from the internal
// learningActions list. Tracked as its own small status (not required /
// in progress / sent) rather than on the intake form, since it's a process
// that develops over the life of the case, same pattern as the listening
// discussion offered/completed timestamps.
export async function updateLfeReportStatus(concernId, status, actor = {}) {
  const patch = { lfeReportStatus: status };
  if (status === "sent") patch.lfeReportSentAt = serverTimestamp();
  await updateConcern(concernId, patch, actor);
  const label = status === "sent" ? "sent to the Welsh Risk Pool" : status === "in_progress" ? "started" : "marked not required";
  await addConcernTimeline(concernId, { type: "lfe_report", title: `Learning from Events report ${label}`, message: "", actor });
}

export async function recordListeningDiscussion(concern, actor = {}, completed = true, day = "") {
  const stage = stageAfter(concern.status, CONCERN_STATUSES.listening);
  const at = stampFor(day);
  const patch = completed
    ? { listeningDiscussionCompletedAt: at, listeningDiscussionOfferedAt: concern.listeningDiscussionOfferedAt || at }
    : { listeningDiscussionOfferedAt: at };
  await updateConcern(concern.id, { ...(stage ? { status: stage } : {}), ...patch }, actor);
  await addConcernTimeline(concern.id, { type: "listening", title: completed ? "Listening discussion completed" : "Listening discussion offered", message: day ? `Recorded for ${ukOf(day)}.` : "Listening to People discussion step updated.", actor });
}

// They only want a statement (the Health Board, say): once it has been sent the case can be closed without the learning, Welsh
// Risk Pool or Duty of Candour steps. Can be switched back if they come back wanting a full response.
export async function setStatementOnly(concernId, statementOnly, actor = {}) {
  await updateConcern(concernId, { statementOnly: statementOnly === true }, actor);
  await addConcernTimeline(concernId, {
    type: "statement_only",
    title: statementOnly ? "Statement only" : "Full response needed",
    message: statementOnly ? "They only want a statement. The case can be closed once it has been sent." : "The case needs a full response, so the usual closing steps apply.",
    actor,
  });
}

export async function closeConcern(concern, actor = {}, outcome) {
  if (!CONCERN_OUTCOMES.includes(outcome)) throw new Error("An outcome is required to close a case.");
  await updateConcern(concern.id, { status: CONCERN_STATUSES.closed, closedAt: serverTimestamp(), outcome }, actor);
  await addConcernTimeline(concern.id, { type: "closed", title: "Case closed", message: `Concern closed after response/learning review. Outcome: ${CONCERN_OUTCOME_LABELS[outcome]}.`, actor });
}

// Corrects the recorded outcome on an already-closed case — mistakes happen,
// and an annual return needs the final figure to be right, not just the
// first one entered.
export async function updateConcernOutcome(concernId, outcome, actor = {}) {
  if (!CONCERN_OUTCOMES.includes(outcome)) throw new Error("Not a valid outcome.");
  await updateConcern(concernId, { outcome }, actor);
  await addConcernTimeline(concernId, { type: "outcome_changed", title: "Outcome updated", message: `Outcome changed to ${CONCERN_OUTCOME_LABELS[outcome]}.`, actor });
}

// A restricted-scope timeline entry a shared-with (but not Concerns-team)
// user can add — the Firestore rules for governance_concern_timeline only
// let a non-team involved user create entries with type "note", never any
// of the status-changing types the functions above write.
export async function addConcernQuickNote(concernId, message, actor = {}) {
  const text = String(message || "").trim();
  if (!text) return null;
  return addConcernTimeline(concernId, { type: "note", title: "Note added", message: text, actor });
}

export async function addInvolvedUser(concernId, uid, actor = {}) {
  if (isSafeSyntheticMode() || !concernId || !uid) return;
  await updateDoc(doc(db, CONCERNS_COLLECTION, concernId), { involvedUserIds: arrayUnion(uid), updatedAt: serverTimestamp() });
  await addConcernTimeline(concernId, { type: "shared", title: "Case shared", message: "A staff member was given visibility on this case.", actor });
}

export async function removeInvolvedUser(concernId, uid, actor = {}) {
  if (isSafeSyntheticMode() || !concernId || !uid) return;
  await updateDoc(doc(db, CONCERNS_COLLECTION, concernId), { involvedUserIds: arrayRemove(uid), updatedAt: serverTimestamp() });
  await addConcernTimeline(concernId, { type: "unshared", title: "Case visibility removed", message: "A staff member's visibility on this case was removed.", actor });
}

export async function addLearningAction(concernId, action = {}, actor = {}) {
  if (isSafeSyntheticMode()) return `demo-learning-${Date.now()}`;
  const ref = doc(collection(db, CONCERN_LEARNING_COLLECTION));
  await setDoc(ref, {
    concernId,
    title: action.title || "Learning action",
    description: action.description || "",
    ownerUid: action.ownerUid || "",
    ownerName: action.ownerName || "Unassigned",
    dueAt: action.dueAt ? Timestamp.fromDate(new Date(action.dueAt)) : null,
    status: "open",
    createdByUid: actor.uid || null,
    createdByName: actor.displayName || actor.email || "Unknown",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, CONCERNS_COLLECTION, concernId), { learningRequired: true, learningRecordedAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await addConcernTimeline(concernId, { type: "learning", title: "Learning action added", message: action.title || "Learning action created.", actor });
  return ref.id;
}

// Covers multiple letters, extension notices and face-to-face meetings under
// one chronological log per case, rather than separate near-identical
// features for each.
export async function addConcernCorrespondence(concernId, entry = {}, actor = {}) {
  if (isSafeSyntheticMode()) return `demo-correspondence-${Date.now()}`;
  const type = CORRESPONDENCE_TYPES.includes(entry.type) ? entry.type : "letter";
  const ref = doc(collection(db, CONCERN_CORRESPONDENCE_COLLECTION));
  await setDoc(ref, {
    concernId,
    type,
    notes: String(entry.notes || "").trim(),
    occurredAt: entry.occurredAt ? Timestamp.fromDate(new Date(entry.occurredAt)) : serverTimestamp(),
    createdByUid: actor.uid || null,
    createdByName: actor.displayName || actor.email || "Unknown",
    createdAt: serverTimestamp(),
  });
  await addConcernTimeline(concernId, { type: "correspondence", title: `${friendly(type)} logged`, message: entry.notes || "", actor });
  return ref.id;
}

// ---------------------------------------------------------------------------
// Face-to-face meetings. One record per meeting (so a second meeting is just
// another record): when it was requested and by whom, when it's booked, who
// attends, a brief outcome, and whether the patient or their representative
// then asked for a second meeting, a follow-up, or a summary of the meeting.
// Dates are kept as plain yyyy-mm-dd / HH:mm text — a meeting time is a
// wall-clock time at the practice, not an instant, so there's no timezone to
// get wrong.
// ---------------------------------------------------------------------------
export const MEETING_FURTHER_REQUESTS = [
  { key: "second_meeting", label: "A second meeting" },
  { key: "follow_up", label: "A follow-up of the meeting" },
  { key: "summary", label: "A summary of the meeting" },
];
const MEETING_REQUEST_KEYS = MEETING_FURTHER_REQUESTS.map((item) => item.key);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;

export function formatMeetingDate(value) {
  if (!DATE_PATTERN.test(String(value || ""))) return "";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

// A blank form (optionally seeded), or one filled in from an existing meeting.
export function getMeetingForm(meeting = null, seed = {}) {
  return {
    requestedDate: meeting?.requestedDate ?? formatDateInput(new Date()),
    requestedBy: meeting?.requestedBy ?? "",
    bookedDate: meeting?.bookedDate ?? "",
    bookedTime: meeting?.bookedTime ?? "",
    attendees: meeting?.attendees ?? "",
    outcome: meeting?.outcome ?? "",
    furtherRequests: Array.isArray(meeting?.furtherRequests) ? [...meeting.furtherRequests] : [],
    ...(meeting ? {} : seed),
  };
}

export function buildMeetingFields(form = {}) {
  return {
    requestedDate: String(form.requestedDate || "").trim(),
    requestedBy: String(form.requestedBy || "").trim().slice(0, 160),
    bookedDate: String(form.bookedDate || "").trim(),
    bookedTime: form.bookedDate ? String(form.bookedTime || "").trim() : "",
    attendees: String(form.attendees || "").trim().slice(0, 400),
    outcome: String(form.outcome || "").trim().slice(0, 2000),
    furtherRequests: (form.furtherRequests || []).filter((key) => MEETING_REQUEST_KEYS.includes(key)),
  };
}

// Returns a message for the first problem, or "" when the form is fine.
export function validateMeetingForm(form = {}) {
  const fields = buildMeetingFields(form);
  if (!DATE_PATTERN.test(fields.requestedDate)) return "Enter the date the meeting was requested.";
  if (!fields.requestedBy) return "Enter who requested the meeting.";
  if (fields.bookedDate && !DATE_PATTERN.test(fields.bookedDate)) return "Enter the date the meeting is booked for.";
  if (String(form.bookedTime || "").trim() && !fields.bookedDate) return "Add the date booked as well as the time.";
  if (fields.bookedTime && !TIME_PATTERN.test(fields.bookedTime)) return "Enter the time as hours and minutes, e.g. 14:30.";
  return "";
}

// Where the meeting has got to, worked out from what's been filled in.
export function getMeetingStatus(meeting = {}, now = new Date()) {
  if (String(meeting.outcome || "").trim()) return { key: "held", label: "Outcome recorded", tone: "success" };
  if (meeting.bookedDate) {
    const when = new Date(`${meeting.bookedDate}T${meeting.bookedTime || "23:59"}`);
    if (!Number.isNaN(when.getTime()) && when < now) return { key: "awaiting_outcome", label: "Awaiting outcome", tone: "warning" };
    return { key: "booked", label: "Booked", tone: "info" };
  }
  return { key: "requested", label: "Requested, not yet booked", tone: "warning" };
}

function describeMeetingChanges(before = {}, after) {
  const changes = [];
  if (before.requestedDate !== after.requestedDate || before.requestedBy !== after.requestedBy) changes.push("request details updated");
  if ((before.bookedDate || "") !== after.bookedDate || (before.bookedTime || "") !== after.bookedTime) {
    changes.push(after.bookedDate ? `booked for ${formatMeetingDate(after.bookedDate)}${after.bookedTime ? ` at ${after.bookedTime}` : ""}` : "booking removed");
  }
  if ((before.attendees || "") !== after.attendees) changes.push("attendees updated");
  if ((before.outcome || "") !== after.outcome) changes.push(before.outcome ? "outcome updated" : "outcome recorded");
  if (JSON.stringify(before.furtherRequests || []) !== JSON.stringify(after.furtherRequests)) {
    const labels = MEETING_FURTHER_REQUESTS.filter((item) => after.furtherRequests.includes(item.key)).map((item) => item.label.toLowerCase());
    changes.push(labels.length ? `patient or representative has requested ${labels.join(", ")}` : "further requests cleared");
  }
  return changes;
}

export async function addConcernMeeting(concernId, form, actor = {}) {
  if (isSafeSyntheticMode()) return `demo-meeting-${Date.now()}`;
  const problem = validateMeetingForm(form);
  if (problem) throw new Error(problem);
  const fields = buildMeetingFields(form);
  // The id is made up front and the record written with setDoc (not addDoc):
  // if the connection drops after the server has saved it, the client re-sends
  // the write, and a create-only resend is refused as "already exists" even
  // though the save worked. Re-sending a set just re-saves the same record.
  const ref = doc(collection(db, CONCERN_MEETINGS_COLLECTION));
  await setDoc(ref, {
    concernId,
    ...fields,
    createdByUid: actor.uid || null,
    createdByName: actor.displayName || actor.email || "Unknown",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  const booked = fields.bookedDate ? ` Booked for ${formatMeetingDate(fields.bookedDate)}${fields.bookedTime ? ` at ${fields.bookedTime}` : ""}.` : "";
  await addConcernTimeline(concernId, {
    type: "meeting",
    title: "Face-to-face meeting requested",
    message: `Requested on ${formatMeetingDate(fields.requestedDate)}.${booked}`,
    actor,
  });
  return ref.id;
}

// `meeting` is the record as it was when the edit started, so the case
// timeline can say what actually changed.
export async function updateConcernMeeting(meeting, form, actor = {}) {
  if (isSafeSyntheticMode() || !meeting?.id) return;
  const problem = validateMeetingForm(form);
  if (problem) throw new Error(problem);
  const fields = buildMeetingFields(form);
  const changes = describeMeetingChanges(meeting, fields);
  if (!changes.length) return;
  await updateDoc(doc(db, CONCERN_MEETINGS_COLLECTION, meeting.id), { ...fields, updatedAt: serverTimestamp() });
  const sentence = changes.join("; ");
  await addConcernTimeline(meeting.concernId, {
    type: "meeting",
    title: "Face-to-face meeting updated",
    message: sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".",
    actor,
  });
}

// Filtered by concern only (no orderBy) so it needs no composite index; the
// newest request goes first.
export function subscribeConcernMeetings(concernId, callback, onError) {
  if (isSafeSyntheticMode()) {
    const timer = setTimeout(() => callback([]), 50);
    return () => clearTimeout(timer);
  }
  if (!concernId) return () => {};
  const q = query(collection(db, CONCERN_MEETINGS_COLLECTION), where("concernId", "==", concernId));
  return onSnapshot(q, (snapshot) => {
    const rows = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    rows.sort((a, b) => String(b.requestedDate || "").localeCompare(String(a.requestedDate || "")) || (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0));
    callback(rows);
  }, onError);
}

// Concerns-team/Partner callers get every case (unconstrained query - allowed
// broadly by the Firestore rules). Everyone else must pass involvedUid: a
// query scoped to array-contains their own uid is the only shape Firestore's
// per-document rule evaluation can actually satisfy for someone who isn't
// team/partner - an unconstrained query would be rejected outright the
// moment it could return a case they're not listed on.
export function subscribeConcerns(callback, onError, { involvedUid } = {}) {
  if (isSafeSyntheticMode()) {
    const timer = setTimeout(() => callback(demoGovernanceCases), 50);
    return () => clearTimeout(timer);
  }
  const q = involvedUid
    ? query(collection(db, CONCERNS_COLLECTION), where("involvedUserIds", "array-contains", involvedUid))
    : query(collection(db, CONCERNS_COLLECTION), orderBy("receivedAt", "desc"));
  return onSnapshot(q, (snapshot) => {
    const rows = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    if (involvedUid) rows.sort((a, b) => (toDate(b.receivedAt)?.getTime() || 0) - (toDate(a.receivedAt)?.getTime() || 0));
    callback(rows);
  }, onError);
}

export function subscribeConcernTimeline(concernId, callback, onError) {
  if (isSafeSyntheticMode()) {
    const rows = demoConcernTimeline[concernId] || [
      { id: "demo-tl-created", type: "created", title: "Concern received", message: "Synthetic case opened for demonstration.", actorName: "Demo User", createdAt: new Date() },
    ];
    const timer = setTimeout(() => callback(rows), 50);
    return () => clearTimeout(timer);
  }
  if (!concernId) return () => {};
  const q = query(collection(db, CONCERN_TIMELINE_COLLECTION), where("concernId", "==", concernId), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })).filter((event) => event.type !== AUDIT_TYPE)); // the audit lines are for the printed summary, not the case timeline
  }, onError);
}

export function subscribeLearningActions(concernId, callback, onError) {
  if (isSafeSyntheticMode()) {
    const rows = demoLearningActions[concernId] || [];
    const timer = setTimeout(() => callback(rows), 50);
    return () => clearTimeout(timer);
  }
  if (!concernId) return () => {};
  const q = query(collection(db, CONCERN_LEARNING_COLLECTION), where("concernId", "==", concernId), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
  }, onError);
}

export function subscribeConcernCorrespondence(concernId, callback, onError) {
  if (isSafeSyntheticMode()) {
    const timer = setTimeout(() => callback([]), 50);
    return () => clearTimeout(timer);
  }
  if (!concernId) return () => {};
  const q = query(collection(db, CONCERN_CORRESPONDENCE_COLLECTION), where("concernId", "==", concernId), orderBy("occurredAt", "desc"));
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
  }, onError);
}

export function buildGovernancePrompts(concerns = []) {
  const open = concerns.filter((c) => ![CONCERN_STATUSES.closed, CONCERN_STATUSES.archived].includes(c.status));
  const overdue = open.filter((c) => getDeadlineTone(c).status === "critical");
  const ackDue = open.filter((c) => !c.acknowledgedAt);
  const listeningMissing = open.filter((c) => !c.listeningDiscussionOfferedAt);
  const high = open.filter((c) => c.priority === CONCERN_PRIORITIES.high);

  const prompts = [];
  if (overdue.length) prompts.push(`${overdue.length} concern${overdue.length === 1 ? " is" : "s are"} overdue or due today.`);
  if (ackDue.length) prompts.push(`${ackDue.length} concern${ackDue.length === 1 ? " needs" : "s need"} acknowledgement review.`);
  if (listeningMissing.length) prompts.push(`${listeningMissing.length} case${listeningMissing.length === 1 ? " has" : "s have"} no Listening Discussion offer recorded.`);
  if (high.length) prompts.push(`${high.length} high priority case${high.length === 1 ? "" : "s"} should stay visible to the manager.`);
  if (!prompts.length) prompts.push("No urgent governance concerns detected. Keep routine updates and learning actions current.");
  return prompts;
}

export function getConcernMetrics(concerns = []) {
  const open = concerns.filter((c) => ![CONCERN_STATUSES.closed, CONCERN_STATUSES.archived].includes(c.status));
  const overdue = open.filter((c) => getDeadlineTone(c).status === "critical");
  const dueWeek = open.filter((c) => {
    const days = daysUntilDate(c.finalResponseDueAt);
    return days !== null && days >= 0 && days <= 7;
  });
  const high = open.filter((c) => c.priority === CONCERN_PRIORITIES.high);
  const listeningMissing = open.filter((c) => !c.listeningDiscussionOfferedAt);
  const avgHealth = open.length ? Math.round(open.reduce((sum, c) => sum + calculateCaseHealth(c), 0) / open.length) : 100;
  return { open: open.length, overdue: overdue.length, dueWeek: dueWeek.length, high: high.length, listeningMissing: listeningMissing.length, avgHealth };
}

// ---------------------------------------------------------------------------
// The wizards: what has gone back and forth with the indemnity insurer, GMPI (or NHS Resolution) and a solicitor, and closing a case
// only once it has been dealt with. The rules for both are in modules/governance/concernCase.js.
// ---------------------------------------------------------------------------

// Filtered by concern only (no orderBy), so it needs no composite index; callers order them with orderedSteps().
export function subscribeCaseSteps(concernId, callback, onError) {
  if (isSafeSyntheticMode()) {
    const timer = setTimeout(() => callback([]), 50);
    return () => clearTimeout(timer);
  }
  if (!concernId) return () => {};
  return onSnapshot(
    query(collection(db, CONCERN_STEPS_COLLECTION), where("concernId", "==", concernId)),
    (snapshot) => callback(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError,
  );
}

// Record one step with a party. `steps` is what the case already has, so a "sent" knows which round it is.
// Takes back a step that was recorded by mistake: nothing is deleted, a withdrawal with the reason is recorded against it
export async function withdrawCaseStep(concernId, step, steps, reason, actor = {}) {
  const record = buildWithdrawal({ step, steps, reason });
  if (isSafeSyntheticMode()) return `demo-step-${Date.now()}`;
  const ref = doc(collection(db, CONCERN_STEPS_COLLECTION));
  await setDoc(ref, { concernId, ...record, createdByUid: actor.uid || null, createdByName: actor.displayName || actor.email || "Unknown", createdAt: serverTimestamp(), createdAtMs: Date.now() });
  recordAudit(concernEvent("step", { concern: { id: concernId }, party: record.party, action: WITHDRAWN }));
  const who = partyOf(record.party, [record])?.short || "An outside party";
  await addConcernTimeline(concernId, { type: "step_withdrawn", title: `${who}: a step was recorded by mistake`, message: `${STEP_ACTIONS[step.action] || "A step"} on ${ukDay(step.occurredOn)} was taken back. ${record.note}`, actor });
  return ref.id;
}

export async function addCaseStep(concernId, steps, input, actor = {}) {
  // someone typed in ("other") is kept under a key made from their name; one already on the case keeps the name it was given
  const key = input?.party === "other" ? otherKey(input.partyName) : input?.party;
  const round = input?.action === "sent" ? sentCount(steps, key) + 1 : null;
  const step = buildStep({ ...input, partyName: input?.partyName || partyOf(key, steps)?.short || "", round });
  if (isSafeSyntheticMode()) return `demo-step-${Date.now()}`;
  // the id is made up first and the record set, so a re-sent write after a dropped connection lands on the same record
  const ref = doc(collection(db, CONCERN_STEPS_COLLECTION));
  await setDoc(ref, {
    concernId,
    ...step,
    createdByUid: actor.uid || null,
    createdByName: actor.displayName || actor.email || "Unknown",
    createdAt: serverTimestamp(),
    createdAtMs: Date.now(),
  });
  recordAudit(concernEvent("step", { concern: { id: concernId }, party: step.party, action: step.action, round: step.round || 0 }));
  const who = partyOf(step.party, [step])?.short || "An outside party";
  const rounds = step.round && step.round > 1 ? ` (time ${step.round})` : "";
  await addConcernTimeline(concernId, {
    type: "step",
    title: step.action === "sent" ? `Sent to ${who}${rounds}` : step.action === "instructed" ? `${who} instructed a solicitor` : `${who}: ${STEP_ACTIONS[step.action].toLowerCase()}`,
    message: `${ukDay(step.occurredOn)}.${step.note ? ` ${step.note}` : ""}`,
    actor,
  });
  return ref.id;
}

// "The final response letter is ready to send". When outside parties have not all accepted, a reason is kept with it.
export async function markFinalResponseReady(concern, { reason = "", actor = {} } = {}) {
  if (isSafeSyntheticMode() || !concern?.id) return;
  const why = String(reason || "").replace(/\s+/g, " ").trim().slice(0, 300);
  await updateConcern(concern.id, { finalResponseReadyAt: serverTimestamp(), finalResponseReadyNote: why }, actor);
  await addConcernTimeline(concern.id, { type: "response_ready", title: "Final response letter ready to send", message: why ? `Marked ready before everyone had accepted it: ${why}` : "Everyone involved has accepted it.", actor });
}

// Close a case once the final response has been sent, learning has been considered, the Welsh Risk Pool report and the Duty of
// Candour have been dealt with, and an outcome is recorded. Throws a sentence for the first thing missing, writing nothing.
export async function closeConcernGuided({ concern, steps = [], closing = {}, learningCount = 0, actor = {} } = {}) {
  const patch = buildClosePatch({ closing, concern, steps, learningCount });
  if (isSafeSyntheticMode() || !concern?.id) return;
  for (const title of (closing.newLearning || []).map((t) => String(t || "").replace(/\s+/g, " ").trim().slice(0, 160)).filter(Boolean)) {
    await addLearningAction(concern.id, { title }, actor);
  }
  await addConcernCorrespondence(concern.id, {
    type: patch.finalResponseSentVia === "meeting" ? "meeting" : patch.finalResponseSentVia,
    occurredAt: patch.finalResponseSentOn,
    notes: patch.statementOnly ? "Statement sent." : `Final response sent.${patch.sentBeforeAccepted ? ` Sent before everyone involved had accepted it: ${patch.sentBeforeAcceptedReason}` : ""}`,
  }, actor);
  await updateConcern(concern.id, {
    status: CONCERN_STATUSES.closed,
    closedAt: serverTimestamp(),
    outcome: patch.outcome,
    finalResponseSentAt: Timestamp.fromDate(new Date(`${patch.finalResponseSentOn}T12:00:00`)),
    finalResponseSentVia: patch.finalResponseSentVia,
    sentBeforeAccepted: patch.sentBeforeAccepted,
    sentBeforeAcceptedReason: patch.sentBeforeAcceptedReason,
    learningRequired: patch.learningRequired,
    learningNote: patch.learningNote,
    lfeReportStatus: patch.lfeReportStatus,
    ...(patch.lfeReportStatus === "sent" && concern.lfeReportStatus !== "sent" ? { lfeReportSentAt: serverTimestamp() } : {}),
    dutyOfCandourConsidered: !patch.statementOnly,
    dutyOfCandourTriggered: patch.dutyOfCandourTriggered,
    dutyOfCandourNote: patch.dutyOfCandourNote,
  }, actor);
  recordAudit(concernEvent("closed", { concern, outcome: patch.outcome, sentBeforeAccepted: patch.sentBeforeAccepted }));
  const lfe = { not_required: "not needed", in_progress: "being prepared", sent: "sent" }[patch.lfeReportStatus];
  await addConcernTimeline(concern.id, {
    type: "closed",
    title: "Case closed",
    message: patch.statementOnly ? `Statement sent ${ukDay(patch.finalResponseSentOn)}. Only a statement was requested, so there was no investigation.` : [
      `Outcome: ${CONCERN_OUTCOME_LABELS[patch.outcome]}.`,
      `Final response sent ${ukDay(patch.finalResponseSentOn)}.`,
      patch.learningRequired ? "Learning recorded." : `No learning: ${patch.learningNote}`,
      `Welsh Risk Pool report: ${lfe}.`,
      patch.dutyOfCandourTriggered ? "Duty of Candour triggered." : "Duty of Candour considered, not triggered.",
    ].join(" "),
    actor,
  });
}
