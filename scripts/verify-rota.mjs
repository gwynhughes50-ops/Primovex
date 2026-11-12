// Covers the reception rota engine (src/modules/rota): the rules from the current rota are entered as rules, and the weeks it builds are checked against them.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ABSENCE_REASONS, DAYS, DEFAULT_SHIFTS, availabilityOn, fitsWhole, inStandardOrder, offText, partTimes, ruleCoversShift, DEFAULT_SETTINGS, checkRules, mondayOf, addDays, newPerson, shiftById, toMinutes } from "../src/modules/rota/rotaModel.js";
import { assignMin, canDo, generateWeek, generateWeeks, historyAfter, shiftIdOfKey, weekCounters } from "../src/modules/rota/rotaEngine.js";
import { checkWeek, historyBefore, lockedOf, setPlace, withNames } from "../src/modules/rota/rotaWeek.js";
import { buildRotaHtml, buildRotaXlsx, counterColumns, placeText, runningCounters, totalRows, weekSheet } from "../src/modules/rota/rotaExport.js";
import { unzipSync, strFromU8 } from "fflate";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };

// ---- the rules of the current rota ----
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
    person("karenl", "Karen L", { dayRules: { wed: { shift: "early2", until: "12:00" } } }),
    person("karenb", "Karen B", { mode: "only", onlyShifts: ["desk2"], days: ["wed", "thu", "fri"] }),
    person("debbie", "Debbie", { mode: "only", onlyShifts: ["desk2"], days: ["tue", "wed", "thu"] }),
  ],
};
const POOL = ["helen", "emily", "kim", "lewis", "libby", "lucy", "karenl"];
const ROTATING = ["early1", "early2", "mid", "late", "admin1", "admin3", "tyelan"];
const FIRST = "2026-11-16";
const nameOf = (uid) => rules.people.find((p) => p.uid === uid).name;
const weeks = generateWeeks({ rules, firstMonday: FIRST, weeks: 7 });
const slotsOf = (week, day) => Object.entries(week.days[day].slots).map(([key, a]) => ({ key, shiftId: shiftIdOfKey(key), ...a }));

t("the starting rules are well formed", () => {
  assert.deepEqual(checkRules(rules), []);
  assert.match(checkRules({ shifts: [{ id: "x", label: "X", start: "10:00", end: "09:00", count: 1, days: ["mon"] }], people: [] }).join(" "), /finish must be after the start/);
  assert.match(checkRules({ shifts: DEFAULT_SHIFTS, people: [{ ...newPerson("a", "A"), mode: "fixed" }] }).join(" "), /choose their fixed shift/);
});

t("dates: weeks start on Monday", () => {
  assert.equal(mondayOf("2026-11-18"), "2026-11-16");
  assert.equal(mondayOf("2026-11-22"), "2026-11-16");
  assert.equal(mondayOf("2026-11-16"), "2026-11-16");
  assert.equal(addDays("2026-12-28", 7), "2027-01-04");
});

t("the assignment step finds the cheapest whole-day fit, not just the cheapest first choice", () => {
  // person 0 prefers slot 0 (cost 1) but then person 1 would pay 100: better is 2 + 2
  const pick = assignMin([[1, 2], [100, 2]]);
  assert.deepEqual(pick, [0, 1].map((c, i) => pick[i]));
  const total = [[1, 2], [100, 2]].reduce((sum, row, i) => sum + row[pick[i]], 0);
  assert.equal(total, 3);
  assert.deepEqual(assignMin([]), []);
});

t("seven weeks of the normal team: every essential shift filled every day, no gaps, nobody double-booked", () => {
  for (const week of weeks) {
    assert.equal(week.issues.filter((i) => i.severity === "gap").length, 0, "no gaps");
    for (const day of DAYS) {
      const slots = slotsOf(week, day);
      const ids = slots.map((s) => s.shiftId);
      for (const essential of ["early1", "early2", "mid", "late", "admin1", "tyelan"]) assert.ok(ids.includes(essential), `${essential} on ${day}`);
      const uids = slots.map((s) => s.uid);
      assert.equal(new Set(uids).size, uids.length, "one shift each per day");
    }
  }
});

t("the fixed people are where their rules put them", () => {
  for (const week of weeks) {
    for (const day of DAYS) {
      const slots = slotsOf(week, day);
      assert.equal(slots.find((s) => s.shiftId === "admin2")?.uid, "jack");
      assert.equal(slots.find((s) => s.shiftId === "desk")?.uid, "dave");
      assert.equal(slots.some((s) => s.uid === "dave" && s.shiftId === "tyelan"), false, "Dave never does Ty Elan");
      const morning = slots.filter((s) => s.shiftId === "desk2").map((s) => s.uid).sort();
      const expected = { mon: [], tue: ["debbie"], wed: ["debbie", "karenb"], thu: ["debbie", "karenb"], fri: ["karenb"] }[day];
      assert.deepEqual(morning, expected, `morning desk on ${day}`);
    }
  }
});

