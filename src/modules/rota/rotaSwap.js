// Swapping shifts and asking for adjustments, for the reception team on their phones. Pure logic (no screens, no database), run on the server: it can see everyone's rules and time off, which the
// team's phones never can. A swap is checked against the rules before it is offered and again when it is made, and says whether it changes anyone's hours (which is when the coordinator has to approve it).
import { DAYS, DAY_LABELS, availabilityOn, addDays, hhmm, isOwned, partTimes, ruleCoversShift, shiftById, timeLabel, toMinutes, weekDates } from "./rotaModel.js";
import { shiftIdOfKey } from "./rotaEngine.js";
import { checkWeek, setPlace } from "./rotaWeek.js";

export const ADJUSTMENT_KINDS = {
  finish_early: { label: "Finish early", needs: "from" },
  start_late: { label: "Start late", needs: "to" },
  part_day: { label: "Off for part of the day", needs: "both" },
  day_off: { label: "The whole day off", needs: "none" },
  different_shift: { label: "A different shift", needs: "none", noAbsence: true },
  other: { label: "Something else (the coordinator will get in touch)", needs: "none", noAbsence: true },
};
export const ADJUSTMENT_REASONS = { leave: "Annual leave", toil: "Time off in lieu (TOIL)", other: "Off (any other reason)" };
export const DECLINE_REASONS = {
  cover: "There is not enough cover",
  notice: "It needs more notice",
  others_off: "Others are already off then",
  rules: "It would break a rule of the rota",
  talk: "Please speak to me about it",
};

const placeAt = (week, day, key) => week?.days?.[day]?.slots?.[key] || null;

// How many minutes a place is worked for: the shift, or the part of it someone is in for
export function placeMinutes(rules, key, place) {
  const shift = shiftById(rules, shiftIdOfKey(key));
  if (!shift || !place) return 0;
  const start = place.from ? Math.max(toMinutes(shift.start), toMinutes(place.from)) : toMinutes(shift.start);
  const end = place.until ? Math.min(toMinutes(shift.end), toMinutes(place.until)) : toMinutes(shift.end);
  return Math.max(0, end - start);
}

// the minutes a person works in a week
export function weekMinutes(rules, week, uid) {
  let total = 0;
  for (const day of DAYS) for (const [key, place] of Object.entries(week?.days?.[day]?.slots || {})) if (place.uid === uid) total += placeMinutes(rules, key, place);
  return total;
}

const clone = (v) => JSON.parse(JSON.stringify(v));

// Can this person be on this shift on this day by their own rules? "" if so, otherwise why not. (How they take part: someone who rotates does not do a shift that belongs to others; someone who is
// always on one shift stays on it; someone with a usual shift only steps in where their rules say; someone on "only these shifts" does only those; a day rule keeps them on its shift that day.)
export function takeProblem(rules, person, shift, day) {
  const mode = person.mode || "pool";
  const label = (id) => shiftById(rules, id)?.label || "their shift";
  if (mode === "pool" && isOwned(rules, shift)) return `${person.name} does not do ${shift.label}: it belongs to others on the rota`;
  if (mode === "fixed" && person.shift !== shift.id) return `${person.name} is always on ${label(person.shift)}`;
  if (mode === "usual" && person.shift !== shift.id && !(person.coverShifts || []).includes(shift.id)) return `${person.name} does not step in on ${shift.label}`;
  if (mode === "only" && !(person.onlyShifts || []).includes(shift.id)) return `${person.name} only works particular shifts, and ${shift.label} is not one of them`;
  const rule = person.dayRules?.[day];
  if (rule && !ruleCoversShift(rule.shift, shift)) return `${person.name} is always on the same kind of shift on a ${DAY_LABELS[day]}`;
  return "";
}
const gapTexts = (rules, week, absences) => new Set(checkWeek(rules, week, absences).filter((i) => i.severity === "gap").map((i) => i.text));
const hoursText = (m) => { const h = Math.floor(m / 60); const r = m % 60; return r ? `${h}h ${r}m` : `${h}h`; };

