import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { isSafeSyntheticMode } from "@/config/platformMode";
import { demoGovernanceCases, demoConcernTimeline, demoLearningActions } from "@/data/demoDataset";

export const CONCERNS_COLLECTION = "governance_concerns";
export const CONCERN_TIMELINE_COLLECTION = "governance_concern_timeline";
export const CONCERN_LEARNING_COLLECTION = "governance_concern_learning_actions";

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

export const CONCERN_SOURCES = ["patient", "relative", "pals", "bcuhb", "mddus", "gmpi", "solicitor", "coroner", "ombudsman", "staff", "other"];
export const CONCERN_CATEGORIES = ["access", "communication", "clinical_care", "medication", "results", "confidentiality", "attitude", "records", "referral", "bereavement", "safeguarding", "other"];

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
  const emisNumber = String(form.emisNumber || "").trim();
  const initials = String(form.patientInitials || "").trim().toUpperCase();

  return {
    reference: form.reference || createConcernReference(new Date()),
    patientIdentifierType: emisNumber ? "emis" : "initials_dob",
    emisNumber,
    patientInitials: initials,
    dateOfBirth: form.dateOfBirth || "",
    source: form.source || "patient",
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
    learningRequired: form.learningRequired !== false,
    learningRecordedAt: null,
    createdByUid: actor.uid || null,
    createdByName: actor.displayName || actor.email || "Unknown",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

export function validateConcernForm(form) {
  const errors = [];
  if (!String(form.emisNumber || "").trim()) {
    if (!String(form.patientInitials || "").trim() || !form.dateOfBirth) {
      errors.push("Use an EMIS number, or initials plus date of birth if the EMIS number is unavailable.");
    }
  }
  if (!String(form.summary || "").trim()) errors.push("Add a short anonymised summary.");
  return errors;
}

export async function addConcernTimeline(concernId, event = {}) {
  if (isSafeSyntheticMode()) return `demo-timeline-${Date.now()}`;
  if (!concernId) return null;
  const ref = await addDoc(collection(db, CONCERN_TIMELINE_COLLECTION), {
    concernId,
    type: event.type || "note",
    title: event.title || "Timeline event",
    message: event.message || "",
    actorUid: event.actor?.uid || null,
    actorName: event.actor?.displayName || event.actor?.email || "Unknown",
    createdAt: serverTimestamp(),
  });
  return ref.id;
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
  const ref = await addDoc(collection(db, CONCERNS_COLLECTION), payload);
  await addConcernTimeline(ref.id, {
    type: "created",
    title: "Concern received",
    message: `${payload.reference} created using anonymised identifiers.`,
    actor,
  });
  return ref.id;
}

export async function updateConcern(concernId, patch = {}, actor = {}) {
  if (isSafeSyntheticMode()) return;
  if (!concernId) return;
  await updateDoc(doc(db, CONCERNS_COLLECTION, concernId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
  if (patch.status) {
    await addConcernTimeline(concernId, {
      type: "status",
      title: `Moved to ${friendly(patch.status)}`,
      message: "Case workflow status updated.",
      actor,
    });
  }
}

export async function acknowledgeConcern(concern, actor = {}) {
  await updateConcern(concern.id, { status: CONCERN_STATUSES.acknowledged, acknowledgedAt: serverTimestamp() }, actor);
  await addConcernTimeline(concern.id, { type: "acknowledged", title: "Acknowledgement recorded", message: "Acknowledgement sent/recorded within the case timeline.", actor });
}

export async function recordListeningDiscussion(concern, actor = {}, completed = true) {
  const patch = completed
    ? { status: CONCERN_STATUSES.listening, listeningDiscussionCompletedAt: serverTimestamp(), listeningDiscussionOfferedAt: concern.listeningDiscussionOfferedAt || serverTimestamp() }
    : { status: CONCERN_STATUSES.listening, listeningDiscussionOfferedAt: serverTimestamp() };
  await updateConcern(concern.id, patch, actor);
  await addConcernTimeline(concern.id, { type: "listening", title: completed ? "Listening discussion completed" : "Listening discussion offered", message: "Listening to People discussion step updated.", actor });
}

export async function closeConcern(concern, actor = {}) {
  await updateConcern(concern.id, { status: CONCERN_STATUSES.closed, closedAt: serverTimestamp() }, actor);
  await addConcernTimeline(concern.id, { type: "closed", title: "Case closed", message: "Concern closed after response/learning review.", actor });
}

export async function addLearningAction(concernId, action = {}, actor = {}) {
  if (isSafeSyntheticMode()) return `demo-learning-${Date.now()}`;
  const ref = await addDoc(collection(db, CONCERN_LEARNING_COLLECTION), {
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

export function subscribeConcerns(callback, onError) {
  if (isSafeSyntheticMode()) {
    const timer = setTimeout(() => callback(demoGovernanceCases), 50);
    return () => clearTimeout(timer);
  }
  const q = query(collection(db, CONCERNS_COLLECTION), orderBy("receivedAt", "desc"));
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
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
    callback(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
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
