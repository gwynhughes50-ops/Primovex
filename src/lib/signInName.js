// Signing in without an email address. Some people (a cleaner, say) have none, so they sign in with a short "sign-in name". Behind the
// scenes it is an address at a domain that can never receive mail, which is how Firebase Auth accepts it; the person only ever types the
// name. The same rules are enforced by the server (functions/services/userAccountService.js).

export const NO_EMAIL_DOMAIN = "no-email.invalid";
export const SIGN_IN_NAME = /^[a-z0-9][a-z0-9._-]{2,29}$/;

export const signInNameProblem = (name) => (SIGN_IN_NAME.test(String(name || "").trim().toLowerCase()) ? "" : "A sign-in name is 3 to 30 letters, numbers, dots, dashes or underscores, starting with a letter or number (for example cherryl.blair).");

// a first suggestion from a person's name: "Cherryl Blair" -> "cherryl.blair"
export function suggestSignInName(displayName) {
  const words = String(displayName || "").toLowerCase().replace(/[^a-z0-9\s'-]/g, "").replace(/['']/g, "").split(/[\s-]+/).filter(Boolean);
  return words.join(".").slice(0, 30).replace(/\.+$/, "");
}

// What to send to Firebase Auth for whatever was typed on the sign-in page: an email stays as it is, a sign-in name becomes its address,
// and anything else is not usable ("")
export function loginAddress(typed) {
  const text = String(typed || "").trim();
  if (!text) return "";
  if (text.includes("@")) return text;
  const name = text.toLowerCase();
  return SIGN_IN_NAME.test(name) ? `${name}@${NO_EMAIL_DOMAIN}` : "";
}

export const isSignInAddress = (address) => String(address || "").toLowerCase().endsWith(`@${NO_EMAIL_DOMAIN}`);
