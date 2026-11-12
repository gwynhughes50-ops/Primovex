// Covers swapping shifts, asking for adjustments and what the team see (src/modules/rota/rotaSwap.js and rotaPublish.js).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DAYS, DEFAULT_SETTINGS, DEFAULT_SHIFTS, newPerson } from "../src/modules/rota/rotaModel.js";
import { generateWeeks } from "../src/modules/rota/rotaEngine.js";
import { withNames } from "../src/modules/rota/rotaWeek.js";
import { ADJUSTMENT_KINDS, adjustmentAbsence, adjustmentText, placeMinutes, swapOptions, swapPlaces, takeProblem, weekMinutes } from "../src/modules/rota/rotaSwap.js";
import { dayRoster, isPublishedCurrent, myShifts, projectPublished, publishedDays } from "../src/modules/rota/rotaPublish.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const person = (uid, name, extra = {}) => ({ ...newPerson(uid, name), ...extra });
const LATEST = Object.fromEntries(DAYS.map((d) => [d, "18:30"]));
const rules = {
  shifts: DEFAULT_SHIFTS.map((s) => ({ ...s })),
  settings: { ...DEFAULT_SETTINGS },
  people: [
    person("dave", "Dave", { mode: "usual", shift: "desk", coverShifts: ["early1", "early2", "mid", "late"], cannotDo: ["tyelan"] }),
    person("jack", "Jack", { mode: "fixed", shift: "admin2" }),
    person("helen", "Helen", { earliest: { mon: "09:00", tue: "08:00", wed: "08:00", thu: "09:00", fri: "09:00" }, latest: LATEST, maxPerWeek: { late: 1 } }),
    person("emily", "Emily"), person("kim", "Kim"), person("lewis", "Lewis"), person("libby", "Libby"), person("lucy", "Lucy"),
    person("karenl", "Karen L", { dayRules: { wed: { shift: "group:early", until: "12:00" } } }),
    person("karenb", "Karen B", { mode: "only", onlyShifts: ["desk2"], days: ["wed", "thu", "fri"] }),
    person("debbie", "Debbie", { mode: "only", onlyShifts: ["desk2"], days: ["tue", "wed", "thu"] }),
  ],
};
const FIRST = "2026-11-16";
const build = (count, absences = []) => Object.fromEntries(generateWeeks({ rules, firstMonday: FIRST, weeks: count, absences }).map((w) => [w.mondayIso, { ...withNames(w, rules), edited: {} }]));
const weeks = build(3);
const at = (monday, day, key) => ({ monday, day, key });
const whoIs = (w, day, key) => w.days[day].slots[key]?.uid;
// two people on different shifts on the same day who may swap: from the first week's Monday
const pair = (monday, day) => {
  const slots = Object.entries(weeks[monday].days[day].slots).filter(([, a]) => ["emily", "kim", "lewis", "libby", "lucy"].includes(a.uid));
  return [slots[0], slots[1]];
};

t("a swap on the same day between two people with the same freedom: both places change, hours stay the same, both are marked as changed by hand", () => {
  const [[ka, pa], [kb, pb]] = pair(FIRST, "mon");
  const r = swapPlaces({ rules, weeks, absences: [], a: at(FIRST, "mon", ka), b: at(FIRST, "mon", kb) });
  assert.equal(r.ok, true, r.problems.join("; "));
  assert.equal(r.changesHours, false, "every full shift is 8.5 hours");
  assert.equal(whoIs(r.weeks[FIRST], "mon", ka), pb.uid);
  assert.equal(whoIs(r.weeks[FIRST], "mon", kb), pa.uid);
  assert.equal(r.weeks[FIRST].edited[`mon|${ka}`], true);
  assert.equal(r.weeks[FIRST].edited[`mon|${kb}`], true);
  assert.equal(whoIs(weeks[FIRST], "mon", ka), pa.uid, "the saved week is not changed by checking");
  assert.deepEqual(r.hours, []);
});

