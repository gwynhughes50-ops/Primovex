import { useEffect, useMemo, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, where, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { isSafeSyntheticMode } from "@/config/platformMode";
import { demoTraining } from "@/data/demoTraining";
import { recordKey } from "./training";
import { planMerge } from "./mergePeople";

// The staff training matrix in Firestore (rules: firestore.rules, "STAFF TRAINING MATRIX"). What a person can read is decided by
// the rules; this reads the right slice so the query is allowed:
//   training.manage          everyone
//   training.manageClinical  the clinical group
//   training.view            everyone, read only (partners)
//   anyone else              their own record only (the person linked to their account)

export const COURSES = "training_courses";
export const PEOPLE = "training_people";
export const RECORDS = "training_records";

// "all" | "clinical" | "own", from what this login may do
export function trainingScope(can) {
  if (can("training.manage")) return "all";
  if (can("training.manageClinical")) return "clinical";
  if (can("training.view")) return "all";
  return "own";
}

// true when this login can look at everyone's training but not change it
export const trainingReadOnly = (can) => !can("training.manage") && !can("training.manageClinical") && can("training.view");

const withId = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

// courses, people and records for this login, live. `ready` is false until all three have answered.
export function useTrainingData(enabled = true) {
  const { user, can } = useAuth();
  const scope = trainingScope(can);
  const uid = user?.uid || "";
  const [state, setState] = useState({ courses: null, people: null, records: null, error: "" });

  useEffect(() => {
    if (enabled && isSafeSyntheticMode()) { const demo = demoTraining(); setState({ ...demo, error: "" }); return undefined; }
    if (!enabled || !uid) { setState({ courses: enabled ? [] : null, people: enabled ? [] : null, records: enabled ? [] : null, error: "" }); return undefined; }
    const fail = (error) => setState((s) => ({ ...s, error: error?.code === "permission-denied" ? "You can't open training records." : "Could not load training records." }));
    const peopleQuery = scope === "all" ? collection(db, PEOPLE) : scope === "clinical" ? query(collection(db, PEOPLE), where("group", "==", "clinical")) : query(collection(db, PEOPLE), where("uid", "==", uid));
    const recordsQuery = scope === "all" ? collection(db, RECORDS) : scope === "clinical" ? query(collection(db, RECORDS), where("group", "==", "clinical")) : query(collection(db, RECORDS), where("ownerUid", "==", uid));
    const stops = [
      onSnapshot(collection(db, COURSES), (snap) => setState((s) => ({ ...s, courses: withId(snap).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.name).localeCompare(String(b.name))) })), fail),
      onSnapshot(peopleQuery, (snap) => setState((s) => ({ ...s, people: withId(snap).sort((a, b) => String(a.name).localeCompare(String(b.name), "en", { sensitivity: "base" })) })), fail),
      onSnapshot(recordsQuery, (snap) => setState((s) => ({ ...s, records: withId(snap) })), fail),
    ];
    return () => stops.forEach((stop) => stop());
  }, [enabled, uid, scope]);

  return useMemo(() => ({ ...state, scope, ready: state.courses !== null && state.people !== null && state.records !== null }), [state, scope]);
}

// ---- writing -------------------------------------------------------------------------------------------------------------

const clean = (value) => String(value ?? "").trim();

// Set, change or clear one person's record for one course. All blank and no mark = remove it.
export async function saveRecord({ person, course, completedOn = "", dueOn = "", status = "" }, actor = {}) {
  if (isSafeSyntheticMode()) throw new Error("Demo mode can't save changes.");
  const id = recordKey(person.id, course.id);
  if (!completedOn && !dueOn && !status) { await deleteDoc(doc(db, RECORDS, id)); return; }
  await setDoc(doc(db, RECORDS, id), {
    personId: person.id, courseId: course.id, group: person.group, ownerUid: person.uid || "",
    completedOn: completedOn || "", dueOn: dueOn || "", status: status || "",
    updatedByName: actor.displayName || actor.email || "", updatedAt: serverTimestamp(),
  });
}

export async function saveCourse(course) {
  if (isSafeSyntheticMode()) throw new Error("Demo mode can't save changes.");
  const id = course.id;
  await setDoc(doc(db, COURSES, id), {
    name: clean(course.name), category: clean(course.category) || "General", intervalMonths: Number(course.intervalMonths) || 0,
    mode: clean(course.mode), order: Number(course.order) || 0, active: course.active !== false,
  }, { merge: true });
}

