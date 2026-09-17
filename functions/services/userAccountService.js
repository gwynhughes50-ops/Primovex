const { getAuth } = require("firebase-admin/auth");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const { HttpsError } = require("firebase-functions/v2/https");

// Mirrors the role names in src/core/identity/capabilities.js ROLE_TEMPLATES.
// Kept as a plain list here since that file is a frontend ES module the
// functions codebase (CommonJS) can't import directly — if a role is added
// there, add its name here too so account creation accepts it.
const VALID_ROLES = [
  "System Admin",
  "Practice Manager",
  "User",
  "Nurse",
  "HCA",
  "Reception",
  "Caretaker",
  "Cleaner",
  "Partner",
  "ReadOnly",
];

// Creates a real Firebase Auth account (Admin SDK, so it never touches the
// calling admin's own session) plus the matching users/{uid} Firestore
// profile, then returns a password-set link for the admin to hand to the new
// user. There is no email-sending infrastructure in this project, so this
// deliberately returns the link rather than pretending to have emailed it.
async function createUserAccount({ displayName, email, role, creatorUid }) {
  const cleanName = String(displayName || "").trim();
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanName) throw new HttpsError("invalid-argument", "Enter a display name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new HttpsError("invalid-argument", "Enter a valid email address.");

  const db = getFirestore();

  if (!VALID_ROLES.includes(role)) {
    // Not a built-in role — check the admin-defined roles collection
    // (see AdminDashboard.jsx's Add Role) before rejecting it.
    const customRole = await db.collection("roles").doc(String(role || "")).get();
    if (!customRole.exists || customRole.data()?.active === false) {
      throw new HttpsError("invalid-argument", `Unknown role "${role}".`);
    }
  }

  const auth = getAuth();
  let userRecord;
  try {
    userRecord = await auth.createUser({ email: cleanEmail, displayName: cleanName });
  } catch (error) {
    if (error.code === "auth/email-already-exists") {
      throw new HttpsError("already-exists", "An account with this email already exists.");
    }
    throw new HttpsError("internal", error.message || "Could not create the account.");
  }

  await db.collection("users").doc(userRecord.uid).set({
    displayName: cleanName,
    email: cleanEmail,
    role,
    createdAt: FieldValue.serverTimestamp(),
    createdByUid: creatorUid || null,
  });

  const inviteLink = await auth.generatePasswordResetLink(cleanEmail);

  return { uid: userRecord.uid, inviteLink };
}

// Disables/re-enables the Firebase Auth account (so they genuinely can't
// sign in) and mirrors that onto the Firestore profile. Reversible — data
// and audit history are untouched. This is the everyday "remove someone's
// access" action; see deleteUserAccount for the irreversible one.
async function setUserActive({ uid, active, actorUid }) {
  const cleanUid = String(uid || "");
  if (!cleanUid) throw new HttpsError("invalid-argument", "Missing user id.");
  if (cleanUid === actorUid) throw new HttpsError("failed-precondition", "You can't deactivate your own account.");

  const auth = getAuth();
  const db = getFirestore();

  try {
    await auth.updateUser(cleanUid, { disabled: !active });
  } catch (error) {
    if (error.code === "auth/user-not-found") throw new HttpsError("not-found", "That account no longer exists.");
    throw new HttpsError("internal", error.message || "Could not update the account.");
  }

  await db.collection("users").doc(cleanUid).update({
    active: !!active,
    updatedAt: FieldValue.serverTimestamp(),
    updatedByUid: actorUid || null,
  });

  return { uid: cleanUid, active: !!active };
}

// Permanently removes the Firebase Auth account and its Firestore profile.
// For accounts that should never have existed (wrong email, duplicate) —
// deactivate is the right tool for someone who's actually leaving, since it
// keeps their history. Guarded against self-deletion and removing the last
// System Admin so the practice can't lock itself out.
async function deleteUserAccount({ uid, actorUid }) {
  const cleanUid = String(uid || "");
  if (!cleanUid) throw new HttpsError("invalid-argument", "Missing user id.");
  if (cleanUid === actorUid) throw new HttpsError("failed-precondition", "You can't delete your own account.");

  const db = getFirestore();
  const snap = await db.collection("users").doc(cleanUid).get();

  if (snap.exists && snap.data()?.role === "System Admin") {
    const remaining = await db.collection("users").where("role", "==", "System Admin").get();
    if (remaining.size <= 1) {
      throw new HttpsError("failed-precondition", "Can't delete the last System Admin.");
    }
  }

  try {
    await getAuth().deleteUser(cleanUid);
  } catch (error) {
    if (error.code !== "auth/user-not-found") {
      throw new HttpsError("internal", error.message || "Could not delete the account.");
    }
  }

  await db.collection("users").doc(cleanUid).delete();

  return { uid: cleanUid };
}

module.exports = { createUserAccount, setUserActive, deleteUserAccount, VALID_ROLES };
