const test = require("node:test");
const assert = require("node:assert/strict");
const { NO_EMAIL_DOMAIN, addressFor, generateTemporaryPassword, signInNameProblem } = require("../services/userAccountService");

test("a sign-in name becomes an address that can never receive mail", () => {
  assert.equal(NO_EMAIL_DOMAIN, "no-email.invalid");
  assert.equal(addressFor("cherryl.blair"), "cherryl.blair@no-email.invalid");
  assert.equal(addressFor("Cherryl.Blair"), "cherryl.blair@no-email.invalid", "the name is not case sensitive");
});

test("a sign-in name is checked in words", () => {
  for (const ok of ["cherryl.blair", "cb1", "a-b_c.d", "x".repeat(30)]) assert.equal(signInNameProblem(ok), "", ok);
  for (const bad of ["", "ab", "x".repeat(31), "has space", "has@sign", ".leading", "-leading", "Capital", "ñame"]) assert.match(signInNameProblem(bad), /3 to 30 letters, numbers/, bad);
});

test("a temporary password is 12 characters in three groups, with nothing that can be mistaken for something else", () => {
  for (let i = 0; i < 200; i += 1) {
    const password = generateTemporaryPassword();
    assert.match(password, /^[a-hj-km-np-zA-HJ-NP-Z2-9]{4}-[a-hj-km-np-zA-HJ-NP-Z2-9]{4}-[a-hj-km-np-zA-HJ-NP-Z2-9]{4}$/, password);
    assert.ok(!/[0O1lI]/.test(password), password);
  }
  assert.notEqual(generateTemporaryPassword(), generateTemporaryPassword(), "each one is different");
});

test("the password uses the random source it is given (so it is tested without luck)", () => {
  let n = 0;
  assert.equal(generateTemporaryPassword(() => (n++) % 5), "abcd-eabc-deab");
});
