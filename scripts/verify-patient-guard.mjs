// Covers the patient-identity guard (src/ai/guard/patientGuard.js): what it refuses, what it must let through, and that staff names are fine.
import assert from "node:assert/strict";
import { checkText, findIdentifiers } from "../src/ai/guard/patientGuard.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const kinds = (text, options) => findIdentifiers(text, options).map((p) => p.kind);

t("names are refused: titles, first names with surnames, patients 'called' someone, in any case", () => {
  for (const text of [
    "Mrs Jones has complained about her letter", "Please help me word a reply to Margaret Smith", "the patient called John Davies rang again", "patient Mary said she was cold",
    "write to margaret jones about her results", "Master Evans was brought in by his dad", "Dr Patel was rude at the desk", "she is called Aisha", "Mr. Hussain wants a copy", "named Gareth Price",
    "a complaint from Siobhan about the wait", "the daughter, Rhiannon, called",
  ]) assert.ok(kinds(text).includes("name"), `should refuse: ${text}`);
});

t("other ways of identifying someone are refused: NHS number, phone, email, postcode, street address", () => {
  assert.deepEqual(kinds("Her NHS number is 943 476 5919"), ["nhsNumber"]);
  assert.deepEqual(kinds("NHS 9434765919 needs a letter"), ["nhsNumber"]);
  assert.ok(kinds("call her on 07700 900123").includes("phone"));
  assert.ok(kinds("ring +44 7700 900123").includes("phone"));
  assert.deepEqual(kinds("email j.smith@example.com"), ["email"]);
  assert.ok(kinds("lives at 12 High Street").includes("address"));
  assert.ok(kinds("flat 3, 45 Station Road").includes("address"));
  assert.ok(kinds("postcode CF10 1AA").includes("postcode"));
  assert.ok(kinds("cf101aa").includes("postcode"), "with no space and in lower case too");
});

t("what Primovex does use is fine: EMIS number, initials, date of birth, and everyday questions", () => {
  for (const text of [
    "SAR for EMIS 1234567, patient JS, born 04/05/1960, needs a holding letter", "EMIS 9434765919 needs a letter", "Which stock is low?", "Count the gloves, I have 12", "Remind me on Monday to ring the pharmacy",
    "Take me to the SARs", "Are all fridges OK today?", "How many SARs are outstanding?", "I used one pack of gauze", "I have received 20 chlorphenamine ampoules",
    "I miss the deadline sometimes", "Where is the master list of fridges?", "Fridge 2 in the Treatment Room is warm", "The Staff Kitchen hot tap failed its check", "amoxicillin 500mg is low",
    "In March the Health Board visit is due", "the June audit", "Please Mark it as done", "Mark the box as checked", "Early 1 and Late on the rota", "when did we last test the fire alarm",
    "BD blue needles need ordering", "Cardiff and Vale Health Board", "the complaint is about waiting times", "patient needs a letter", "client wants a copy", "the patient JS rang",
  ]) assert.deepEqual(findIdentifiers(text), [], `should pass: ${text}`);
});

t("staff names are allowed: a colleague can be messaged, looked up and named, a stranger with the same first name still cannot", () => {
  const allow = ["Sam Price", "Craig Davies", "Ben Lane", "Margaret Hughes"];
  assert.deepEqual(findIdentifiers("Tell Sam the fridge needs checking", { allow }), []);
  assert.deepEqual(findIdentifiers("when did Craig Davies last log in", { allow }), []);
  assert.deepEqual(findIdentifiers("Dr Lane has asked for the SAR list", { allow }), []);
  assert.deepEqual(findIdentifiers("message Margaret about the rota", { allow }), []);
  assert.ok(kinds("when did Craig last log in").includes("name"), "without the staff list it is refused (the app lets staff lookups through)");
  assert.ok(kinds("Margaret Jones phoned about her letter", { allow }).includes("name"), "a patient with a colleague's first name");
  assert.ok(kinds("Dr Patel was rude", { allow }).includes("name"));
});

t("the message says what was found, quotes it so it can be fixed, and says what to do instead", () => {
  const out = checkText("Please help me word a reply to Margaret Smith, NHS number 943 476 5919");
  assert.equal(out.ok, false);
  assert.match(out.message, /^I can't process this because it looks like it contains a person's name and an NHS number \(“Margaret Smith”, “943 476 5919”\)\./);
  assert.match(out.message, /EMIS number, a date of birth and initials/);
  assert.match(out.message, /Please change it and try again\.$/);
  assert.equal(checkText("Which stock is low?").ok, true);
  assert.equal(checkText("").ok, true);
  assert.equal(checkText(undefined).ok, true);
});

t("a long message with several problems quotes three and says there are more", () => {
  const out = checkText("Mrs Jones, Mr Evans, Mrs Taylor and Mr Brown all rang");
  assert.match(out.message, /and more\)/);
});

console.log(`\n${n} passed`);
