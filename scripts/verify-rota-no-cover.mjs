// "Nobody, no cover needed": the person building the rota can say a shift needs nobody on a day. It is left empty, is not reported as a gap, and stays empty when the week is built again.
import assert from "node:assert/strict";
import { DAYS, DEFAULT_SETTINGS, DEFAULT_SHIFTS, newPerson } from "../src/modules/rota/rotaModel.js";
import { generateWeek, generateWeeks, shiftIdOfKey } from "../src/modules/rota/rotaEngine.js";
import { checkWeek, noCoverOf, setNoCover, setPlace, withNames } from "../src/modules/rota/rotaWeek.js";
import { weekSheet } from "../src/modules/rota/rotaExport.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const person = (uid, name, extra = {}) => ({ ...newPerson(uid, name), ...extra });
const rules = {
  shifts: DEFAULT_SHIFTS.map((s) => ({ ...s })),
  settings: { ...DEFAULT_SETTINGS },
  people: [person("dave", "Dave", { mode: "usual", shift: "desk", coverShifts: ["early1", "early2", "mid", "late"] }), person("jack", "Jack", { mode: "fixed", shift: "admin2" }),
    ...["emily", "kim", "lewis", "libby", "lucy", "helen", "karen", "sam"].map((u) => person(u, u[0].toUpperCase() + u.slice(1)))],
};
const MON = "2026-11-16";
const base = generateWeek({ rules, mondayIso: MON });
const on = (week, day, id) => Object.entries(week.days[day].slots).filter(([k]) => shiftIdOfKey(k) === id);

t("saying a shift needs nobody takes the person off, leaves no gap, and marks it as a choice", () => {
  assert.equal(on(base, "wed", "mid").length, 1);
  const week = setNoCover(base, rules, "wed", "mid", true);
  assert.equal(on(week, "wed", "mid").length, 0);
  assert.deepEqual(week.days.wed.noCover, ["mid"]);
  assert.equal(week.days.wed.unfilled.includes("mid"), false);
  assert.ok(week.edited["wed|mid"]);
  assert.equal(checkWeek(rules, week, []).some((i) => /Mid/.test(i.text) && /nobody|not staffed/.test(i.text)), false);
  // without the choice the same empty place is a gap
  const empty = setPlace(base, rules, "wed", "mid", "");
  assert.equal(checkWeek(rules, empty, []).some((i) => i.severity === "gap" && /Wednesday: nobody is on Mid/.test(i.text)), true);
});

t("putting a person back removes the choice, and it can be undone", () => {
  const week = setNoCover(base, rules, "wed", "mid", true);
  const back = setPlace(week, rules, "wed", "mid", "kim");
  assert.equal(back.days.wed.noCover, undefined);
  assert.equal(back.days.wed.slots.mid.uid, "kim");
  const off = setNoCover(week, rules, "wed", "mid", false);
  assert.equal(off.days.wed.noCover, undefined);
  assert.equal(off.days.wed.unfilled.includes("mid"), true);
});

t("building again leaves it empty, nobody else is moved onto it, and the rest of the week still gets built", () => {
  const week = setNoCover(base, rules, "thu", "late", true);
  const again = generateWeek({ rules, mondayIso: MON, noCover: noCoverOf(week) });
  assert.equal(on(again, "thu", "late").length, 0);
  assert.deepEqual(again.days.thu.noCover, ["late"]);
  assert.equal(again.days.thu.unfilled.includes("late"), false);
  assert.equal(again.issues.some((i) => i.severity === "gap"), false);
  assert.equal(on(again, "thu", "early1").length, 1);
  assert.deepEqual(noCoverOf(again), { thu: ["late"] });
  assert.equal(again.days.mon.noCover, undefined, "other days are untouched");
});

t("it works for one place of a shift with two, and across a multi-week build", () => {
  const built = generateWeeks({ rules, firstMonday: MON, weeks: 2, noCoverByWeek: { "2026-11-23": { tue: ["desk2#2"] } } });
  assert.equal(built[0].days.tue.noCover, undefined);
  assert.deepEqual(built[1].days.tue.noCover, ["desk2#2"]);
});

t("it survives the names being put on, shows in the Excel sheet and the printout, and is not a missing essential shift", () => {
  const week = withNames(setNoCover(base, rules, "fri", "early2", true), rules);
  assert.deepEqual(week.days.fri.noCover, ["early2"]);
  const row = weekSheet(week, rules).rows.find((r) => /^Early 2/.test(r[0]));
  assert.equal(row[DAYS.indexOf("fri") + 1], "No cover needed");
});

console.log(`\n${n} checks passed`);
