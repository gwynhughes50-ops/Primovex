// Covers surgery closures on the reception rota: the main surgery and the branch surgery shut for whole days or part days, and the rota built, checked, printed and published around them.
import assert from "node:assert/strict";
import { CLOSURE_SITES, DAYS, DEFAULT_SETTINGS, DEFAULT_SHIFTS, closedText, closureProblem, closureSignature, dayClosures, newPerson, openPartOf, siteOfShift } from "../src/modules/rota/rotaModel.js";
import { generateWeek, generateWeeks, shiftIdOfKey } from "../src/modules/rota/rotaEngine.js";
import { checkWeek, closuresChangedSince, setPlace, slotsOfDay, withNames } from "../src/modules/rota/rotaWeek.js";
import { buildRotaHtml, weekSheet } from "../src/modules/rota/rotaExport.js";
import { isPublishedCurrent, projectPublished, publishedDays } from "../src/modules/rota/rotaPublish.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };

const person = (uid, name, extra = {}) => ({ ...newPerson(uid, name), ...extra });
const ALL_LATEST = Object.fromEntries(DAYS.map((d) => [d, "18:30"]));
const rules = {
  shifts: DEFAULT_SHIFTS.map((s) => ({ ...s })),
  settings: { ...DEFAULT_SETTINGS },
  people: [
    person("dave", "Dave", { mode: "usual", shift: "desk", coverShifts: ["early1", "early2", "mid", "late"], cannotDo: ["tyelan"] }),
    person("jack", "Jack", { mode: "fixed", shift: "admin2" }),
    person("helen", "Helen", { earliest: { mon: "09:00", tue: "08:00", wed: "08:00", thu: "09:00", fri: "09:00" }, latest: ALL_LATEST, maxPerWeek: { late: 1 } }),
    person("emily", "Emily"), person("kim", "Kim"), person("lewis", "Lewis"), person("libby", "Libby"), person("lucy", "Lucy"),
    person("karenl", "Karen L"),
    person("karenb", "Karen B", { mode: "only", onlyShifts: ["desk2"], days: ["wed", "thu", "fri"] }),
    person("tess", "Tess", { mode: "fixed", shift: "tyelan" }),
  ],
};
const MON = "2026-11-16";
const iso = (day) => ({ mon: "2026-11-16", tue: "2026-11-17", wed: "2026-11-18", thu: "2026-11-19", fri: "2026-11-20" }[day]);
const placed = (week, day) => Object.entries(week.days[day].slots).map(([key, a]) => ({ key, shiftId: shiftIdOfKey(key), ...a }));
const build = (closures, extra = {}) => generateWeek({ rules, mondayIso: MON, closures, ...extra });

// ---- what a closure is ----
t("the Ty Elan shift is the branch's and every other shift is the main surgery's, until a shift says otherwise", () => {
  assert.equal(siteOfShift({ id: "tyelan" }), "branch");
  assert.equal(siteOfShift({ id: "early1" }), "main");
  assert.equal(siteOfShift({ id: "early1", site: "branch" }), "branch");
  assert.equal(siteOfShift({ id: "tyelan", site: "main" }), "main");
  assert.equal(siteOfShift({ id: "x", site: "somewhere" }), "main");
});

t("a closure gives its stretch on each day it covers, both surgeries for 'both', and nothing on other days", () => {
  const c = [{ site: "both", from: "2026-11-16", to: "2026-11-17", fromTime: "14:00", toTime: "10:00", reason: "building" }];
  assert.deepEqual(dayClosures(c, "2026-11-16"), [{ from: 840, reason: "building", site: "branch", until: 1440 }, { from: 840, reason: "building", site: "main", until: 1440 }]);
  assert.deepEqual(dayClosures(c, "2026-11-17"), [{ from: 0, reason: "building", site: "branch", until: 600 }, { from: 0, reason: "building", site: "main", until: 600 }]);
  assert.deepEqual(dayClosures(c, "2026-11-18"), []);
  assert.deepEqual(dayClosures([{ site: "main", from: "2026-11-16", reason: "bank" }], "2026-11-16"), [{ from: 0, reason: "bank", site: "main", until: 1440 }]);
  assert.deepEqual(dayClosures([{ site: "main", from: "2026-11-16", reason: "nonsense" }], "2026-11-16")[0].reason, "other");
  assert.deepEqual(dayClosures([{ site: "elsewhere", from: "2026-11-16", reason: "bank" }], "2026-11-16"), []);
  assert.deepEqual(dayClosures([{ site: "main", from: "2026-11-16", fromTime: "15:00", toTime: "14:00", reason: "bank" }], "2026-11-16"), [], "a stretch that ends before it starts is ignored");
});

