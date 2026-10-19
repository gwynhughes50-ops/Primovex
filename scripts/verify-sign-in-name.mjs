import assert from "node:assert/strict";
import { NO_EMAIL_DOMAIN, isSignInAddress, loginAddress, signInNameProblem, suggestSignInName } from "../src/lib/signInName.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };

t("what is typed on the sign-in page: an email stays, a sign-in name becomes its address, nonsense is refused", () => {
  assert.equal(loginAddress("gwyn.hughes@wales.nhs.uk"), "gwyn.hughes@wales.nhs.uk");
  assert.equal(loginAddress("  Gwyn@Example.com "), "Gwyn@Example.com", "an email is passed on as typed");
  assert.equal(loginAddress("cherryl.blair"), `cherryl.blair@${NO_EMAIL_DOMAIN}`);
  assert.equal(loginAddress("Cherryl.Blair"), `cherryl.blair@${NO_EMAIL_DOMAIN}`, "a sign-in name is not case sensitive");
  assert.equal(loginAddress(""), "");
  assert.equal(loginAddress("ab"), "", "too short to be a sign-in name");
  assert.equal(loginAddress("two words"), "");
});

t("a sign-in name is checked in words", () => {
  assert.equal(signInNameProblem("cherryl.blair"), "");
  assert.equal(signInNameProblem("Cherryl.Blair"), "", "case is ignored");
  assert.match(signInNameProblem("ab"), /3 to 30 letters/);
  assert.match(signInNameProblem("has space"), /3 to 30 letters/);
  assert.match(signInNameProblem(".leading"), /3 to 30 letters/);
});

t("a name is suggested from the person's name", () => {
  assert.equal(suggestSignInName("Cherryl Blair"), "cherryl.blair");
  assert.equal(suggestSignInName("  Mary-Jane  O'Neil "), "mary.jane.oneil");
  assert.equal(suggestSignInName("Elizabeth Wood-Brignall"), "elizabeth.wood.brignall");
  assert.equal(suggestSignInName(""), "");
  assert.ok(suggestSignInName("A Very Long Name Indeed Which Goes On And On").length <= 30);
});

t("an address made from a sign-in name is recognised as one", () => {
  assert.equal(isSignInAddress(`cherryl@${NO_EMAIL_DOMAIN}`), true);
  assert.equal(isSignInAddress("someone@wales.nhs.uk"), false);
});

console.log(`\n${n} passed`);
