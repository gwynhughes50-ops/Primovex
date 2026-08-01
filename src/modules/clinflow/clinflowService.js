import { collection, doc, onSnapshot, query, serverTimestamp, where, writeBatch } from "firebase/firestore";
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
  batch.set(doc(collection(db, EVENTS)), eventPayload("queue", "clinflow.demo_queue_saved", "Synthetic workflow queue saved", { count: items.length }, context));
  await batch.commit();
}

function ensureWorkflowRecord(batch, item, context) {
  const ref = doc(db, DOCUMENTS, item.id);
  if (!item.persisted) batch.set(ref, { ...workflowPayload(item, context), createdAt: serverTimestamp() }, { merge: true });
  return ref;
}

export async function applyClinFlowAction(item, action, context) {
  requireActor(context);
  if (!item?.id) throw new Error("No ClinFlow document is selected.");
  const batch = writeBatch(db);
  const ref = ensureWorkflowRecord(batch, item, context);
  const changes = { updatedAt: serverTimestamp(), updatedByUid: context.actorUid };
  if (action.type === "route") changes.destination = clean(action.destination, "Workflow");
  if (action.type === "priority") changes.priority = clean(action.priority, "high");
  if (action.type === "claim") Object.assign(changes, { claimedByUid: context.actorUid, claimedAt: serverTimestamp(), status: "in_review" });
  if (action.type === "complete") Object.assign(changes, { completedByUid: context.actorUid, completedAt: serverTimestamp(), status: "completed" });
  if (action.type === "archive") Object.assign(changes, { archived: true, archivedByUid: context.actorUid, archivedAt: serverTimestamp(), status: "archived" });
  if (action.type === "triage") Object.assign(changes, {
    triageDecision: clean(action.decision, "review_required"),
    triageStatus: "human_confirmed",
    triageRulesetVersion: clean(action.rulesetVersion, "unknown"),
    triageReviewedByUid: context.actorUid,
    triageReviewedAt: serverTimestamp(),
  });
  batch.set(ref, changes, { merge: true });
  batch.set(doc(collection(db, EVENTS)), eventPayload(item.id, `clinflow.${action.type}`, action.summary, action.metadata, context));
  await batch.commit();
}

export async function recordClinFlowNoteMarker(item, noteLength, context) {
  requireActor(context);
  const batch = writeBatch(db);
  const ref = ensureWorkflowRecord(batch, item, context);
  batch.set(ref, { updatedAt: serverTimestamp(), updatedByUid: context.actorUid }, { merge: true });
  batch.set(doc(collection(db, EVENTS)), eventPayload(item.id, "clinflow.note", "Workflow note marker recorded", { noteLength: Number(noteLength) || 0, contentStored: false }, context));
  await batch.commit();
}