t("what a closure leaves of a shift: nothing, all of it, or the open part", () => {
  const early = { id: "early1", start: "08:00", end: "16:30" };
  const day = (from, until) => [{ site: "main", from, until, reason: "bank" }];
  assert.equal(openPartOf([], early) && Object.keys(openPartOf([], early)).length, 0, "no closure leaves the shift whole");
  assert.deepEqual(openPartOf(day(0, 1440), early), null, "shut all day");
  assert.deepEqual(openPartOf(day(750, 1440), early), { until: "12:30" }, "shut from 12:30");
  assert.deepEqual(openPartOf(day(0, 600), early), { from: "10:00" }, "opens at 10");
  assert.deepEqual(openPartOf(day(0, 600), { id: "mid", start: "09:30", end: "18:00" }), { from: "10:00" });
  assert.deepEqual(openPartOf(day(540, 1440), early), { until: "09:00" }, "an hour open is kept");
  assert.deepEqual(openPartOf(day(510, 1440), early), null, "under an hour open is shut");
  assert.deepEqual(openPartOf(day(600, 720), early), { from: "12:00" }, "a gap in the middle keeps the longer open stretch (12:00 to 16:30)");
  assert.deepEqual(openPartOf([{ site: "branch", from: 0, until: 1440, reason: "bank" }], early), {}, "a closure at the other surgery does not touch it");
  assert.deepEqual(openPartOf([{ site: "branch", from: 0, until: 1440, reason: "bank" }], { id: "tyelan", start: "08:30", end: "17:00" }), null);
});

t("how a closure reads, and what the form accepts", () => {
  const c = dayClosures([{ site: "main", from: iso("wed"), fromTime: "12:30", reason: "training" }], iso("wed"));
  assert.equal(closedText(c, "main"), "from 12:30");
  assert.equal(closedText(c, "branch"), "");
  assert.equal(closedText(dayClosures([{ site: "main", from: iso("wed"), reason: "bank" }], iso("wed")), "main"), "all day");
  assert.equal(closedText(dayClosures([{ site: "main", from: iso("wed"), toTime: "10:00", reason: "bank" }], iso("wed")), "main"), "until 10:00");
  assert.equal(closedText(dayClosures([{ site: "main", from: iso("wed"), fromTime: "13:00", toTime: "14:00", reason: "bank" }], iso("wed")), "main"), "13:00–14:00");
  assert.equal(closureProblem({ site: "branch", from: iso("mon"), reason: "bank" }), "");
  assert.match(closureProblem({ site: "", from: iso("mon"), reason: "bank" }), /Choose which surgery/);
  assert.match(closureProblem({ site: "both", from: "", reason: "bank" }), /first day/);
  assert.match(closureProblem({ site: "both", from: iso("tue"), to: iso("mon"), reason: "bank" }), /last day cannot be before/);
  assert.match(closureProblem({ site: "both", from: iso("mon"), fromTime: "13:00", toTime: "12:00", reason: "bank" }), /reopens must be after/);
  assert.match(closureProblem({ site: "both", from: iso("mon"), reason: "holiday" }), /Choose a reason/);
  assert.match(closureProblem({ site: "both", from: iso("mon"), fromTime: "9am", reason: "bank" }), /times from the list/);
  assert.deepEqual(Object.keys(CLOSURE_SITES), ["main", "branch", "both"]);
});

