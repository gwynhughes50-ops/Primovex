import {
  Timestamp, addDoc, arrayRemove, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import {
  ACTION_STATUSES, MEETING_STATUSES, REVIEW_STATUSES, SE_ACTIONS_COLLECTION, SE_COLLECTION, SE_MEETINGS_COLLECTION, SE_REVIEWS_COLLECTION,
  SE_SETTINGS_DOC, SE_STATUSES, SE_TIMELINE_COLLECTION, createSeReference, normaliseReport, reviewDocId, stageLabel, validateAction, validateReport, validateReview,
} from "../seModel";

// Reading and writing significant events. The rules (firestore.rules, "SIGNIFICANT EVENTS") decide
// who can do each of these; the stages and what is allowed next live in seModel.js.

export * from "../seModel";

const toTimestamp = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : Timestamp.fromDate(date);
};

export function toDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value) {
  const date = toDate(value);
  return date ? date.toLocaleDateString("en-GB") : "";
}

export function formatDateInput(value) {
  const date = toDate(value);
  return date ? date.toISOString().slice(0, 10) : "";
}

const actorName = (actor = {}) => actor.displayName || actor.email || "Unknown";

// ---- timeline ---------------------------------------------------------------------------------------------------

export async function addTimeline(seId, entry = {}, actor = {}) {
  await addDoc(collection(db, SE_TIMELINE_COLLECTION), {
    seId,
    type: entry.type || "note",
    title: entry.title || "Update",
    message: String(entry.message || "").slice(0, 2000),
    actorUid: actor.uid || null,
    actorName: actorName(actor),
    createdAt: serverTimestamp(),
  });
}

// Best effort: a failed notification never undoes the change that caused it.
export async function notifyEvent(seId, kind, extra = {}) {
  try {
    await httpsCallable(functions, "notifySignificantEvent")({ seId, kind, ...extra });
  } catch (err) {
    console.warn("Significant event notification was not sent.", err?.message || err);
  }
}

// ---- reporting ----------------------------------------------------------------------------------------------------

// Anyone signed in. The rules allow only this exact shape: as yourself, at the first stage.
export async function reportEvent(form, actor = {}) {
  const problem = validateReport(form);
  if (problem) throw new Error(problem);
  if (!actor.uid) throw new Error("You need to be signed in to report an event.");
  const fields = normaliseReport(form);
  const ref = doc(collection(db, SE_COLLECTION));
  await setDoc(ref, {
    reference: createSeReference(new Date()),
    status: SE_STATUSES.reported,
    investigation: "pending",
    ...fields,
    eventDate: toTimestamp(fields.eventDate),
    reportedByUid: actor.uid,
    reportedByName: actorName(actor),
    reportedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await addTimeline(ref.id, { type: "reported", title: "Reported", message: "" }, actor).catch((err) => console.warn("Timeline entry failed", err));
  notifyEvent(ref.id, "reported");
  return ref.id;
}

// ---- reading events -------------------------------------------------------------------------------------------------

// The team and oversight read everything. Anyone else reads the events they reported, lead,
// are named on or were asked to review: the rules need one query per reason, merged here.
export function subscribeEvents({ seesAll, uid }, callback, onError) {
  if (seesAll) {
    return onSnapshot(
      query(collection(db, SE_COLLECTION), orderBy("createdAt", "desc"), limit(500)),
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      onError
    );
  }
  if (!uid) return () => {};
  const parts = new Map();
  const emit = () => {
    const merged = new Map();
    parts.forEach((rows) => rows.forEach((row) => merged.set(row.id, row)));
    callback([...merged.values()].sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0)));
  };
  const queries = [
    ["reported", where("reportedByUid", "==", uid)],
    ["lead", where("leadUid", "==", uid)],
    ["involved", where("involvedUserIds", "array-contains", uid)],
    ["reviewer", where("reviewerUids", "array-contains", uid)],
  ];
  const unsubs = queries.map(([key, constraint]) => onSnapshot(
    query(collection(db, SE_COLLECTION), constraint),
    (snap) => { parts.set(key, snap.docs.map((d) => ({ id: d.id, ...d.data() }))); emit(); },
    onError
  ));
  return () => unsubs.forEach((u) => u());
}

export function subscribeTimeline(seId, callback, onError) {
  return onSnapshot(
    query(collection(db, SE_TIMELINE_COLLECTION), where("seId", "==", seId), orderBy("createdAt", "desc")),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError
  );
}

export function subscribeReviews(seId, { seesAll, uid }, callback, onError) {
  const constraints = seesAll ? [where("seId", "==", seId)] : [where("seId", "==", seId), where("reviewerUid", "==", uid)];
  return onSnapshot(
    query(collection(db, SE_REVIEWS_COLLECTION), ...constraints),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError
  );
}