// Save a person. Their records carry the group and the account, so they are brought into line when either changes.
export async function savePerson(person, { previous = null, records = [] } = {}) {
  if (isSafeSyntheticMode()) throw new Error("Demo mode can't save changes.");
  const data = {
    name: clean(person.name), jobRole: clean(person.jobRole), group: person.group || "admin", uid: clean(person.uid) || null,
    active: person.active !== false,
  };
  const batch = writeBatch(db);
  batch.set(doc(db, PEOPLE, person.id), data, { merge: true });
  if (previous && (previous.group !== data.group || (previous.uid || null) !== data.uid)) {
    for (const record of records.filter((r) => r.personId === person.id)) batch.update(doc(db, RECORDS, record.id), { group: data.group, ownerUid: data.uid || "" });
  }
  await batch.commit();
}

// Remove someone who should never have been on the matrix (an import mistake, a duplicate): the person and all their dates.
// Someone who has simply left is marked "Left" instead, so their history is kept.
export async function deletePerson(person, records = []) {
  if (isSafeSyntheticMode()) throw new Error("Demo mode can't save changes.");
  const batch = writeBatch(db);
  for (const record of records.filter((r) => r.personId === person.id)) batch.delete(doc(db, RECORDS, record.id));
  batch.delete(doc(db, PEOPLE, person.id));
  await batch.commit();
}

// Join two entries for the same person (see mergePeople.js): the kept one gets the later date for each course, remembers the other
// name, and the other is removed. One batch, so it either all happens or none of it does.
export async function mergePeople(keep, other, records = []) {
  if (isSafeSyntheticMode()) throw new Error("Demo mode can't save changes.");
  const plan = planMerge(keep, other, records);
  const batch = writeBatch(db);
  const stamp = { updatedByName: "Merged", updatedAt: serverTimestamp() };
  for (const w of plan.writes) batch.set(doc(db, RECORDS, recordKey(w.personId, w.courseId)), { ...w, ...stamp });
  if (plan.relink) for (const r of records.filter((x) => x.personId === keep.id)) batch.update(doc(db, RECORDS, r.id), { ownerUid: plan.relink.ownerUid });
  for (const id of plan.deletes) batch.delete(doc(db, RECORDS, id));
  batch.set(doc(db, PEOPLE, keep.id), { name: clean(plan.person.name), jobRole: clean(plan.person.jobRole), group: plan.person.group || "admin", uid: plan.person.uid || null, active: plan.person.active !== false, aliases: plan.person.aliases }, { merge: true });
  batch.delete(doc(db, PEOPLE, plan.deletePersonId));
  await batch.commit();
  return plan.counts;
}

export const newPersonId = (name) => `p-${clean(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || Date.now()}`;
export const newCourseId = (name) => `c-${clean(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || Date.now()}`;

// Apply an import plan (see planImport). Done in batches of 400, a failure stops it and says how far it got.
export async function applyImportPlan(plan) {
  if (isSafeSyntheticMode()) throw new Error("Demo mode can't save changes.");
  const ops = [
    ...plan.newCourses.map((c) => ({ ref: doc(db, COURSES, c.id), data: { name: c.name, category: c.category, intervalMonths: c.intervalMonths, mode: c.mode || "", order: c.order || 0, active: true } })),
    ...plan.newPeople.map((p) => ({ ref: doc(db, PEOPLE, p.id), data: { name: p.name, jobRole: p.jobRole || "", group: p.group, uid: null, active: true } })),
    ...plan.records.map((r) => ({ ref: doc(db, RECORDS, recordKey(r.personId, r.courseId)), data: { personId: r.personId, courseId: r.courseId, group: r.group, ownerUid: r.ownerUid || "", completedOn: r.completedOn || "", dueOn: r.dueOn || "", status: "", updatedByName: "Import", updatedAt: serverTimestamp() } })),
  ];
  let done = 0;
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db);
    ops.slice(i, i + 400).forEach((op) => batch.set(op.ref, op.data));
    try { await batch.commit(); } catch (error) { throw new Error(`${done} of ${ops.length} were saved before this went wrong: ${error?.message || "check your permissions"}`); }
    done += Math.min(400, ops.length - i);
  }
  return { written: done };
}