// ---- the build ----
t("with no closures the build is exactly what it was", () => {
  const plain = generateWeek({ rules, mondayIso: MON });
  assert.deepEqual(build([]).days, plain.days);
  assert.equal(JSON.stringify(plain).includes("closed"), false, "nothing about closures appears when there are none");
});

t("the branch surgery shut all day: Ty Elan is not staffed, nobody is made a gap, the rest of the day is as usual", () => {
  const week = build([{ site: "branch", from: iso("tue"), reason: "bank" }]);
  const tue = placed(week, "tue");
  assert.equal(tue.some((p) => p.shiftId === "tyelan"), false);
  assert.equal(Object.keys(week.days.tue.slots).length > 0, true);
  assert.equal(week.days.tue.unfilled.includes("tyelan"), false, "a closed shift is not 'unfilled'");
  assert.equal(week.days.tue.closed.length, 1);
  assert.equal(week.days.tue.closed[0].site, "branch");
  assert.equal(week.days.mon.closed, undefined, "other days carry no closure");
  assert.equal(checkWeek(rules, week, []).some((i) => i.severity === "gap" && i.day === "tue"), false, "a closure is not a gap");
  const text = week.issues.map((i) => i.text).join("\n");
  assert.match(text, /Tuesday: the branch surgery is closed all day \(Bank holiday\), so Ty Elan is not staffed\./);
  assert.match(text, /Tuesday: Tess would be on Ty Elan, which is closed, so has no shift\./);
  assert.equal(placed(week, "mon").some((p) => p.shiftId === "tyelan"), true, "Monday is untouched");
});

t("the main surgery shut all day: everything at the main surgery is unstaffed, only the branch is staffed", () => {
  const week = build([{ site: "main", from: iso("mon"), reason: "bank" }]);
  const mon = placed(week, "mon");
  assert.deepEqual(mon.map((p) => p.shiftId), ["tyelan"]);
  assert.equal(week.days.mon.unfilled.length, 0);
  assert.equal(checkWeek(rules, week, []).some((i) => i.severity === "gap" && i.day === "mon"), false);
  assert.match(week.issues.map((i) => i.text).join("\n"), /Monday: the main surgery is closed all day \(Bank holiday\), so .*Early 1.*are not staffed/);
  assert.match(week.issues.map((i) => i.text).join("\n"), /Monday: .* is not needed because of the closure\./);
});

t("both surgeries shut: nobody is on, and the day says so once, not once for every person", () => {
  const week = build([{ site: "both", from: iso("fri"), reason: "bank" }]);
  assert.equal(Object.keys(week.days.fri.slots).length, 0);
  const fri = week.issues.filter((i) => i.day === "fri");
  assert.equal(fri.filter((i) => /is closed all day/.test(i.text)).length, 2, "one line for each surgery");
  assert.equal(fri.some((i) => /has no shift \(more people than shifts\)/.test(i.text)), false);
  assert.equal(checkWeek(rules, week, []).some((i) => i.severity === "gap"), false);
});

t("a training afternoon at the main surgery: shifts that run into it are cut to the open hours and the places say so", () => {
  const week = build([{ site: "main", from: iso("wed"), fromTime: "12:30", reason: "training" }]);
  const wed = placed(week, "wed");
  assert.equal(wed.find((p) => p.shiftId === "early1").until, "12:30", "Early 1 (8 to 4.30) is cut at 12.30");
  assert.equal(wed.find((p) => p.shiftId === "late").until, "12:30", "the Late (10 to 6.30) is open 10 to 12.30, over an hour, so it is cut rather than dropped");
  assert.equal(wed.find((p) => p.shiftId === "tyelan").until, undefined, "the branch is not touched");
});

t("a shift left with under an hour is dropped, and one with an hour or more is cut", () => {
  const kept = placed(build([{ site: "main", from: iso("wed"), fromTime: "11:00", reason: "training" }]), "wed");
  assert.equal(kept.find((p) => p.shiftId === "late").until, "11:00", "Late would be open 10 to 11: an hour is kept");
  const week = build([{ site: "main", from: iso("wed"), fromTime: "10:30", reason: "training" }]);
  const wed = placed(week, "wed");
  assert.equal(wed.some((p) => p.shiftId === "late"), false, "Late would be open 10 to 10.30, under an hour: not staffed");
  assert.equal(wed.find((p) => p.shiftId === "early1").until, "10:30");
  assert.equal(wed.some((p) => p.shiftId === "tyelan"), true, "the branch is not touched");
});