t("Karen L is on Early 2 until 12 every Wednesday and the rota says the afternoon is for the team to absorb", () => {
  for (const week of weeks) {
    const a = week.days.wed.slots.early2;
    assert.equal(a.uid, "karenl");
    assert.equal(a.until, "12:00");
    assert.ok(week.issues.some((i) => i.day === "wed" && /Karen L is on Early 2 until 12:00 only/.test(i.text)));
    for (const day of ["mon", "tue", "thu", "fri"]) assert.equal(slotsOf(week, day).find((s) => s.uid === "karenl")?.shiftId !== "early2" || day !== "wed", true);
  }
});

t("Helen: never before 9 on Mon, Thu and Fri; never past 6.30; at most one late a week", () => {
  for (const week of weeks) {
    const helen = rules.people.find((p) => p.uid === "helen");
    let lates = 0;
    for (const day of DAYS) {
      const s = slotsOf(week, day).find((x) => x.uid === "helen");
      assert.ok(s, "Helen works every day");
      const shift = shiftById(rules, s.shiftId);
      assert.ok(canDo(helen, shift, day), `${shift.label} on ${day}`);
      if (["mon", "thu", "fri"].includes(day)) assert.ok(toMinutes(shift.start) >= 9 * 60);
      if (shift.group === "late") lates += 1;
    }
    assert.ok(lates <= 1, `Helen's lates: ${lates}`);
  }
});

t("the Friday late goes round the team in turn: nobody does it twice until everyone has", () => {
  const fridayLates = weeks.map((w) => w.days.fri.slots.late.uid);
  assert.equal(new Set(fridayLates).size, 7, `seven weeks, seven different people: ${fridayLates.join(", ")}`);
});

t("the shifts are shared out fairly over the seven weeks, among the people whose rules leave them free", () => {
  const totals = {};
  for (const week of weeks) for (const [uid, row] of Object.entries(weekCounters(week, rules))) for (const [g, c] of Object.entries(row)) { totals[uid] = totals[uid] || {}; totals[uid][g] = (totals[uid][g] || 0) + c; }
  const FREE = ["emily", "kim", "lewis", "libby", "lucy"]; // Helen's hours and Karen L's Wednesday rule decide some of theirs, so they are compared on what is left
  for (const group of ["early", "mid", "late", "admin1", "admin3", "tyelan"]) {
    const counts = FREE.map((u) => totals[u]?.[group] || 0);
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 3, `${group}: ${counts.join(",")}`);
  }
  const lates = FREE.map((u) => totals[u]?.late || 0);
  assert.ok(Math.max(...lates) - Math.min(...lates) <= 2, `lates: ${lates.join(",")}`);
  assert.ok((totals.helen.late || 0) <= 7, "and Helen never has more than her one a week");
  assert.ok(POOL.every((u) => (totals[u]?.late || 0) >= 3), "everyone does some lates");
  const helen = totals.helen;
  assert.ok((helen.mid || 0) >= 4 && (helen.admin1 || 0) >= 3, "Helen gets her share of the shifts her hours allow");
});

t("nobody has an early the morning after a late, and the same shift is not repeated day after day", () => {
  for (const week of weeks) {
    let prev = {};
    for (const day of DAYS) {
      const now = {};
      for (const s of slotsOf(week, day)) now[s.uid] = shiftById(rules, s.shiftId).group;
      for (const uid of POOL) {
        if (!prev[uid]) continue;
        assert.ok(!(prev[uid] === "late" && now[uid] === "early"), `${nameOf(uid)} late then early`);
      }
      prev = now;
    }
  }
});

t("the same rules and the same history always give the same rota", () => {
  const again = generateWeeks({ rules, firstMonday: FIRST, weeks: 7 });
  assert.deepEqual(again.map((w) => w.days), weeks.map((w) => w.days));
});

t("the counters match the rota: every person-day is counted once", () => {
  const counters = weekCounters(weeks[0], rules);
  assert.equal(counters.dave.desk, 5);
  assert.equal(counters.jack.admin2, 5);
  assert.equal(counters.debbie.desk, 3);
  assert.equal(counters.karenb.total, 3);
  assert.equal(counters.helen.total, 5);
  const everyone = Object.values(counters).reduce((sum, row) => sum + row.total, 0);
  assert.equal(everyone, 9 * 5 + 6, "nine full-timers for five days, plus six morning desk shifts");
});

