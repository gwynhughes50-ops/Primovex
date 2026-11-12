// Builds the reception rota from the rules. Pure logic: rules, absences and what has already been worked go in, a week comes out. Same input, same rota, every time.
//
// How a day is filled:
//   1. Anything the person building the rota fixed by hand stays where it is ("locked").
//   2. Day rules (Karen L on a Wednesday), fixed people (Jack), usual-shift people (Dave) and "only these shifts" people (Debbie, Karen B) go where their rules say.
//   3. Everyone else rotates through the remaining shifts. The best fit is found for the whole day at once (not one shift at a time), looking at:
//        - who is allowed (working that day, not off, not a shift they never do, within their earliest and latest times, not over a weekly limit);
//        - fairness (someone who has had a lot of lates recently is less likely to get another; the Friday late goes round in turn);
//        - not the same shift two days running, and not an early the morning after a late.
//   4. If an essential shift is still empty, someone with a usual shift who can cover it steps in, and the shift they leave is shown as empty.
//   5. Anything still empty is reported. An essential shift that can't be covered is a gap; a non-essential one that is dropped is a note. Nothing is left empty quietly.
import { DAYS, DAY_LABELS, MIN_PART_MINUTES, addDays, availabilityOn, fitsWhole, isOwned, overlapMinutes, ownersOnDay, partTimes, ruleShiftsOf, shiftById, toMinutes, weekDates } from "./rotaModel.js";

const BIG = 1e9;
const ESSENTIAL_EMPTY = 100000; // leaving an essential shift empty is always worse than anything else
const BENCH = 400; // a present person with no shift at all
const FAIR_WEIGHT = 100;
const FRIDAY_LATE_WEIGHT = 80;

export const slotKeyOf = (shift, i) => (Number(shift.count) > 1 ? `${shift.id}#${i + 1}` : shift.id);
export const shiftIdOfKey = (key) => String(key).split("#")[0];

// Minimum-cost assignment (Hungarian algorithm) on a square matrix. Returns, for each row, the column chosen.
export function assignMin(cost) {
  const n = cost.length;
  if (!n) return [];
  const u = new Array(n + 1).fill(0), v = new Array(n + 1).fill(0), p = new Array(n + 1).fill(0), way = new Array(n + 1).fill(0);
  for (let i = 1; i <= n; i += 1) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(Infinity);
    const used = new Array(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity, j1 = 0;
      for (let j = 1; j <= n; j += 1) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= n; j += 1) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const result = new Array(n).fill(-1);
  for (let j = 1; j <= n; j += 1) if (p[j]) result[p[j] - 1] = j - 1;
  return result;
}

// A small steady number from text, so ties are broken the same way every time but not always in favour of the same person.
function jitter(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 4;
}

const emptyCounts = () => ({});
const bump = (counts, uid, group) => { counts[uid] = counts[uid] || {}; counts[uid][group] = (counts[uid][group] || 0) + 1; };
const totalOf = (counts, uid) => Object.values(counts[uid] || {}).reduce((a, b) => a + b, 0);

// Can this person do this shift (for the whole of it, or until `until`) on this day?
export function canDo(person, shift, day, { until = null, from = null } = {}) {
  if ((person.cannotDo || []).includes(shift.id)) return false;
  const start = from ? Math.max(toMinutes(shift.start), toMinutes(from)) : toMinutes(shift.start);
  const end = until ? Math.min(toMinutes(shift.end), toMinutes(until)) : toMinutes(shift.end);
  const earliest = person.earliest?.[day];
  const latest = person.latest?.[day];
  if (earliest && start < toMinutes(earliest)) return false;
  if (latest && end > toMinutes(latest)) return false;
  return true;
}

