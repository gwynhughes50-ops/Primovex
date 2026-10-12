import assert from "node:assert/strict";
import { cleanContact, contactFromForm, hasContact, legacyContact, quickConcernSeed, validateContact, validateQuickConcern } from "../src/modules/governance/concernContact.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };

t("contact details are tidied and the email is lower case", () => {
  assert.deepEqual(cleanContact({ phone: "  07123   456789 ", email: " Jo@Example.COM ", preferred: "email" }), { phone: "07123 456789", email: "jo@example.com", preferred: "email" });
  assert.equal(cleanContact({ preferred: "post" }).preferred, "either");
  assert.equal(hasContact({ phone: "", email: " " }), false);
  assert.equal(hasContact({ email: "a@b.co" }), true);
});

t("a bad number or email is caught in words, a good one passes, empty is allowed", () => {
  assert.deepEqual(validateContact({ phone: "07123 456789", email: "jo@example.com" }), []);
  assert.deepEqual(validateContact({}), []);
  assert.match(validateContact({ phone: "0712" })[0], /10 to 13 digits/);
  assert.match(validateContact({ phone: "call me" })[0], /10 to 13 digits/);
  assert.match(validateContact({ phone: "+44 7123 456789" }).join(" ") || "ok", /ok/, "a +44 number is fine");
  assert.match(validateContact({ email: "not-an-email" })[0], /does not look right/);
  assert.match(validateContact({ email: "a@b.co", preferred: "phone" })[0], /no phone number/);
  assert.match(validateContact({ phone: "07123 456789", preferred: "email" })[0], /no email address/);
});

t("older cases' single contact value reads as a phone or an email", () => {
  assert.deepEqual(legacyContact({ raisedByContactMethod: "email", raisedByContactValue: "A@B.com" }), { phone: "", email: "a@b.com", preferred: "email" });
  assert.deepEqual(legacyContact({ raisedByContactMethod: "mobile", raisedByContactValue: "07123 456789" }), { phone: "07123 456789", email: "", preferred: "phone" });
  assert.deepEqual(legacyContact({ raisedByContactMethod: "none", raisedByContactValue: "x" }), { phone: "", email: "", preferred: "either" });
  assert.deepEqual(legacyContact({}), { phone: "", email: "", preferred: "either" });
});

t("the quick capture needs the patient's identifier, what it is about, and initials when it is not the patient", () => {
  const seed = quickConcernSeed(new Date(2026, 9, 12));
  assert.equal(seed.receivedAt, "2026-10-12");
  assert.equal(seed.source, "patient");
  assert.equal(validateQuickConcern(seed).length, 2, "identifier and summary");
  const ok = { ...seed, emisNumber: "123456", summary: "Waited a long time on the phone" };
  assert.deepEqual(validateQuickConcern(ok), []);
  assert.match(validateQuickConcern({ ...ok, source: "relative" })[0], /initials of the person raising/);
  assert.deepEqual(validateQuickConcern({ ...ok, source: "relative", raisedByInitials: "J.S." }), []);
  assert.deepEqual(validateQuickConcern({ ...seed, patientInitials: "AB", dateOfBirth: "1980-01-01", summary: "x" }), [], "initials and date of birth instead of EMIS");
  assert.match(validateQuickConcern({ ...ok, raisedByEmail: "nope" }).join(" "), /does not look right/);
});

t("the contact record comes from the form's fields", () => {
  assert.deepEqual(contactFromForm({ raisedByPhone: " 07123 456789", raisedByEmail: "X@y.org", raisedByPreferred: "phone" }), { phone: "07123 456789", email: "x@y.org", preferred: "phone" });
});

console.log(`\n${n} passed`);