t("a swap that breaks someone's rules is not possible, and says why: Helen cannot start before 9 on a Monday, and only has one late a week", () => {
  const helenMon = Object.entries(weeks[FIRST].days.mon.slots).find(([, a]) => a.uid === "helen")[0];
  const early = Object.entries(weeks[FIRST].days.mon.slots).find(([k, a]) => ["early1", "early2"].includes(k) && a.uid !== "helen");
  const r = swapPlaces({ rules, weeks, absences: [], a: at(FIRST, "mon", helenMon), b: at(FIRST, "mon", early[0]) });
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((x) => /Helen cannot do Early [12]/.test(x)), r.problems.join("; "));
  // a second late for Helen in the same week
  const lateDay = DAYS.find((d) => weeks[FIRST].days[d].slots.late?.uid !== "helen" && !Object.values(weeks[FIRST].days).some((x) => x.slots.late?.uid === "helen" && false));
  const helenLateDay = DAYS.find((d) => weeks[FIRST].days[d].slots.late?.uid === "helen");
  const other = DAYS.find((d) => d !== helenLateDay && weeks[FIRST].days[d].slots.late);
  const helenKey = Object.entries(weeks[FIRST].days[other].slots).find(([, a]) => a.uid === "helen")[0];
  const r2 = swapPlaces({ rules, weeks, absences: [], a: at(FIRST, other, helenKey), b: at(FIRST, other, "late") });
  assert.equal(r2.ok, false, `${lateDay}`);
  assert.ok(r2.problems.some((x) => /Helen has more than 1 late/.test(x)), r2.problems.join("; "));
});

t("people keep their own arrangements: Jack stays on Admin 2, Karen L stays on an early on Wednesday, a part-timer stays on the morning desk, and someone who rotates cannot take a shift that belongs to others", () => {
  const rule = (p, shiftId, day = "mon") => takeProblem(rules, rules.people.find((x) => x.uid === p), rules.shifts.find((s) => s.id === shiftId), day);
  assert.match(rule("jack", "late"), /Jack is always on Admin 2/);
  assert.equal(rule("jack", "admin2"), "");
  assert.match(rule("karenl", "late", "wed"), /always on the same kind of shift on a Wednesday/);
  assert.equal(rule("karenl", "early1", "wed"), "");
  assert.equal(rule("karenl", "late", "mon"), "");
  assert.match(rule("debbie", "early1", "tue"), /only works particular shifts/);
  assert.equal(rule("debbie", "desk2", "tue"), "");
  assert.match(rule("kim", "desk"), /Kim does not do Desk\/phones: it belongs to others/);
  assert.equal(rule("dave", "mid"), "", "Dave steps in on mid");
  assert.match(rule("dave", "tyelan"), /Dave does not step in on Ty Elan/);
  // and so a swap with Jack or on Karen L's Wednesday is refused
  const jackKey = "admin2";
  const [kk] = pair(FIRST, "mon")[0];
  const r = swapPlaces({ rules, weeks, absences: [], a: at(FIRST, "mon", jackKey), b: at(FIRST, "mon", kk) });
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((x) => /Jack is always on Admin 2/.test(x)));
});

t("someone who is off cannot be swapped on to a shift that day, and a swap that would leave someone on two shifts is refused", () => {
  const [[ka, pa], [kb, pb]] = pair(FIRST, "tue");
  const off = swapPlaces({ rules, weeks, absences: [{ uid: pb.uid, from: "2026-11-18", to: "2026-11-18" }], a: at(FIRST, "tue", ka), b: at(FIRST, "tue", kb) });
  assert.equal(off.ok, true, "being off a different day does not matter");
  const offToday = swapPlaces({ rules, weeks, absences: [{ uid: pa.uid, from: "2026-11-17", to: "2026-11-17" }], a: at(FIRST, "tue", ka), b: at(FIRST, "tue", kb) });
  assert.equal(offToday.ok, false);
  assert.ok(offToday.problems.some((x) => /but is off/.test(x)));
  // swapping with a place on another day gives each of them two shifts on one day and none on the other
  const [kw, pw] = Object.entries(weeks[FIRST].days.wed.slots).find(([, a]) => ["emily", "kim", "lewis", "libby", "lucy"].includes(a.uid) && a.uid !== pa.uid);
  const across = swapPlaces({ rules, weeks, absences: [], a: at(FIRST, "tue", ka), b: at(FIRST, "wed", kw) });
  assert.equal(across.ok, false);
  assert.ok(across.problems.some((x) => /is on 2 shifts/.test(x)), across.problems.join("; "));
});

t("a swap with nobody on one of the places, or with oneself, or in a week not built, is refused", () => {
  const [[ka, pa]] = pair(FIRST, "mon");
  assert.equal(swapPlaces({ rules, weeks, a: at(FIRST, "mon", ka), b: at(FIRST, "mon", "nope") }).ok, false);
  assert.match(swapPlaces({ rules, weeks, a: at(FIRST, "mon", ka), b: at(FIRST, "mon", ka) }).problems[0], /same person/);
  assert.match(swapPlaces({ rules, weeks, a: at(FIRST, "mon", ka), b: at("2027-01-04", "mon", ka) }).problems[0], /has not been built/);
});