t("opening late: shifts that start before the surgery opens start when it does", () => {
  const week = build([{ site: "main", from: iso("thu"), toTime: "10:00", reason: "building" }]);
  const thu = placed(week, "thu");
  const early = thu.find((p) => p.shiftId === "early1");
  assert.equal(early.from, "10:00");
  assert.equal(thu.find((p) => p.shiftId === "late").from, undefined, "Late starts at 10 anyway");
});

t("a closure and someone's own time off together: they are in for what is left of both", () => {
  const absences = [{ uid: "helen", from: iso("wed"), to: iso("wed"), fromTime: "11:30", reason: "leave" }];
  const week = generateWeek({ rules, mondayIso: MON, absences, closures: [{ site: "main", from: iso("wed"), fromTime: "13:00", reason: "training" }] });
  for (const p of placed(week, "wed").filter((x) => x.uid === "helen")) assert.equal(p.until <= "11:30", true, "Helen is never put on past her time off");
  for (const p of placed(week, "wed").filter((x) => x.shiftId !== "tyelan" && x.until)) assert.equal(p.until <= "13:00", true, "nobody is on at the main surgery after it shuts");
});

t("a place fixed by hand on a shift that is now closed is cleared, with a note", () => {
  const first = build([]);
  const key = Object.keys(first.days.tue.slots).find((k) => shiftIdOfKey(k) === "tyelan");
  const hand = setPlace({ mondayIso: MON, days: first.days, edited: {} }, rules, "tue", key, "tess");
  const again = build([{ site: "branch", from: iso("tue"), reason: "building" }], { locked: { tue: { [key]: "tess" } } });
  assert.equal(placed(again, "tue").some((p) => p.shiftId === "tyelan"), false);
  assert.match(again.issues.map((i) => i.text).join("\n"), /Tess was placed on Ty Elan by hand but the branch surgery is closed then, so the place was cleared\./);
  assert.ok(hand.edited[`tue|${key}`]);
});

t("a multi-week build carries the closures into the right weeks and the history stays fair", () => {
  const built = generateWeeks({ rules, firstMonday: MON, weeks: 3, closures: [{ site: "both", from: "2026-11-24", to: "2026-11-25", reason: "training" }] });
  assert.equal(built[0].days.tue.closed, undefined);
  assert.equal(built[1].days.tue.closed.length, 2);
  assert.equal(Object.keys(built[1].days.tue.slots).length + Object.keys(built[1].days.wed.slots).length, 0);
  assert.equal(Object.keys(built[2].days.tue.slots).length > 0, true);
});

// ---- the check, the shape of a week, and what has changed ----
t("slotsOfDay leaves out a closed shift and cuts the rest, and says nothing different without closures", () => {
  const closed = dayClosures([{ site: "main", from: iso("wed"), fromTime: "12:30", reason: "training" }, { site: "branch", from: iso("wed"), reason: "bank" }], iso("wed"));
  const all = slotsOfDay(rules, "wed");
  const some = slotsOfDay(rules, "wed", closed);
  assert.equal(some.some((s) => s.shift.id === "tyelan"), false);
  assert.equal(some.find((s) => s.shift.id === "early1").shift.end, "12:30");
  assert.deepEqual(some.find((s) => s.shift.id === "early1").trim, { until: "12:30" });
  assert.equal(all.find((s) => s.shift.id === "early1").shift.end, "16:30", "the rules themselves are not changed");
  assert.deepEqual(slotsOfDay(rules, "wed", []).map((s) => s.key), all.map((s) => s.key));
});