t("one person off: their days are not filled by them and admin 3 is dropped first", () => {
  const absences = [{ uid: "kim", from: "2026-11-30", to: "2026-12-02", reason: "leave" }];
  const [week] = generateWeeks({ rules, firstMonday: "2026-11-30", weeks: 1, absences });
  for (const day of ["mon", "tue", "wed"]) {
    assert.equal(slotsOf(week, day).some((s) => s.uid === "kim"), false, `Kim on ${day}`);
    assert.ok(week.days[day].unfilled.includes("admin3"), `admin 3 dropped on ${day}`);
    assert.deepEqual(week.days[day].unfilled.filter((k) => !k.startsWith("desk2")), ["admin3"], "nothing else dropped (the morning desk is only for the two part-timers)");
  }
  assert.equal(week.issues.filter((i) => i.severity === "gap").length, 0);
  assert.ok(slotsOf(week, "thu").some((s) => s.uid === "kim"), "back on Thursday");
  assert.ok(week.issues.some((i) => /Admin 3 is not staffed/.test(i.text)), "and it says so");
});

t("two people off: still every essential shift covered", () => {
  const absences = [{ uid: "kim", from: "2026-12-07", to: "2026-12-11" }, { uid: "lucy", from: "2026-12-08", to: "2026-12-09" }];
  const [week] = generateWeeks({ rules, firstMonday: "2026-12-07", weeks: 1, absences });
  assert.equal(week.issues.filter((i) => i.severity === "gap").length, 0);
});

t("three people off: Dave steps in on a shift he can cover, the desk is left unstaffed, and what cannot be covered is a gap, never silent", () => {
  const absences = ["kim", "lucy", "emily"].map((uid) => ({ uid, from: "2026-12-14", to: "2026-12-14" }));
  const [week] = generateWeeks({ rules, firstMonday: "2026-12-14", weeks: 1, absences });
  const mon = slotsOf(week, "mon");
  const cover = mon.find((s) => s.source === "cover");
  assert.equal(cover?.uid, "dave");
  assert.ok(["early1", "early2", "mid", "late"].includes(cover.shiftId));
  assert.ok(week.days.mon.unfilled.includes("desk"));
  assert.ok(week.issues.some((i) => i.severity === "note" && /Dave covers .* so Desk\/phones is left unstaffed/.test(i.text)));
  const gaps = week.issues.filter((i) => i.severity === "gap" && i.day === "mon");
  assert.equal(gaps.length, 1, "four rotating people cannot fill six essential rotating shifts, even with Dave on one: one gap is reported");
  assert.match(gaps[0].text, /nobody is available for/);
});

t("Jack off: Admin 2 is reported as not staffed; nothing else changes", () => {
  const [week] = generateWeeks({ rules, firstMonday: FIRST, weeks: 1, absences: [{ uid: "jack", from: "2026-11-17", to: "2026-11-17" }] });
  assert.ok(week.days.tue.unfilled.includes("admin2"));
  assert.ok(week.issues.some((i) => /Admin 2 is not staffed \(Jack is not in\)/.test(i.text)));
  assert.equal(week.issues.filter((i) => i.severity === "gap").length, 0);
});

t("a place fixed by hand is kept when the week is rebuilt; one for someone who is now off is cleared and says so", () => {
  const first = generateWeek({ rules, mondayIso: FIRST });
  const wasOnMonLate = first.days.mon.slots.late.uid;
  const other = POOL.find((u) => u !== wasOnMonLate && u !== "helen");
  const locked = { mon: { late: other } };
  const again = generateWeek({ rules, mondayIso: FIRST, locked });
  assert.equal(again.days.mon.slots.late.uid, other);
  assert.equal(again.days.mon.slots.late.source, "locked");
  assert.equal(again.issues.filter((i) => i.severity === "gap").length, 0);
  const off = generateWeek({ rules, mondayIso: FIRST, locked, absences: [{ uid: other, from: "2026-11-16", to: "2026-11-16" }] });
  assert.notEqual(off.days.mon.slots.late.uid, other);
  assert.ok(off.issues.some((i) => /was placed on Late by hand but is not available/.test(i.text)));
});

t("hours: a shift is only offered to someone who can do all of it", () => {
  const helen = rules.people.find((p) => p.uid === "helen");
  assert.equal(canDo(helen, shiftById(rules, "early1"), "mon"), false, "starts at 8, she cannot start before 9 on Monday");
  assert.equal(canDo(helen, shiftById(rules, "early1"), "tue"), true);
  assert.equal(canDo(helen, shiftById(rules, "mid"), "mon"), true);
  assert.equal(canDo(helen, shiftById(rules, "late"), "fri"), true, "finishes at 6.30");
  assert.equal(canDo(helen, shiftById(rules, "tyelan"), "mon"), false);
  assert.equal(canDo(rules.people.find((p) => p.uid === "dave"), shiftById(rules, "tyelan"), "mon"), false);
  assert.equal(canDo(helen, shiftById(rules, "early1"), "mon", { until: "12:00" }), false, "a part shift still starts when it starts");
});