t("a swap that changes someone's hours says so, with the figures (when the shifts are different lengths), so the coordinator has to approve it", () => {
  const short = { ...rules, shifts: [...rules.shifts, { id: "half", label: "Half day", group: "half", start: "09:00", end: "13:00", essential: false, count: 1, days: DAYS, dropOrder: 6 }] };
  const wk = JSON.parse(JSON.stringify(weeks[FIRST]));
  const [[ka, pa]] = pair(FIRST, "mon");
  const bUid = rules.people.find((p) => ["emily", "kim", "lewis", "libby", "lucy"].includes(p.uid) && p.uid !== pa.uid && !Object.values(wk.days.mon.slots).some((x) => x.uid === p.uid)) || null;
  // put someone on the half day by hand, leaving their old shift empty (the half day is not owned, so the team may take it)
  const kb = Object.entries(wk.days.mon.slots).find(([k, a]) => a.uid !== pa.uid && ["emily", "kim", "lewis", "libby", "lucy"].includes(a.uid))[0];
  const holder = wk.days.mon.slots[kb].uid;
  wk.days.mon.slots.half = { uid: holder, name: rules.people.find((p) => p.uid === holder).name, source: "locked" };
  delete wk.days.mon.slots[kb];
  const w2 = { ...weeks, [FIRST]: wk };
  const r = swapPlaces({ rules: short, weeks: w2, absences: [], a: at(FIRST, "mon", ka), b: at(FIRST, "mon", "half") });
  assert.equal(bUid === null || true, true);
  assert.equal(r.changesHours, true, r.problems.join("; "));
  assert.ok(r.hours.some((h) => h.uid === pa.uid && h.before - h.after === 8.5 * 60 - 4 * 60));
  assert.ok(r.hours.some((h) => h.uid === holder && h.after - h.before === 8.5 * 60 - 4 * 60));
  assert.equal(placeMinutes(short, "half", {}), 240);
  assert.equal(placeMinutes(rules, "early1", { until: "12:00" }), 240, "a part shift counts for the part");
  assert.equal(placeMinutes(rules, "late", { from: "13:00" }), 330);
  assert.equal(weekMinutes(rules, weeks[FIRST], "jack"), 5 * 510, "Jack: five days of 8.5 hours");
});

t("the swaps on offer for a shift are only ones that work, with the colleague, the shift and whether hours change, earliest first", () => {
  const [[ka, pa]] = pair(FIRST, "mon");
  const options = swapOptions({ rules, weeks, absences: [], uid: pa.uid, from: at(FIRST, "mon", ka), todayIso: "2026-11-16" });
  assert.ok(options.length >= 2, `${options.length} options`);
  for (const o of options) {
    assert.notEqual(o.withUid, pa.uid);
    assert.ok(!["jack", "dave", "karenb", "debbie"].includes(o.withUid), `${o.withUid} has fixed arrangements`);
    const r = swapPlaces({ rules, weeks, absences: [], a: at(FIRST, "mon", ka), b: at(o.monday, o.day, o.key) });
    assert.equal(r.ok, true, `${o.label}: ${r.problems.join("; ")}`);
    assert.match(o.label, /\d+ [A-Z][a-z]{2}, \d/);
    assert.equal(typeof o.changesHours, "boolean");
  }
  const dates = options.map((o) => o.monday + DAYS.indexOf(o.day));
  assert.deepEqual(dates, [...dates].sort());
  assert.ok(options.every((o) => o.monday === FIRST && o.day === "mon"), "a full-timer works every day, so only same-day swaps work");
  assert.deepEqual(swapOptions({ rules, weeks, absences: [], uid: "someone-else", from: at(FIRST, "mon", ka), todayIso: "2026-11-16" }), [], "only your own shift can be offered");
  assert.ok(swapOptions({ rules, weeks, absences: [], uid: pa.uid, from: at(FIRST, "mon", ka), todayIso: "2026-11-17" }).every((o) => o.day !== "mon" || o.monday !== FIRST), "nothing in the past");
});

