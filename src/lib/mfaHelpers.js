// Pure helpers for authenticator-app (TOTP) sign-in. Kept free of any Firebase
// import so they can be tested directly; the Firebase calls live in
// src/services/mfaService.js.

export const MFA_REQUIRED_CODE = "auth/multi-factor-auth-required";

export function isMfaRequiredError(error) {
  return error?.code === MFA_REQUIRED_CODE;
}

// People type or paste codes with spaces ("123 456"); only the digits matter.
export function cleanCode(value) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 6);
}

export function isValidCode(value) {
  return /^\d{6}$/.test(cleanCode(value));
}

// Plain-English wording for the errors Firebase can raise while enrolling or
// signing in with an authenticator app. Never shows a raw error code.
export function friendlyMfaError(error) {
  switch (error?.code) {
    case "auth/invalid-verification-code":
    case "auth/code-expired":
      return "That code wasn't right. Open your authenticator app, wait for a fresh code and try again.";
    case "auth/operation-not-allowed":
    case "auth/second-factor-not-supported":
      return "Authenticator-app sign-in hasn't been switched on for Primovex yet. Ask your administrator.";
    case "auth/unverified-email":
      return "Your email address needs verifying before you can add an authenticator app. Send yourself a verification email below, open the link, then try again.";
    case "auth/requires-recent-login":
      return "For your security, please sign out and sign back in, then try again.";
    case "auth/second-factor-already-in-use":
      return "This authenticator app is already set up on your account.";
    case "auth/maximum-second-factor-count-exceeded":
      return "You already have the maximum number of authenticator apps on this account.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a few minutes and try again.";
    case "auth/network-request-failed":
      return "No connection. Check your network and try again.";
    default:
      return error?.message && !/^Firebase/i.test(error.message)
        ? error.message
        : "Something went wrong. Please try again.";
  }
}

// Whether a Firebase error means "email not verified yet" (so the screen can
// offer to send the verification email).
export function needsVerifiedEmail(error) {
  return error?.code === "auth/unverified-email";
}

// "Primovex (gwyn.hughes@wales.nhs.uk)" is what shows in the authenticator app.
export function accountLabel(email) {
  return String(email || "").trim() || "Primovex account";
}
