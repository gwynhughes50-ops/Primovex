// What the reception team's phones see of the rota. The coordinator publishes a week, and the team get a staff-safe copy of it: who is on which shift, and the shift times. It never holds the check's
// notes, which places were changed by hand, anyone's rules, or anyone's time off, so the team can see who is on a shift (they need to, to swap) but never who is off or why. Pure logic.
import { DAYS, shiftById, weekDates } from "./rotaModel.js";
import { shiftIdOfKey } from "./rotaEngine.js";
import { slotsOfDay } from "./rotaWeek.js";

// The days of a week reduced to what the team may see: { mon: { iso, slots: { key: { uid, name, from?, until? } } } }
export function publishedDays(week, rules) {
  const names = Object.fromEntries((rules.people || []).map((p) => [p.uid, p.name]));
  const out = {};
  for (const { day, iso } of weekDates(week.mondayIso)) {
    const slots = {};
    for (const [key, a] of Object.entries(week.days?.[day]?.slots || {})) slots[key] = { uid: a.uid, name: names[a.uid] || a.name || "", ...(a.from ? { from: a.from } : {}), ...(a.until ? { until: a.until } : {}) };
    out[day] = { iso, slots };
  }
  return out;
}

// The shifts the team's phones need to show a week: the slot, its name and its times, in the order of the rota
export function publishedSlots(rules) {
  const seen = new Set(); const list = [];
  for (const day of DAYS) for (const s of slotsOfDay(rules, day)) if (!seen.has(s.key)) { seen.add(s.key); list.push({ key: s.key, label: s.shift.label, start: s.shift.start, end: s.shift.end, days: DAYS.filter((d) => slotsOfDay(rules, d).some((x) => x.key === s.key)) }); }
  return list.sort((a, b) => ((rules.shifts || []).indexOf(shiftById(rules, shiftIdOfKey(a.key))) - (rules.shifts || []).indexOf(shiftById(rules, shiftIdOfKey(b.key)))) || a.key.localeCompare(b.key));
}

// The record to publish for a built week (the server adds who and when)
export function projectPublished(week, rules) {
  return { mondayIso: week.mondayIso, teamUids: (rules.people || []).map((p) => p.uid), slots: publishedSlots(rules), days: publishedDays(week, rules) };
}

// Has the week changed since it was published?
export const isPublishedCurrent = (week, published, rules) => Boolean(published) && JSON.stringify(publishedDays(week, rules)) === JSON.stringify(published.days);

// ---- what a person sees ----
// The person's own shifts from today on, across the published weeks: [{ monday, day, iso, key, label, start, end, from, until }]
export function myShifts(publishedWeeks, uid, todayIso) {
  const out = [];
  for (const week of Object.values(publishedWeeks || {})) {
    for (const day of DAYS) {
      const d = week.days?.[day];
      if (!d || d.iso < todayIso) continue;
      for (const [key, a] of Object.entries(d.slots || {})) {
        if (a.uid !== uid) continue;
        const slot = (week.slots || []).find((s) => s.key === key);
        out.push({ monday: week.mondayIso, day, iso: d.iso, key, label: slot?.label || key, start: a.from || slot?.start, end: a.until || slot?.end, from: a.from || "", until: a.until || "" });
      }
    }
  }
  return out.sort((x, y) => x.iso.localeCompare(y.iso) || String(x.start).localeCompare(String(y.start)));
}

// Who is on each shift on one day: [{ key, label, start, end, uid, name, from, until }], in the order of the rota (empty shifts left out)
export function dayRoster(week, day) {
  const d = week?.days?.[day];
  if (!d) return [];
  return (week.slots || []).filter((s) => d.slots?.[s.key]).map((s) => { const a = d.slots[s.key]; return { key: s.key, label: s.label, start: a.from || s.start, end: a.until || s.end, uid: a.uid, name: a.name, from: a.from || "", until: a.until || "" }; });
}
