import {
  addDoc,
  getDocs,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { writeAuditEvent } from "@/core/identity/auditService";

export const PRACTICE_CONFIG_ID = "main";

export const DEFAULT_DEPARTMENTS = [
  "Partners",
  "Management Team",
  "Clinical Team",
  "Nursing",
  "Administration",
  "Reception",
  "Facilities",
  "Finance",
  "Research",
];

export const DEFAULT_ROLE_TEMPLATES = [
  {
    name: "Practice Manager",
    department: "Management Team",
    permissions: ["dashboard.read", "operations.read", "operations.manage", "inventory.read", "inventory.write", "inventory.adjust", "inventory.verify", "inventory.delete", "purchasing.read", "purchasing.write", "purchasing.approve", "suppliers.read", "suppliers.write", "compliance.read", "compliance.write", "governance.read", "governance.write", "reports.read", "practiceAdmin.read", "practiceAdmin.write"],
  },
  {
    name: "Management Team",
    department: "Management Team",
    permissions: ["dashboard.read", "operations.read", "inventory.read", "inventory.write", "purchasing.read", "purchasing.write", "suppliers.read", "suppliers.write", "governance.read", "governance.write", "reports.read", "practiceAdmin.read"],
  },
  {
    name: "Practice Nurse",
    department: "Nursing",
    permissions: ["dashboard.read", "operations.read", "inventory.read", "inventory.write", "inventory.verify", "temperature.read", "temperature.write", "temperature.resolveIncident", "compliance.read", "compliance.recordChecks", "mobile.access"],
  },
  {
    name: "Healthcare Assistant",
    department: "Nursing",
    permissions: ["dashboard.read", "operations.read", "inventory.read", "inventory.write", "inventory.verify", "purchasing.read", "purchasing.write", "mobile.access"],
  },
  {
    name: "Caretaker",
    department: "Facilities",
    permissions: ["dashboard.read", "operations.read", "temperature.read", "temperature.write", "compliance.read", "compliance.write", "compliance.recordChecks", "compliance.manageAssets", "mobile.access"],
  },
  {
    name: "Read Only",
    department: "Administration",
    permissions: ["dashboard.read", "inventory.read", "reports.read"],
  },
];

export const PULSE_AREAS = [
  { key: "inventory", label: "Inventory", defaultWeight: 15 },
  { key: "purchasing", label: "Purchasing", defaultWeight: 15 },
  { key: "compliance", label: "Compliance", defaultWeight: 25 },
  { key: "assets", label: "Assets", defaultWeight: 10 },
  { key: "estates", label: "Estates", defaultWeight: 10 },
  { key: "workforce", label: "Workforce", defaultWeight: 15 },
  { key: "governance", label: "Governance", defaultWeight: 10 },
];

export function subscribePracticeConfig(callback, onError) {
  return onSnapshot(doc(db, "practice_config", PRACTICE_CONFIG_ID), callback, onError);
}

export function subscribeCollection(collectionName, callback, onError) {
  const q = query(collection(db, collectionName), orderBy("created_at", "asc"));
  return onSnapshot(q, callback, onError);
}

export async function savePracticeConfig(payload, actor = null) {
  const result = await setDoc(
    doc(db, "practice_config", PRACTICE_CONFIG_ID),
    {
      ...payload,
      updated_at: serverTimestamp(),
      updated_by: actor,
    },
    { merge: true }
  );
  await writeAuditEvent({ action: "administration.practice_config.update", module: "administration", targetType: "practice_config", targetId: PRACTICE_CONFIG_ID, summary: "Practice configuration updated", metadata: { changedFields: Object.keys(payload || {}).slice(0, 20) } });
  return result;
}

export async function addPracticeSite(payload, actor = null) {
  const result = await addDoc(collection(db, "practice_sites"), {
    ...payload,
    active: true,
    created_at: serverTimestamp(),
    created_by: actor,
  });
  await writeAuditEvent({ action: "administration.site.create", module: "administration", targetType: "practice_site", targetId: result.id, summary: "Practice site created" });
  return result;
}

export async function addDepartment(payload, actor = null) {
  const result = await addDoc(collection(db, "practice_departments"), {
    ...payload,
    active: true,
    created_at: serverTimestamp(),
    created_by: actor,
  });
  await writeAuditEvent({ action: "administration.department.create", module: "administration", targetType: "practice_department", targetId: result.id, summary: "Practice department created" });
  return result;
}

export async function updatePracticeSite(siteId, payload, actor = null) {
  const result = await updateDoc(doc(db, "practice_sites", siteId), {
    ...payload,
    updated_at: serverTimestamp(),
    updated_by: actor,
  });
  await writeAuditEvent({ action: "administration.site.update", module: "administration", targetType: "practice_site", targetId: siteId, summary: "Practice site updated", metadata: { changedFields: Object.keys(payload || {}).slice(0, 20) } });
  return result;
}

export async function updateDepartment(departmentId, payload, actor = null) {
  const result = await updateDoc(doc(db, "practice_departments", departmentId), {
    ...payload,
    updated_at: serverTimestamp(),
    updated_by: actor,
  });
  await writeAuditEvent({ action: "administration.department.update", module: "administration", targetType: "practice_department", targetId: departmentId, summary: "Practice department updated", metadata: { changedFields: Object.keys(payload || {}).slice(0, 20) } });
  return result;
}

export async function addPracticeRole(payload, actor = null) {
  const result = await addDoc(collection(db, "practice_roles"), {
    ...payload,
    active: true,
    created_at: serverTimestamp(),
    created_by: actor,
  });
  await writeAuditEvent({ action: "administration.role.create", module: "administration", targetType: "practice_role", targetId: result.id, summary: "Practice role template created", metadata: { permissionCount: Array.isArray(payload?.permissions) ? payload.permissions.length : 0 } });
  return result;
}

export async function updatePracticeRole(roleId, payload, actor = null) {
  const result = await updateDoc(doc(db, "practice_roles", roleId), {
    ...payload,
    updated_at: serverTimestamp(),
    updated_by: actor,
  });
  await writeAuditEvent({ action: "administration.role.update", module: "administration", targetType: "practice_role", targetId: roleId, summary: "Practice role template updated", metadata: { changedFields: Object.keys(payload || {}).slice(0, 20), permissionCount: Array.isArray(payload?.permissions) ? payload.permissions.length : 0 } });
  return result;
}

export async function seedPracticeDefaults(actor = null) {
  const nowActor = actor || null;
  const [departmentSnapshot, roleSnapshot] = await Promise.all([
    getDocs(collection(db, "practice_departments")),
    getDocs(collection(db, "practice_roles")),
  ]);

  const existingDepartments = new Set(
    departmentSnapshot.docs.map((row) => String(row.data()?.name || "").trim().toLowerCase())
  );
  const existingRoles = new Set(
    roleSnapshot.docs.map((row) => String(row.data()?.name || "").trim().toLowerCase())
  );

  const missingDepartments = DEFAULT_DEPARTMENTS.filter(
    (name) => !existingDepartments.has(name.trim().toLowerCase())
  );
  const missingRoles = DEFAULT_ROLE_TEMPLATES.filter(
    (role) => !existingRoles.has(role.name.trim().toLowerCase())
  );

  await Promise.all(
    missingDepartments.map((name) =>
      addDepartment({ name, description: "", order: 0 }, nowActor)
    )
  );

  await Promise.all(
    missingRoles.map((role) =>
      addPracticeRole({ ...role, description: "Default Primovex role template" }, nowActor)
    )
  );

  await savePracticeConfig(
    {
      setup_started: true,
      pulse_weights: PULSE_AREAS.reduce((acc, area) => {
        acc[area.key] = area.defaultWeight;
        return acc;
      }, {}),
    },
    nowActor
  );

  return {
    departmentsAdded: missingDepartments.length,
    rolesAdded: missingRoles.length,
  };
}
