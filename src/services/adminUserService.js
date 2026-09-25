import { collection, doc, onSnapshot, updateDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";

// Real users/{uid} profiles, live. Replaces the old scaffold/mock user list.
// Deliberately no orderBy: older profiles (from before accounts were created
// through the createUserAccount Cloud Function) may not have a createdAt field, and Firestore silently drops
// any doc missing an ordered field from the results — sorting client-side
// avoids quietly hiding real accounts from the admin.
export function subscribeUsers(onData, onError) {
  return onSnapshot(collection(db, "users"), (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    rows.sort((a, b) => String(a.displayName || a.email || "").localeCompare(String(b.displayName || b.email || "")));
    onData(rows);
  }, onError);
}

// Creates a real Firebase Auth account + Firestore profile via the
// createUserAccount Cloud Function (admin-only). Returns { uid, inviteLink }
// — there's no email-sending set up in this project, so the admin needs to
// hand the invite link to the new user themselves (email, chat, etc.).
export async function createUserAccount({ displayName, email, role }) {
  const call = httpsCallable(functions, "createUserAccount");
  const response = await call({ displayName, email, role });
  return response.data;
}

// Firestore rules allow an admin to update any user's profile directly, so
// this is a plain client write rather than another Cloud Function.
export async function updateUserRole(uid, role) {
  await updateDoc(doc(db, "users", uid), { role });
}

// Who this person reports to, for the organisation chart (Practice Admin >
// Departments). A list, not a single value - some staff genuinely report to
// more than one manager at once (e.g. a GP answering to both the Practice
// Manager and a partner). Same reasoning as updateUserRole above - a plain
// client write, no Cloud Function needed. An empty array puts them at the
// top of the chart.
export async function updateUserReportsTo(uid, managerUids) {
  await updateDoc(doc(db, "users", uid), { reportsTo: Array.isArray(managerUids) ? managerUids : (managerUids ? [managerUids] : []) });
}

// A purely visual marker for the organisation chart - e.g. picking out a
// senior partner among several partners who all sit at the same level (same
// manager or none). Deliberately separate from reportsTo/role: it changes
// how someone's box looks, never where it sits in the tree.
export async function updateUserOrgHighlight(uid, highlighted) {
  await updateDoc(doc(db, "users", uid), { orgHighlight: !!highlighted });
}

// Issues a fresh password-set link for an existing account (the one from Add
// User expires after an hour). Returns { uid, email, link } — admin-only, and
// only a System Admin can do it for another System Admin.
export async function createPasswordLink(uid) {
  const call = httpsCallable(functions, "createPasswordLink");
  const response = await call({ uid });
  return response.data;
}

// Disables/re-enables sign-in via the setUserActive Cloud Function — the
// client SDK can't touch another user's Firebase Auth account directly, same
// reason createUserAccount is a Cloud Function rather than a client write.
export async function setUserActive(uid, active) {
  const call = httpsCallable(functions, "setUserActive");
  await call({ uid, active });
}

// Permanently removes the account (Auth + Firestore profile) via the
// deleteUserAccount Cloud Function. Irreversible — see setUserActive for the
// reversible "remove access" action.
export async function deleteUserAccount(uid) {
  const call = httpsCallable(functions, "deleteUserAccount");
  await call({ uid });
}
