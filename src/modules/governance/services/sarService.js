import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { writeAuditEvent } from "@/core/identity/auditService";

export const SAR_COLLECTION = "governance_sars";
export const SAR_ACTIVITY_COLLECTION = "governance_sar_activity";
export const SAR_YEARS_COLLECTION = "governance_sar_years";

export const SAR_STATUSES = {
  new: "new",
  assigned: "assigned",
  in_progress: "in_progress",
  quality_check: "quality_check",
  completed: "completed",
  archived: "archived",
};

// Who a request came from. "company" carries a typed company name (stored in
// requestedByOther). Older records may still say "solicitor" or "other" - those
// are no longer offered, but are still read and shown correctly.
export const SAR_REQUESTED_BY_OPTIONS = ["patient", "parent", "executor", "court", "company"];

// The form only offers the current options, so a legacy record is edited as a
// company: "other" already holds a company / firm name; "solicitor" had none.
export function normaliseRequestedBy(sar = {}) {
  const value = sar.requestedBy || "patient";
  if (value === "other" || value === "solicitor") {
    return { requestedBy: "company", requestedByOther: String(sar.requestedByOther || "").trim() };
  }
  return { requestedBy: value, requestedByOther: value === "company" ? String(sar.requestedByOther || "").trim() : "" };
}

// What the register and detail view show: a headline (the company name for a
// company request, so a chaser can spot it at a glance) and a small tag.
export function getRequestedByDisplay(sar = {}) {
  const value = sar.requestedBy || "patient";
  const name = String(sar.requestedByOther || "").trim();
  if (value === "company" || value === "other") {
    return { label: name || (value === "other" ? "Other" : "Company"), tag: name ? (value === "other" ? "Other" : "Company") : "", isCompany: true };
  }
  return { label: String(value).replaceAll("_", " ").replace(/(^| )[a-z]/g, (m) => m.toUpperCase()), tag: "", isCompany: false };
}

export function requestedBySearchText(sar = {}) {
  const d = getRequestedByDisplay(sar);
  return [d.label, d.tag].filter(Boolean).join(" ");
}

export const SAR_STATUS_LABELS = {
  new: "New",
  assigned: "Assigned",
  in_progress: "In Progress",
  quality_check: "Quality Check",
  completed: "Completed",
  archived: "Archived",
};

export const SAR_REQUEST_TYPES = [
  {
    key: "full_record",
    label: "Full Medical Record",
    options: ["Full records from birth", "Since registration", "Full records - check with patient"],
  },
  {
    key: "summary",
    label: "Medical Summary",
    options: ["Standard summary", "Summary for PIP", "Summary for benefits", "Summary + referral letter", "Summary + immunisations"],
  },
  {
    key: "date_range",
    label: "Date Range",
    options: ["Last 12 months", "Last 3 years", "Last 5 years", "Last 10 years", "Custom range"],
  },
  {
    key: "consultation",
    label: "Specific Consultation",
    options: ["Consultation note", "Blood test consultation", "Procedure consultation", "Custom consultation date"],
  },
  {
    key: "letters",
    label: "Letters",
    options: ["Mental health letters", "Rheumatology letters", "Audiology letters", "Speech & Language", "Hospital letters", "Hafod letters", "Other letters"],
  },
  {
    key: "referrals",
    label: "Referrals",
    options: ["ADHD referral", "Hospital referral", "Respiratory referral", "Orthopaedic referral", "Other referral"],
  },
  {
    key: "investigations",
    label: "Investigations",
    options: ["Blood tests", "X-ray", "MRI", "DEXA", "ECG", "Other investigation"],
  },
  {
    key: "medication",
    label: "Medication",
    options: ["Medication list", "Medication details", "Current medication", "Medication history"],
  },
  {
    key: "immunisations",
    label: "Immunisations",
    options: ["Immunisation history", "Childhood immunisations", "Travel immunisations"],
  },
  {
    key: "diagnosis",
    label: "Diagnosis",
    options: ["Mental health", "Autism", "ADHD", "Anxiety", "Depression", "Osteoporosis", "Arthritis", "Other diagnosis"],
  },
  { key: "other", label: "Other", options: ["See scanned letter", "See Docman", "See PATCHS", "Custom request"] },
];

