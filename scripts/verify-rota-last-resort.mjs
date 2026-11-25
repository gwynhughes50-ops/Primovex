// The morning desk (Desk/phones, 2 places) is filled LAST: Debbie and Karen, who work only that shift, always have it; anyone else is put on it only when they are in and have no other shift, after every
// other shift has been filled, so it is never filled at the cost of another.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DAYS, DEFAULT_SETTINGS, DEFAULT_SHIFTS, isLastResort, mayTakeShift, newPerson, shiftById } from "../src/modules/rota/rotaModel.js";
import { generateWeek, generateWeeks, shiftIdOfKey } from "../src/modules/rota/rotaEngine.js";
import { checkWeek } from "../src/modules/rota/rotaWeek.js";
import { takeProblem } from "../src/modules/rota/rotaSwap.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const person = (uid, name, extra = {}) => ({ ...newPerson(uid, name), ...extra });
const POOL = ["helen", "emily", "kim", "lewis", "libby", "lucy", "sam", "tess", "una"]; // nine people who rotate
const build = (poolIds, shifts = DEFAULT_SHIFTS) => ({
  shifts: shifts.map((s) => ({ ...s })),
  settings: { ...DEFAULT_SETTINGS },
  people: [
    person("dave", "Dave", { mode: "usual", shift: "desk", coverShifts: ["early1", "early2", "mid", "late"], cannotDo: ["tyelan"] }),
    person("jack", "Jack", { mode: "fixed", shift: "admin2" }),
    ...poolIds.map((u) => person(u, u[0].toUpperCase() + u.slice(1))),
    person("karen", "Karen Nurke", { mode: "only", onlyShifts: ["desk2"], days: ["wed", "thu", "fri"] }),
    person("debbie", "Debbie Humphries", { mode: "only", onlyShifts: ["desk2"], days: ["tue", "wed", "thu"] }),
  ],
});
const MON = "2026-11-16";
const day = (week, d, id) => Object.entries(week.days[d].slots).filter(([k]) => shiftIdOfKey(k) === id).map(([, a]) => a);
const others = (week, d) => Object.entries(week.days[d].slots).filter(([k]) => shiftIdOfKey(k) !== "desk2" && shiftIdOfKey(k) !== "desk" && shiftIdOfKey(k) !== "admin2");

t("the morning desk is a last-resort shift, and an older saved rota that never had the setting is treated the same", () => {
  assert.equal(isLastResort(shiftById({ shifts: DEFAULT_SHIFTS }, "desk2")), true);
  assert.equal(isLastResort({ id: "desk2" }), true, "no setting saved yet");
  assert.equal(isLastResort({ id: "desk2", lastResort: false }), false, "switched off");
  assert.equal(isLastResort({ id: "mid" }), false);
  assert.equal(isLastResort({ id: "mid", lastResort: true }), true, "any shift can be made one");
});

t("Debbie and Karen always have the morning desk on the days they are in, and nobody spare takes their places", () => {
  const rules = build(POOL);
  const week = generateWeek({ rules, mondayIso: MON });
  assert.deepEqual(day(week, "wed", "desk2").map((a) => a.name).sort(), ["Debbie Humphries", "Karen Nurke"]);
  assert.deepEqual(day(week, "thu", "desk2").map((a) => a.name).sort(), ["Debbie Humphries", "Karen Nurke"]);
  assert.equal(day(week, "wed", "desk2").every((a) => a.source === "usual"), true);
});

t("with more people in than the other shifts need, the open morning desk places go to the spare people, and only then", () => {
  const rules = build(POOL);
  const week = generateWeek({ rules, mondayIso: MON });
  // Monday: neither Debbie nor Karen is in, so both places are open; nine people rotate over seven other shifts, so two are spare
  const mon = day(week, "mon", "desk2");
  assert.equal(mon.length, 2);
  assert.equal(mon.every((a) => a.source === "spare"), true);
  assert.equal(new Set(mon.map((a) => a.uid)).size, 2, "two different people");
  // every other shift was still filled first
  for (const id of ["early1", "early2", "mid", "late", "admin1", "admin3", "tyelan"]) assert.equal(day(week, "mon", id).length, 1, id);
  // Tuesday: Debbie is in, one place is open
  assert.equal(day(week, "tue", "desk2").map((a) => a.source).sort().join(), "spare,usual");
  assert.match(week.issues.map((i) => i.text).join("\n"), /Monday: .* is on Desk\/phones \(morning\) because they are in and have no other shift: more people are in than the other shifts need\./);
});

t("it is never filled at the cost of another shift: with only just enough people, the morning desk is left empty", () => {
  const ESSENTIAL = ["early1", "early2", "mid", "late", "admin1", "tyelan"];
  const six = generateWeek({ rules: build(POOL.slice(0, 6)), mondayIso: MON });
  assert.equal(day(six, "mon", "desk2").length, 0);
  for (const id of ESSENTIAL) assert.equal(day(six, "mon", id).length, 1, id);
  assert.equal(six.issues.some((i) => i.severity === "gap"), false, "an empty morning desk is no gap");
  // seven people fill all seven rotating shifts: nobody is spare, so the desk is still empty
  const seven = generateWeek({ rules: build(POOL.slice(0, 7)), mondayIso: MON });
  assert.equal(day(seven, "mon", "admin3").length, 1);
  assert.equal(day(seven, "mon", "desk2").length, 0);
  // eight people: exactly one is spare, so exactly one place is filled
  const eight = generateWeek({ rules: build(POOL.slice(0, 8)), mondayIso: MON });
  assert.equal(day(eight, "mon", "desk2").length, 1);
  assert.equal(day(eight, "mon", "admin3").length, 1, "and the other shifts were filled first");
});

