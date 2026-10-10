import assert from "node:assert/strict";
import { scoreUser, searchUsers } from "../src/lib/userSearch.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };

const u = (displayName, email) => ({ displayName, email: email || `${displayName.toLowerCase().replace(/\s+/g, ".")}@wales.nhs.uk` });
const team = [
  u("Abi Ellis"), u("Abigail Evans"), u("Alan Ellis"), u("Craig Davies"), u("Ellis Jones"), u("Elaine Price"),
  u("Gwyn Hughes"), u("Hayley Morgan"), u("Ben Jones"), u("Benjamin Hart"), u("Zoë O'Neill"), { displayName: "", email: "reception@wales.nhs.uk" },
];
const names = (query) => searchUsers(team, query).map((x) => x.displayName || x.email);

t("nothing typed leaves the list exactly as it was", () => {
  assert.equal(searchUsers(team, ""), team);
  assert.equal(searchUsers(team, "   "), team);
  assert.equal(searchUsers(team), team);
});

t("the first letters bring people to the top and drop everyone else", () => {
  assert.deepEqual(names("ab"), ["Abi Ellis", "Abigail Evans"]);
  assert.deepEqual(names("c"), ["Craig Davies"]);
  assert.equal(names("zzz").length, 0);
});

t("carrying on typing the name and then the surname narrows to the right person", () => {
  assert.deepEqual(names("abi"), ["Abi Ellis", "Abigail Evans"]);
  assert.deepEqual(names("abi "), ["Abi Ellis", "Abigail Evans"]);
  assert.deepEqual(names("abi e"), ["Abi Ellis", "Abigail Evans"]);
  assert.deepEqual(names("abi el"), ["Abi Ellis"]);
  assert.deepEqual(names("abi ellis"), ["Abi Ellis"]);
  assert.deepEqual(names("abigail"), ["Abigail Evans"]);
});

t("a first name beats the same word as a surname, and the whole word beats the start of one", () => {
  assert.deepEqual(names("ellis"), ["Ellis Jones", "Abi Ellis", "Alan Ellis"], "Ellis as a first name first, then the Ellises");
  assert.equal(names("ben")[0], "Ben Jones", "the whole word Ben before Benjamin");
  assert.deepEqual(names("jones"), ["Ben Jones", "Ellis Jones"]);
});

t("the surname first, either way round, and email style, all find her", () => {
  assert.deepEqual(names("ellis abi"), ["Abi Ellis"]);
  assert.deepEqual(names("abi.ellis"), ["Abi Ellis"]);
  assert.deepEqual(names("ABI ELLIS"), ["Abi Ellis"]);
  assert.deepEqual(names("  abi   ellis  "), ["Abi Ellis"]);
});

t("accents and apostrophes don't get in the way", () => {
  assert.deepEqual(names("zoe"), ["Zoë O'Neill"]);
  assert.deepEqual(names("zoë"), ["Zoë O'Neill"]);
  assert.deepEqual(names("o'neill"), ["Zoë O'Neill"]);
  assert.deepEqual(names("zoe o"), ["Zoë O'Neill"]);
});

t("someone with no name is found by their email, and the email finds people too", () => {
  assert.deepEqual(names("recep"), ["reception@wales.nhs.uk"]);
  assert.deepEqual(names("craig.d"), ["Craig Davies"]);
  assert.equal(searchUsers([u("Pat Smith", "psmith@wales.nhs.uk")], "psm").length, 1);
});

t("a run of letters inside a name is a last resort, ranked below any real match", () => {
  const rows = searchUsers(team, "llis");
  assert.deepEqual(rows.map((x) => x.displayName), ["Abi Ellis", "Alan Ellis", "Ellis Jones"].sort((a, b) => a.localeCompare(b)));
  assert.ok(scoreUser(u("Abi Ellis"), "llis") < scoreUser(u("Abi Ellis"), "ab"));
});

t("a tie falls back to name order, and the role or anything else is left alone", () => {
  assert.deepEqual(searchUsers([u("Bea Cook"), u("Bea Adams")], "bea").map((x) => x.displayName), ["Bea Adams", "Bea Cook"]);
  assert.equal(searchUsers([{ displayName: "Abi Ellis", email: "a@b.c", role: "Nurse" }], "nurse").length, 0);
});

console.log(`\n${n} passed`);