export const SAR_CHECKLIST = [
  { key: "identity_checked", label: "Identity / authority checked" },
  { key: "information_extracted", label: "Information extracted" },
  { key: "quality_checked", label: "Quality checked" },
  { key: "sent", label: "Response sent" },
  { key: "recorded", label: "Completion recorded" },
];

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

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function calculateDueDate(receivedDate) {
  return addDays(receivedDate || new Date(), 28);
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

export function getSarDeadlineTone(sar, now = new Date()) {
  const status = sar?.status || SAR_STATUSES.new;
  if (status === SAR_STATUSES.completed || status === SAR_STATUSES.archived) {
    return { label: "Completed", status: "success", className: "text-emerald-200" };
  }

  const days = daysUntilDate(sar?.dueDate || sar?.due_date, now);
  if (days === null) return { label: "No due date", status: "info", className: "text-slate-300" };
  if (days < 0) return { label: `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}`, status: "critical", className: "text-rose-200" };
  if (days === 0) return { label: "Due today", status: "critical", className: "text-rose-200" };
  if (days <= 2) return { label: `${days} day${days === 1 ? "" : "s"} left`, status: "high", className: "text-orange-200" };
  if (days <= 7) return { label: `${days} days left`, status: "warning", className: "text-amber-200" };
  return { label: `${days} days left`, status: "success", className: "text-emerald-200" };
}

export function createSarReference(date = new Date()) {
  const year = date.getFullYear();
  const stamp = `${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}${String(date.getSeconds()).padStart(2, "0")}`;
  return `SAR-${year}-${stamp}`;
}

export function getRequestTypeLabel(key) {
  return SAR_REQUEST_TYPES.find((type) => type.key === key)?.label || "Other";
}

export function getStatusLabel(status) {
  return SAR_STATUS_LABELS[status] || status || "New";
}

export function getSarStatusBadge(status) {
  if (status === SAR_STATUSES.completed || status === SAR_STATUSES.archived) return "success";
  if (status === SAR_STATUSES.quality_check) return "info";
  if (status === SAR_STATUSES.in_progress || status === SAR_STATUSES.assigned) return "warning";
  return "info";
}

// The editable fields of a SAR, normalised the same way whether it's being
// created or edited. Identity, status, checklist and created* stay out of
// this so an edit can never overwrite them.
export function buildSarFields(form) {
  const receivedDate = form.receivedDate ? new Date(form.receivedDate) : new Date();
  const dueDate = form.dueDate ? new Date(form.dueDate) : calculateDueDate(receivedDate);

  return {
    emisNumber: String(form.emisNumber || "").trim(),
    receivedDate: Timestamp.fromDate(receivedDate),
    dueDate: Timestamp.fromDate(dueDate),
    requestedBy: form.requestedBy || "patient",
    requestedByOther: form.requestedBy === "company" ? String(form.requestedByOther || "").trim().slice(0, 120) : "",
    receivedVia: form.receivedVia || "email",
    solicitorReference: String(form.solicitorReference || "").trim(),
    requestType: form.requestType || "summary",
    requestTypeLabel: getRequestTypeLabel(form.requestType || "summary"),
    requestOptions: form.requestOptions || [],
    informationRequired: String(form.informationRequired || "").trim(),
    consentToEmail: !!form.consentToEmail,
    urgent: !!form.urgent,
    deliveryMethod: form.deliveryMethod || "email",
    emailAddress: String(form.emailAddress || "").trim(),
    assignedToUid: form.assignedToUid || "",
    assignedToName: form.assignedToName || "Unassigned",
    managerUid: form.managerUid || "",
    managerName: form.managerName || "",
    priority: form.urgent ? "high" : "routine",
    notes: String(form.notes || "").trim(),
  };
}

export function buildSarPayload(form, actor = {}) {
  const fields = buildSarFields(form);

  return {
    reference: form.reference || createSarReference(new Date()),
    ...fields,
    status: fields.assignedToUid ? SAR_STATUSES.assigned : SAR_STATUSES.new,
    checklist: SAR_CHECKLIST.reduce((acc, item) => ({ ...acc, [item.key]: false }), {}),
    createdByUid: actor.uid || null,
    createdByName: actor.displayName || actor.email || "Unknown",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

export async function addSarActivity(sarId, activity = {}) {
  if (!sarId) return;
  try {
    await addDoc(collection(db, SAR_ACTIVITY_COLLECTION), {
      sarId,
      type: activity.type || "note",
      title: activity.title || "Activity",
      message: activity.message || "",
      actorUid: activity.actor?.uid || null,
      actorName: activity.actor?.displayName || activity.actor?.email || "Unknown",
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    // Activity entries are append-only, and the id is made on this device, so
    // "already exists" can only mean our own earlier send landed and the client
    // re-sent it after a dropped connection — the entry is there, it worked.
    if (err?.code === "already-exists") return;
    throw err;
  }
}

export async function createUserNotification(uid, notification = {}) {
  if (!uid) return null;
  const ref = doc(collection(db, "users", uid, "notifications"));
  await setDoc(ref, {
    recipientUid: uid,
    title: notification.title || "MedTrak+ notification",
    message: notification.message || "",
    module: notification.module || "governance",
    priority: notification.priority || "routine",
    dueDate: notification.dueDate || null,
    actionUrl: notification.actionUrl || "",
    read: false,
    status: "open",
    createdByUid: notification.createdByUid || null,
    createdByName: notification.createdByName || "MedTrak+",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function createSar(form, actor = {}) {
  const payload = buildSarPayload(form, actor);
  // The id is made up front and the SAR written with setDoc (not addDoc): if
  // the connection drops after the server has saved it, the client re-sends the
  // write, and a create-only resend is refused as "already exists" even though
  // the save worked — the person sees an error and saves again, making a
  // duplicate. Re-sending a set just re-saves the same record.
  const ref = doc(collection(db, SAR_COLLECTION));
  await setDoc(ref, payload);

  await addSarActivity(ref.id, {
    type: "created",
    title: "SAR created",
    message: `${payload.reference} created and ${payload.assignedToUid ? `assigned to ${payload.assignedToName}` : "left unassigned"}.`,
    actor,
  });

  if (payload.assignedToUid) {
    try {
      await createUserNotification(payload.assignedToUid, {
        title: `New SAR assigned: ${payload.reference}`,
        message: `${payload.requestTypeLabel} request due ${formatDateInput(toDate(payload.dueDate))}.`,
        module: "sar",
        priority: payload.priority,
        dueDate: payload.dueDate,
        actionUrl: "/governance/sars",
        createdByUid: actor.uid || null,
        createdByName: actor.displayName || actor.email || "MedTrak+",
      });
    } catch (err) {
      console.warn("Unable to create assignment notification. Check Firestore notification create rules.", err);
    }
  }

  return ref.id;
}

// Year folders on the SAR register. A folder shows up by itself once a SAR is
// received in that year; these are the ones the team adds by hand (e.g. next
// year's) so they can exist before their first SAR does.
export function isValidSarYear(year) {
  return Number.isInteger(year) && year >= 2000 && year <= new Date().getFullYear() + 10;
}

export function subscribeSarYearFolders(callback, onError) {
  return onSnapshot(
    collection(db, SAR_YEARS_COLLECTION),
    (snap) => callback(snap.docs.map((d) => Number(d.data().year)).filter(isValidSarYear)),
    onError
  );
}

export async function createSarYearFolder(year, actor = {}) {
  if (!isValidSarYear(year)) throw new Error("Enter a four-digit year, e.g. 2027.");
  const ref = doc(db, SAR_YEARS_COLLECTION, String(year));
  if ((await getDoc(ref)).exists()) return; // already there — nothing to do
  try {
    await setDoc(ref, {
      year,
      createdByUid: actor.uid || null,
      createdByName: actor.displayName || actor.email || "Unknown",
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    // If the connection drops after the server has saved the folder, the
    // client re-sends the write; that second copy lands on a folder that now
    // exists and the rules (folders are never edited) refuse it, so a save that
    // actually worked reports "permission denied". If the folder is there, it worked.
    try {
      if ((await getDoc(ref)).exists()) return;
    } catch {
      // fall through to the original error
    }
    throw err;
  }
}

export async function deleteSarYearFolder(year) {
  if (!isValidSarYear(year)) return;
  await deleteDoc(doc(db, SAR_YEARS_COLLECTION, String(year)));
}

// Labels for the fields whose change is worth naming in the activity log.
const SAR_EDIT_LABELS = [
  ["emisNumber", "EMIS number"],
  ["requestedBy", "requested by"],
  ["requestedByOther", "company name"],
  ["receivedVia", "received via"],
  ["solicitorReference", "solicitor reference"],
  ["requestType", "request type"],
  ["informationRequired", "information required"],
  ["urgent", "urgent flag"],
  ["deliveryMethod", "delivery method"],
  ["emailAddress", "email address"],
  ["assignedToUid", "assignee"],
  ["managerUid", "manager"],
  ["notes", "internal notes"],
];

function describeSarChanges(before, fields) {
  const changed = SAR_EDIT_LABELS
    .filter(([key]) => JSON.stringify(before?.[key] ?? "") !== JSON.stringify(fields[key] ?? ""))
    .map(([, label]) => label);
  const asDay = (value) => { const d = toDate(value); return d ? formatDateInput(d) : ""; };
  if (asDay(before?.receivedDate) !== asDay(fields.receivedDate)) changed.push("date received");
  if (asDay(before?.dueDate) !== asDay(fields.dueDate)) changed.push("due date");
  if (JSON.stringify(before?.requestOptions || []) !== JSON.stringify(fields.requestOptions || [])) changed.push("request options");
  return changed;
}

// `before` is the SAR as it was when the edit started, so the activity log
// can say what actually changed. Reference, status progress, checklist and
// created* are deliberately not editable here.
export async function updateSarDetails(sarId, form, actor = {}, before = {}) {
  if (!sarId) return;
  const fields = buildSarFields(form);
  const updates = { ...fields, updatedAt: serverTimestamp() };

  // Assigning someone moves a brand-new SAR to "assigned" (and un-assigning
  // returns it); a SAR that's already in progress or beyond keeps its status.
  const status = before.status || SAR_STATUSES.new;
  if (status === SAR_STATUSES.new && fields.assignedToUid) updates.status = SAR_STATUSES.assigned;
  else if (status === SAR_STATUSES.assigned && !fields.assignedToUid) updates.status = SAR_STATUSES.new;

  await updateDoc(doc(db, SAR_COLLECTION, sarId), updates);

  const changed = describeSarChanges(before, fields);
  await addSarActivity(sarId, {
    type: "edited",
    title: "SAR details updated",
    message: changed.length ? `Changed: ${changed.join(", ")}.` : "Details were re-saved with no changes.",
    actor,
  });

  if (fields.assignedToUid && fields.assignedToUid !== (before.assignedToUid || "")) {
    try {
      await createUserNotification(fields.assignedToUid, {
        title: `SAR assigned to you: ${before.reference || ""}`.trim(),
        message: `${fields.requestTypeLabel} request due ${formatDateInput(toDate(fields.dueDate))}.`,
        module: "sar",
        priority: fields.priority,
        dueDate: fields.dueDate,
        actionUrl: "/governance/sars",
        createdByUid: actor.uid || null,
        createdByName: actor.displayName || actor.email || "Primovex",
      });
    } catch (err) {
      console.warn("Unable to create assignment notification. Check Firestore notification create rules.", err);
    }
  }
}

// Removes the SAR record. Its activity entries can't be deleted (Firestore
// rules make governance_sar_activity append-only), so a final "deleted" entry
// is written there and a governed audit event is recorded — the trail
// outlives the record. Both are best-effort once the delete itself has
// succeeded.
export async function deleteSar(sar, actor = {}) {
  if (!sar?.id) return;
  await deleteDoc(doc(db, SAR_COLLECTION, sar.id));

  try {
    await addSarActivity(sar.id, {
      type: "deleted",
      title: "SAR deleted",
      message: `${sar.reference || "SAR"} was deleted.`,
      actor,
    });
  } catch (err) {
    console.warn("SAR was deleted but the activity entry could not be written.", err);
  }

  try {
    await writeAuditEvent({
      actor,
      action: "governance.sar.deleted",
      module: "governance",
      targetType: "sar",
      targetId: sar.id,
      summary: `SAR ${sar.reference || ""} deleted`.trim(),
      classification: "governance",
      metadata: { reference: sar.reference || "", status: sar.status || "" },
    });
  } catch (err) {
    console.warn("SAR was deleted but the audit event could not be recorded.", err);
  }
}

export async function updateSarStatus(sarId, status, actor = {}) {
  if (!sarId || !status) return;
  const updates = {
    status,
    updatedAt: serverTimestamp(),
  };

  if (status === SAR_STATUSES.completed) {
    updates.completedAt = serverTimestamp();
    updates.completedByUid = actor.uid || null;
    updates.completedByName = actor.displayName || actor.email || "Unknown";
  }

  await updateDoc(doc(db, SAR_COLLECTION, sarId), updates);
  await addSarActivity(sarId, {
    type: "status",
    title: "Status updated",
    message: `Status changed to ${getStatusLabel(status)}.`,
    actor,
  });
}

export async function updateSarChecklist(sarId, checklist, actor = {}) {
  if (!sarId) return;
  await updateDoc(doc(db, SAR_COLLECTION, sarId), {
    checklist,
    updatedAt: serverTimestamp(),
  });
  await addSarActivity(sarId, {
    type: "checklist",
    title: "Checklist updated",
    message: "Completion checklist updated.",
    actor,
  });
}

export async function addSarNote(sarId, message, actor = {}) {
  if (!sarId || !String(message || "").trim()) return;
  await addSarActivity(sarId, {
    type: "note",
    title: "Note added",
    message: String(message).trim(),
    actor,
  });
}

export async function getSarActivity(sarId) {
  if (!sarId) return [];
  const qActivity = query(
    collection(db, SAR_ACTIVITY_COLLECTION),
    where("sarId", "==", sarId),
    limit(50)
  );
  const snap = await getDocs(qActivity);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0));
}
