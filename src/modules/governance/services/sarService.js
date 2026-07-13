import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

export const SAR_COLLECTION = "governance_sars";
export const SAR_ACTIVITY_COLLECTION = "governance_sar_activity";

export const SAR_STATUSES = {
  new: "new",
  assigned: "assigned",
  in_progress: "in_progress",
  quality_check: "quality_check",
  completed: "completed",
  archived: "archived",
};

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

export function buildSarPayload(form, actor = {}) {
  const receivedDate = form.receivedDate ? new Date(form.receivedDate) : new Date();
  const dueDate = form.dueDate ? new Date(form.dueDate) : calculateDueDate(receivedDate);
  const assignedToUid = form.assignedToUid || "";

  return {
    reference: form.reference || createSarReference(new Date()),
    emisNumber: String(form.emisNumber || "").trim(),
    receivedDate: Timestamp.fromDate(receivedDate),
    dueDate: Timestamp.fromDate(dueDate),
    requestedBy: form.requestedBy || "patient",
    receivedVia: form.receivedVia || "email",
    requestType: form.requestType || "summary",
    requestTypeLabel: getRequestTypeLabel(form.requestType || "summary"),
    requestOptions: form.requestOptions || [],
    informationRequired: String(form.informationRequired || "").trim(),
    consentToEmail: !!form.consentToEmail,
    urgent: !!form.urgent,
    deliveryMethod: form.deliveryMethod || "email",
    emailAddress: String(form.emailAddress || "").trim(),
    assignedToUid,
    assignedToName: form.assignedToName || "Unassigned",
    managerUid: form.managerUid || "",
    managerName: form.managerName || "",
    status: assignedToUid ? SAR_STATUSES.assigned : SAR_STATUSES.new,
    priority: form.urgent ? "high" : "routine",
    notes: String(form.notes || "").trim(),
    checklist: SAR_CHECKLIST.reduce((acc, item) => ({ ...acc, [item.key]: false }), {}),
    createdByUid: actor.uid || null,
    createdByName: actor.displayName || actor.email || "Unknown",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

export async function addSarActivity(sarId, activity = {}) {
  if (!sarId) return;
  await addDoc(collection(db, SAR_ACTIVITY_COLLECTION), {
    sarId,
    type: activity.type || "note",
    title: activity.title || "Activity",
    message: activity.message || "",
    actorUid: activity.actor?.uid || null,
    actorName: activity.actor?.displayName || activity.actor?.email || "Unknown",
    createdAt: serverTimestamp(),
  });
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
  const ref = await addDoc(collection(db, SAR_COLLECTION), payload);

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
