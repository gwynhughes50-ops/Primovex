import assert from "node:assert/strict";
import { cleanInitials, identityFields, identityLabel, identityProblems, ukDob, validDob } from "../src/modules/governance/patientIdentity.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const now = new Date(2026, 9, 21, 9, 0);

t("initials are letters only, upper case, and a sensible length", () => {
  assert.equal(cleanInitials("a. b"), "AB");
  assert.equal(cleanInitials(" j-s "), "JS");
  assert.equal(cleanInitials("123"), "");
  assert.equal(cleanInitials("abcdefghij"), "ABCDEF");
  assert.equal(cleanInitials(null), "");
});

t("a date of birth must be a real day in the past", () => {
  assert.ok(validDob("1980-02-29", now), "1980 was a leap year");
  assert.ok(!validDob("1981-02-29", now));
  assert.ok(!validDob("1980-13-01", now));
  assert.ok(!validDob("2026-10-22", now), "tomorrow");
  assert.ok(validDob("2026-10-21", now), "today (a newborn)");
  assert.ok(!validDob("1850-01-01", now));
  assert.ok(!validDob("12/03/1980", now), "only yyyy-mm-dd");
  assert.ok(!validDob("", now));
  assert.equal(ukDob("1980-03-12"), "12/03/1980");
  assert.equal(ukDob("nonsense"), "");
});

t("a SAR needs EMIS, initials and date of birth; a concern needs initials and date of birth", () => {
  const full = { emisNumber: "123456", patientInitials: "AB", dateOfBirth: "1980-03-12" };
  assert.deepEqual(identityProblems(full, { emisRequired: true, now }), []);
  assert.deepEqual(identityProblems({ ...full, emisNumber: "" }, { now }), [], "a concern may have no EMIS number");
  assert.equal(identityProblems({ ...full, emisNumber: "" }, { emisRequired: true, now }).length, 1);
  assert.deepEqual(identityProblems({ emisNumber: "123" }, { now }), ["Give the patient's initials.", "Give the patient's date of birth."]);
  assert.match(identityProblems({ ...full, dateOfBirth: "1980-02-31" }, { now })[0], /not a real date/);
});

t("an older record that never had them can still be edited, but a date that is given must be real", () => {
  assert.deepEqual(identityProblems({ emisNumber: "123" }, { emisRequired: true, needed: false, now }), []);
  assert.match(identityProblems({ emisNumber: "123", dateOfBirth: "2999-01-01" }, { emisRequired: true, needed: false, now })[0], /not a real date/);
});

t("what is saved is tidy, and a bad date is not saved", () => {
  assert.deepEqual(identityFields({ emisNumber: " 123 ", patientInitials: "a.b.", dateOfBirth: "1980-03-12" }), { emisNumber: "123", patientInitials: "AB", dateOfBirth: "1980-03-12" });
  assert.equal(identityFields({ dateOfBirth: "1980-02-31" }).dateOfBirth, "");
  assert.deepEqual(identityFields({}), { emisNumber: "", patientInitials: "", dateOfBirth: "" });
});

t("lists show EMIS and initials; the case page and print add the date of birth", () => {
  const rec = { emisNumber: "123456", patientInitials: "AB", dateOfBirth: "1980-03-12" };
  assert.equal(identityLabel(rec), "EMIS 123456 · AB");
  assert.equal(identityLabel(rec, { withDob: true }), "EMIS 123456 · AB · born 12/03/1980");
  assert.equal(identityLabel({ patientInitials: "AB", dateOfBirth: "1980-03-12" }, { withDob: true }), "AB · born 12/03/1980", "a concern without an EMIS number");
  assert.equal(identityLabel({ emisNumber: "123456" }), "EMIS 123456", "an older record with only an EMIS number");
  assert.equal(identityLabel({}), "No patient identifier");
});

console.log(`\n${n} passed`);