// Swap two places: the person on `a` goes to `b` and the person on `b` goes to `a`. weeks is { mondayIso: savedWeek }. Returns
// { ok, problems, weeks (the changed weeks, as they would be saved), hours: [{ uid, weekIso, before, after }], changesHours }.
// A swap is not possible if it would give anyone a new gap or a broken rule (hours, weekly limits, someone who is off, two shifts in a day).
export function swapPlaces({ rules, weeks, absences = [], a, b }) {
  const fail = (problem) => ({ ok: false, problems: [problem], weeks: {}, hours: [], changesHours: false });
  const weekA = weeks[a.monday]; const weekB = weeks[b.monday];
  if (!weekA?.days || !weekB?.days) return fail("That week has not been built.");
  const pa = placeAt(weekA, a.day, a.key); const pb = placeAt(weekB, b.day, b.key);
  if (!pa || !pb) return fail("One of the shifts has nobody on it, so there is nothing to swap.");
  if (pa.uid === pb.uid) return fail("That is the same person.");
  const isoA = weekDates(a.monday).find((d) => d.day === a.day)?.iso;
  const isoB = weekDates(b.monday).find((d) => d.day === b.day)?.iso;
  const people = Object.fromEntries((rules.people || []).map((p) => [p.uid, p]));
  if (!people[pa.uid] || !people[pb.uid]) return fail("Someone is no longer on the rota.");

  const before = {};
  for (const m of new Set([a.monday, b.monday])) before[m] = gapTexts(rules, weeks[m], absences);
  const next = { [a.monday]: clone(weekA) };
  if (b.monday !== a.monday) next[b.monday] = clone(weekB);

  // the times each person is in for on their new shift: their own time off that day, and a day rule's "until"
  const timesFor = (uid, iso, day, key) => {
    const shift = shiftById(rules, shiftIdOfKey(key));
    const t = partTimes(availabilityOn(absences, uid, iso), shift);
    const rule = people[uid].dayRules?.[day];
    const ruleUntil = rule && ruleCoversShift(rule.shift, shift) ? rule.until || null : null;
    return { from: t.from, until: ruleUntil && (!t.until || ruleUntil < t.until) ? ruleUntil : t.until };
  };
  next[a.monday] = setPlace(next[a.monday], rules, a.day, a.key, pb.uid, timesFor(pb.uid, isoA, a.day, a.key));
  next[b.monday] = setPlace(next[b.monday], rules, b.day, b.key, pa.uid, timesFor(pa.uid, isoB, b.day, b.key));

  const problems = [];
  const shiftA = shiftById(rules, shiftIdOfKey(a.key)); const shiftB = shiftById(rules, shiftIdOfKey(b.key));
  const own = [takeProblem(rules, people[pb.uid], shiftA, a.day), takeProblem(rules, people[pa.uid], shiftB, b.day)].filter(Boolean);
  problems.push(...own);
  for (const m of Object.keys(next)) {
    for (const issue of checkWeek(rules, next[m], absences)) {
      if (issue.severity !== "gap" || before[m].has(issue.text)) continue;
      problems.push(issue.text.replace(/^[A-Za-z]+: /, ""));
    }
  }
  const hours = [];
  for (const uid of [pa.uid, pb.uid]) {
    for (const m of Object.keys(next)) {
      const was = weekMinutes(rules, weeks[m], uid);
      const now = weekMinutes(rules, next[m], uid);
      if (was !== now) hours.push({ uid, weekIso: m, before: was, after: now });
    }
  }
  // a swap across two weeks can move hours between weeks for the same person: that is a change in their hours for each of those weeks
  return { ok: problems.length === 0, problems: [...new Set(problems)], weeks: next, hours, changesHours: hours.length > 0 };
}

export const describeHours = (rules, hours) => hours.map((h) => `${(rules.people || []).find((p) => p.uid === h.uid)?.name || "Someone"}: ${hoursText(h.before)} to ${hoursText(h.after)} in the week commencing ${h.weekIso}`);

