// A shift that people on "only these shifts" work (the morning desk) is theirs alone: nobody else is put on it, by the build, by hand, by a swap or as cover.
import assert from "node:assert/strict";
import { DAYS, DEFAULT_SETTINGS, DEFAULT_SHIFTS, mayTakeShift, newPerson, onlyOwnersOf, shiftById } from "../src/modules/rota/rotaModel.js";
import { generateWeek, shiftIdOfKey } from "../src/modules/rota/rotaEngine.js";
import { checkWeek, setPlace } from "../src/modules/rota/rotaWeek.js";
import { takeProblem } from "../src/modules/rota/rotaSwap.js";
import { absenceProblem } from "../src/modules/rota/rotaModel.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const person = (uid, name, extra = {}) => ({ ...newPerson(uid, name), ...extra });
const rules = {
  shifts: DEFAULT_SHIFTS.map((s) => ({ ...s })),
  settings: { ...DEFAULT_SETTINGS },
  people: [
    person("dave", "Dave", { mode: "usual", shift: "desk", coverShifts: ["early1", "early2", "mid", "late", "desk2"] }),
    person("emily", "Emily"), person("kim", "Kim"), person("lewis", "Lewis"), person("libby", "Libby"), person("lucy", "Lucy"), person("helen", "Helen"), person("jack", "Jack", { mode: "fixed", shift: "admin2" }),
    person("karenb", "Karen B", { mode: "only", onlyShifts: ["desk2"], days: ["wed", "thu", "fri"] }),
    person("debbie", "Debbie", { mode: "only", onlyShifts: ["desk2"], days: ["tue", "wed", "thu"] }),
  ],
};
const desk2 = shiftById(rules, "desk2");
const MON = "2026-11-16";

t("who owns a shift on their own, and who may take it", () => {
  assert.deepEqual(onlyOwnersOf(rules, desk2).map((p) => p.name), ["Karen B", "Debbie"]);
  assert.equal(mayTakeShift(rules, rules.people.find((p) => p.uid === "debbie"), desk2), true);
  assert.equal(mayTakeShift(rules, rules.people.find((p) => p.uid === "kim"), desk2), false);
  assert.equal(mayTakeShift(rules, rules.people.find((p) => p.uid === "dave"), desk2), false, "not even someone with a usual shift who is set to cover it");
  assert.equal(mayTakeShift(rules, rules.people.find((p) => p.uid === "kim"), shiftById(rules, "early1")), true, "a shift nobody owns is open to everyone");
  assert.deepEqual(onlyOwnersOf({ people: [] }, desk2), []);
});

t("the build never puts anyone else on the morning desk, whoever is off", () => {
  for (const absences of [[], [{ uid: "karenb", from: "2026-11-18", to: "2026-11-20", reason: "leave" }, { uid: "debbie", from: "2026-11-17", to: "2026-11-19", reason: "leave" }]]) {
    const week = generateWeek({ rules, mondayIso: MON, absences });
    for (const day of DAYS) for (const [key, a] of Object.entries(week.days[day].slots)) if (shiftIdOfKey(key) === "desk2") assert.equal(["karenb", "debbie"].includes(a.uid), true, `${day}: ${a.uid} on the morning desk`);
  }
});

t("a place fixed by hand for someone else is cleared when the week is built again", () => {
  const week = generateWeek({ rules, mondayIso: MON, locked: { tue: { "desk2#2": "kim" } } });
  assert.equal(Object.values(week.days.tue.slots).some((a) => a.uid === "kim" && false), false);
  assert.equal(week.days.tue.slots["desk2#2"]?.uid === "kim", false);
  assert.match(week.issues.map((i) => i.text).join("\n"), /Kim was placed on Desk\/phones \(morning\) by hand, but that shift is only for Karen B and Debbie, so the place was cleared\./);
});

t("a week with someone else on it is flagged, and the swap rules refuse it", () => {
  const week = generateWeek({ rules, mondayIso: MON });
  const hand = setPlace(week, rules, "mon", "desk2#1", "kim");
  assert.match(checkWeek(rules, hand, []).filter((i) => i.severity === "gap").map((i) => i.text).join("\n"), /Monday: Kim is on Desk\/phones \(morning\), which is only for Karen B and Debbie\./);
  const owner = setPlace(week, rules, "tue", "desk2#1", "debbie");
  assert.equal(checkWeek(rules, owner, []).some((i) => /only for/.test(i.text)), false);
  assert.match(takeProblem(rules, rules.people.find((p) => p.uid === "kim"), desk2, "mon"), /belongs to others/);
  assert.match(takeProblem(rules, rules.people.find((p) => p.uid === "dave"), desk2, "mon"), /only for/);
  assert.equal(takeProblem(rules, rules.people.find((p) => p.uid === "debbie"), desk2, "tue"), "");
});

t("changing time off: the same checks as adding it", () => {
  assert.equal(absenceProblem({ uid: "u", from: "2026-12-01", to: "2026-12-04", reason: "leave" }), "");
  assert.match(absenceProblem({ uid: "", from: "2026-12-01", reason: "leave" }), /Choose who is off/);
  assert.match(absenceProblem({ uid: "u", from: "2026-12-05", to: "2026-12-04", reason: "leave" }), /cannot be before/);
  assert.match(absenceProblem({ uid: "u", from: "2026-12-05", fromTime: "14:00", toTime: "13:00", reason: "leave" }), /back must be after/);
  assert.match(absenceProblem({ uid: "u", from: "2026-12-05", reason: "sickness" }), /Choose a reason/);
});

console.log(`\n${n} checks passed`);
