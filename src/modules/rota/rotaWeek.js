// Helpers around weeks that have been built and saved: what history to build from, which places were fixed by hand, and a check of a week after someone has changed it.
import { DAYS, DAY_LABELS, addDays, availabilityOn, hhmm, shiftById, toMinutes, weekDates } from "./rotaModel.js";
import { canDo, historyAfter, shiftIdOfKey, slotKeyOf } from "./rotaEngine.js";

const HISTORY_WEEKS = 12; // how far back fairness looks

// What each person has already worked, from the saved weeks before this one (the last twelve), in order.
export function historyBefore(saved, mondayIso, rules) {
  const earlier = Object.values(saved || {}).filter((w) => w.mondayIso < mondayIso && w.days).sort((a, b) => a.mondayIso.localeCompare(b.mondayIso)).slice(-HISTORY_WEEKS);
  let history = { counts: {}, friLate: {}, previous: {}, lastFriday: {} };
  for (const week of earlier) history = historyAfter(history, week, rules);
  return history;
}

// { mon: { late: "uid" } } from the places someone fixed by hand ("edited" is { "mon|late": true }).
export function lockedOf(week) {
  const locked = {};
  for (const key of Object.keys(week?.edited || {})) {
    const [day, slot] = key.split("|");
    const uid = week.days?.[day]?.slots?.[slot]?.uid;
    if (!uid) continue;
    locked[day] = locked[day] || {};
    locked[day][slot] = uid;
  }
  return locked;
}

// The slots of every shift on a day, in the order the rota shows them.
export function slotsOfDay(rules, day) {
  const out = [];
  for (const shift of rules.shifts || []) {
    if (!(shift.days || []).includes(day)) continue;
    for (let i = 0; i < Number(shift.count || 1); i += 1) out.push({ key: slotKeyOf(shift, i), shift });
  }
  return out;
}

// Put a person's name on every place, so a saved week can be printed and exported without the rules.
export function withNames(week, rules) {
  const names = Object.fromEntries((rules.people || []).map((p) => [p.uid, p.name]));
  const days = {};
  for (const day of DAYS) {
    const src = week.days?.[day] || { slots: {}, unfilled: [] };
    const slots = {};
    for (const [key, a] of Object.entries(src.slots || {})) slots[key] = { ...a, name: names[a.uid] || a.name || "" };
    days[day] = { iso: src.iso, slots, unfilled: src.unfilled || [] };
  }
  return { ...week, days };
}

// Set one place by hand. uid "" clears it. Returns the week with the change and `edited` marked.
export function setPlace(week, rules, day, slotKey, uid, times = null) {
  const t = typeof times === "string" ? { until: times } : (times || {});
  const names = Object.fromEntries((rules.people || []).map((p) => [p.uid, p.name]));
  const days = JSON.parse(JSON.stringify(week.days || {}));
  const d = days[day] = days[day] || { iso: weekDates(week.mondayIso).find((x) => x.day === day).iso, slots: {}, unfilled: [] };
  d.slots = d.slots || {};
  if (uid) d.slots[slotKey] = { uid, name: names[uid] || "", source: "locked", ...(t.from ? { from: t.from } : {}), ...(t.until ? { until: t.until } : {}) };
  else delete d.slots[slotKey];
  const all = slotsOfDay(rules, day).map((s) => s.key);
  d.unfilled = all.filter((k) => !d.slots[k]);
  return { ...week, days, edited: { ...(week.edited || {}), [`${day}|${slotKey}`]: true } };
}

// Check a week as it now stands (after changes by hand): double bookings, people who are off or don't work that day, hours and weekly limits, and anything empty.
export function checkWeek(rules, week, absences = []) {
  const issues = [];
  const people = Object.fromEntries((rules.people || []).map((p) => [p.uid, p]));
  const weekCount = {};
  let prev = {};
  for (const { day, iso } of weekDates(week.mondayIso)) {
    const slots = week.days?.[day]?.slots || {};
    const seen = {};
    const today = {};
    for (const key of slotsOfDay(rules, day).map((s) => s.key)) {
      const a = slots[key];
      const shift = shiftById(rules, shiftIdOfKey(key));
      if (!a) {
        if (shift.essential) issues.push({ day, iso, severity: "gap", text: `${DAY_LABELS[day]}: nobody is on ${shift.label} (${shift.start}–${shift.end}).` });
        else issues.push({ day, iso, severity: "note", text: `${DAY_LABELS[day]}: ${shift.label} is not staffed.` });
        continue;
      }
      const p = people[a.uid];
      const who = p?.name || a.name || "Someone";
      seen[a.uid] = (seen[a.uid] || 0) + 1;
      today[a.uid] = shift.group;
      weekCount[a.uid] = weekCount[a.uid] || {};
      weekCount[a.uid][shift.group] = (weekCount[a.uid][shift.group] || 0) + 1;
      if (!p) { issues.push({ day, iso, severity: "gap", text: `${DAY_LABELS[day]}: ${who} is on ${shift.label} but is no longer on the rota.` }); continue; }
      const avail = availabilityOn(absences, a.uid, iso);
      const placeStart = Math.max(toMinutes(shift.start), a.from ? toMinutes(a.from) : 0);
      const placeEnd = Math.min(toMinutes(shift.end), a.until ? toMinutes(a.until) : 1440);
      if (!avail) issues.push({ day, iso, severity: "gap", text: `${DAY_LABELS[day]}: ${who} is on ${shift.label} but is off.` });
      else if (placeStart < avail.from || placeEnd > avail.until) issues.push({ day, iso, severity: "gap", text: `${DAY_LABELS[day]}: ${who} is on ${shift.label} but is off for part of it (in ${hhmm(avail.from)} to ${hhmm(avail.until)} only).` });
      else if (!(p.days || []).includes(day)) issues.push({ day, iso, severity: "gap", text: `${DAY_LABELS[day]}: ${who} is on ${shift.label} but does not work on a ${DAY_LABELS[day]}.` });
      else if (!canDo(p, shift, day, { until: a.until || null, from: a.from || null })) issues.push({ day, iso, severity: "gap", text: `${DAY_LABELS[day]}: ${who} cannot do ${shift.label} (their hours or their rules).` });
      if (a.from || (a.until && toMinutes(a.until) < toMinutes(shift.end))) issues.push({ day, iso, severity: "note", text: `${DAY_LABELS[day]}: ${who} is on ${shift.label} ${a.from ? `from ${a.from}` : ""}${a.from && a.until ? " " : ""}${a.until ? `until ${a.until}` : ""} only, so ${a.from && a.until ? "the rest" : a.from ? "the first part" : "the rest"} of the shift is for the team to absorb.` });
      const limit = p.maxPerWeek?.[shift.group];
      if (limit != null && weekCount[a.uid][shift.group] > Number(limit)) issues.push({ day, iso, severity: "gap", text: `${DAY_LABELS[day]}: ${who} has more than ${limit} ${shift.group} shift${Number(limit) === 1 ? "" : "s"} this week.` });
      if (rules.settings?.avoidLateThenEarly !== false && prev[a.uid] === "late" && shift.group === "early") issues.push({ day, iso, severity: "note", text: `${DAY_LABELS[day]}: ${who} has an early after a late.` });
    }
    for (const [uid, count] of Object.entries(seen)) if (count > 1) issues.push({ day, iso, severity: "gap", text: `${DAY_LABELS[day]}: ${people[uid]?.name || "Someone"} is on ${count} shifts.` });
    prev = today;
  }
  return issues;
}

export const nextMonday = (mondayIso) => addDays(mondayIso, 7);
