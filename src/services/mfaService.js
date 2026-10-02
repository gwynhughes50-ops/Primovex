import {
  getMultiFactorResolver,
  multiFactor,
  sendEmailVerification,
  TotpMultiFactorGenerator,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { accountLabel, cleanCode, isValidCode } from "@/lib/mfaHelpers";

// Authenticator-app (TOTP) sign-in. TOTP costs nothing per sign-in (SMS does),
// and the second factor is checked by Firebase Auth itself, not by app code.
//
// Nothing here changes how anyone signs in until they enrol an authenticator
// app: the sign-in screens only show the code step when Firebase answers a
// password sign-in with "second factor required", which only happens for an
// enrolled account.

const ISSUER = "Primovex";

// --- Signing in ------------------------------------------------------------

export function resolverFromError(error) {
  return getMultiFactorResolver(auth, error);
}

function totpHint(resolver) {
  return resolver?.hints?.find((hint) => hint.factorId === TotpMultiFactorGenerator.FACTOR_ID) || null;
}

// Whether this sign-in can be completed with an authenticator app (an account
// may in future carry a different factor type).
export function canResolveWithTotp(resolver) {
  return Boolean(totpHint(resolver));
}

// Completes a password sign-in that Firebase held back for a second factor.
// Resolves to the normal UserCredential.
export async function resolveSignInWithTotp(resolver, code) {
  const hint = totpHint(resolver);
  if (!hint) throw new Error("This account doesn't have an authenticator app set up.");
  if (!isValidCode(code)) {
    const error = new Error("Enter the 6-digit code from your authenticator app.");
    error.code = "primovex/bad-code-format";
    throw error;
  }
  const assertion = TotpMultiFactorGenerator.assertionForSignIn(hint.uid, cleanCode(code));
  return resolver.resolveSignIn(assertion);
}

// --- Enrolling / removing --------------------------------------------------

export function enrolledTotpFactors(user = auth.currentUser) {
  if (!user) return [];
  return multiFactor(user).enrolledFactors.filter((factor) => factor.factorId === TotpMultiFactorGenerator.FACTOR_ID);
}

// Step 1: a fresh secret for this user, plus the otpauth:// link that becomes
// the QR code. Nothing is saved to the account until the code is confirmed.
export async function beginTotpEnrolment(user = auth.currentUser) {
  if (!user) throw new Error("You need to be signed in.");
  const session = await multiFactor(user).getSession();
  const secret = await TotpMultiFactorGenerator.generateSecret(session);
  return {
    secret,
    secretKey: secret.secretKey,
    otpauthUrl: secret.generateQrCodeUrl(accountLabel(user.email), ISSUER),
  };
}

// Step 2: the person types the code their app now shows; that proves the app
// is set up correctly, and only then is the factor added.
export async function completeTotpEnrolment(secret, code, user = auth.currentUser, name = "Authenticator app") {
  if (!user) throw new Error("You need to be signed in.");
  if (!isValidCode(code)) {
    const error = new Error("Enter the 6-digit code from your authenticator app.");
    error.code = "primovex/bad-code-format";
    throw error;
  }
  const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, cleanCode(code));
  await multiFactor(user).enroll(assertion, name);
}

export async function removeTotpFactor(factorUid, user = auth.currentUser) {
  if (!user) throw new Error("You need to be signed in.");
  const factor = multiFactor(user).enrolledFactors.find((item) => item.uid === factorUid);
  if (!factor) return;
  await multiFactor(user).unenroll(factor);
}

// Firebase only lets an account with a verified email add a second factor.
export async function sendVerificationEmail(user = auth.currentUser) {
  if (!user) throw new Error("You need to be signed in.");
  await sendEmailVerification(user);
}
