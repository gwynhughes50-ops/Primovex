// A review of the reception rota for the person who builds it: what needs fixing, what to watch, and what is just worth knowing. Pure logic (no AI, no screens): it reads the weeks that have been built, the
// rules and who is off, and says so in plain words with a suggestion for each. An AI can then write these findings up as a short summary, but it only ever sees them with letters in place of names
// (anonymise / restore below), and the findings are the same with or without it.
import { DAYS, DAY_LABELS, absentOn, addDays, availabilityOn, groupLabel, isOwned, offText, ruleCoversShift, timeLabel, weekDates, weekLabel } from "./rotaModel.js";
import { canDo, weekCounters } from "./rotaEngine.js";
import { shiftById } from "./rotaModel.js";
import { checkWeek, slotsOfDay } from "./rotaWeek.js";

const SEVERITY_ORDER = { fix: 0, watch: 1, info: 2 };
const FAIRNESS_WEEKS = 12; // how far back fairness looks
const FAIRNESS_MIN_WEEKS = 3; // fewer built weeks than this and the totals say little
const FAIRNESS_GAP = 3; // how far above the average of the others someone has to be before it is worth saying

let counter = 0;
const finding = (severity, kind, title, detail, suggestion, extra = {}) => ({ id: `${kind}:${extra.weekIso || ""}:${extra.day || ""}:${++counter}`, severity, kind, title, detail, suggestion, ...extra });

// the people who work and are in for the whole of this day
const poolPresent = (rules, absences, day, iso) => (rules.people || []).filter((p) => (p.mode || "pool") === "pool" && (p.days || []).includes(day) && (() => { const a = availabilityOn(absences, p.uid, iso); return a && a.from === 0 && a.until === 1440; })());

