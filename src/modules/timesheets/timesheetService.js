import { useEffect, useMemo, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, where, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { isSafeSyntheticMode } from "@/config/platformMode";
import { demoTimesheetStaff } from "@/data/demoTimesheets";

// The staff register for timesheets in Firestore (rules: firestore.rules, "TIMESHEETS"). It is staff employment data:
//   timesheets.manage   reads and writes everyone's
//   anyone else         reads only their own (the record linked to their account)
// Facts from BrightHR (job title, teams, contract type, payroll number, start date, leave figures) are brought in by an import;
// what Primovex owns (working patterns, account link, line manager) is set here and never overwritten by an import.

export const STAFF = "timesheet_staff";

const withId = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
const byName = (a, b) => String(a.name).localeCompare(String(b.name), "en", { sensitivity: "base" });

export function useTimesheetStaff(enabled = true) {
  const { user, can } = useAuth();
  const uid = user?.uid || "";
  const all = can("timesheets.manage");
  const [state, setState] = useState({ staff: null, error: "" });
  useEffect(() => {
    if (enabled && isSafeSyntheticMode()) { setState({ staff: demoTimesheetStaff(), error: "" }); return undefined; }
    if (!enabled || !uid) { setState({ staff: enabled ? [] : null, error: "" }); return undefined; }
    const source = all ? collection(db, STAFF) : query(collection(db, STAFF), where("uid", "==", uid));
    return onSnapshot(source, (snap) => setState({ staff: withId(snap).sort(byName), error: "" }),
      (error) => setState({ staff: [], error: error?.code === "permission-denied" ? "You can't open the timesheet records." : "Could not load the timesheet records." }));
  }, [enabled, uid, all]);
  return useMemo(() => ({ ...state, ready: state.staff !== null, all }), [state, all]);
}

const clean = (value) => String(value ?? "").trim();

// A person's own facts. `patch` can hold: patterns, uid, managerId, active, jobTitle, ...  Only known fields are written.
const OWN = ["name", "patterns", "uid", "managerId", "managerUid", "active", "notes"];
export async function saveStaff(person, patch, actor = {}) {
  if (isSafeSyntheticMode()) throw new Error("Demo mode can't save changes.");
  const data = {};
  for (const key of OWN) if (key in patch) data[key] = key === "uid" || key === "managerId" || key === "managerUid" ? clean(patch[key]) || null : key === "name" || key === "notes" ? clean(patch[key]) : patch[key];
  data.updatedAt = serverTimestamp();
  data.updatedByName = actor.displayName || actor.email || "";
  await setDoc(doc(db, STAFF, person.id), data, { merge: true });
}

export async function removeStaff(person) {
  if (isSafeSyntheticMode()) throw new Error("Demo mode can't save changes.");
  await deleteDoc(doc(db, STAFF, person.id));
}

// Apply a plan from planStaffImport. Done in batches; a failure stops it and says how far it got.
export async function applyStaffImport(plan, actor = {}) {
  if (isSafeSyntheticMode()) throw new Error("Demo mode can't save changes.");
  const stamp = { updatedAt: serverTimestamp(), updatedByName: actor.displayName || actor.email || "" };
  const ops = [
    ...plan.added.map((p) => ({ id: p.id, data: { name: p.name, ...p.hr, uid: null, managerId: null, patterns: [], ...stamp } })),
    ...plan.updated.map((p) => ({ id: p.id, data: { ...p.hr, ...stamp } })),
  ];
  let written = 0;
  try {
    for (let i = 0; i < ops.length; i += 400) {
      const batch = writeBatch(db);
      for (const op of ops.slice(i, i + 400)) batch.set(doc(db, STAFF, op.id), op.data, { merge: true });
      await batch.commit();
      written += Math.min(400, ops.length - i);
    }
  } catch (error) {
    const failure = new Error(`The import stopped after ${written} of ${ops.length}: ${error?.message || "it did not save"}. Importing again is safe.`);
    failure.written = written;
    throw failure;
  }
  return { written };
}