// A place described for people: "Early 1, Tue 17 Nov, 8 to 16.30"
export function placeLabel(rules, monday, day, key, place) {
  const shift = shiftById(rules, shiftIdOfKey(key));
  const iso = weekDates(monday).find((d) => d.day === day)?.iso;
  const date = iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : DAY_LABELS[day];
  const start = place?.from || shift?.start; const end = place?.until || shift?.end;
  return `${shift?.label || key}, ${date}, ${timeLabel(start)} to ${timeLabel(end)}`;
}

// The swaps that are possible for this person's shift: every other person's shift in the built weeks from today on that it could be swapped with, checked against the rules and time off.
// [{ withUid, name, monday, day, key, label, changesHours }], earliest first.
export function swapOptions({ rules, weeks, absences = [], uid, from, todayIso, weeksAhead = 4 }) {
  const out = [];
  const people = Object.fromEntries((rules.people || []).map((p) => [p.uid, p]));
  const mine = placeAt(weeks[from.monday], from.day, from.key);
  if (!mine || mine.uid !== uid) return out;
  const last = addDays(from.monday, 7 * weeksAhead);
  for (const monday of Object.keys(weeks).sort()) {
    if (monday > last || monday < addDays(todayIso, -6)) continue;
    for (const { day, iso } of weekDates(monday)) {
      if (iso < todayIso) continue;
      for (const [key, place] of Object.entries(weeks[monday]?.days?.[day]?.slots || {})) {
        if (place.uid === uid || !people[place.uid]) continue;
        if (monday === from.monday && day === from.day && key === from.key) continue;
        const result = swapPlaces({ rules, weeks, absences, a: from, b: { monday, day, key } });
        if (!result.ok) continue;
        // the label shows the shift as the person asking would work it (their own time off applies, not the other person's)
        out.push({ withUid: place.uid, name: people[place.uid].name, monday, day, key, label: placeLabel(rules, monday, day, key, result.weeks[monday].days[day].slots[key]), changesHours: result.changesHours });
      }
    }
  }
  return out.sort((x, y) => (x.monday + DAYS.indexOf(x.day)).localeCompare(y.monday + DAYS.indexOf(y.day)));
}

// ---- adjustments ----
// Checks the request and returns { ok, problem, absence } where absence is the time off to enter if the coordinator agrees (null for the kinds that are only a conversation).
export function adjustmentAbsence({ rules, uid, name, day, iso, kind, fromTime = "", toTime = "", reason = "other" }) {
  const spec = ADJUSTMENT_KINDS[kind];
  if (!spec) return { ok: false, problem: "Choose what you are asking for." };
  if (!ADJUSTMENT_REASONS[reason]) return { ok: false, problem: "Choose a reason." };
  if (!(rules.people || []).some((p) => p.uid === uid)) return { ok: false, problem: "You are not on the rota." };
  if (spec.noAbsence) return { ok: true, absence: null };
  const t = /^\d{2}:\d{2}$/;
  if ((spec.needs === "from" || spec.needs === "both") && !t.test(fromTime)) return { ok: false, problem: spec.needs === "both" ? "Choose the time you are off from." : "Choose the time you finish." };
  if ((spec.needs === "to" || spec.needs === "both") && !t.test(toTime)) return { ok: false, problem: spec.needs === "both" ? "Choose the time you are back." : "Choose the time you start." };
  if (spec.needs === "both" && toTime <= fromTime) return { ok: false, problem: "The time you are back must be after the time you go." };
  const absence = { uid, name, from: iso, to: iso, reason, ...(spec.needs === "from" || spec.needs === "both" ? { fromTime } : {}), ...(spec.needs === "to" || spec.needs === "both" ? { toTime } : {}) };
  return { ok: true, absence };
}

export const adjustmentText = (kind, fromTime, toTime) => {
  const label = ADJUSTMENT_KINDS[kind]?.label || "An adjustment";
  if (kind === "finish_early" && fromTime) return `${label} at ${timeLabel(fromTime)}`;
  if (kind === "start_late" && toTime) return `${label}: back at ${timeLabel(toTime)}`;
  if (kind === "part_day" && fromTime && toTime) return `Off from ${timeLabel(fromTime)} to ${timeLabel(toTime)}`;
  return label;
};

export { hhmm };
