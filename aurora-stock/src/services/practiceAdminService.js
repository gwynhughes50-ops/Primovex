import {
  addDoc,
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
    permissions: ["dashboard", "inventory", "purchasing", "suppliers", "compliance", "governance", "reports", "practice_admin"],
  },
  {
    name: "Management Team",
    department: "Management Team",
    permissions: ["dashboard", "inventory", "purchasing", "suppliers", "governance", "reports"],
  },
  {
    name: "Practice Nurse",
    department: "Nursing",
    permissions: ["dashboard", "inventory", "temperature", "compliance"],
  },
  {
    name: "Healthcare Assistant",
    department: "Nursing",
    permissions: ["dashboard", "inventory", "reorder", "deliveries"],
  },
  {
    name: "Caretaker",
    department: "Facilities",
    permissions: ["dashboard", "compliance", "estates", "assets"],
  },
  {
    name: "Read Only",
    department: "Administration",
    permissions: ["dashboard", "inventory", "reports"],
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
  return setDoc(
    doc(db, "practice_config", PRACTICE_CONFIG_ID),
    {
      ...payload,
      updated_at: serverTimestamp(),
      updated_by: actor,
    },
    { merge: true }
  );
}

export async function addPracticeSite(payload, actor = null) {
  return addDoc(collection(db, "practice_sites"), {
    ...payload,
    active: true,
    created_at: serverTimestamp(),
    created_by: actor,
  });
}

export async function addDepartment(payload, actor = null) {
  return addDoc(collection(db, "practice_departments"), {
    ...payload,
    active: true,
    created_at: serverTimestamp(),
    created_by: actor,
  });
}

export async function addPracticeRole(payload, actor = null) {
  return addDoc(collection(db, "practice_roles"), {
    ...payload,
    active: true,
    created_at: serverTimestamp(),
    created_by: actor,
  });
}

export async function updatePracticeRole(roleId, payload, actor = null) {
  return updateDoc(doc(db, "practice_roles", roleId), {
    ...payload,
    updated_at: serverTimestamp(),
    updated_by: actor,
  });
}

export async function seedPracticeDefaults(actor = null) {
  const nowActor = actor || null;

  await Promise.all(
    DEFAULT_DEPARTMENTS.map((name) =>
      addDepartment({ name, description: "", order: 0 }, nowActor)
    )
  );

  await Promise.all(
    DEFAULT_ROLE_TEMPLATES.map((role) =>
      addPracticeRole({ ...role, description: "Default MedTrak+ role template" }, nowActor)
    )
  );

  await savePracticeConfig(
    {
      setup_complete: true,
      setup_started: true,
      pulse_weights: PULSE_AREAS.reduce((acc, area) => {
        acc[area.key] = area.defaultWeight;
        return acc;
      }, {}),
    },
    nowActor
  );
}