export function subscribeMyReviews(uid, callback, onError) {
  if (!uid) return () => {};
  return onSnapshot(
    query(collection(db, SE_REVIEWS_COLLECTION), where("reviewerUid", "==", uid)),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError
  );
}

export function subscribeMeetings({ seesAll, uid }, callback, onError) {
  const q = seesAll
    ? query(collection(db, SE_MEETINGS_COLLECTION), orderBy("meetingDate", "desc"), limit(200))
    : query(collection(db, SE_MEETINGS_COLLECTION), where("attendeeUids", "array-contains", uid));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
}

export function subscribeActions({ seesAll, uid }, callback, onError) {
  const q = seesAll
    ? query(collection(db, SE_ACTIONS_COLLECTION), orderBy("createdAt", "desc"), limit(500))
    : query(collection(db, SE_ACTIONS_COLLECTION), where("ownerUid", "==", uid));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
}

// One read of everything this person can see, for the Orb. Same queries as the screens, so the
// database rules decide what comes back.
export async function loadVisibleSe({ seesAll, uid }) {
  const rows = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const merge = (lists) => [...new Map(lists.flat().map((r) => [r.id, r])).values()];
  const events = seesAll
    ? rows(await getDocs(query(collection(db, SE_COLLECTION), orderBy("createdAt", "desc"), limit(500))))
    : merge(await Promise.all([
        getDocs(query(collection(db, SE_COLLECTION), where("reportedByUid", "==", uid))),
        getDocs(query(collection(db, SE_COLLECTION), where("leadUid", "==", uid))),
        getDocs(query(collection(db, SE_COLLECTION), where("involvedUserIds", "array-contains", uid))),
        getDocs(query(collection(db, SE_COLLECTION), where("reviewerUids", "array-contains", uid))),
      ]).then((snaps) => snaps.map(rows)));
  const [actions, reviews, meetings] = await Promise.all([
    getDocs(seesAll ? query(collection(db, SE_ACTIONS_COLLECTION), limit(500)) : query(collection(db, SE_ACTIONS_COLLECTION), where("ownerUid", "==", uid))).then(rows),
    getDocs(query(collection(db, SE_REVIEWS_COLLECTION), where("reviewerUid", "==", uid))).then(rows),
    getDocs(seesAll ? query(collection(db, SE_MEETINGS_COLLECTION), orderBy("meetingDate", "desc"), limit(50)) : query(collection(db, SE_MEETINGS_COLLECTION), where("attendeeUids", "array-contains", uid))).then(rows),
  ]);
  return { events, actions, reviews, meetings };
}

// ---- running an event (the team) ------------------------------------------------------------------------------------------

export async function moveStage(event, step, { reason = "" } = {}, actor = {}) {
  if (step.blocked) throw new Error(step.blockedReason || "That isn't possible yet.");
  if (step.needsReason && !String(reason).trim()) throw new Error("Please say why.");
  const patch = { status: step.to, updatedAt: serverTimestamp() };
  if (step.investigation) patch.investigation = step.investigation;
  if (step.id === "no_investigation") patch.noInvestigationReason = String(reason).trim().slice(0, 1000);
  if (step.id === "close_without_meeting") patch.closedWithoutMeetingReason = String(reason).trim().slice(0, 1000);
  if (step.to === SE_STATUSES.closed) patch.closedAt = serverTimestamp();
  if (step.id === "reopen") patch.closedAt = null;
  await updateDoc(doc(db, SE_COLLECTION, event.id), patch);
  await addTimeline(event.id, { type: "stage", title: `Moved to ${stageLabel(step.to)}`, message: step.needsReason ? String(reason).trim() : step.label }, actor);
}

export async function setLead(event, lead, actor = {}) {
  await updateDoc(doc(db, SE_COLLECTION, event.id), { leadUid: lead?.id || "", leadName: lead?.label || "", updatedAt: serverTimestamp() });
  await addTimeline(event.id, { type: "lead", title: lead?.id ? `${lead.label} is leading the investigation` : "Lead removed" }, actor);
  if (lead?.id) notifyEvent(event.id, "lead_assigned");
}

export async function setInvolved(event, people = [], actor = {}) {
  await updateDoc(doc(db, SE_COLLECTION, event.id), {
    involvedUserIds: people.map((p) => p.id),
    involvedNames: people.map((p) => p.label),
    updatedAt: serverTimestamp(),
  });
  await addTimeline(event.id, { type: "involved", title: "People involved updated", message: people.map((p) => p.label).join(", ") }, actor);
}

