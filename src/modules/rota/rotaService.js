import { collection, deleteDoc, deleteField, doc, onSnapshot, query, serverTimestamp, setDoc, addDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isSafeSyntheticMode } from "@/config/platformMode";
import { recordAudit } from "@/modules/audit/recordAudit";
import { rotaEvent } from "@/modules/audit/auditEvents";
import { absenceProblem, checkRules, closureProblem } from "./rotaModel";
import { demoStore } from "./rotaDemo";

// Reading and writing the reception rota: the rules (one record), the weeks that have been built (one record per Monday), and who is off (one record per absence).
// Demo and training mode use an invented rota kept in memory (rotaDemo.js): they never read or write the real one.

export const RULES = "reception_rota_rules";
export const WEEKS = "reception_rota_weeks";
export const ABSENCES = "reception_rota_absences";
export const CLOSURES = "reception_rota_closures";
export const RULES_ID = "main";

const who = (actor) => ({ uid: actor?.uid || "", name: actor?.displayName || actor?.email || "" });
const rowOf = (d) => ({ id: d.id, ...(d.data() || {}) });

export function subscribeRules(onData, onError) {
  if (isSafeSyntheticMode()) return demoStore().subscribe("rules", onData);
  return onSnapshot(doc(db, RULES, RULES_ID), (snap) => onData(snap.exists() ? snap.data() : null), onError);
}

export async function saveRules(rules, actor) {
  const problems = checkRules(rules);
  if (problems.length) throw new Error(problems[0]);
  if (isSafeSyntheticMode()) { demoStore().set("rules", { shifts: rules.shifts, people: rules.people, settings: rules.settings || {} }); return; }
  const a = who(actor);
  await setDoc(doc(db, RULES, RULES_ID), { shifts: rules.shifts, people: rules.people, settings: rules.settings || {}, updatedAt: serverTimestamp(), updatedByUid: a.uid, updatedByName: a.name });
  recordAudit(rotaEvent("rules_saved"));
}

// every saved week, keyed by its Monday
export function subscribeWeeks(onData, onError) {
  if (isSafeSyntheticMode()) return demoStore().subscribe("weeks", onData);
  return onSnapshot(query(collection(db, WEEKS)), (snap) => onData(Object.fromEntries(snap.docs.map((d) => [d.id, rowOf(d)]))), onError);
}

// A week as built or as changed by hand. `edited` is { "mon|late": true } for the places fixed by hand, which are kept when the week is built again.
export async function saveWeek(week, actor, { edited = {}, built = false } = {}) {
  if (isSafeSyntheticMode()) { demoStore().saveWeek({ mondayIso: week.mondayIso, days: week.days, issues: week.issues || [], edited }); return; }
  const a = who(actor);
  const body = { mondayIso: week.mondayIso, days: week.days, issues: week.issues || [], edited, updatedAt: serverTimestamp(), updatedByUid: a.uid, updatedByName: a.name };
  if (built) { body.generatedAt = serverTimestamp(); body.generatedByUid = a.uid; body.generatedByName = a.name; }
  await setDoc(doc(db, WEEKS, week.mondayIso), body, { merge: true });
  recordAudit(rotaEvent(built ? "week_built" : "week_changed", { mondayIso: week.mondayIso }));
}

export async function removeWeek(mondayIso) {
  if (isSafeSyntheticMode()) { demoStore().removeWeek(mondayIso); return; }
  await deleteDoc(doc(db, WEEKS, mondayIso));
  recordAudit(rotaEvent("week_removed", { mondayIso }));
}

export function subscribeAbsences(onData, onError) {
  if (isSafeSyntheticMode()) return demoStore().subscribe("absences", onData);
  return onSnapshot(query(collection(db, ABSENCES)), (snap) => onData(snap.docs.map(rowOf).sort((x, y) => String(x.from).localeCompare(String(y.from)))), onError);
}