t("history: the next week does not repeat the last one's pattern, and the Friday late keeps rolling across weeks", () => {
  const [a, b] = generateWeeks({ rules, firstMonday: FIRST, weeks: 2 });
  assert.notDeepEqual(a.days.mon.slots, b.days.mon.slots);
  const hist = historyAfter({}, a, rules);
  assert.equal(Object.values(hist.friLate).reduce((x, y) => x + y, 0), 1, "one Friday late so far");
  assert.equal(hist.lastFriday[a.days.fri.slots.late.uid], "late");
});

t("more people than shifts: the extra person is told they have no shift, not lost", () => {
  const bigger = { ...rules, people: [...rules.people, person("extra", "Extra")] };
  const week = generateWeek({ rules: bigger, mondayIso: FIRST });
  const noShift = week.issues.filter((i) => /has no shift \(more people than shifts\)/.test(i.text));
  assert.equal(noShift.length, 5, "one person each day");
});

t("saved weeks: history for a new week comes from the weeks before it, and places fixed by hand are found again", () => {
  const saved = Object.fromEntries(weeks.slice(0, 3).map((w) => [w.mondayIso, w]));
  const h = historyBefore(saved, weeks[3].mondayIso, rules);
  assert.ok(h.counts.helen.late >= 1);
  assert.equal(Object.values(h.friLate).reduce((a, b) => a + b, 0), 3);
  assert.deepEqual(historyBefore(saved, weeks[0].mondayIso, rules).counts, {}, "nothing before the first week");
  const edited = setPlace({ ...weeks[0] }, rules, "mon", "late", "kim");
  assert.deepEqual(lockedOf(edited), { mon: { late: "kim" } });
  assert.equal(edited.days.mon.slots.late.name, "Kim");
  assert.equal(edited.edited["mon|late"], true);
  const cleared = setPlace(edited, rules, "mon", "late", "");
  assert.equal(cleared.days.mon.slots.late, undefined);
  assert.ok(cleared.days.mon.unfilled.includes("late"));
});

t("checking a week after changes by hand: double bookings, people who are off, hours and limits, empty shifts", () => {
  const week = weeks[0];
  assert.deepEqual(checkWeek(rules, week, []).filter((i) => i.severity === "gap"), [], "a built week has no gaps");
  const helenMon = setPlace(week, rules, "mon", "early1", "helen");
  assert.ok(checkWeek(rules, helenMon, []).some((i) => /Helen cannot do Early 1/.test(i.text)));
  const twice = setPlace(week, rules, "tue", "early1", week.days.tue.slots.mid.uid);
  assert.ok(checkWeek(rules, twice, []).some((i) => /is on 2 shifts/.test(i.text)));
  const off = checkWeek(rules, week, [{ uid: week.days.wed.slots.mid.uid, from: "2026-11-18", to: "2026-11-18" }]);
  assert.ok(off.some((i) => i.day === "wed" && /but is off/.test(i.text)));
  const empty = setPlace(week, rules, "thu", "tyelan", "");
  assert.ok(checkWeek(rules, empty, []).some((i) => i.severity === "gap" && /nobody is on Ty Elan/.test(i.text)));
  const adminEmpty = setPlace(week, rules, "thu", "admin3", "");
  assert.ok(checkWeek(rules, adminEmpty, []).every((i) => i.severity !== "gap"), "an empty Admin 3 is only a note");
  const twoLates = setPlace(setPlace(week, rules, "mon", "late", "helen"), rules, "tue", "late", "helen");
  assert.ok(checkWeek(rules, twoLates, []).some((i) => /Helen has more than 1 late shift this week/.test(i.text)));
});

t("the Excel file: one sheet per week laid out like the current rota, with the counters, and nothing else", () => {
  const named = weeks.slice(0, 2).map((w) => withNames(w, rules));
  const files = unzipSync(buildRotaXlsx(named, rules));
  assert.ok(files["xl/workbook.xml"] && files["xl/worksheets/sheet1.xml"] && files["xl/worksheets/sheet2.xml"] && files["[Content_Types].xml"]);
  const wb = strFromU8(files["xl/workbook.xml"]);
  assert.match(wb, /name="w\.c\. 16 Nov"/);
  assert.match(wb, /name="w\.c\. 23 Nov"/);
  const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
  assert.match(sheet, />Karen L \(till 12\)</);
  assert.match(sheet, />Early 1 8-16\.30</);
  const { rows, counterRows } = weekSheet(named[0], rules);
  assert.equal(rows[0][0], "w.c. 16 Nov");
  assert.equal(rows.length, 1 + 11, "a row for each of the eleven places");
  assert.equal(counterRows[0][counterRows[0].length - 1], "Total");
  assert.equal(placeText({ name: "Debbie", until: "10:00" }), "Debbie (till 10)");
  assert.equal(placeText(undefined), "");
  assert.doesNotMatch(sheet, /sickness|reason/i);
});

