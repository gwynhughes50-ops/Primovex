// Covers the pure authenticator-app (TOTP) helpers in src/lib/mfaHelpers.js.
import assert from "node:assert/strict";
import { accountLabel, cleanCode, friendlyMfaError, isMfaRequiredError, isValidCode, needsVerifiedEmail } from "../src/lib/mfaHelpers.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };

t("isMfaRequiredError: only Firebase's second-factor challenge", () => {
  assert.equal(isMfaRequiredError({ code: "auth/multi-factor-auth-required" }), true);
  assert.equal(isMfaRequiredError({ code: "auth/wrong-password" }), false);
  assert.equal(isMfaRequiredError(null), false);
});

t("cleanCode: keeps the digits, drops spaces and dashes, caps at six", () => {
  assert.equal(cleanCode("123 456"), "123456");
  assert.equal(cleanCode(" 12-34-56 "), "123456");
  assert.equal(cleanCode("1234567890"), "123456");
  assert.equal(cleanCode(null), "");
  assert.equal(cleanCode("abc"), "");
});

t("isValidCode: exactly six digits once cleaned", () => {
  assert.equal(isValidCode("123 456"), true);
  assert.equal(isValidCode("12345"), false);
  assert.equal(isValidCode(""), false);
});

t("friendlyMfaError: plain English, no raw codes", () => {
  for (const code of [
    "auth/invalid-verification-code", "auth/operation-not-allowed", "auth/unverified-email",
    "auth/requires-recent-login", "auth/too-many-requests", "auth/network-request-failed",
  ]) {
    const text = friendlyMfaError({ code, message: "Firebase: Error (" + code + ")." });
    assert.ok(text.length > 20, code);
    assert.ok(!text.includes("auth/"), code);
    assert.ok(!/^Firebase/i.test(text), code);
  }
  assert.match(friendlyMfaError({ code: "auth/invalid-verification-code" }), /code wasn't right/);
  assert.match(friendlyMfaError({ code: "auth/operation-not-allowed" }), /administrator/);
});
t("friendlyMfaError: an unknown Firebase error becomes a generic message", () => {
  assert.equal(friendlyMfaError({ code: "auth/weird", message: "Firebase: Error (auth/weird)." }), "Something went wrong. Please try again.");
  assert.equal(friendlyMfaError(undefined), "Something went wrong. Please try again.");
});
t("friendlyMfaError: a deliberate app message is passed through", () => {
  assert.equal(friendlyMfaError(new Error("This account has no authenticator app.")), "This account has no authenticator app.");
});

t("needsVerifiedEmail", () => {
  assert.equal(needsVerifiedEmail({ code: "auth/unverified-email" }), true);
  assert.equal(needsVerifiedEmail({ code: "auth/other" }), false);
});

t("accountLabel: the email, or a fallback", () => {
  assert.equal(accountLabel(" a@b.nhs.uk "), "a@b.nhs.uk");
  assert.equal(accountLabel(""), "Primovex account");
});

console.log(`\n${n} passed`);
