import { ABSENCE_REASONS, DAYS, DAY_LABELS, addDays, isoOf, mondayOf, timeLabel } from "@/modules/rota/rotaModel";
import { slotsOfDay } from "@/modules/rota/rotaWeek";

// "Coming up" (the next fortnight, in date order) and "In today" (who is on the reception rota today and who is off) for the Practice
// Manager's Dashboard. Pure: the Dashboard hands in what the rest of the app already knows. No patient details: a SAR or a concern is
// its reference.

export const WINDOW_DAYS = 14;
export const MAX_COMING = 8;

const SHORT_DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const asDate = (value) => {
  if (!value) return null;
  const d = typeof value.toDate === "function" ? value.toDate() : value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};
const dayDiff = (iso, todayIso) => Math.round((new Date(`${iso}T12:00:00`) - new Date(`${todayIso}T12:00:00`)) / 86400000);

// "Today", "Tomorrow", "Wed 18 Nov"
export function whenLabel(iso, todayIso) {
  const diff = dayDiff(iso, todayIso);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  const d = new Date(`${iso}T12:00:00`);
  return `${SHORT_DAY[d.getDay()]} ${d.getDate()} ${MONTH[d.getMonth()]}`;
}

// What is NOT already in "Needs you", so nothing is shown twice: SARs due in more than a week (a SAR due sooner is listed there with a Remind
// button), concerns due in more than five days (sooner ones are counted there), and time off on the rota. Certificates and COSHH reviews are
// left out altogether: they are listed in "Needs you" from the moment they come into their warning period, which is longer than this window.
export const SAR_IN_NEEDS_YOU_DAYS = 7;
export const CONCERN_IN_NEEDS_YOU_DAYS = 5;
export const COMING_KINDS = [{ key: "SAR", label: "SARs" }, { key: "Concern", label: "Concerns" }, { key: "Off", label: "Time off" }];

// opts: { now, days (7, 14 or 28), hide (kinds left out), sarRows, concerns, absences }
export function buildComingUp({ now = new Date(), days = WINDOW_DAYS, hide = [], sarRows = [], concerns = [], absences = [] } = {}) {
  const todayIso = isoOf(now);
  const lastIso = addDays(todayIso, days);
  const inWindow = (iso, fromDay = 0) => !!iso && iso >= addDays(todayIso, fromDay) && iso <= lastIso;
  const items = [];

  if (!hide.includes("SAR")) {
    for (const r of sarRows) {
      const d = asDate(r.dueDate);
      const iso = d ? isoOf(d) : "";
      if (inWindow(iso, SAR_IN_NEEDS_YOU_DAYS + 1)) items.push({ id: `sar-${r.id}`, iso, kind: "SAR", text: `${r.reference} is due`, detail: r.assignedToName || "Not assigned", to: "/sars-to-chase" });
    }
  }
  if (!hide.includes("Concern")) {
    for (const c of concerns) {
      if (["closed", "archived"].includes(c.status || "received")) continue;
      const reference = c.reference || c.id;
      if (!c.acknowledgedAt) {
        const ack = asDate(c.acknowledgementDueAt);
        if (ack && inWindow(isoOf(ack), CONCERN_IN_NEEDS_YOU_DAYS + 1)) items.push({ id: `concern-ack-${c.id}`, iso: isoOf(ack), kind: "Concern", text: `${reference}: acknowledgement due`, detail: "", to: "/governance/concerns" });
      }
      const final = asDate(c.finalResponseDueAt);
      if (final && inWindow(isoOf(final), CONCERN_IN_NEEDS_YOU_DAYS + 1)) items.push({ id: `concern-final-${c.id}`, iso: isoOf(final), kind: "Concern", text: `${reference}: final response due`, detail: "", to: "/governance/concerns" });
    }
  }
  if (!hide.includes("Off")) {
    for (const a of absences) {
      if (!inWindow(a.from)) continue;
      const reason = a.reason === "leave" ? "leave" : a.reason === "toil" ? "TOIL" : "";
      const span = a.to && a.to !== a.from ? ` to ${whenLabel(a.to, todayIso)}` : "";
      items.push({ id: `off-${a.id || `${a.uid}-${a.from}`}`, iso: a.from, kind: "Off", text: `${a.name || "Someone"} is off${span}`, detail: reason, to: "/reception-rota?tab=off" });
    }
  }

  items.sort((x, y) => x.iso.localeCompare(y.iso) || x.kind.localeCompare(y.kind) || x.text.localeCompare(y.text));
  return { items: items.slice(0, MAX_COMING).map((i) => ({ ...i, when: whenLabel(i.iso, todayIso) })), more: Math.max(0, items.length - MAX_COMING), todayIso };
}

// Who is on the reception rota today (or, at a weekend, on the next working day) and who is off.
// weeks: { [mondayIso]: week }, rules: the rota rules (names and shifts), absences: [{ uid, name, from, to, fromTime, toTime, reason }]
export function buildInToday({ now = new Date(), weeks = {}, rules = null, absences = [] } = {}) {
  let iso = isoOf(now);
  const weekday = now.getDay(); // 0 Sunday
  if (weekday === 6) iso = addDays(iso, 2); else if (weekday === 0) iso = addDays(iso, 1);
  const monday = mondayOf(iso);
  const dayKey = DAYS[Math.round((new Date(`${iso}T12:00:00`) - new Date(`${monday}T12:00:00`)) / 86400000)];
  const label = iso === isoOf(now) ? "today" : DAY_LABELS[dayKey];
  const week = weeks?.[monday] || null;

  const off = absences
    .filter((a) => a.from <= iso && (a.to || a.from) >= iso)
    .map((a) => {
      const startsLate = a.from === iso && a.fromTime ? `from ${timeLabel(a.fromTime)}` : "";
      const finishesEarly = (a.to || a.from) === iso && a.toTime ? `until ${timeLabel(a.toTime)}` : "";
      return { uid: a.uid, name: a.name || "Someone", reason: a.reason === "leave" ? "leave" : a.reason === "toil" ? "TOIL" : "off", part: [startsLate, finishesEarly].filter(Boolean).join(" ") };
    })
    .sort((x, y) => x.name.localeCompare(y.name));

  if (!week || !rules || !dayKey) return { iso, label, hasWeek: false, on: [], off, people: 0 };
  const names = Object.fromEntries((rules.people || []).map((p) => [p.uid, p.name]));
  const day = week.days?.[dayKey] || { slots: {} };
  const on = [];
  for (const slot of slotsOfDay(rules, dayKey)) {
    const a = day.slots?.[slot.key];
    if (!a || !a.uid) continue;
    on.push({ uid: a.uid, name: names[a.uid] || a.name || "Someone", shift: slot.shift?.label || "Shift", start: a.from || slot.shift?.start || "", end: a.until || slot.shift?.end || "" });
  }
  return { iso, label, hasWeek: true, on, off, people: new Set(on.map((p) => p.uid)).size };
}

export const OFF_REASON_LABEL = ABSENCE_REASONS;