t("a closure entered after the week was built is noticed, and so is someone left on a closed shift", () => {
  const week = build([]);
  const closures = [{ site: "branch", from: iso("tue"), reason: "bank" }];
  assert.equal(closuresChangedSince(week, []), false);
  assert.equal(closuresChangedSince(week, closures), true);
  const key = Object.keys(week.days.tue.slots).find((k) => shiftIdOfKey(k) === "tyelan");
  const withClosure = { ...week, days: { ...week.days, tue: { ...week.days.tue, closed: dayClosures(closures, iso("tue")) } } };
  assert.match(checkWeek(rules, withClosure, []).filter((i) => i.severity === "gap").map((i) => i.text).join("\n"), /Tuesday: .* is on Ty Elan, but the branch surgery is closed then\./);
  assert.ok(key);
  const rebuilt = build(closures);
  assert.equal(closuresChangedSince(rebuilt, closures), false);
  assert.equal(closuresChangedSince(rebuilt, []), true, "removing the closure also makes the week out of date");
  assert.equal(closureSignature(dayClosures(closures, iso("tue"))), closureSignature(JSON.parse(JSON.stringify(rebuilt.days.tue.closed))), "the signature survives being stored");
});

t("the check shows what a closure did, once a week is built", () => {
  const week = build([{ site: "main", from: iso("wed"), fromTime: "12:30", reason: "training" }]);
  assert.match(checkWeek(rules, week, []).map((i) => i.text).join("\n"), /Wednesday: the main surgery is closed from 12:30 \(Training or protected learning\), so .* cut to the open hours\./);
  assert.equal(checkWeek(rules, week, []).some((i) => /absorb/.test(i.text) && /12:30/.test(i.text)), false, "a place cut by a closure is not reported as someone being part-time");
});

t("hand changes keep working on a week with a closure", () => {
  const week = build([{ site: "branch", from: iso("tue"), reason: "bank" }]);
  const key = Object.keys(week.days.mon.slots).find((k) => shiftIdOfKey(k) === "tyelan");
  const moved = setPlace(week, rules, "tue", "mid", "kim");
  assert.equal(moved.days.tue.unfilled.includes("tyelan"), false, "a closed shift never appears as empty after a change");
  assert.ok(key);
});

// ---- printing, Excel and the team's phones ----
t("the printout and the sheet say CLOSED for a closed shift and list the closures", () => {
  const week = withNames(build([{ site: "branch", from: iso("tue"), reason: "bank" }]), rules);
  const sheet = weekSheet(week, rules);
  const tyRow = sheet.rows.find((r) => /^Ty Elan/.test(r[0]));
  assert.equal(tyRow[2], "CLOSED");
  assert.notEqual(tyRow[1], "CLOSED");
  const last = sheet.rows[sheet.rows.length - 1];
  assert.equal(last[0], "Surgery closed");
  assert.equal(last[2], "Branch surgery all day");
  assert.match(buildRotaHtml([week], rules), /CLOSED/);
  const plain = weekSheet(withNames(build([]), rules), rules);
  assert.equal(plain.rows.some((r) => r.includes("CLOSED") || r[0] === "Surgery closed"), false);
});

t("what the team can see includes the closure (a bank holiday is not private), and a change to a closure marks the week as changed", () => {
  const week = build([{ site: "branch", from: iso("tue"), reason: "building" }]);
  const days = publishedDays(week, rules);
  assert.deepEqual(days.tue.closed, [{ site: "branch", from: 0, until: 1440, reason: "building" }]);
  assert.equal(days.mon.closed, undefined);
  const published = projectPublished(week, rules);
  assert.equal(isPublishedCurrent(week, published, rules), true);
  assert.equal(isPublishedCurrent(build([]), published, rules), false, "the closure was removed since it was published");
  const reordered = JSON.parse(JSON.stringify({ ...published, days: Object.fromEntries(Object.entries(published.days).map(([d, v]) => [d, Object.fromEntries(Object.entries(v).sort(([a], [b]) => b.localeCompare(a)))])) }));
  assert.equal(isPublishedCurrent(week, reordered, rules), true, "the database may hand the fields back in another order");
});

console.log(`\n${n} checks passed`);