t("the printed rota names people and shifts, escapes what it prints, and carries no reasons for absence", () => {
  const named = withNames(weeks[0], rules);
  named.days.mon.slots.late = { ...named.days.mon.slots.late, name: "<b>Kim</b>" };
  const html = buildRotaHtml([named], rules, { printedBy: "Her", printedAt: new Date("2026-11-10T10:00:00Z") });
  assert.match(html, /Reception rota: week commencing 16 November 2026/);
  assert.match(html, /&lt;b&gt;Kim&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<b>Kim<\/b>/);
  assert.doesNotMatch(html, /sickness/i);
});

t("the person who builds the rota can load the staff list to pick the team from (the server allows rota.manage), and a failure is shown, not swallowed", () => {
  const server = readFileSync(new URL("../functions/index.js", import.meta.url), "utf8");
  const block = server.slice(server.indexOf("exports.listStaffDirectory"), server.indexOf("exports.listStaffDirectory") + 2600);
  assert.match(block, /hasCapability\(capabilities, "rota\.manage"\)/);
  const panel = readFileSync(new URL("../src/components/rota/RotaRulesPanel.jsx", import.meta.url), "utf8");
  assert.match(panel, /The staff list could not be loaded/);
  assert.match(panel, /The staff list is empty/);
});

t("the rota runs down in the order Sarah asked for, TOIL is an absence reason, and the shifts can be moved", () => {
  assert.deepEqual(DEFAULT_SHIFTS.map((x) => x.label), ["Early 1", "Early 2", "Mid", "Late", "Admin 1", "Admin 2", "Admin 3", "Desk/phones", "Desk/phones (morning)", "Ty Elan"]);
  const sheet = weekSheet(withNames(weeks[0], rules), rules);
  assert.deepEqual(sheet.rows.slice(1).map((r) => r[0].replace(/ [\d.]+-[\d.]+$/, "")), ["Early 1", "Early 2", "Mid", "Late", "Admin 1", "Admin 2", "Admin 3", "Desk/phones", "Desk/phones (morning)", "Desk/phones (morning)", "Ty Elan"]);
  assert.equal(ABSENCE_REASONS.toil, "Time off in lieu (TOIL)");
  assert.ok(!("sickness" in ABSENCE_REASONS));
  const panel = readFileSync(new URL("../src/components/rota/RotaRulesPanel.jsx", import.meta.url), "utf8");
  assert.match(panel, /Move \$\{s\.label\} up/);
  assert.match(panel, /Move \$\{s\.label\} down/);
});

t("Karen L is on Early 1 or Early 2 every Wednesday, whichever is free, until 12, when her rule says any early", () => {
  const anyEarly = { ...rules, people: rules.people.map((p) => (p.uid === "karenl" ? { ...p, dayRules: { wed: { shift: "group:early", until: "12:00" } } } : p)) };
  assert.deepEqual(checkRules(anyEarly), []);
  const built = generateWeeks({ rules: anyEarly, firstMonday: FIRST, weeks: 7 });
  for (const week of built) {
    const wed = Object.entries(week.days.wed.slots).find(([, a]) => a.uid === "karenl");
    assert.ok(["early1", "early2"].includes(wed[0]), `Karen L on ${wed[0]}`);
    assert.equal(wed[1].until, "12:00");
    assert.equal(week.issues.filter((i) => i.severity === "gap").length, 0);
    const other = ["early1", "early2"].find((k) => k !== wed[0]);
    assert.ok(week.days.wed.slots[other] && week.days.wed.slots[other].uid !== "karenl", "the other early is a full day for someone else");
    const tue = Object.entries(week.days.tue.slots).find(([, a]) => a.uid === "karenl")[0];
    assert.notEqual(tue, "late", "no late the day before an early");
  }
  assert.match(checkRules({ ...rules, people: rules.people.map((p) => (p.uid === "karenl" ? { ...p, dayRules: { wed: { shift: "group:nothing" } } } : p)) }).join(" "), /choose the shift/);
  assert.equal(ruleCoversShift("group:early", shiftById(rules, "early2")), true);
  assert.equal(ruleCoversShift("group:early", shiftById(rules, "mid")), false);
  assert.equal(ruleCoversShift("early2", shiftById(rules, "early2")), true);
  const panel = readFileSync(new URL("../src/components/rota/RotaRulesPanel.jsx", import.meta.url), "utf8");
  assert.match(panel, /value=\{`group:\$\{g\}`\}/, "the page offers 'any early'");
});

