import { collection, doc, onSnapshot, updateDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";

// Real users/{uid} profiles, live. Replaces the old scaffold/mock user list.
// Deliberately no orderBy: pre-existing profiles (e.g. self-registered via
// Register.jsx) may not have a createdAt field, and Firestore silently drops
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