// history = {
//   counts:      { uid: { group: n } }  what each person has worked in earlier weeks
//   friLate:     { uid: n }             Friday lates done in earlier weeks
//   previous:    { uid: { mon..fri: group } }  last week, so the same pattern is not repeated
//   lastFriday:  { uid: group }         what they did on the Friday before this week
// }
// locked = { mon: { slotKey: uid } }  places fixed by hand, which are kept.
export function generateWeek({ rules, mondayIso, absences = [], history = {}, locked = {} }) {
  const people = rules?.people || [];
  const byUid = Object.fromEntries(people.map((p) => [p.uid, p]));
  const settings = rules?.settings || {};
  const counts = JSON.parse(JSON.stringify(history.counts || emptyCounts()));
  const friLate = { ...(history.friLate || {}) };
  const previous = history.previous || {};
  const weekCounts = {};
  const issues = [];
  const out = {};
  let prevGroups = { ...(history.lastFriday || {}) }; // what each person did the day before

  // shifts that belong to someone by their rules (fixed, usual or "only"): the rotation does not touch them
  const reserved = new Set();
  for (const p of people) {
    if (p.mode === "fixed" || p.mode === "usual") reserved.add(p.shift);
    if (p.mode === "only") (p.onlyShifts || []).forEach((id) => reserved.add(id));
  }

  for (const { day, iso } of weekDates(mondayIso)) {
    const slots = [];
    for (const shift of rules.shifts || []) {
      if (!(shift.days || []).includes(day)) continue;
      for (let i = 0; i < Number(shift.count || 1); i += 1) slots.push({ key: slotKeyOf(shift, i), shift });
    }
    const assigned = {}; // slotKey -> { uid, until, source }
    const used = new Set();
    // who is in today, and for how much of the day (someone off for part of it is still in, for the rest)
    const availOf = {};
    const present = people.filter((p) => {
      if (!(p.days || []).includes(day)) return false;
      const a = availabilityOn(absences, p.uid, iso);
      if (!a) return false;
      availOf[p.uid] = a;
      return true;
    });
    const presentUids = new Set(present.map((p) => p.uid));
    const firstFree = (shiftId) => slots.find((s) => s.shift.id === shiftId && !assigned[s.key]);
    const put = (slot, uid, source, { from = null, until = null } = {}) => {
      assigned[slot.key] = { uid, name: byUid[uid]?.name || "", source, ...(from ? { from } : {}), ...(until ? { until } : {}) };
      used.add(uid);
      bump(weekCounts, uid, slot.shift.group);
    };
    const earlierOf = (a, b) => (a && b ? (toMinutes(a) <= toMinutes(b) ? a : b) : a || b || null);
    const partNote = (name, shift, from, until) => issues.push({ day, iso, severity: "note", text: `${DAY_LABELS[day]}: ${name} is on ${shift.label} ${from ? `from ${from}` : ""}${from && until ? " " : ""}${until ? `until ${until}` : ""} only, so ${from && until ? "the rest" : from ? "the first part" : "the rest"} of the shift is for the team to absorb.` });
    // place someone on a slot, with the times they are in for (their time off, and a rule's "until") and a note when it is only part of the shift
    const putPart = (slot, p, source, ruleUntil = null) => {
      const t = partTimes(availOf[p.uid], slot.shift);
      const until = earlierOf(t.until, ruleUntil && toMinutes(ruleUntil) < toMinutes(slot.shift.end) ? ruleUntil : null);
      put(slot, p.uid, source, { from: t.from, until });
      if (t.from || until) partNote(p.name, slot.shift, t.from, until);
    };

    // 1. places fixed by hand
    for (const [key, uid] of Object.entries(locked[day] || {})) {
      const slot = slots.find((s) => s.key === key);
      if (!slot) continue;
      if (!presentUids.has(uid) || used.has(uid) || assigned[key]) {
        issues.push({ day, iso, severity: "note", text: `${DAY_LABELS[day]}: ${byUid[uid]?.name || "someone"} was placed on ${slot.shift.label} by hand but is not available that day, so the place was cleared.` });
        continue;
      }
      const t = partTimes(availOf[uid], slot.shift);
      put(slot, uid, "locked", t);
    }

    // 2. day rules, fixed, usual and "only" people
    for (const p of present) {
      if (used.has(p.uid)) continue;
      const dr = p.dayRules?.[day];
      const ruleShifts = dr ? ruleShiftsOf(rules, dr.shift) : [];
      if (dr && ruleShifts.length) {
        // one shift, or any shift of a kind (Early 1 or Early 2): a part shift goes on the later row, so the first row stays whole for someone working all day
        const free = slots.filter((s) => ruleShifts.some((x) => x.id === s.shift.id) && !assigned[s.key]);
        const slot = dr.until ? free[free.length - 1] : free[0];
        if (slot) { putPart(slot, p, "rule", dr.until || null); continue; }
      }
      if (p.mode === "fixed" || p.mode === "usual") {
        const slot = firstFree(p.shift);
        if (slot) putPart(slot, p, "usual");
      } else if (p.mode === "only") {
        for (const id of p.onlyShifts || []) { const slot = firstFree(id); if (slot) { putPart(slot, p, "usual"); break; } }
      }
    }

    const tooLittle = new Set();
    // 2b. someone in for only part of the day, with no whole shift that fits: they take the shift they overlap most (an essential one first), for the part they are in; the rest is for the team to absorb
    for (const p of [...present].sort((x, y) => String(x.uid).localeCompare(String(y.uid)))) {
      const a = availOf[p.uid];
      if (used.has(p.uid) || (p.mode || "pool") !== "pool" || (a.from === 0 && a.until === 1440)) continue;
      const open = slots.filter((s) => !assigned[s.key] && !reserved.has(s.shift.id));
      if (open.some((s) => fitsWhole(a, s.shift) && canDo(p, s.shift, day))) continue;
      let best = null;
      for (const s of open) {
        const ov = overlapMinutes(a, s.shift);
        if (ov < MIN_PART_MINUTES) continue;
        const limit = p.maxPerWeek?.[s.shift.group];
        if (limit != null && (weekCounts[p.uid]?.[s.shift.group] || 0) >= Number(limit)) continue;
        if (!canDo(p, s.shift, day, partTimes(a, s.shift))) continue;
        const score = ov + (s.shift.essential ? 30 : 0);
        if (!best || score > best.score) best = { slot: s, score };
      }
      if (best) putPart(best.slot, p, "part");
      else { tooLittle.add(p.uid); issues.push({ day, iso, severity: "note", text: `${DAY_LABELS[day]}: ${p.name} is in for too little of the day to take a shift.` }); }
    }

    // 3. everyone else rotates through the shifts nobody owns
    const rotating = slots.filter((s) => !assigned[s.key] && !reserved.has(s.shift.id));
    const pool = present.filter((p) => !used.has(p.uid) && (p.mode || "pool") === "pool");
    if (rotating.length && pool.length) {
      const rows = rotating.length, cols = pool.length;
      const n = rows + cols;
      const cost = Array.from({ length: n }, () => new Array(n).fill(0));
      for (let r = 0; r < n; r += 1) {
        for (let c = 0; c < n; c += 1) {
          if (r < rows && c < cols) {
            const slot = rotating[r], person = pool[c], group = slot.shift.group;
            const limit = person.maxPerWeek?.[group];
            if (!fitsWhole(availOf[person.uid], slot.shift) || !canDo(person, slot.shift, day) || (limit != null && (weekCounts[person.uid]?.[group] || 0) >= Number(limit))) { cost[r][c] = BIG; continue; }
            const total = totalOf(counts, person.uid) + totalOf(weekCounts, person.uid);
            const share = ((counts[person.uid]?.[group] || 0) + (weekCounts[person.uid]?.[group] || 0)) / (total + 1);
            let v = Math.round(FAIR_WEIGHT * share);
            if (prevGroups[person.uid] === group) v += 25; // the same shift two days running
            if (previous[person.uid]?.[day] === group) v += 10; // the same shift on the same day last week
            if (settings.avoidLateThenEarly !== false && prevGroups[person.uid] === "late" && group === "early") v += 60;
            // tomorrow is already fixed as an early for them (Karen L on a Wednesday), so a late today would be a late then an early
            if (settings.avoidLateThenEarly !== false && group === "late") {
              const tomorrow = DAYS[DAYS.indexOf(day) + 1];
              const rule = tomorrow ? person.dayRules?.[tomorrow] : null;
              if (rule && ruleShiftsOf(rules, rule.shift).some((x) => x.group === "early") && (person.days || []).includes(tomorrow)) v += 200;
            }
            if (settings.rollFridayLate !== false && day === "fri" && group === "late") v += FRIDAY_LATE_WEIGHT * (friLate[person.uid] || 0);
            v += jitter(`${person.uid}|${slot.key}|${iso}`);
            cost[r][c] = v;
          } else if (r < rows) {
            cost[r][c] = rotating[r].shift.essential ? ESSENTIAL_EMPTY : 50 + 10 * (Number(rotating[r].shift.dropOrder) || 5); // leave this shift empty: the lower its drop order, the sooner it is given up
          } else if (c < cols) {
            cost[r][c] = BENCH; // this person has no shift
          } else {
            cost[r][c] = 0;
          }
        }
      }
      const pick = assignMin(cost);
      for (let r = 0; r < rows; r += 1) {
        const c = pick[r];
        if (c >= 0 && c < cols && cost[r][c] < BIG) put(rotating[r], pool[c].uid, "auto");
      }
    }

    // 4. cover for an essential shift that is still empty
    for (const slot of slots) {
      if (assigned[slot.key] || !slot.shift.essential) continue;
      const coverers = present.filter((p) => p.mode === "usual" && (p.coverShifts || []).includes(slot.shift.id) && fitsWhole(availOf[p.uid], slot.shift) && canDo(p, slot.shift, day) && !(p.maxPerWeek?.[slot.shift.group] != null && (weekCounts[p.uid]?.[slot.shift.group] || 0) >= Number(p.maxPerWeek[slot.shift.group])));
      const free = coverers.find((p) => !used.has(p.uid));
      const stepIn = free || coverers[0];
      if (!stepIn) continue;
      if (!free) {
        const leftKey = Object.keys(assigned).find((k) => assigned[k].uid === stepIn.uid);
        if (leftKey) {
          const left = slots.find((s) => s.key === leftKey);
          delete assigned[leftKey];
          issues.push({ day, iso, severity: "note", text: `${DAY_LABELS[day]}: ${stepIn.name} covers ${slot.shift.label}, so ${left.shift.label} is left unstaffed.` });
        }
        used.delete(stepIn.uid);
      }
      put(slot, stepIn.uid, "cover");
    }

    // 5. whatever is still empty
    const unfilled = [];
    for (const slot of slots) {
      if (assigned[slot.key]) continue;
      unfilled.push(slot.key);
      if (slot.shift.essential) issues.push({ day, iso, severity: "gap", text: `${DAY_LABELS[day]}: nobody is available for ${slot.shift.label} (${slot.shift.start}–${slot.shift.end}).` });
      else if (!issues.some((i) => i.day === day && i.text.includes(`${slot.shift.label} is left unstaffed`))) {
        const owners = ownersOnDay(rules, slot.shift, day);
        const place = slots.filter((s) => s.shift.id === slot.shift.id).indexOf(slot);
        const absentOwner = owners.find((o) => !presentUids.has(o.uid));
        // a shift that belongs to certain people is only worth a note when one of them who should be in is not (the morning desk on a day neither part-timer is due in is not a gap)
        if (isOwned(rules, slot.shift) && place >= owners.length) continue;
        const why = absentOwner ? `${absentOwner.name} is not in` : reserved.has(slot.shift.id) ? "nobody is on it" : "there are not enough people";
        issues.push({ day, iso, severity: "note", text: `${DAY_LABELS[day]}: ${slot.shift.label} is not staffed (${why}).` });
      }
    }
    const benched = present.filter((p) => !used.has(p.uid) && !tooLittle.has(p.uid) && (p.mode || "pool") === "pool").map((p) => p.uid);
    for (const uid of benched) issues.push({ day, iso, severity: "note", text: `${DAY_LABELS[day]}: ${byUid[uid].name} has no shift (more people than shifts).` });

    out[day] = { iso, slots: assigned, unfilled };
    const nextPrev = {};
    for (const [key, a] of Object.entries(assigned)) {
      const shift = shiftById(rules, shiftIdOfKey(key));
      nextPrev[a.uid] = shift.group;
      if (day === "fri" && shift.group === "late") friLate[a.uid] = (friLate[a.uid] || 0) + 1;
    }
    prevGroups = nextPrev;
  }
  return { mondayIso, days: out, issues, counts: weekCounts };
}

