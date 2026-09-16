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
  if (!VALID_ROLES.includes(role)) throw new HttpsError("invalid-argument", `Unknown role "${role}".`);

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

  const db = getFirestore();
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

module.exports = { createUserAccount, VALID_ROLES };