// An absence is a person (picked from the list), the first and last day off with an optional time on each ("from 14:00" on the first day, "until 10:00" on the last: a half day, finishing early,
// starting late), and "leave", "toil" or "other". Nothing typed. No first time means from the start of the day, no last time means to the end of it.
const TIME = /^\d{2}:\d{2}$/;
// Change an absence that has been entered (annual leave moved, a day added, a half day made a whole one). The same checks as adding one. Whoever it is for stays the same.
export async function updateAbsence(id, { uid, name, from, to, fromTime = "", toTime = "", reason }, actor) {
  const problem = absenceProblem({ uid, from, to, fromTime, toTime, reason });
  if (problem) throw new Error(problem);
  if (isSafeSyntheticMode()) { demoStore().updateAbsence(id, { uid, name, from, to: to || from, fromTime, toTime, reason }); return; }
  await updateDoc(doc(db, ABSENCES, id), { uid, name, from, to: to || from, fromTime: fromTime || deleteField(), toTime: toTime || deleteField(), reason });
  recordAudit(rotaEvent("absence_changed"));
}

export async function addAbsence({ uid, name, from, to, fromTime = "", toTime = "", reason }, actor) {
  const problem = absenceProblem({ uid, from, to, fromTime, toTime, reason });
  if (problem) throw new Error(problem);
  if (isSafeSyntheticMode()) { demoStore().addAbsence({ uid, name, from, to: to || from, ...(fromTime ? { fromTime } : {}), ...(toTime ? { toTime } : {}), reason }); return; }
  const a = who(actor);
  await addDoc(collection(db, ABSENCES), { uid, name, from, to: to || from, ...(fromTime ? { fromTime } : {}), ...(toTime ? { toTime } : {}), reason, createdAt: serverTimestamp(), createdByUid: a.uid, createdByName: a.name });
  recordAudit(rotaEvent("absence_added"));
}

// A surgery closure: which surgery (main, branch or both), the first and last day it is shut with an optional time on each (a training afternoon: shut from 12.30; reopening late: back at 10), and why,
// all picked from lists. Nothing typed. No first time means from the start of the day, no last time means to the end of it. It holds no names and nothing about anyone.
export function subscribeClosures(onData, onError) {
  if (isSafeSyntheticMode()) return demoStore().subscribe("closures", onData);
  return onSnapshot(query(collection(db, CLOSURES)), (snap) => onData(snap.docs.map(rowOf).sort((x, y) => String(x.from).localeCompare(String(y.from)))), onError);
}
export async function addClosure({ site, from, to, fromTime = "", toTime = "", reason }, actor) {
  const problem = closureProblem({ site, from, to, fromTime, toTime, reason });
  if (problem) throw new Error(problem);
  const row = { site, from, to: to || from, ...(fromTime ? { fromTime } : {}), ...(toTime ? { toTime } : {}), reason };
  if (isSafeSyntheticMode()) { demoStore().addClosure(row); return; }
  const a = who(actor);
  await addDoc(collection(db, CLOSURES), { ...row, createdAt: serverTimestamp(), createdByUid: a.uid, createdByName: a.name });
  recordAudit(rotaEvent("closure_added"));
}
export async function updateClosure(id, { site, from, to, fromTime = "", toTime = "", reason }, actor) {
  const problem = closureProblem({ site, from, to, fromTime, toTime, reason });
  if (problem) throw new Error(problem);
  if (isSafeSyntheticMode()) { demoStore().updateClosure(id, { site, from, to: to || from, fromTime, toTime, reason }); return; }
  await updateDoc(doc(db, CLOSURES, id), { site, from, to: to || from, fromTime: fromTime || deleteField(), toTime: toTime || deleteField(), reason });
  recordAudit(rotaEvent("closure_changed"));
}
export async function removeClosure(id) {
  if (isSafeSyntheticMode()) { demoStore().removeClosure(id); return; }
  await deleteDoc(doc(db, CLOSURES, id));
  recordAudit(rotaEvent("closure_removed"));
}

export async function removeAbsence(id) {
  if (isSafeSyntheticMode()) { demoStore().removeAbsence(id); return; }
  await deleteDoc(doc(db, ABSENCES, id));
  recordAudit(rotaEvent("absence_removed"));
}
