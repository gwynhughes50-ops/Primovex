import assert from "node:assert/strict";
import { nameIndex, nameKey, planMerge, possibleDuplicates, whyPossiblySame } from "../src/modules/training/mergePeople.js";
import { planImport } from "../src/modules/training/trainingImport.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const person = (id, name, extra = {}) => ({ id, name, group: "clinical", uid: null, active: true, ...extra });
const rec = (personId, courseId, extra = {}) => ({ id: `${personId}_${courseId}`, personId, courseId, completedOn: "", dueOn: "", status: "", ...extra });

t("the same person under two forms of a first name is suggested, and people who merely share a surname are not", () => {
  assert.equal(whyPossiblySame(person("a", "Nicola Testington"), person("b", "Nicky Testington")), "the same name in a different form");
  assert.equal(whyPossiblySame(person("a", "Elizabeth Sample"), person("b", "Liz Sample")), "the same name in a different form");
  assert.equal(whyPossiblySame(person("a", "Katherine Sample"), person("b", "Katy Sample")), "the same name in a different form");
  assert.equal(whyPossiblySame(person("a", "Alison Sample"), person("b", "Alice Sample")), "first names that start the same");
  assert.equal(whyPossiblySame(person("a", "Pat Sample"), person("b", "Pat Sample")), "the same name");
  assert.equal(whyPossiblySame(person("a", "Nicola Testington"), person("b", "Nicola Other")), "", "a different surname");
  assert.equal(whyPossiblySame(person("a", "Anna Sample"), person("b", "Ben Sample")), "", "different first names");
  assert.equal(whyPossiblySame(person("a", "Sample"), person("b", "Sample")), "", "no first name to go on");
  const pairs = possibleDuplicates([person("1", "Nicola Testington"), person("2", "Nicky Testington"), person("3", "Ben Sample"), person("4", "Pat Sample"), person("5", "Patricia Sample")]);
  assert.equal(pairs.length, 2);
  assert.ok(pairs.some((p) => p.a.id === "1" && p.b.id === "2"));
  assert.ok(pairs.some((p) => p.a.id === "4" && p.b.id === "5"));
});

t("a pair that has already been joined is not suggested again", () => {
  const kept = person("1", "Nicola Testington", { aliases: ["Nicky Testington"] });
  assert.deepEqual(possibleDuplicates([kept, person("2", "Nicky Testington")]), []);
});

t("joining keeps the person chosen, takes the later date for each course, and never replaces a 'not required' or 'away' mark", () => {
  const keep = person("p-nicola", "Nicola Testington", { uid: "u1" });
  const other = person("p-nicky", "Nicky Testington");
  const records = [
    rec("p-nicola", "c-fire", { dueOn: "2026-01-01" }), rec("p-nicky", "c-fire", { dueOn: "2027-06-01" }),       // theirs is later: taken
    rec("p-nicola", "c-ig", { dueOn: "2028-01-01" }), rec("p-nicky", "c-ig", { dueOn: "2026-02-01" }),           // ours is later: kept
    rec("p-nicky", "c-cpr", { completedOn: "2025-03-01" }),                                                     // only theirs: moved
    rec("p-nicola", "c-moving", { status: "not-required" }), rec("p-nicky", "c-moving", { dueOn: "2030-01-01" }), // our mark stays
    rec("p-nicola", "c-same", { dueOn: "2027-01-01" }), rec("p-nicky", "c-same", { dueOn: "2027-01-01" }),
    rec("p-other-person", "c-fire", { dueOn: "2099-01-01" }),
  ];
  const plan = planMerge(keep, other, records);
  assert.deepEqual(plan.writes.map((w) => [w.personId, w.courseId, w.dueOn || w.completedOn]).sort(), [["p-nicola", "c-cpr", "2025-03-01"], ["p-nicola", "c-fire", "2027-06-01"]]);
  assert.ok(plan.writes.every((w) => w.group === "clinical" && w.ownerUid === "u1"), "they carry the kept person's team and account");
  assert.deepEqual(plan.counts, { kept: 2, taken: 1, onlyOther: 1, same: 1 });
  assert.deepEqual(plan.deletes.sort(), ["p-nicky_c-cpr", "p-nicky_c-fire", "p-nicky_c-ig", "p-nicky_c-moving", "p-nicky_c-same"], "every record of the other person goes, and nobody else's");
  assert.equal(plan.deletePersonId, "p-nicky");
  assert.deepEqual(plan.person.aliases, ["Nicky Testington"], "the other name is remembered");
  assert.equal(plan.person.name, "Nicola Testington");
});

t("the kept person gains the other's account when they had none, and stays active if either is", () => {
  const plan = planMerge(person("a", "Liz Sample", { active: false }), person("b", "Elizabeth Sample", { uid: "u9", aliases: ["Beth Sample"] }), [rec("a", "c1", { dueOn: "2027-01-01" })]);
  assert.equal(plan.person.uid, "u9");
  assert.equal(plan.person.active, true);
  assert.deepEqual(plan.person.aliases, ["Elizabeth Sample", "Beth Sample"]);
  assert.deepEqual(plan.relink, { ownerUid: "u9", courseIds: ["c1"] }, "their older dates follow the account");
  const away = planMerge(person("a", "A One"), person("b", "A Two"), [rec("a", "c1"), rec("b", "c1", { status: "on-leave" })]);
  assert.deepEqual(away.writes.map((w) => w.status), ["on-leave"], "an empty record takes the other's mark");
  assert.throws(() => planMerge(person("a", "A"), person("a", "A"), []), /two different/);
  assert.throws(() => planMerge(null, person("a", "A"), []), /two people/);
});

t("an import of the same spreadsheet does not bring the other name back as a new person", () => {
  const existing = {
    courses: [{ id: "c-fire", name: "Fire" }],
    people: [person("p-nicola", "Nicola Testington", { aliases: ["Nicky Testington"] })],
    records: [rec("p-nicola", "c-fire", { dueOn: "2026-01-01" })],
  };
  const parsed = {
    courses: [{ id: "c-fire", name: "Fire", category: "x", intervalMonths: 12 }],
    people: [{ id: "p-nicky-testington", name: "Nicky Testington", group: "clinical", jobRole: "Nurse", active: true }, { id: "p-new-person", name: "New Person", group: "admin", active: true }],
    records: [{ personId: "p-nicky-testington", courseId: "c-fire", dueOn: "2027-06-01" }, { personId: "p-new-person", courseId: "c-fire", dueOn: "2027-01-01" }],
  };
  const plan = planImport(parsed, existing);
  assert.deepEqual(plan.newPeople.map((p) => p.name), ["New Person"], "only the genuinely new person is added");
  assert.deepEqual(plan.records.map((r) => [r.personId, r.dueOn]).sort(), [["p-new-person", "2027-01-01"], ["p-nicola", "2027-06-01"]], "and the later date lands on the person it belongs to");
  // names are compared ignoring case and punctuation
  assert.equal(nameKey("  NICKY  testington. "), "nickytestington");
  assert.equal(nameIndex(existing.people).get("nickytestington").id, "p-nicola");
});

console.log(`\n${n} passed`);
