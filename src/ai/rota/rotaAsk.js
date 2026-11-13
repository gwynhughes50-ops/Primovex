// "Show my shifts": a member of the reception team asks Ask Primovex for their own shifts, read from the weeks the coordinator has published to them.
// Pure (no React, no Firestore): the lookup in readOnlyTools.js reads the published weeks and hands them in. It only ever tells a person their own
// shifts; who else is on, and who is off, are not part of this.

import { DAYS, DAY_LABELS, addDays, isoOf, mondayOf, timeLabel } from "../../modules/rota/rotaModel.js";
import { myShifts } from "../../modules/rota/rotaPublish.js";

const WEEKDAY = { monday: "mon", tuesday: "tue", wednesday: "wed", thursday: "thu", friday: "fri" };
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SHORT = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri" };

// null when it isn't a question about the person's own shifts. Otherwise { when }, where when is
// "next" (the next few), "today", "tomorrow", "week", "nextWeek" or a weekday ("mon" ... "fri").
export function parseMyShifts(prompt) {
  const text = String(prompt || "").toLowerCase().replace(/[’‘]/g, "'").trim().replace(/[?.!]+$/g, "");
  if (!text) return null;
  // changing a shift or asking how is something else (help and the rota's own requests)
  if (/\b(?:how\s+(?:do|to|can)|swap|swapping|change|cover|request|ask\s+for|trade|book|add|remove|report)\b/.test(text)) return null;
  const mine = /\bmy\s+(?:next\s+|upcoming\s+|current\s+)?(?:shifts?|rota|hours|working\s+hours|schedule)\b/.test(text)
    || /\bwhen\s+(?:am\s+i|do\s+i|i'm|im)\s+(?:next\s+)?(?:working|work|in|on)\b/.test(text)
    || /\bwhat\s+(?:shift|shifts|time|hours)\s+(?:am\s+i|do\s+i|i'm|im)\b/.test(text)
    || /\bam\s+i\s+(?:working|in|on)\b/.test(text)
    || /\bwhat\s+am\s+i\s+(?:working|on)\b/.test(text);
  if (!mine) return null;
  let when = "next";
  if (/\btoday\b/.test(text)) when = "today";
  else if (/\btomorrow\b/.test(text)) when = "tomorrow";
  else if (/\bnext\s+week\b/.test(text)) when = "nextWeek";
  else if (/\b(?:this\s+week|the\s+week|week)\b/.test(text)) when = "week";
  else {
    const named = text.match(/\b(monday|tuesday|wednesday|thursday|friday)\b/);
    if (named) when = WEEKDAY[named[1]];
  }
  return { when };
}

const dayText = (iso) => {
  const d = new Date(`${iso}T12:00:00`);
  const key = DAYS[(d.getDay() + 6) % 7];
  return `${SHORT[key] || d.toLocaleDateString("en-GB", { weekday: "short" })} ${d.getDate()} ${MONTH[d.getMonth()]}`;
};
const shiftText = (s) => `${s.label}, ${timeLabel(s.start)}–${timeLabel(s.end)}${s.from ? " (a part shift)" : ""}`;

// The iso date a "when" means, or the range of them
function rangeOf(when, todayIso) {
  if (when === "today") return { from: todayIso, to: todayIso, label: "today" };
  if (when === "tomorrow") { const iso = addDays(todayIso, 1); return { from: iso, to: iso, label: "tomorrow" }; }
  if (when === "week") { const monday = mondayOf(todayIso); return { from: todayIso, to: addDays(monday, 4), label: "this week" }; }
  if (when === "nextWeek") { const monday = addDays(mondayOf(todayIso), 7); return { from: monday, to: addDays(monday, 4), label: "next week" }; }
  if (DAYS.includes(when)) {
    const monday = mondayOf(todayIso);
    let iso = addDays(monday, DAYS.indexOf(when));
    if (iso < todayIso) iso = addDays(iso, 7);
    return { from: iso, to: iso, label: `on ${DAY_LABELS[when]}` };
  }
  return null;
}

// weeks: the published weeks that list this person ({ [mondayIso]: week }); uid: the person; now: today
export function myShiftsAnswer({ weeks = {}, uid = "", now = new Date(), when = "next" }) {
  const todayIso = isoOf(now);
  const listed = Object.values(weeks || {}).some((week) => (week.teamUids || []).includes(uid));
  if (!listed) return { found: false, text: "I can't see any shifts for you. Either you're not on the reception rota, or your coordinator hasn't published a week that includes you yet." };

  const all = myShifts(weeks, uid, todayIso);
  const range = rangeOf(when, todayIso);
  if (!range) {
    const next = all.slice(0, 5);
    if (!next.length) return { found: true, count: 0, text: "You have no upcoming shifts in the weeks that have been published." };
    return { found: true, count: next.length, text: `Your next shifts:\n${next.map((s) => `${dayText(s.iso)}: ${shiftText(s)}`).join("\n")}` };
  }
  const inRange = all.filter((s) => s.iso >= range.from && s.iso <= range.to);
  const single = when === "today" || when === "tomorrow" || DAYS.includes(when);
  if (!inRange.length) {
    const nextOne = all.find((s) => s.iso > range.to);
    return { found: true, count: 0, text: `${single ? `You're not on a shift ${range.label}.` : `You have no shifts ${range.label}.`}${nextOne ? ` Your next is ${dayText(nextOne.iso)}: ${shiftText(nextOne)}.` : ""}` };
  }
  if (single) return { found: true, count: inRange.length, text: `${range.label === "today" ? "Today" : range.label === "tomorrow" ? "Tomorrow" : cap(range.label)} you're on ${inRange.map(shiftText).join(" and ")}.` };
  return { found: true, count: inRange.length, text: `Your shifts ${range.label}:\n${inRange.map((s) => `${dayText(s.iso)}: ${shiftText(s)}`).join("\n")}` };
}

const cap = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);