t("asking for an adjustment: each kind needs the right times, and becomes the time off to enter if the coordinator agrees", () => {
  const ask = (over) => adjustmentAbsence({ rules, uid: "kim", name: "Kim", day: "thu", iso: "2026-11-19", kind: "finish_early", fromTime: "14:00", reason: "toil", ...over });
  assert.deepEqual(ask({}).absence, { uid: "kim", name: "Kim", from: "2026-11-19", to: "2026-11-19", reason: "toil", fromTime: "14:00" });
  assert.deepEqual(ask({ kind: "start_late", toTime: "13:00", fromTime: "" }).absence, { uid: "kim", name: "Kim", from: "2026-11-19", to: "2026-11-19", reason: "toil", toTime: "13:00" });
  assert.deepEqual(ask({ kind: "part_day", fromTime: "10:00", toTime: "13:00" }).absence.fromTime, "10:00");
  assert.deepEqual(ask({ kind: "day_off", fromTime: "" }).absence, { uid: "kim", name: "Kim", from: "2026-11-19", to: "2026-11-19", reason: "toil" });
  assert.equal(ask({ kind: "different_shift" }).absence, null, "a conversation, not time off");
  assert.equal(ask({ kind: "other" }).ok, true);
  assert.match(ask({ fromTime: "" }).problem, /Choose the time you finish/);
  assert.match(ask({ kind: "start_late", toTime: "" }).problem, /Choose the time you start/);
  assert.match(ask({ kind: "part_day", fromTime: "13:00", toTime: "10:00" }).problem, /must be after/);
  assert.match(ask({ kind: "made up" }).problem, /Choose what/);
  assert.match(ask({ reason: "sickness" }).problem, /Choose a reason/);
  assert.match(ask({ uid: "stranger" }).problem, /not on the rota/);
  assert.equal(adjustmentText("finish_early", "14:00", ""), "Finish early at 14");
  assert.equal(adjustmentText("start_late", "", "13:00"), "Start late: back at 13");
  assert.deepEqual(Object.keys(ADJUSTMENT_KINDS), ["finish_early", "start_late", "part_day", "day_off", "different_shift", "other"]);
});

t("what the team see: who is on which shift and the times, and nothing else: no checks, no hand-changed marks, no rules, no time off", () => {
  const week = { ...weeks[FIRST], issues: [{ text: "Kim is off" }], edited: { "mon|late": true }, generatedByName: "Sarah" };
  const out = projectPublished(week, rules);
  assert.deepEqual(Object.keys(out).sort(), ["days", "mondayIso", "slots", "teamUids"]);
  const json = JSON.stringify(out);
  assert.doesNotMatch(json, /issues|edited|generatedBy|dayRules|earliest|maxPerWeek|reason|absence|is off/);
  assert.equal(out.teamUids.length, 11);
  assert.deepEqual(out.slots.slice(0, 3).map((s) => s.label), ["Early 1", "Early 2", "Mid"]);
  for (const day of DAYS) for (const a of Object.values(out.days[day].slots)) assert.deepEqual(Object.keys(a).filter((k) => !["from", "until"].includes(k)).sort(), ["name", "uid"]);
  assert.equal(isPublishedCurrent(week, { days: publishedDays(week, rules) }, rules), true);
  const changed = JSON.parse(JSON.stringify(week)); changed.days.mon.slots.late.uid = "someone";
  assert.equal(isPublishedCurrent(changed, { days: publishedDays(week, rules) }, rules), false, "a change since publishing is noticed");
  assert.equal(isPublishedCurrent(week, null, rules), false);
});

t("what a person sees: their own shifts from today on, in order, with part shifts, and the team on a day in the order of the rota", () => {
  const pub = Object.fromEntries(Object.values(weeks).map((w) => [w.mondayIso, projectPublished(w, rules)]));
  const mine = myShifts(pub, "kim", "2026-11-17");
  assert.ok(mine.length >= 8);
  assert.ok(mine.every((s) => s.iso >= "2026-11-17"));
  assert.deepEqual(mine.map((s) => s.iso), [...mine.map((s) => s.iso)].sort());
  assert.ok(!mine.some((s) => s.iso === "2026-11-16"), "yesterday is gone");
  const lena = myShifts(pub, "karenl", "2026-11-16").find((s) => s.day === "wed");
  assert.equal(lena.until, "12:00");
  assert.equal(lena.end, "12:00");
  const roster = dayRoster(pub[FIRST], "wed");
  assert.ok(roster.length >= 9);
  assert.deepEqual(roster.slice(0, 2).map((r) => r.label), ["Early 1", "Early 2"]);
  assert.equal(roster.find((r) => r.uid === "karenl").end, "12:00");
  assert.deepEqual(dayRoster(null, "mon"), []);
});

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