// ---- one built week: gaps, part shifts, thin cover ----
function reviewWeek(rules, week, absences) {
  const out = [];
  const issues = checkWeek(rules, week, absences);
  const label = `week commencing ${weekLabel(week.mondayIso)}`;
  const base = { weekIso: week.mondayIso };

  for (const i of issues.filter((x) => x.severity === "gap")) {
    if (/but is off/.test(i.text)) out.push(finding("fix", "off-but-on", "Someone is on a shift but is off", i.text.replace(/^[A-Za-z]+: /, ""), "Rebuild the week so it takes the time off into account, or move them.", { ...base, day: i.day }));
    else out.push(finding("fix", "gap", "A shift is not covered", i.text.replace(/^[A-Za-z]+: /, ""), "Change the place by hand, or add or move a person, then check again.", { ...base, day: i.day }));
  }

  // an essential shift that someone is on for only part of: worth watching when time off causes it, not when it is their standing arrangement (Karen L until 12 every Wednesday)
  for (const day of DAYS) {
    for (const [key, place] of Object.entries(week.days?.[day]?.slots || {})) {
      if (!place.from && !place.until) continue;
      const shift = shiftById(rules, key.split("#")[0]);
      const p = (rules.people || []).find((x) => x.uid === place.uid);
      const rule = p?.dayRules?.[day];
      if (!shift?.essential || (rule && ruleCoversShift(rule.shift, shift) && !place.from && place.until === (rule.until || place.until))) continue;
      const times = `${place.from ? `from ${timeLabel(place.from)}` : ""}${place.from && place.until ? " " : ""}${place.until ? `until ${timeLabel(place.until)}` : ""}`;
      out.push(finding("watch", "part-shift", "An essential shift is only part covered", `${p?.name || place.name || "Someone"} is on ${shift.label} ${times} only, on ${DAY_LABELS[day]} in the ${label}, so the rest of the shift is for the team to absorb.`, "Make sure someone else can take the rest of that shift, or move a person to it.", { ...base, day }));
    }
  }

  for (const i of issues.filter((x) => x.severity === "note" && /in for too little of the day/.test(x.text))) out.push(finding("watch", "too-little", "Someone is in for too little of a day to take a shift", i.text.replace(/^[A-Za-z]+: /, ""), "They are not on the rota that day. If they are in for longer, change their time off.", { ...base, day: i.day }));
  for (const i of issues.filter((x) => x.severity === "note" && /covers .* so .* is left unstaffed/.test(x.text))) out.push(finding("watch", "cover", "Cover is stretching the usual team", i.text.replace(/^[A-Za-z]+: /, ""), "Fine for a day, but check it does not become the pattern.", { ...base, day: i.day }));
  for (const i of issues.filter((x) => x.severity === "note" && /has an early after a late/.test(x.text))) out.push(finding("watch", "late-early", "An early the morning after a late", i.text.replace(/^[A-Za-z]+: /, ""), "Swap one of the two shifts if you can.", { ...base, day: i.day }));
  const benched = issues.filter((x) => x.severity === "note" && /has no shift \(more people than shifts\)/.test(x.text));
  if (benched.length) out.push(finding("info", "no-shift", "Someone has no shift on some days", `${benched.length} day${benched.length === 1 ? "" : "s"} in the ${label} ${benched.length === 1 ? "has" : "have"} more people than shifts.`, "Spare people can cover desk or admin work, or the rota can drop to one fewer person.", base));
  const quiet = issues.filter((x) => x.severity === "note" && /is not staffed/.test(x.text));
  if (quiet.length) out.push(finding("info", "not-staffed", "Some optional shifts are not staffed", quiet.map((x) => x.text.replace(/\.$/, "")).slice(0, 4).join("; ") + (quiet.length > 4 ? `; and ${quiet.length - 4} more` : ""), "Optional shifts are given up first when there are not enough people. Nothing to do unless you need them.", base));

  // thin cover: days with no spare person, so one more absence would leave an essential shift uncovered
  const thin = [];
  for (const { day, iso } of weekDates(week.mondayIso)) {
    const essentialRotating = slotsOfDay(rules, day).filter((s) => s.shift.essential && !isOwned(rules, s.shift)).length;
    if (!essentialRotating) continue;
    const spare = poolPresent(rules, absences, day, iso).length - essentialRotating;
    const gapThatDay = issues.some((x) => x.day === day && x.severity === "gap");
    if (spare === 0 && !gapThatDay) thin.push(day);
  }
  if (thin.length) out.push(finding("watch", "thin", "No spare person on some days", `On ${thin.map((d) => DAY_LABELS[d]).join(", ")} in the ${label} exactly enough people are in, so one more person being off would leave a shift uncovered.`, "Agree who could step in on those days (someone with a usual shift, or a person on a short day).", { ...base, day: thin[0] }));
  return out;
}

// someone whose own rules narrow what they can be given (an earliest start, a latest finish, a weekly limit, a day rule, a shift they never do)
const constrained = (p) => Boolean(Object.keys(p.earliest || {}).length || Object.keys(p.latest || {}).length || Object.keys(p.maxPerWeek || {}).length || Object.keys(p.dayRules || {}).length || (p.cannotDo || []).length);

