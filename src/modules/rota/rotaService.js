import { collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, addDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isSafeSyntheticMode } from "@/config/platformMode";
import { recordAudit } from "@/modules/audit/recordAudit";
import { rotaEvent } from "@/modules/audit/auditEvents";
import { checkRules } from "./rotaModel";

// Reading and writing the reception rota: the rules (one record), the weeks that have been built (one record per Monday), and who is off (one record per absence).
// Demo and training mode read nothing and write nothing.

export const RULES = "reception_rota_rules";
export const WEEKS = "reception_rota_weeks";
export const ABSENCES = "reception_rota_absences";
export const RULES_ID = "main";

const who = (actor) => ({ uid: actor?.uid || "", name: actor?.displayName || actor?.email || "" });
const rowOf = (d) => ({ id: d.id, ...(d.data() || {}) });

export function subscribeRules(onData, onError) {
  if (isSafeSyntheticMode()) { onData(null); return () => {}; }
  return onSnapshot(doc(db, RULES, RULES_ID), (snap) => onData(snap.exists() ? snap.data() : null), onError);
}

export async function saveRules(rules, actor) {
  const problems = checkRules(rules);
  if (problems.length) throw new Error(problems[0]);
  if (isSafeSyntheticMode()) return;
  const a = who(actor);
  await setDoc(doc(db, RULES, RULES_ID), { shifts: rules.shifts, people: rules.people, settings: rules.settings || {}, updatedAt: serverTimestamp(), updatedByUid: a.uid, updatedByName: a.name });
  recordAudit(rotaEvent("rules_saved"));
}

// every saved week, keyed by its Monday
export function subscribeWeeks(onData, onError) {
  if (isSafeSyntheticMode()) { onData({}); return () => {}; }
  return onSnapshot(query(collection(db, WEEKS)), (snap) => onData(Object.fromEntries(snap.docs.map((d) => [d.id, rowOf(d)]))), onError);
}

// A week as built or as changed by hand. `edited` is { "mon|late": true } for the places fixed by hand, which are kept when the week is built again.
export async function saveWeek(week, actor, { edited = {}, built = false } = {}) {
  if (isSafeSyntheticMode()) return;
  const a = who(actor);
  const body = { mondayIso: week.mondayIso, days: week.days, issues: week.issues || [], edited, updatedAt: serverTimestamp(), updatedByUid: a.uid, updatedByName: a.name };
  if (built) { body.generatedAt = serverTimestamp(); body.generatedByUid = a.uid; body.generatedByName = a.name; }
  await setDoc(doc(db, WEEKS, week.mondayIso), body, { merge: true });
  recordAudit(rotaEvent(built ? "week_built" : "week_changed", { mondayIso: week.mondayIso }));
}

export async function removeWeek(mondayIso) {
  if (isSafeSyntheticMode()) return;
  await deleteDoc(doc(db, WEEKS, mondayIso));
  recordAudit(rotaEvent("week_removed", { mondayIso }));
}

export function subscribeAbsences(onData, onError) {
  if (isSafeSyntheticMode()) { onData([]); return () => {}; }
  return onSnapshot(query(collection(db, ABSENCES)), (snap) => onData(snap.docs.map(rowOf).sort((x, y) => String(x.from).localeCompare(String(y.from)))), onError);
}

// An absence is a person (picked from the list), the first and last day off, and "leave" or "other". Nothing typed.
export async function addAbsence({ uid, name, from, to, reason }, actor) {
  if (!uid || !from) throw new Error("Choose who is off and the first day.");
  if (to && to < from) throw new Error("The last day cannot be before the first day.");
  if (!["leave", "toil", "other"].includes(reason)) throw new Error("Choose a reason.");
  if (isSafeSyntheticMode()) return;
  const a = who(actor);
  await addDoc(collection(db, ABSENCES), { uid, name, from, to: to || from, reason, createdAt: serverTimestamp(), createdByUid: a.uid, createdByName: a.name });
  recordAudit(rotaEvent("absence_added"));
}

export async function removeAbsence(id) {
  if (isSafeSyntheticMode()) return;
  await deleteDoc(doc(db, ABSENCES, id));
  recordAudit(rotaEvent("absence_removed"));
}