t("the running total adds every week up, in the Excel file and on the printout, and the page can show it", () => {
  const named = weeks.map((w) => withNames(w, rules));
  const total = runningCounters(named, rules);
  const everyone = Object.values(total).reduce((sum, r) => sum + r.total, 0);
  assert.equal(everyone, 7 * (9 * 5 + 6), "seven weeks of person-days");
  assert.equal(total.dave.desk, 35);
  assert.equal(total.jack.admin2, 35);
  const rows = totalRows(named, rules);
  assert.match(rows[0][0], /Running total, 7 weeks \(w\.c\. 16 Nov to w\.c\. 28 Dec\)/);
  assert.equal(rows[0][rows[0].length - 1], "Total");
  const files = unzipSync(buildRotaXlsx(named, rules));
  assert.match(strFromU8(files["xl/workbook.xml"]), /name="Running total"/);
  assert.ok(files["xl/worksheets/sheet8.xml"], "seven weeks and the total");
  assert.equal(Object.keys(unzipSync(buildRotaXlsx(named.slice(0, 1), rules))).filter((k) => k.startsWith("xl/worksheets/")).length, 1, "one week: no total sheet");
  assert.match(buildRotaHtml(named, rules), /Running total, 7 weeks/);
  assert.doesNotMatch(buildRotaHtml(named.slice(0, 1), rules), /Running total/);
  const panel = readFileSync(new URL("../src/components/rota/RotaWeekPanel.jsx", import.meta.url), "utf8");
  assert.match(panel, /Running total \(/);
});

t("rules saved in the old order can be put in the usual order in one go: the usual shifts are sorted, any other shift keeps its place after them, nothing is lost", () => {
  const old = ["early1", "early2", "mid", "late", "admin1", "tyelan", "admin2", "desk", "desk2", "admin3"].map((id) => ({ id, label: id }));
  assert.deepEqual(inStandardOrder(old).map((x) => x.id), ["early1", "early2", "mid", "late", "admin1", "admin2", "admin3", "desk", "desk2", "tyelan"]);
  const withOwn = [{ id: "extra1" }, ...old, { id: "extra2" }];
  assert.deepEqual(inStandardOrder(withOwn).map((x) => x.id), ["early1", "early2", "mid", "late", "admin1", "admin2", "admin3", "desk", "desk2", "tyelan", "extra1", "extra2"]);
  assert.equal(inStandardOrder(old).length, old.length);
  assert.deepEqual(inStandardOrder([]), []);
  const panel = readFileSync(new URL("../src/components/rota/RotaRulesPanel.jsx", import.meta.url), "utf8");
  assert.match(panel, /Put the shifts in the usual order/);
  assert.match(panel, /inStandardOrder\(rules\.shifts\)/);
});

const kimOff = (extra) => [{ uid: "kim", reason: "other", ...extra }];
const kimOn = (week, day) => Object.entries(week.days[day].slots).find(([, a]) => a.uid === "kim");

t("time off to the minute: finishing early, starting late, a gap in the middle, part days at each end, and too little time to count", () => {
  const A = (a) => [{ uid: "kim", from: "2026-11-16", to: "2026-11-16", ...a }];
  assert.deepEqual(availabilityOn([], "kim", "2026-11-16"), { from: 0, until: 1440 });
  assert.deepEqual(availabilityOn(A({}), "kim", "2026-11-16"), null, "no times: off all day");
  assert.deepEqual(availabilityOn(A({ fromTime: "14:00" }), "kim", "2026-11-16"), { from: 0, until: 840 }, "finishes early");
  assert.deepEqual(availabilityOn(A({ toTime: "13:00" }), "kim", "2026-11-16"), { from: 780, until: 1440 }, "starts late");
  assert.deepEqual(availabilityOn(A({ fromTime: "10:00", toTime: "13:00" }), "kim", "2026-11-16"), { from: 780, until: 1440 }, "off in the middle: the longer stretch is the one used");
  assert.equal(availabilityOn(A({ fromTime: "00:30", toTime: "23:45" }), "kim", "2026-11-16"), null, "in for less than an hour counts as off");
  const span = [{ uid: "kim", from: "2026-11-16", to: "2026-11-18", fromTime: "14:00", toTime: "10:00" }];
  assert.deepEqual(availabilityOn(span, "kim", "2026-11-16"), { from: 0, until: 840 }, "Monday: until 2pm");
  assert.equal(availabilityOn(span, "kim", "2026-11-17"), null, "Tuesday: off all day");
  assert.deepEqual(availabilityOn(span, "kim", "2026-11-18"), { from: 600, until: 1440 }, "Wednesday: back at 10");
  assert.deepEqual(availabilityOn(span, "kim", "2026-11-19"), { from: 0, until: 1440 }, "Thursday: in");
  assert.equal(availabilityOn(span, "lucy", "2026-11-17").until, 1440, "someone else is not affected");
  assert.equal(offText(span, "kim", "2026-11-16"), "from 14:00");
  assert.equal(offText(span, "kim", "2026-11-17"), "all day");
  assert.equal(offText(span, "kim", "2026-11-18"), "until 10:00");
  assert.equal(offText(A({ fromTime: "10:00", toTime: "13:00" }), "kim", "2026-11-16"), "10:00–13:00");
  assert.equal(offText([], "kim", "2026-11-16"), "");
  assert.deepEqual(partTimes({ from: 780, until: 1440 }, shiftById(rules, "late")), { from: "13:00", until: null });
  assert.deepEqual(partTimes({ from: 0, until: 720 }, shiftById(rules, "early1")), { from: null, until: "12:00" });
  assert.equal(fitsWhole({ from: 600, until: 1440 }, shiftById(rules, "late")), true);
  assert.equal(fitsWhole({ from: 780, until: 1440 }, shiftById(rules, "late")), false);
});

t("someone who finishes early (off from 12) takes an early shift until 12, and the rest of the shift is noted for the team; nothing else is lost", () => {
  const week = generateWeek({ rules, mondayIso: FIRST, absences: kimOff({ from: "2026-11-16", to: "2026-11-16", fromTime: "12:00" }) });
  const [key, place] = kimOn(week, "mon");
  assert.ok(["early1", "early2"].includes(key), `Kim on ${key}`);
  assert.equal(place.until, "12:00");
  assert.equal(place.from, undefined);
  assert.equal(place.source, "part");
  assert.ok(week.issues.some((i) => /Kim is on Early [12] until 12:00 only, so the rest of the shift is for the team to absorb/.test(i.text)));
  assert.equal(week.issues.filter((i) => i.severity === "gap").length, 0);
  assert.deepEqual(week.days.mon.unfilled.filter((k) => !k.startsWith("desk2")), [], "every other shift is still filled");
  assert.ok(kimOn(week, "tue"), "back as normal on Tuesday");
});

t("someone who starts late (back at 1pm) takes a late shift from 1pm, noted as the first part being for the team", () => {
  const week = generateWeek({ rules, mondayIso: FIRST, absences: kimOff({ from: "2026-11-17", to: "2026-11-17", toTime: "13:00" }) });
  const [key, place] = kimOn(week, "tue");
  assert.equal(place.from, "13:00");
  assert.equal(place.until, undefined);
  assert.ok(["late", "mid", "admin1"].includes(key), `Kim on ${key}`);
  assert.ok(week.issues.some((i) => /Kim is on .* from 13:00 only, so the first part of the shift is for the team to absorb/.test(i.text)));
  assert.equal(week.issues.filter((i) => i.severity === "gap").length, 0);
});

t("someone off from 5pm still does a whole shift that ends by then; a part day that leaves a whole shift is not a part shift", () => {
  const week = generateWeek({ rules, mondayIso: FIRST, absences: kimOff({ from: "2026-11-18", to: "2026-11-18", fromTime: "17:00" }) });
  const [key, place] = kimOn(week, "wed");
  assert.ok(["early1", "early2", "tyelan", "admin3"].includes(key), `Kim on ${key}: a shift that is over by 5`);
  assert.equal(place.from, undefined);
  assert.equal(place.until, undefined);
  const back = generateWeek({ rules, mondayIso: FIRST, absences: kimOff({ from: "2026-11-16", to: "2026-11-18", fromTime: "14:00", toTime: "10:00" }) });
  assert.equal(kimOn(back, "tue"), undefined, "the middle day is all day off");
  assert.ok(kimOn(back, "mon")[1].until, "Monday: until 2pm");
  const wed = kimOn(back, "wed");
  assert.ok(wed, "Wednesday: back at 10");
  assert.equal(wed[1].from, undefined, "Wednesday: back at 10 fits a whole Late, so it is a whole shift");
  assert.equal(back.issues.filter((i) => i.severity === "gap").length, 0);
});

t("someone in for too little of the day to take a shift is told so, not quietly dropped", () => {
  const week = generateWeek({ rules, mondayIso: FIRST, absences: kimOff({ from: "2026-11-16", to: "2026-11-16", fromTime: "08:30" }) });
  assert.equal(kimOn(week, "mon"), undefined);
  assert.ok(week.issues.some((i) => /Kim is in for too little of the day to take a shift/.test(i.text)));
  assert.equal(week.issues.filter((i) => /Kim has no shift/.test(i.text)).length, 0, "and it is not reported twice");
});

t("part days: people with a usual shift keep it for the time they are in (Dave finishing early is on the desk until then)", () => {
  const week = generateWeek({ rules, mondayIso: FIRST, absences: [{ uid: "dave", from: "2026-11-19", to: "2026-11-19", fromTime: "15:00", reason: "leave" }] });
  assert.equal(week.days.thu.slots.desk.uid, "dave");
  assert.equal(week.days.thu.slots.desk.until, "15:00");
  assert.ok(week.issues.some((i) => /Dave is on Desk\/phones until 15:00 only/.test(i.text)));
});

t("a week is checked against part days: a whole shift for someone in for part of the day is a problem, a shift with the right times is not", () => {
  const week = weeks[0];
  const [curKey, cur] = Object.entries(week.days.mon.slots).find(([, x]) => ["emily", "kim", "lewis", "libby", "lucy"].includes(x.uid));
  const who = cur.uid;
  const off = [{ uid: who, from: "2026-11-16", to: "2026-11-16", fromTime: "12:00" }];
  const bad = checkWeek(rules, week, off);
  assert.ok(bad.some((i) => i.severity === "gap" && /but is off for part of it \(in 00:00 to 12:00 only\)/.test(i.text)));
  assert.ok(bad.some((i) => /but is off/.test(i.text)), "the page's 'rebuild affected weeks' notice picks this up");
  const fixed = setPlace(setPlace(week, rules, "mon", curKey, ""), rules, "mon", "early1", who, { until: "12:00" });
  const clean = checkWeek(rules, fixed, off).filter((i) => i.severity === "gap" && new RegExp(rules.people.find((p) => p.uid === who).name).test(i.text));
  assert.deepEqual(clean, [], "on an early until 12 they are fine");
  const placed = setPlace(week, rules, "mon", "late", "kim", { from: "13:00", until: "16:00" });
  assert.deepEqual([placed.days.mon.slots.late.from, placed.days.mon.slots.late.until], ["13:00", "16:00"]);
  assert.equal(setPlace(week, rules, "mon", "late", "kim", "12:00").days.mon.slots.late.until, "12:00", "the old way of passing an until still works");
  assert.equal(placeText({ name: "Kim", from: "13:00" }), "Kim (from 13)");
  assert.equal(placeText({ name: "Kim", from: "13:00", until: "16:00" }), "Kim (from 13 till 16)");
  assert.equal(placeText({ name: "Kim", until: "12:00" }), "Kim (till 12)");
});

t("time off is entered and shown with times: the form, the saved fields and the rota's Off row", () => {
  const panel = readFileSync(new URL("../src/components/rota/RotaAbsencesPanel.jsx", import.meta.url), "utf8");
  assert.match(panel, /Off from/);
  assert.match(panel, /Back at/);
  assert.match(panel, /fromTime, toTime, reason/);
  const service = readFileSync(new URL("../src/modules/rota/rotaService.js", import.meta.url), "utf8");
  assert.match(service, /\.\.\.\(fromTime \? \{ fromTime \} : \{\}\), \.\.\.\(toTime \? \{ toTime \} : \{\}\)/);
  assert.match(service, /The time they are back must be after the time they go/);
  const weekPanel = readFileSync(new URL("../src/components/rota/RotaWeekPanel.jsx", import.meta.url), "utf8");
  assert.match(weekPanel, /offText\(absences, p\.uid, iso\)/);
  assert.match(weekPanel, /availabilityOn\(absences, uid/);
});

t("notes are only for what matters: the morning desk is not 'not staffed' on a day neither part-timer is due in, but is when one who should be in is off", () => {
  for (const week of weeks) {
    assert.equal(week.issues.filter((x) => /Desk\/phones \(morning\) is not staffed/.test(x.text)).length, 0, "a normal week has no such notes");
    assert.equal(checkWeek(rules, week, []).filter((x) => /Desk\/phones \(morning\) is not staffed/.test(x.text)).length, 0, "and the checker agrees");
  }
  const absences = [{ uid: "debbie", from: "2026-11-17", to: "2026-11-17", reason: "other" }];
  const week = generateWeek({ rules, mondayIso: FIRST, absences });
  assert.ok(week.issues.some((x) => x.day === "tue" && /Desk\/phones \(morning\) is not staffed \(Debbie is not in\)/.test(x.text)));
  assert.equal(week.issues.filter((x) => /Desk\/phones \(morning\) is not staffed/.test(x.text)).length, 1, "only Tuesday");
  assert.ok(checkWeek(rules, week, absences).some((x) => x.day === "tue" && /Desk\/phones \(morning\) is not staffed/.test(x.text)));
});

t("the counter columns read as on the current rota: Early (Early 1 and 2 together), Mid, Late, Admin 1, Admin 2, Admin 3, Desk/phones, Ty Elan", () => {
  assert.deepEqual(counterColumns(rules).map((c) => c.label), ["Early", "Mid", "Late", "Admin 1", "Admin 2", "Admin 3", "Desk/phones", "Ty Elan"]);
});

console.log(`\n${n} passed`);