t("someone who is off, or who cannot do the hours, is not put on it, and a person with a weekly limit is held to it", () => {
  const rules = build(POOL);
  rules.people.find((p) => p.uid === "una").maxPerWeek = { desk: 1 };
  const absences = [{ uid: "tess", from: "2026-11-16", to: "2026-11-16", reason: "leave" }, { uid: "sam", from: "2026-11-16", to: "2026-11-16", fromTime: "09:00", reason: "other" }];
  const week = generateWeek({ rules, mondayIso: MON, absences });
  const on = day(week, "mon", "desk2").map((a) => a.uid);
  assert.equal(on.includes("tess"), false, "off all day");
  assert.equal(on.includes("sam"), false, "off from 9: they cannot do all of 8.30 to 10");
  const early = rules.people.find((p) => p.uid === "emily"); early.earliest = { mon: "09:00" };
  assert.equal(day(generateWeek({ rules, mondayIso: MON, absences }), "mon", "desk2").map((a) => a.uid).includes("emily"), false, "cannot start before 9");
  const weekly = generateWeek({ rules, mondayIso: MON });
  const una = DAYS.filter((d) => day(weekly, d, "desk2").some((a) => a.uid === "una"));
  assert.ok(una.length <= 1, "held to one a week");
});

t("the places are shared out fairly over the weeks, not always the same spare person", () => {
  const rules = build(POOL);
  const weeks = generateWeeks({ rules, firstMonday: MON, weeks: 6 });
  const tally = {};
  for (const w of weeks) for (const d of DAYS) for (const a of day(w, d, "desk2")) if (a.source === "spare") tally[a.uid] = (tally[a.uid] || 0) + 1;
  const counts = Object.values(tally);
  assert.ok(Object.keys(tally).length >= 5, "several different people share it");
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 4, "no one has it far more than the others: " + JSON.stringify(tally));
});

t("a spare person on the morning desk shows as a part shift (8.30 to 10), and it is checked like any other place", () => {
  const rules = build(POOL);
  const week = generateWeek({ rules, mondayIso: MON });
  assert.deepEqual(checkWeek(rules, week, []).filter((i) => i.severity === "gap"), [], "nothing needs attention");
  const spare = day(week, "mon", "desk2")[0];
  assert.equal(spare.from, undefined, "the shift is the whole of 8.30 to 10, so no part times");
});

t("anyone may be put on it by hand or swapped onto it, since it is open to spare staff", () => {
  const rules = build(POOL);
  const desk2 = shiftById(rules, "desk2");
  const kim = rules.people.find((p) => p.uid === "kim");
  assert.equal(mayTakeShift(rules, kim, desk2), true);
  assert.equal(takeProblem(rules, kim, desk2, "mon"), "");
  const strict = build(POOL, DEFAULT_SHIFTS.map((s) => (s.id === "desk2" ? { ...s, lastResort: false } : s)));
  assert.equal(mayTakeShift(strict, kim, shiftById(strict, "desk2")), false, "switched off, it is theirs alone again");
  assert.match(takeProblem(strict, kim, shiftById(strict, "desk2"), "mon"), /belongs to others/);
  const strictWeek = generateWeek({ rules: strict, mondayIso: MON });
  assert.equal(day(strictWeek, "mon", "desk2").length, 0, "nobody but Debbie and Karen");
});

t("any other shift can be made a last-resort shift too, and is then filled only by spare people", () => {
  const rules = build(POOL, DEFAULT_SHIFTS.map((s) => (s.id === "admin3" ? { ...s, lastResort: true } : s)));
  const full = generateWeek({ rules, mondayIso: MON });
  assert.equal(day(full, "mon", "admin3").length, 1, "with spare people it is filled");
  const tight = generateWeek({ rules: build(POOL.slice(0, 6), DEFAULT_SHIFTS.map((s) => (s.id === "admin3" ? { ...s, lastResort: true } : s))), mondayIso: MON });
  assert.equal(day(tight, "mon", "admin3").length, 0, "with only just enough people it is left empty, and the other shifts are all filled");
  assert.equal(others(tight, "mon").length >= 4, true);
  const seven = generateWeek({ rules: build(POOL.slice(0, 7), DEFAULT_SHIFTS.map((s) => (s.id === "admin3" ? { ...s, lastResort: true } : s))), mondayIso: MON });
  assert.equal(day(seven, "mon", "admin3").length, 1, "seven people fill the six other rotating shifts and the seventh is spare, so admin 3 is filled");
});

t("the shifts table has the setting, and an essential shift cannot be a last-resort shift", () => {
  const panel = readFileSync(new URL("../src/components/rota/RotaRulesPanel.jsx", import.meta.url), "utf8");
  assert.match(panel, /Spare staff only/);
  assert.match(panel, /is filled last, by spare staff/);
  assert.match(panel, /disabled=\{!canManage \|\| Boolean\(s\.essential\)\}/);
  assert.match(readFileSync(new URL("../src/modules/rota/rotaModel.js", import.meta.url), "utf8"), /id: "desk2".*lastResort: true/);
});

console.log(`\n${n} checks passed`);