// ---- totals over the built weeks: is it fair? ----
function reviewFairness(rules, builtWeeks) {
  const out = [];
  if (builtWeeks.length < FAIRNESS_MIN_WEEKS) return out;
  const weeks = builtWeeks.slice(-FAIRNESS_WEEKS);
  const totals = {};
  for (const w of weeks) for (const [uid, row] of Object.entries(weekCounters(w, rules))) { totals[uid] = totals[uid] || {}; for (const [g, n] of Object.entries(row)) totals[uid][g] = (totals[uid][g] || 0) + n; }
  const byUid = Object.fromEntries((rules.people || []).map((p) => [p.uid, p]));
  const groups = [...new Set((rules.shifts || []).map((s) => s.group))];
  for (const group of groups) {
    const shifts = (rules.shifts || []).filter((s) => s.group === group);
    // people who could do this kind of shift: rotating people whose rules allow it on at least one of their days
    // people who could do this kind of shift and have the same freedom as each other: someone whose hours, weekly limits or day rules narrow what they can do is left out of the comparison
    const eligible = (rules.people || []).filter((p) => (p.mode || "pool") === "pool" && !constrained(p) && shifts.some((s) => (p.days || []).some((d) => (s.days || []).includes(d) && canDo(p, s, d))));
    if (eligible.length < 3) continue;
    const counts = eligible.map((p) => ({ uid: p.uid, n: totals[p.uid]?.[group] || 0 }));
    const sum = counts.reduce((a, c) => a + c.n, 0);
    if (sum < weeks.length) continue; // hardly any of this kind of shift: nothing to compare
    const high = [...counts].sort((a, b) => b.n - a.n)[0];
    const low = [...counts].sort((a, b) => a.n - b.n)[0];
    const avgOthers = (sum - high.n) / (counts.length - 1);
    const avgOthersLow = (sum - low.n) / (counts.length - 1);
    const name = groupLabel(rules, group);
    if (high.n - avgOthers >= FAIRNESS_GAP) out.push(finding("watch", "fairness-high", `${name} shifts are not evenly shared`, `${byUid[high.uid].name} has done ${high.n} ${name} shifts in the last ${weeks.length} weeks; the others have averaged ${avgOthers.toFixed(1)}.`, `Give ${byUid[high.uid].name} fewer ${name} shifts in the next weeks, or check this is intended.`, { uids: [high.uid] }));
    else if (avgOthersLow - low.n >= FAIRNESS_GAP) out.push(finding("info", "fairness-low", `${name} shifts are not evenly shared`, `${byUid[low.uid].name} has done ${low.n} ${name} shifts in the last ${weeks.length} weeks; the others have averaged ${avgOthersLow.toFixed(1)}.`, `Give ${byUid[low.uid].name} a few more ${name} shifts, or check this is intended.`, { uids: [low.uid] }));
  }

  // the Friday late: it should go round the team
  if (weeks.length >= 4) {
    const late = (rules.shifts || []).find((s) => s.group === "late");
    if (late && (late.days || []).includes("fri")) {
      const given = {};
      for (const w of weeks) { const uid = w.days?.fri?.slots?.[late.id]?.uid; if (uid) given[uid] = (given[uid] || 0) + 1; }
      const eligible = (rules.people || []).filter((p) => (p.mode || "pool") === "pool" && (p.days || []).includes("fri") && canDo(p, late, "fri"));
      const most = eligible.map((p) => ({ uid: p.uid, n: given[p.uid] || 0 })).sort((a, b) => b.n - a.n)[0];
      const none = eligible.filter((p) => !given[p.uid]);
      if (most && most.n >= 2 && none.length) out.push(finding("watch", "friday-late", "The Friday late is not rolling round fairly", `${byUid[most.uid].name} has had the Friday late ${most.n} times in ${weeks.length} weeks while ${none.map((p) => p.name).join(", ")} ${none.length === 1 ? "has" : "have"} not had it.`, "Give the next Friday late to someone who has not had it yet.", { uids: [most.uid, ...none.map((p) => p.uid)] }));
    }
  }
  return out;
}