// The lead (or team) records what they found. `finish` also moves it on to review.
export async function saveFindings(event, findings, { finish = false } = {}, actor = {}) {
  const clean = {
    whatHappened: String(findings.whatHappened || "").slice(0, 4000),
    whyItHappened: String(findings.whyItHappened || "").slice(0, 4000),
    contributingFactors: String(findings.contributingFactors || "").slice(0, 4000),
    evidence: String(findings.evidence || "").slice(0, 2000),
  };
  const patch = { findings: clean, updatedAt: serverTimestamp() };
  if (finish) patch.status = SE_STATUSES.in_review;
  await updateDoc(doc(db, SE_COLLECTION, event.id), patch);
  await addTimeline(event.id, { type: "investigation", title: finish ? "Investigation finished" : "Investigation notes saved" }, actor);
}

export async function addNote(seId, message, actor = {}) {
  const text = String(message || "").trim();
  if (!text) return;
  await addTimeline(seId, { type: "note", title: "Note", message: text }, actor);
}

// ---- reviews -----------------------------------------------------------------------------------------------------------------

// Asks each person to review. A person who already has a review keeps it (nothing is overwritten).
export async function requestReviews(event, reviewers = [], existingReviews = [], actor = {}) {
  const have = new Set(existingReviews.map((r) => r.reviewerUid));
  const fresh = reviewers.filter((r) => !have.has(r.id));
  for (const person of fresh) {
    await setDoc(doc(db, SE_REVIEWS_COLLECTION, reviewDocId(event.id, person.id)), {
      seId: event.id,
      seReference: event.reference || "",
      reviewerUid: person.id,
      reviewerName: person.label || "",
      reviewerRole: person.role || "",
      status: REVIEW_STATUSES.requested,
      summary: "", learning: "", recommendation: "",
      requestedByUid: actor.uid || null,
      requestedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  if (fresh.length) {
    await updateDoc(doc(db, SE_COLLECTION, event.id), {
      reviewerUids: arrayUnion(...fresh.map((p) => p.id)),
      updatedAt: serverTimestamp(),
    });
    await addTimeline(event.id, { type: "review", title: `Review requested from ${fresh.length} ${fresh.length === 1 ? "person" : "people"}`, message: fresh.map((p) => p.label).join(", ") }, actor);
    notifyEvent(event.id, "review_requested", { targetUids: fresh.map((p) => p.id) });
  }
  return fresh.length;
}

export async function removeReviewer(event, review, actor = {}) {
  await deleteDoc(doc(db, SE_REVIEWS_COLLECTION, review.id));
  await updateDoc(doc(db, SE_COLLECTION, event.id), { reviewerUids: arrayRemove(review.reviewerUid), updatedAt: serverTimestamp() });
  await addTimeline(event.id, { type: "review", title: "A reviewer was removed", message: review.reviewerName || "" }, actor);
}

export async function submitReview(review, form, actor = {}) {
  const problem = validateReview(form);
  if (problem) throw new Error(problem);
  await updateDoc(doc(db, SE_REVIEWS_COLLECTION, review.id), {
    summary: String(form.summary).trim().slice(0, 4000),
    learning: String(form.learning || "").trim().slice(0, 4000),
    recommendation: String(form.recommendation || "").trim().slice(0, 4000),
    status: REVIEW_STATUSES.submitted,
    submittedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  // The reviewer isn't always allowed to write to the timeline, and the review itself is the record.
  await addTimeline(review.seId, { type: "note", title: "Review submitted", message: `${actorName(actor)} submitted their review.` }, actor).catch(() => {});
}

// ---- meetings -------------------------------------------------------------------------------------------------------------------

export async function createMeeting(form, actor = {}) {
  const title = String(form.title || "").trim() || "Significant event meeting";
  const date = toTimestamp(form.meetingDate);
  if (!date) throw new Error("Choose the meeting date.");
  const attendees = form.attendees || [];
  const ref = doc(collection(db, SE_MEETINGS_COLLECTION));
  await setDoc(ref, {
    title: title.slice(0, 120),
    meetingDate: date,
    status: MEETING_STATUSES.planned,
    chairUid: form.chair?.id || "",
    chairName: form.chair?.label || "",
    attendeeUids: attendees.map((p) => p.id),
    attendeeNames: attendees.map((p) => p.label),
    apologies: String(form.apologies || "").slice(0, 500),
    eventIds: form.eventIds || [],
    discussion: {},
    minutes: "",
    createdByUid: actor.uid || null,
    createdByName: actorName(actor),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateMeeting(meetingId, patch = {}, actor = {}) {
  const next = { ...patch, updatedAt: serverTimestamp() };
  if (patch.meetingDate) next.meetingDate = toTimestamp(patch.meetingDate);
  if (patch.attendees) {
    next.attendeeUids = patch.attendees.map((p) => p.id);
    next.attendeeNames = patch.attendees.map((p) => p.label);
    delete next.attendees;
  }
  if (patch.chair) {
    next.chairUid = patch.chair.id || "";
    next.chairName = patch.chair.label || "";
    delete next.chair;
  }
  await updateDoc(doc(db, SE_MEETINGS_COLLECTION, meetingId), next);
}

// Put an event on a meeting's agenda.
export async function addEventToMeeting(meeting, event, actor = {}) {
  await updateDoc(doc(db, SE_MEETINGS_COLLECTION, meeting.id), { eventIds: arrayUnion(event.id), updatedAt: serverTimestamp() });
  await updateDoc(doc(db, SE_COLLECTION, event.id), { meetingIds: arrayUnion(meeting.id), updatedAt: serverTimestamp() });
  await addTimeline(event.id, { type: "meeting", title: `On the agenda for ${meeting.title}`, message: formatDate(meeting.meetingDate) }, actor);
}

export async function removeEventFromMeeting(meeting, event) {
  await updateDoc(doc(db, SE_MEETINGS_COLLECTION, meeting.id), { eventIds: arrayRemove(event.id), updatedAt: serverTimestamp() });
  await updateDoc(doc(db, SE_COLLECTION, event.id), { meetingIds: arrayRemove(meeting.id), updatedAt: serverTimestamp() });
}

// The meeting took place: events that were waiting for it now have actions to finish.
export async function markMeetingHeld(meeting, events = [], actor = {}) {
  await updateDoc(doc(db, SE_MEETINGS_COLLECTION, meeting.id), { status: MEETING_STATUSES.held, heldAt: serverTimestamp(), updatedAt: serverTimestamp() });
  for (const event of events) {
    if (event.status === SE_STATUSES.awaiting_meeting) {
      await updateDoc(doc(db, SE_COLLECTION, event.id), { status: SE_STATUSES.actions_open, updatedAt: serverTimestamp() });
    }
    await addTimeline(event.id, { type: "meeting", title: `Discussed at ${meeting.title}`, message: formatDate(meeting.meetingDate) }, actor);
  }
}

// ---- actions -------------------------------------------------------------------------------------------------------------------------

export async function createAction(form, event = null, meeting = null, actor = {}) {
  const problem = validateAction(form);
  if (problem) throw new Error(problem);
  const ref = doc(collection(db, SE_ACTIONS_COLLECTION));
  await setDoc(ref, {
    seId: event?.id || "",
    seReference: event?.reference || "",
    meetingId: meeting?.id || "",
    title: String(form.title).trim().slice(0, 300),
    ownerUid: form.ownerUid,
    ownerName: form.ownerName || "",
    dueDate: form.dueDate ? toTimestamp(form.dueDate) : null,
    status: ACTION_STATUSES.open,
    createdByUid: actor.uid || null,
    createdByName: actorName(actor),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  if (event?.id) {
    await addTimeline(event.id, { type: "action", title: "Action added", message: `${String(form.title).trim()} (${form.ownerName || "owner"})` }, actor);
    notifyEvent(event.id, "action_assigned", { actionId: ref.id });
  }
  return ref.id;
}

export async function setActionDone(action, done, note = "", actor = {}) {
  await updateDoc(doc(db, SE_ACTIONS_COLLECTION, action.id), done
    ? { status: ACTION_STATUSES.done, completedAt: serverTimestamp(), completedByName: actorName(actor), completionNote: String(note || "").slice(0, 1000), updatedAt: serverTimestamp() }
    : { status: ACTION_STATUSES.open, completedAt: null, completedByName: "", completionNote: "", updatedAt: serverTimestamp() });
}

export async function deleteAction(action) {
  await deleteDoc(doc(db, SE_ACTIONS_COLLECTION, action.id));
}

// ---- the practice's choices --------------------------------------------------------------------------------------------------------

export function subscribeSeSettings(callback) {
  return onSnapshot(doc(db, "settings", SE_SETTINGS_DOC), (snap) => callback(snap.exists() ? snap.data() : {}), () => callback({}));
}

export async function loadSeSettings() {
  try {
    const snap = await getDoc(doc(db, "settings", SE_SETTINGS_DOC));
    return snap.exists() ? snap.data() : {};
  } catch {
    return {};
  }
}

export async function saveReviewerRoles(roles = [], actor = {}) {
  await setDoc(doc(db, "settings", SE_SETTINGS_DOC), {
    reviewerRoles: [...new Set(roles.filter(Boolean))],
    updatedAt: serverTimestamp(),
    updatedByUid: actor.uid || null,
  }, { merge: true });
}