t("the team's screens never read the rules, the time off or the weeks as built: only the published weeks and their own requests, and every request goes through the server", () => {
  const screen = read("src/components/rota/MyRota.jsx");
  assert.doesNotMatch(screen, /subscribeRules|subscribeAbsences|subscribeWeeks|rotaService|reception_rota_(rules|weeks|absences)|checkWeek|availabilityOn/, "nothing about anyone's rules or time off");
  assert.match(screen, /subscribeMyPublished\(uid/);
  assert.match(screen, /subscribeMyRequests\(uid/);
  assert.match(screen, /askRota\(\{ action: "options"/);
  assert.match(screen, /askRota\(\{ action: "create_swap"/);
  assert.match(screen, /askRota\(\{ action: "create_adjust"/);
  const service = read("src/modules/rota/rotaTeamService.js");
  assert.match(service, /where\("teamUids", "array-contains", uid\)/, "the published weeks that list the person");
  assert.match(service, /where\("requesterUid", "==", uid\)/);
  assert.match(service, /where\("targetUid", "==", uid\)/);
  assert.doesNotMatch(service.slice(service.indexOf("// ---- a member of the team ----")), /setDoc|addDoc|updateDoc|deleteDoc/, "the team's side never writes");
  assert.match(service, /httpsCallable\(functions, "rotaRequest"/);
});

t("it is wired in: a My rota tile and page on the phone (behind the session lock), the same page in the desktop app, the notification label, and the coordinator's publish, requests and team switch", () => {
  assert.match(read("src/apps/MobileApp.jsx"), /<Route path="\/my-rota" element=\{<MobileRotaRoute \/>\} \/>/);
  assert.match(read("src/apps/MobileApp.jsx"), /<MobileSessionShell><MobileRota coordinator=\{coordinator\} \/><\/MobileSessionShell>/);
  assert.match(read("src/apps/DesktopApp.jsx"), /<Route path="my-rota"/);
  assert.match(read("src/mobile/MobileLayout.jsx"), /case "my-rota":\s*navigate\("\/my-rota"\)/);
  assert.match(read("src/mobile/RoleAdaptiveMobileHome.jsx"), /visibleActions\(home, capabilities, \{ hasLaptop, hasRota \}\)/);
  assert.match(read("src/services/notificationCentreService.js"), /rota: "Reception rota"/);
  const week = read("src/components/rota/RotaWeekPanel.jsx");
  assert.match(week, /publishWeeks\(list, rules, actor\)/);
  assert.match(week, /Publish to the team/);
  const page = read("src/pages/ReceptionRota.jsx");
  assert.match(page, /<RotaRequestsPanel requests=\{requests\} teamAccess=\{teamAccess\} canSwitch=\{canSwitch\}/);
  const panel = read("src/components/rota/RotaRequestsPanel.jsx");
  assert.match(panel, /I have checked that the DPIA addition/, "turning the team's access on asks for a tick");
  assert.match(panel, /disabled=\{busy \|\| !confirmed\}/);
  assert.match(panel, /Only the Practice Manager and administrators can switch this on or off/);
  const fn = read("functions/index.js");
  assert.match(fn.slice(fn.indexOf("exports.rotaRequest")), /rotaRequest\(\{ db, uid: request\.auth\.uid/);
});

t("the Practice Manager and the coordinator can see the rota and answer requests on the phone: the tile, the page behind the permission, and the screen reads the built weeks (which they may read) and shows them as the team see them", () => {
  assert.match(read("src/apps/MobileApp.jsx"), /<Route path="\/reception-rota" element=\{<MobileRotaRoute coordinator \/>\} \/>/);
  assert.match(read("src/apps/MobileApp.jsx"), /coordinator && !can\("rota\.read"\) && !can\("rota\.manage"\)\) return <MobileAccessDenied/);
  assert.match(read("src/mobile/MobileLayout.jsx"), /case "reception-rota":\s*navigate\("\/reception-rota"\)/);
  const screen = read("src/components/rota/CoordinatorRota.jsx");
  assert.match(screen, /subscribeWeeks/);
  assert.match(screen, /projectPublished\(w, rules\)/);
  assert.match(screen, /showAccess=\{false\}/, "the team access switch stays on the desktop");
  assert.match(screen, /canSwitch=\{false\}/);
  assert.match(read("src/components/rota/RotaRequestsPanel.jsx"), /\{showAccess && <section/);
});

console.log(`\n${n} passed`);
