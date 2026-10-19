const { getAuth } = require("firebase-admin/auth");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const { HttpsError } = require("firebase-functions/v2/https");
const { randomInt } = require("node:crypto");

// Some people (a cleaner, say) have no email address. They sign in with a short "sign-in name" instead: behind the scenes it is an
// address at a domain that can never receive mail, so Firebase Auth accepts it, and the person types only the name. They get a
// temporary password from the administrator and must choose their own the first time they sign in.
const NO_EMAIL_DOMAIN = "no-email.invalid";
const SIGN_IN_NAME = /^[a-z0-9][a-z0-9._-]{2,29}$/;
const signInNameProblem = (name) => (SIGN_IN_NAME.test(String(name || "")) ? "" : "A sign-in name is 3 to 30 letters, numbers, dots, dashes or underscores, starting with a letter or number (for example cherryl.blair).");
const addressFor = (signInName) => `${String(signInName).toLowerCase()}@${NO_EMAIL_DOMAIN}`;

// 12 characters in three groups, from letters and numbers that can't be mistaken for each other (no 0/O, 1/l/I), e.g. "k7Qm-4xPd-9Wzr"
const PASSWORD_CHARS = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function generateTemporaryPassword(pick = randomInt) {
  const group = () => Array.from({ length: 4 }, () => PASSWORD_CHARS[pick(PASSWORD_CHARS.length)]).join("");
  return `${group()}-${group()}-${group()}`;
}

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
async function createUserAccount({ displayName, email, signInName, role, creatorUid }) {
  const cleanName = String(displayName || "").trim();
  const noEmail = !String(email || "").trim() && Boolean(String(signInName || "").trim());
  const cleanSignIn = noEmail ? String(signInName).trim().toLowerCase() : "";
  const cleanEmail = noEmail ? addressFor(cleanSignIn) : String(email || "").trim().toLowerCase();
  if (!cleanName) throw new HttpsError("invalid-argument", "Enter a display name.");
  if (noEmail) {
    const problem = signInNameProblem(cleanSignIn);
    if (problem) throw new HttpsError("invalid-argument", problem);
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || cleanEmail.endsWith(`@${NO_EMAIL_DOMAIN}`)) {
    throw new HttpsError("invalid-argument", "Enter a valid email address.");
  }

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
  const temporaryPassword = noEmail ? generateTemporaryPassword() : "";
  let userRecord;
  try {
    userRecord = await auth.createUser({ email: cleanEmail, displayName: cleanName, ...(noEmail ? { password: temporaryPassword } : {}) });
  } catch (error) {
    if (error.code === "auth/email-already-exists") {
      throw new HttpsError("already-exists", noEmail ? "That sign-in name is already taken. Try another." : "An account with this email already exists.");
    }
    throw new HttpsError("internal", error.message || "Could not create the account.");
  }

  await db.collection("users").doc(userRecord.uid).set({
    displayName: cleanName,
    email: cleanEmail,
    role,
    createdAt: FieldValue.serverTimestamp(),
    createdByUid: creatorUid || null,
    ...(noEmail ? { noEmail: true, signInName: cleanSignIn, mustChangePassword: true } : {}),
  });

  if (noEmail) return { uid: userRecord.uid, signInName: cleanSignIn, temporaryPassword };
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

// Firebase password-set links expire after one hour and that can't be
// extended, so an account whose link wasn't used in time needs a fresh one —
// this is the admin's way to issue it. Whoever holds the link can set that
// account's password, so a System Admin account's link can only be issued by
// another System Admin (otherwise admin.access alone would be a route to
// taking over the highest-privilege account).
// A new temporary password, handed over in person (or by phone): for someone with no email address, and for anyone whose reset email does not
// arrive (mail systems often block it). They must choose their own at their next sign-in; anything they are signed in on is signed out.
async function setTemporaryPassword({ uid, callerRole }) {
  const cleanUid = String(uid || "");
  if (!cleanUid) throw new HttpsError("invalid-argument", "Missing user id.");
  const db = getFirestore();
  const profile = await db.collection("users").doc(cleanUid).get();
  if (!profile.exists) throw new HttpsError("not-found", "That account has no Primovex profile.");
  const data = profile.data() || {};
  if (data.role === "System Admin" && callerRole !== "System Admin") throw new HttpsError("permission-denied", "Only a System Admin can reset a System Admin's password.");
  if (data.active === false) throw new HttpsError("failed-precondition", "This account is deactivated: reactivate it first.");
  const temporaryPassword = generateTemporaryPassword();
  try {
    await getAuth().updateUser(cleanUid, { password: temporaryPassword });
    await getAuth().revokeRefreshTokens(cleanUid);
  } catch (error) {
    if (error.code === "auth/user-not-found") throw new HttpsError("not-found", "That account no longer exists.");
    throw new HttpsError("internal", error.message || "Could not set a new password.");
  }
  await db.collection("users").doc(cleanUid).set({ mustChangePassword: true }, { merge: true });
  return { uid: cleanUid, signInName: data.noEmail ? data.signInName || "" : "", email: data.noEmail ? "" : data.email || "", temporaryPassword };
}

async function createPasswordLink({ uid, callerRole }) {
  const cleanUid = String(uid || "");
  if (!cleanUid) throw new HttpsError("invalid-argument", "Missing user id.");

  const db = getFirestore();
  const profile = await db.collection("users").doc(cleanUid).get();
  if (!profile.exists) throw new HttpsError("not-found", "That account has no Primovex profile.");
  const data = profile.data() || {};

  if (data.role === "System Admin" && callerRole !== "System Admin") {
    throw new HttpsError("permission-denied", "Only a System Admin can reset a System Admin's password.");
  }
  if (data.active === false) {
    throw new HttpsError("failed-precondition", "This account is deactivated — reactivate it before issuing a password link.");
  }

  let record;
  try {
    record = await getAuth().getUser(cleanUid);
  } catch (error) {
    if (error.code === "auth/user-not-found") throw new HttpsError("not-found", "That account no longer exists.");
    throw new HttpsError("internal", error.message || "Could not look up the account.");
  }
  if (!record.email) throw new HttpsError("failed-precondition", "This account has no email address.");
  if (record.disabled) throw new HttpsError("failed-precondition", "This account is disabled — reactivate it first.");

  const link = await getAuth().generatePasswordResetLink(record.email);
  return { uid: cleanUid, email: record.email, link };
}

// Who may reset whose two-step sign-in (authenticator app). Pure, so the rule
// can be tested without Firebase. An administrator resets someone who has lost
// their phone; it is never available for your own account (you can only call
// this signed in, i.e. past the second step already) and only a real System
// Admin may do it to another System Admin.
function mfaResetDecision({ callerUid, callerRole, targetUid, targetRole }) {
  if (!targetUid) return { allowed: false, code: "invalid-argument", message: "Missing user id." };
  if (callerUid && callerUid === targetUid) {
    return { allowed: false, code: "failed-precondition", message: "You can't reset your own two-step sign-in. Ask another administrator." };
  }
  if (targetRole === "System Admin" && callerRole !== "System Admin") {
    return { allowed: false, code: "permission-denied", message: "Only a System Admin can reset a System Admin's two-step sign-in." };
  }
  return { allowed: true };
}

// Removes every authenticator app from an account and signs it out everywhere,
// so the person can sign in with their password and set a new one up. The
// sign-out matters when the reason is a lost or stolen phone.
async function resetUserMfa({ uid, callerUid, callerRole }) {
  const cleanUid = String(uid || "");
  const db = getFirestore();
  const profile = cleanUid ? await db.collection("users").doc(cleanUid).get() : null;
  if (cleanUid && !profile.exists) throw new HttpsError("not-found", "That account has no Primovex profile.");

  const decision = mfaResetDecision({ callerUid, callerRole, targetUid: cleanUid, targetRole: profile?.data()?.role });
  if (!decision.allowed) throw new HttpsError(decision.code, decision.message);

  let record;
  try {
    record = await getAuth().getUser(cleanUid);
  } catch (error) {
    if (error.code === "auth/user-not-found") throw new HttpsError("not-found", "That account no longer exists.");
    throw new HttpsError("internal", error.message || "Could not look up the account.");
  }
  const enrolled = record.multiFactor?.enrolledFactors || [];
  if (enrolled.length === 0) {
    throw new HttpsError("failed-precondition", "This account doesn't have two-step sign-in set up.");
  }

  await getAuth().updateUser(cleanUid, { multiFactor: { enrolledFactors: null } });
  await getAuth().revokeRefreshTokens(cleanUid);
  return { uid: cleanUid, email: record.email || "", removed: enrolled.length };
}

module.exports = { NO_EMAIL_DOMAIN, signInNameProblem, addressFor, generateTemporaryPassword, setTemporaryPassword, createUserAccount, setUserActive, deleteUserAccount, createPasswordLink, resetUserMfa, mfaResetDecision, VALID_ROLES };
