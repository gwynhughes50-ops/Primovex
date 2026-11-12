import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { isSafeSyntheticMode } from "@/config/platformMode";
import { recordAudit } from "@/modules/audit/recordAudit";
import { rotaEvent } from "@/modules/audit/auditEvents";
import { DEMO_ME, demoStore } from "./rotaDemo";
import { projectPublished } from "./rotaPublish";

// The reception team's side of the rota: the weeks the coordinator has published, requests (swaps and adjustments), and the switch for the team's access. Requests are made and answered only by the
// rotaRequest function on the server; the app only reads them. Demo and training mode use the in-memory demo rota.

export const PUBLISHED = "reception_rota_published";
export const REQUESTS = "reception_rota_requests";

const who = (actor) => ({ uid: actor?.uid || "", name: actor?.displayName || actor?.email || "" });
const rowOf = (d) => ({ id: d.id, ...(d.data() || {}) });
const byNewest = (a, b) => String(b.createdAt?.toMillis?.() || b.history?.[0]?.at || 0).localeCompare(String(a.createdAt?.toMillis?.() || a.history?.[0]?.at || 0), undefined, { numeric: true });

// ---- the coordinator ----
export function subscribePublished(onData, onError) {
  if (isSafeSyntheticMode()) return demoStore().subscribe("published", onData);
  return onSnapshot(query(collection(db, PUBLISHED)), (snap) => onData(Object.fromEntries(snap.docs.map((d) => [d.id, rowOf(d)]))), onError);
}

// Publish built weeks to the team: a copy of each with only who is on which shift and the times
export async function publishWeeks(weeks, rules, actor) {
  const a = who(actor);
  for (const week of weeks) {
    if (isSafeSyntheticMode()) { demoStore().publish(week); continue; }
    await setDoc(doc(db, PUBLISHED, week.mondayIso), { ...projectPublished(week, rules), publishedAt: serverTimestamp(), publishedByUid: a.uid, publishedByName: a.name });
    recordAudit(rotaEvent("week_published", { mondayIso: week.mondayIso }));
  }
}

export function subscribeRequests(onData, onError) {
  if (isSafeSyntheticMode()) return demoStore().subscribe("requests", (rows) => onData(rows));
  return onSnapshot(query(collection(db, REQUESTS)), (snap) => onData(snap.docs.map(rowOf).sort(byNewest)), onError);
}

export function subscribeTeamAccess(onData, onError) {
  if (isSafeSyntheticMode()) return demoStore().subscribe("teamAccess", (s) => onData(s?.teamAccess === true));
  return onSnapshot(doc(db, "settings", "rota"), (snap) => onData(snap.exists() && snap.data().teamAccess === true), onError);
}

export async function setTeamAccess(on, actor) {
  if (isSafeSyntheticMode()) { demoStore().setTeamAccess(on); return; }
  const a = who(actor);
  await setDoc(doc(db, "settings", "rota"), { teamAccess: Boolean(on), updatedAt: serverTimestamp(), updatedByUid: a.uid }, { merge: true });
  recordAudit(rotaEvent(on ? "team_access_on" : "team_access_off"));
}

// every step of a request (asking, answering, cancelling, approving) is made by the server
export async function askRota(data) {
  if (isSafeSyntheticMode()) return demoStore().answer(data);
  const result = await httpsCallable(functions, "rotaRequest", { timeout: 60000 })(data);
  return result.data || {};
}

// ---- a member of the team ----
// The published weeks that list this person. Only readable while the team's access is on.
export function subscribeMyPublished(uid, onData, onError) {
  if (isSafeSyntheticMode()) return demoStore().subscribe("published", onData);
  if (!uid) { onData({}); return () => {}; }
  return onSnapshot(query(collection(db, PUBLISHED), where("teamUids", "array-contains", uid)), (snap) => onData(Object.fromEntries(snap.docs.map((d) => [d.id, rowOf(d)]))), onError);
}

// The requests this person made or that are for them
export function subscribeMyRequests(uid, onData, onError) {
  if (isSafeSyntheticMode()) return demoStore().subscribe("requests", (rows) => onData(rows.filter((r) => r.requesterUid === DEMO_ME || r.targetUid === DEMO_ME)));
  if (!uid) { onData([]); return () => {}; }
  let mine = []; let forMe = [];
  const emit = () => onData([...new Map([...mine, ...forMe].map((r) => [r.id, r])).values()].sort(byNewest));
  const a = onSnapshot(query(collection(db, REQUESTS), where("requesterUid", "==", uid)), (s) => { mine = s.docs.map(rowOf); emit(); }, onError);
  const b = onSnapshot(query(collection(db, REQUESTS), where("targetUid", "==", uid)), (s) => { forMe = s.docs.map(rowOf); emit(); }, onError);
  return () => { a(); b(); };
}

// Who the phone screens show: the signed-in person (in demo mode, an invented one)
export const teamUid = (uid) => (isSafeSyntheticMode() ? DEMO_ME : uid);