// ---- time off: clusters, and weeks that are not built yet ----
function reviewAbsences(rules, absences, weeks, fromMonday, horizon) {
  const out = [];
  const byUid = Object.fromEntries((rules.people || []).map((p) => [p.uid, p]));
  for (let w = 0; w < horizon; w += 1) {
    const monday = addDays(fromMonday, 7 * w);
    for (const { day, iso } of weekDates(monday)) {
      const off = (rules.people || []).filter((p) => (p.days || []).includes(day) && offText(absences, p.uid, iso));
      if (off.length >= 3) out.push(finding("watch", "many-off", `${off.length} people are off on ${DAY_LABELS[day]}`, `${off.map((p) => p.name).join(", ")} ${off.length === 1 ? "is" : "are"} off on ${DAY_LABELS[day]} in the week commencing ${weekLabel(monday)}.`, "Check cover for that day, and consider not agreeing more time off then.", { weekIso: monday, day, uids: off.map((p) => p.uid) }));
    }
    if (!weeks[monday]) {
      const anyOff = weekDates(monday).some(({ iso }) => (rules.people || []).some((p) => absentOn(absences, p.uid, iso) || offText(absences, p.uid, iso)));
      if (anyOff) out.push(finding("watch", "unbuilt-off", "A week with time off has not been built", `The week commencing ${weekLabel(monday)} has not been built, but time off is already entered for it.`, "Build the rota for that week.", { weekIso: monday }));
      else if (w <= 1) out.push(finding("info", "unbuilt", "A coming week has not been built", `The week commencing ${weekLabel(monday)} has not been built yet.`, "Build it when you are ready.", { weekIso: monday }));
    }
  }
  return out;
}

// reviewRota({ rules, weeks: { mondayIso: week }, absences, fromMonday, horizon }) => { findings, stats }
// Looks at the built weeks from `fromMonday` for `horizon` weeks (for gaps and cover), and at the last twelve built weeks for fairness.
export function reviewRota({ rules, weeks = {}, absences = [], fromMonday, horizon = 4 }) {
  counter = 0;
  const findings = [];
  const ahead = [];
  for (let w = 0; w < horizon; w += 1) { const m = addDays(fromMonday, 7 * w); if (weeks[m]?.days) ahead.push(weeks[m]); }
  for (const week of ahead) findings.push(...reviewWeek(rules, week, absences));
  const built = Object.values(weeks).filter((w) => w.days && w.mondayIso <= addDays(fromMonday, 7 * (horizon - 1))).sort((a, b) => a.mondayIso.localeCompare(b.mondayIso));
  findings.push(...reviewFairness(rules, built));
  findings.push(...reviewAbsences(rules, absences, weeks, fromMonday, horizon));
  findings.sort((a, b) => (SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]) || String(a.weekIso || "9").localeCompare(String(b.weekIso || "9")) || (DAYS.indexOf(a.day) - DAYS.indexOf(b.day)));
  return {
    findings,
    stats: { weeksChecked: ahead.length, weeksBuilt: built.length, fix: findings.filter((f) => f.severity === "fix").length, watch: findings.filter((f) => f.severity === "watch").length, info: findings.filter((f) => f.severity === "info").length },
  };
}

// ---- letters in place of names, for the AI ----
const letterFor = (i) => { let n = i; let s = ""; do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0); return s; };
const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// What the AI is given: the findings with every person's name replaced by "Person A", "Person B" ... and nothing else about them. Returns { payload, map } where map turns a letter back into a name.
export function anonymise(findings, rules) {
  const people = [...(rules.people || [])].sort((a, b) => String(a.uid).localeCompare(String(b.uid)));
  const map = {};
  people.forEach((p, i) => { map[letterFor(i)] = p.name; });
  const names = Object.entries(map).sort((a, b) => b[1].length - a[1].length);
  const swap = (text) => {
    let t = String(text || "");
    for (const [letter, name] of names) if (name) t = t.replace(new RegExp(`\\b${escapeRe(name)}\\b`, "g"), `Person ${letter}`);
    return t;
  };
  const payload = {
    findings: findings.slice(0, 40).map((f) => ({ severity: f.severity, title: swap(f.title), detail: swap(f.detail), suggestion: swap(f.suggestion), week: f.weekIso || "", day: f.day || "" })),
    people: people.length,
  };
  return { payload, map };
}

// Put the names back into text the AI wrote ("Person A's Tuesday" becomes "Kim's Tuesday").
export function restoreNames(text, map) {
  return String(text || "").replace(/\bPerson ([A-Z]{1,2})\b/g, (whole, letter) => map[letter] || whole);
}

