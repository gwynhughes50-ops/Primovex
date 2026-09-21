import { collection, doc, onSnapshot, query, serverTimestamp, where, writeBatch } from "firebase/firestore";
import { commitBatchResendSafe } from "@/lib/resendSafeWrites";
import { db } from "@/lib/firebase";
import { assertSyntheticClinFlowMode } from "@/governance/clinicalDataGate";

const DOCUMENTS = "clinflow_workflow_records";
const EVENTS = "clinflow_workflow_events";
const clean = (value, fallback = "") => String(value ?? fallback).trim();

export function createClinFlowContext({ user, profile }) {
  return {
    actorUid: clean(user?.uid),
    cloudEnabled: Boolean(user?.uid && !clean(user.uid).startsWith("synthetic-")),
    practiceId: clean(profile?.practiceId || profile?.organisationId || profile?.organizationId, "primary"),
    siteId: clean(profile?.siteId, "SITE-MAIN"),
  };
}

function requireActor(context) {
  if (!context?.actorUid) throw new Error("You must be signed in to update ClinFlow.");
  if (!context.cloudEnabled) throw new Error("Cloud sync needs a live Firebase login. This demonstration session remains local.");
}

// Workflow state only: never patient identity, document text, note text, staff name or email.
function workflowPayload(input, context) {
  assertSyntheticClinFlowMode("synthetic");
  const triage = input.clinflowAnalysis?.triage || {};
  return {
    schemaVersion: 1,
    dataMode: "synthetic",
    practiceId: context.practiceId,
    siteId: context.siteId,
    demoReference: clean(input.id),
    priority: clean(input.priority, "routine"),
    destination: clean(input.destination, "Workflow"),
    status: clean(input.status, "awaiting_review"),
    archived: Boolean(input.archived),
    patientVerificationStatus: "unverified",
    retentionClass: "synthetic_workflow_only",
    triageSuggestion: clean(triage.decision, "review_required"),
    triageDecision: clean(input.triageReview?.confirmedDecision),
    triageStatus: clean(input.triageReview?.status, "awaiting_human_confirmation"),
    triageRulesetVersion: clean(triage.rulesetVersion, "unknown"),
    createdByUid: context.actorUid,
  };
}

function eventPayload(documentId, type, summary, metadata, context) {
  assertSyntheticClinFlowMode("synthetic");
  return {
    schemaVersion: 1,
    dataMode: "synthetic",
    practiceId: context.practiceId,
    siteId: context.siteId,
    documentId,
    type,
    summary,
    metadata: metadata || {},
    actorUid: context.actorUid,
    createdAt: serverTimestamp(),
  };
}

export function subscribeClinFlowWorkflow(context, onData, onError) {
  if (!context?.cloudEnabled) return () => {};
  const request = query(
    collection(db, DOCUMENTS),
    where("practiceId", "==", context.practiceId),
    where("dataMode", "==", "synthetic"),
  );
  return onSnapshot(request, (snapshot) => {
    const rows = snapshot.docs
      .map((item) => ({ id: item.id, ...item.data(), persisted: true }))
      .filter((item) => item.dataMode === "synthetic" && item.siteId === context.siteId && !item.archived);
    onData(rows);
  }, onError);
}

export async function saveSyntheticWorkflowQueue(items, context) {
  requireActor(context);
  const batch = writeBatch(db);
  items.forEach((item) => batch.set(doc(db, DOCUMENTS, item.id), {
    ...workflowPayload(item, context),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedByUid: context.actorUid,
  }, { merge: true }));
  const eventRef = doc(collection(db, EVENTS));
  batch.set(eventRef, eventPayload("queue", "clinflow.demo_queue_saved", "Synthetic workflow queue saved", { count: items.length }, context));
  await commitBatchResendSafe(batch, eventRef);
}

// Writes exactly once per document per batch. A not-yet-persisted document's
// create write must itself carry the security rules' required fields (like
// dataMode) — issuing that create and then a second, separate set() for the
// action's changes to the same ref in one batch left the second write
// without those fields and got rejected by the "insufficient permissions"
// (permission-denied) rule check, even though the two merges would have
// produced the correct data. Merging changes into the single create/update
// write removes that failure mode entirely.
function ensureWorkflowRecord(batch, item, context, changes = {}) {
  const ref = doc(db, DOCUMENTS, item.id);
  if (!item.persisted) batch.set(ref, { ...workflowPayload(item, context), ...changes, createdAt: serverTimestamp() }, { merge: true });
  else batch.set(ref, changes, { merge: true });
  return ref;
}

export async function applyClinFlowAction(item, action, context) {
  requireActor(context);
  if (!item?.id) throw new Error("No ClinFlow document is selected.");
  const batch = writeBatch(db);
  const changes = { updatedAt: serverTimestamp(), updatedByUid: context.actorUid };
  if (action.type === "route") changes.destination = clean(action.destination, "Workflow");
  if (action.type === "priority") changes.priority = clean(action.priority, "high");
  if (action.type === "claim") Object.assign(changes, { claimedByUid: context.actorUid, claimedAt: serverTimestamp(), status: "in_review" });
  if (action.type === "complete") Object.assign(changes, { completedByUid: context.actorUid, completedAt: serverTimestamp(), status: "completed" });
  if (action.type === "archive") Object.assign(changes, { archived: true, archivedByUid: context.actorUid, archivedAt: serverTimestamp(), status: "archived" });
  if (action.type === "delete") Object.assign(changes, { archived: true, archivedByUid: context.actorUid, archivedAt: serverTimestamp(), deleted: true, deletedByUid: context.actorUid, deletedAt: serverTimestamp() });
  if (action.type === "triage") Object.assign(changes, {
    triageDecision: clean(action.decision, "review_required"),
    triageStatus: "human_confirmed",
    triageRulesetVersion: clean(action.rulesetVersion, "unknown"),
    triageReviewedByUid: context.actorUid,
    triageReviewedAt: serverTimestamp(),
  });
  ensureWorkflowRecord(batch, item, context, changes);
  const eventRef = doc(collection(db, EVENTS));
  batch.set(eventRef, eventPayload(item.id, `clinflow.${action.type}`, action.summary, action.metadata, context));
  await commitBatchResendSafe(batch, eventRef);
}

export async function recordClinFlowNoteMarker(item, noteLength, context) {
  requireActor(context);
  const batch = writeBatch(db);
  ensureWorkflowRecord(batch, item, context, { updatedAt: serverTimestamp(), updatedByUid: context.actorUid });
  const eventRef = doc(collection(db, EVENTS));
  batch.set(eventRef, eventPayload(item.id, "clinflow.note", "Workflow note marker recorded", { noteLength: Number(noteLength) || 0, contentStored: false }, context));
  await commitBatchResendSafe(batch, eventRef);
}