// Build several weeks in a row, each one starting from what the earlier ones already gave out. `existing` holds weeks already saved (with their hand-fixed places) as { mondayIso: week }.
export function generateWeeks({ rules, firstMonday, weeks, absences = [], history = {}, lockedByWeek = {} }) {
  const results = [];
  let hist = { counts: JSON.parse(JSON.stringify(history.counts || {})), friLate: { ...(history.friLate || {}) }, previous: history.previous || {}, lastFriday: history.lastFriday || {} };
  for (let w = 0; w < weeks; w += 1) {
    const mondayIso = addDays(firstMonday, 7 * w);
    const week = generateWeek({ rules, mondayIso, absences, history: hist, locked: lockedByWeek[mondayIso] || {} });
    results.push(week);
    hist = historyAfter(hist, week, rules);
  }
  return results;
}

// What the history looks like once this week has been worked.
export function historyAfter(history, week, rules) {
  const counts = JSON.parse(JSON.stringify(history.counts || {}));
  const friLate = { ...(history.friLate || {}) };
  const previous = {};
  const lastFriday = {};
  for (const day of DAYS) {
    for (const [key, a] of Object.entries(week.days[day]?.slots || {})) {
      const group = shiftById(rules, shiftIdOfKey(key))?.group;
      if (!group) continue;
      bump(counts, a.uid, group);
      previous[a.uid] = previous[a.uid] || {};
      previous[a.uid][day] = group;
      if (day === "fri") { lastFriday[a.uid] = group; if (group === "late") friLate[a.uid] = (friLate[a.uid] || 0) + 1; }
    }
  }
  return { counts, friLate, previous, lastFriday };
}

// The shift counter for one week (what the rota's counter columns show): { uid: { group: n, total } }. A part shift (until 12) counts as one, as on the current rota.
export function weekCounters(week, rules) {
  const table = {};
  for (const day of DAYS) {
    for (const [key, a] of Object.entries(week.days?.[day]?.slots || {})) {
      const shift = shiftById(rules, shiftIdOfKey(key));
      if (!shift) continue;
      table[a.uid] = table[a.uid] || { total: 0 };
      table[a.uid][shift.group] = (table[a.uid][shift.group] || 0) + 1;
      table[a.uid].total += 1;
    }
  }
  return table;
}
