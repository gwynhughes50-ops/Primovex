// What a member of the reception team can ask Ask Primovex about the rota: their own shifts, how many lates and earlies they have, who is on, and
// "swap my Tuesday late". Read from the weeks the coordinator has published to them (who is on which shift, never who is off), so it only ever
// shows what My rota shows. Pure (no React, no Firestore): the lookups in readOnlyTools.js read the published weeks and the swap options and hand them in.

import { DAYS, DAY_LABELS, addDays, isoOf, mondayOf, timeLabel } from "../../modules/rota/rotaModel.js";
import { dayRoster, myShifts } from "../../modules/rota/rotaPublish.js";
import { createProposal } from "../../orb/actionProposals.js";

const WEEKDAY = { monday: "mon", tuesday: "tue", wednesday: "wed", thursday: "thu", friday: "fri" };
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SHORT = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri" };
const cap = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const clean = (prompt) => String(prompt || "").toLowerCase().replace(/[’‘]/g, "'").trim().replace(/[?.!]+$/g, "");

// ---- kinds of shift, from a shift's name ----
export const KINDS = { early: "early", mid: "mid", late: "late", admin: "admin", desk: "desk", tyelan: "Ty Elan" };
const KIND_WORDS = [["tyelan", /\bty\s*elan\b/], ["early", /\bearl(?:y|ies)\b/], ["late", /\blates?\b/], ["mid", /\bmids?\b/], ["admin", /\badmin\b/], ["desk", /\bdesk\b|\bphones?\b/]];
export function kindOfLabel(label) {
  const l = String(label || "").toLowerCase();
  if (/ty\s*elan/.test(l)) return "tyelan";
  if (l.startsWith("early")) return "early";
  if (l.startsWith("mid")) return "mid";
  if (l.startsWith("late")) return "late";
  if (l.startsWith("admin")) return "admin";
  if (l.startsWith("desk")) return "desk";
  return "";
}
const kindIn = (text) => { for (const [kind, pattern] of KIND_WORDS) if (pattern.test(text)) return kind; return ""; };

// ---- when ----
// today / tomorrow / a weekday ("mon".."fri") / "week" / "nextWeek" / "all" (every published week) / "next" (the next few)
function whenOf(text, fallback = "next") {
  if (/\btoday\b/.test(text)) return "today";
  if (/\btomorrow\b/.test(text)) return "tomorrow";
  if (/\bnext\s+week\b/.test(text)) return "nextWeek";
  if (/\b(?:this\s+week|the\s+week)\b/.test(text)) return "week";
  const named = text.match(/\b(monday|tuesday|wednesday|thursday|friday)\b/);
  if (named) return WEEKDAY[named[1]];
  if (/\b(?:rota|this\s+rota|altogether|in\s+total|total|overall|published|all\s+weeks|so\s+far)\b/.test(text)) return "all";
  if (/\bweek\b/.test(text)) return "week";
  return fallback;
}

function rangeOf(when, todayIso) {
  if (when === "today") return { from: todayIso, to: todayIso, label: "today" };
  if (when === "tomorrow") { const iso = addDays(todayIso, 1); return { from: iso, to: iso, label: "tomorrow" }; }
  if (when === "week") { const monday = mondayOf(todayIso); return { from: monday, to: addDays(monday, 4), label: "this week" }; }
  if (when === "nextWeek") { const monday = addDays(mondayOf(todayIso), 7); return { from: monday, to: addDays(monday, 4), label: "next week" }; }
  if (when === "all") return { from: mondayOf(todayIso), to: "9999-12-31", label: "in the published weeks" };
  if (DAYS.includes(when)) {
    const monday = mondayOf(todayIso);
    let iso = addDays(monday, DAYS.indexOf(when));
    if (iso < todayIso) iso = addDays(iso, 7);
    return { from: iso, to: iso, label: `on ${DAY_LABELS[when]}` };
  }
  return null;
}

const dayText = (iso) => {
  const d = new Date(`${iso}T12:00:00`);
  const key = DAYS[(d.getDay() + 6) % 7];
  return `${SHORT[key] || d.toLocaleDateString("en-GB", { weekday: "short" })} ${d.getDate()} ${MONTH[d.getMonth()]}`;
};
const shiftText = (s) => `${s.label}, ${timeLabel(s.start)}–${timeLabel(s.end)}${s.from || s.until ? " (a part shift)" : ""}`;
const isListed = (weeks, uid) => Object.values(weeks || {}).some((week) => (week.teamUids || []).includes(uid));
const NOT_LISTED = "I can't see any shifts for you. Either you're not on the reception rota, or your coordinator hasn't published a week that includes you yet.";

// ---- my shifts ----
// null when it isn't a question about the person's own shifts. Otherwise { when }.
export function parseMyShifts(prompt) {
  const text = clean(prompt);
  if (!text) return null;
  // changing a shift or asking how is something else (help and the rota's own requests), and counting is its own question
  if (/\b(?:how\s+(?:do|to|can)|how\s+many|how\s+much|swap|swapping|change|cover|request|ask\s+for|trade|book|add|remove|report|count|total)\b/.test(text)) return null;
  const mine = /\bmy\s+(?:next\s+|upcoming\s+|current\s+)?(?:shifts?|rota|hours|working\s+hours|schedule)\b/.test(text)
    || /\bwhen\s+(?:am\s+i|do\s+i|i'm|im)\s+(?:next\s+)?(?:working|work|in|on)\b/.test(text)
    || /\bwhat\s+(?:shift|shifts|time|hours)\s+(?:am\s+i|do\s+i|i'm|im)\b/.test(text)
    || /\bam\s+i\s+(?:working|in|on)\b/.test(text)
    || /\bwhat\s+am\s+i\s+(?:working|on)\b/.test(text);
  if (!mine) return null;
  return { when: whenOf(text) === "all" ? "next" : whenOf(text) };
}

// weeks: the published weeks that list this person ({ [mondayIso]: week }); uid: the person; now: today
export function myShiftsAnswer({ weeks = {}, uid = "", now = new Date(), when = "next" }) {
  const todayIso = isoOf(now);
  if (!isListed(weeks, uid)) return { found: false, text: NOT_LISTED };

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

// ---- how many lates, earlies ... ----
// { kind, when } or null. kind is "" for "how many shifts" in general.
export function parseMyCounts(prompt) {
  const text = clean(prompt);
  if (!text) return null;
  if (/\b(?:how\s+(?:do|to|can)\s+i|swap|change|request)\b/.test(text)) return null;
  const counting = /\bhow\s+many\b/.test(text) || /\b(?:count|total|number\s+of|breakdown|break\s+down|split|summary)\b/.test(text);
  const mine = /\b(?:i|me|my|i've|ive|have\s+i|do\s+i|am\s+i)\b/.test(text);
  if (!counting || !mine) return null;
  const kind = kindIn(text);
  const asksShifts = /\bshifts?\b|\bhours\b/.test(text) || kind;
  if (!asksShifts) return null;
  return { kind, when: whenOf(text, "all") };
}

const slotKindOf = (week, key) => kindOfLabel((week.slots || []).find((s) => s.key === key)?.label);

// how many shifts of each kind, for one person, in the weeks and range
export function countShifts(weeks, uid, range) {
  const counts = { early: 0, mid: 0, late: 0, admin: 0, desk: 0, tyelan: 0, other: 0, total: 0 };
  for (const week of Object.values(weeks || {})) {
    for (const day of DAYS) {
      const d = week.days?.[day];
      if (!d || d.iso < range.from || d.iso > range.to) continue;
      for (const [key, a] of Object.entries(d.slots || {})) {
        if (a.uid !== uid) continue;
        const kind = slotKindOf(week, key) || "other";
        counts[kind] += 1; counts.total += 1;
      }
    }
  }
  return counts;
}

const KIND_NOUN = { early: ["early", "earlies"], mid: ["mid", "mids"], late: ["late", "lates"], admin: ["admin shift", "admin shifts"], desk: ["desk shift", "desk shifts"], tyelan: ["Ty Elan shift", "Ty Elan shifts"] };

export function myCountsAnswer({ weeks = {}, uid = "", now = new Date(), kind = "", when = "all" }) {
  const todayIso = isoOf(now);
  if (!isListed(weeks, uid)) return { found: false, text: NOT_LISTED };
  const range = rangeOf(when, todayIso) || rangeOf("all", todayIso);
  const mine = countShifts(weeks, uid, range);
  const weekCount = Object.values(weeks).filter((w) => w.mondayIso >= range.from.slice(0, 10) || addDays(w.mondayIso, 4) >= range.from).filter((w) => w.mondayIso <= range.to).length;
  const where = when === "all" ? `in the ${plural(weekCount || Object.keys(weeks).length, "published week")}` : range.label;
  if (!mine.total) return { found: true, count: 0, text: `You have no shifts ${when === "all" ? where : range.label}.` };

  // the team's average for the same kind over the same range, from the same published weeks (who is on a shift is visible to everyone on the rota)
  const team = [...new Set(Object.values(weeks).flatMap((w) => w.teamUids || []))];
  const average = (k) => {
    if (team.length < 3) return null;
    const total = team.reduce((sum, u) => sum + (k ? countShifts(weeks, u, range)[k] : countShifts(weeks, u, range).total), 0);
    return Math.round((total / team.length) * 10) / 10;
  };
  if (kind) {
    const [one, many] = KIND_NOUN[kind] || [kind, `${kind}s`];
    const n = mine[kind];
    const avg = average(kind);
    return { found: true, count: n, text: `${n === 0 ? `You have no ${many}` : `You have ${plural(n, one, many)}`} ${where}.${avg !== null ? ` The team average is ${avg}.` : ""}` };
  }
  const parts = ["early", "mid", "late", "admin", "desk", "tyelan"].filter((k) => mine[k]).map((k) => plural(mine[k], ...(KIND_NOUN[k] || [k, `${k}s`])));
  if (mine.other) parts.push(plural(mine.other, "other shift"));
  return { found: true, count: mine.total, text: `You have ${plural(mine.total, "shift")} ${where}: ${parts.join(", ")}.` };
}

// ---- who is on ----
// { when, kind, withMe } or null. "Who's in today?" (without "on" or "working") is about sign-ins, not the rota.
export function parseWhoIsOn(prompt) {
  const text = clean(prompt);
  if (!text) return null;
  if (/\b(?:how\s+(?:do|to|can)|swap|change|rota\s+is\s+wrong|holiday|leave|toil|off|sick|away|absent|call)\b/.test(text)) return null;
  const asks = /\bwho(?:'s|s|\s+is|\s+are|\s+am\s+i)\s+(?:also\s+)?(?:on|working|covering|doing)\b/.test(text) || /\bwho\s+(?:am\s+i|do\s+i)\s+(?:working|work)\s+with\b/.test(text) || /\bwho(?:'s|s|\s+is)\s+on\s+with\s+me\b/.test(text);
  if (!asks) return null;
  return { when: whenOf(text, "today"), kind: kindIn(text), withMe: /\bwith\s+me\b|\bam\s+i\s+working\s+with\b|\bdo\s+i\s+work\s+with\b/.test(text) };
}

export function whoIsOnAnswer({ weeks = {}, uid = "", now = new Date(), when = "today", kind = "", withMe = false }) {
  const todayIso = isoOf(now);
  if (!isListed(weeks, uid)) return { found: false, text: NOT_LISTED };
  const range = rangeOf(when === "all" || when === "week" || when === "nextWeek" || when === "next" ? "today" : when, todayIso) || rangeOf("today", todayIso);
  const iso = range.from;
  const monday = mondayOf(iso);
  const week = weeks[monday];
  const dayKey = DAYS[Math.round((new Date(`${iso}T12:00:00`) - new Date(`${monday}T12:00:00`)) / 86400000)];
  if (!week || !dayKey || !week.days?.[dayKey]) return { found: true, count: 0, text: `Nothing has been published for ${range.label === "today" ? "today" : range.label}, so I can't say who is on.` };
  let roster = dayRoster(week, dayKey);
  if (kind) roster = roster.filter((r) => kindOfLabel(r.label) === kind);
  if (!roster.length) return { found: true, count: 0, text: `Nobody is shown on ${kind ? `the ${KINDS[kind]}` : "a shift"} ${range.label}.` };
  const mineToday = roster.find((r) => r.uid === uid);
  const others = roster.filter((r) => r.uid !== uid);
  const lines = (withMe ? others : roster).map((r) => `${r.name || "Someone"} (${r.label}, ${timeLabel(r.start)}–${timeLabel(r.end)})${r.uid === uid ? " that's you" : ""}`);
  const when2 = range.label; // "today", "tomorrow" or "on Wednesday"
  const heading = cap(when2.replace(/^on /, ""));
  if (withMe) {
    if (!mineToday) return { found: true, count: 0, text: `You're not on a shift ${when2}, so I haven't got anyone to show you.` };
    return { found: true, count: others.length, text: `${cap(when2)} you're on ${shiftText(mineToday)}. Also on:\n${lines.join("\n")}` };
  }
  return { found: true, count: roster.length, text: `${heading}${kind ? ` (${KINDS[kind]})` : ""}:\n${lines.join("\n")}` };
}

// ---- swap my shift ----
// { day, kind, withName, theirDay, theirKind } or null. "How do I swap a shift?" is help and never gets here.
export function parseSwap(prompt) {
  const text = clean(prompt);
  if (!text) return null;
  if (/\bhow\s+(?:do|to|can)\b/.test(text)) return null;
  if (!/\b(?:swap|swapping|switch|trade)\b/.test(text)) return null;
  const mine = /\bmy\b/.test(text) || /\b(?:i\s+(?:want|need|would\s+like|'d\s+like)\s+to|can\s+i|could\s+i|who\s+can|can\s+(?:anyone|someone|somebody))\b/.test(text);
  if (!mine) return null;
  const withMatch = text.match(/\bwith\s+([a-z][a-z'-]+)(?:\s+(?:for|on)\s+(?:(?:her|his|their|[a-z]+'s)\s+)?(?:(monday|tuesday|wednesday|thursday|friday)\s*)?([a-z]+)?)?/);
  const NOT_A_NAME = new Set(["me", "someone", "anyone", "somebody", "a", "the", "my", "another", "somebody"]);
  const withName = withMatch && !NOT_A_NAME.has(withMatch[1]) ? withMatch[1] : "";
  const mineText = withName ? text.slice(0, text.indexOf(` with ${withName}`)) : text;
  const day = whenOf(mineText, "");
  return {
    day: day === "all" || day === "week" || day === "nextWeek" || day === "next" ? "" : day,
    kind: kindIn(mineText),
    withName,
    theirDay: withMatch && withMatch[2] ? WEEKDAY[withMatch[2]] : "",
    theirKind: withName ? kindIn(text.slice(text.indexOf(` with ${withName}`) + 6)) : "",
  };
}

// the person's own shifts that this swap could be about: from today, on the day and of the kind they said
export function swapCandidates({ weeks = {}, uid = "", now = new Date(), day = "", kind = "" }) {
  const todayIso = isoOf(now);
  let list = myShifts(weeks, uid, todayIso);
  if (day) { const range = rangeOf(day, todayIso); if (range) list = list.filter((s) => s.iso >= range.from && s.iso <= range.to); }
  if (kind) list = list.filter((s) => kindOfLabel(s.label) === kind);
  return list;
}

const askFor = (s) => `swap my ${SHORT[s.day] || s.day} ${s.label}`;

// The reply to "swap my Tuesday late": which of their shifts, which colleague, and then the card that asks the colleague.
//   candidates: swapCandidates(...); options: the server's swaps that work for the chosen shift [{ withUid, name, monday, day, key, label, changesHours }] or null before they are known
export function swapReply({ parsed, candidates = [], options = null }) {
  if (!candidates.length) return { stage: "none", text: `You don't have ${parsed.day ? `a${parsed.kind ? ` ${KINDS[parsed.kind]}` : ""} shift on ${DAY_LABELS[parsed.day] || parsed.day}` : "any upcoming shift"} to swap in the weeks that have been published.` };
  if (candidates.length > 1) {
    return { stage: "choose-shift", text: "Which shift do you want to swap?", followUps: candidates.slice(0, 5).map((s) => ({ label: `${dayText(s.iso)}: ${shiftText(s)}`, ask: `${askFor(s)}${parsed.withName ? ` with ${parsed.withName}` : ""}`, color: "#0ea5e9" })) };
  }
  const shift = candidates[0];
  if (options === null) return { stage: "need-options", shift };
  if (!options.length) return { stage: "no-options", shift, text: `No one can swap with your ${dayText(shift.iso)} ${shift.label} without breaking someone's rules or time off. You can ask the coordinator for a change in My rota instead.` };
  let chosen = options;
  if (parsed.withName) chosen = chosen.filter((o) => String(o.name || "").toLowerCase().split(/\s+/)[0] === parsed.withName || String(o.name || "").toLowerCase().includes(parsed.withName));
  if (parsed.theirDay) chosen = chosen.filter((o) => o.day === parsed.theirDay);
  if (parsed.theirKind) chosen = chosen.filter((o) => kindOfLabel(o.label) === parsed.theirKind || String(o.label || "").toLowerCase().includes(KINDS[parsed.theirKind].toLowerCase()));
  if (parsed.withName && !chosen.length) return { stage: "no-match", shift, text: `${cap(parsed.withName)} can't swap with your ${dayText(shift.iso)} ${shift.label} (or isn't on the rota). ${options.length === 1 ? "The swap that works is" : "Swaps that work:"}\n${options.slice(0, 6).map((o) => `${o.name}: ${o.label}`).join("\n")}` };
  if (chosen.length === 1) {
    const o = chosen[0];
    const proposal = createProposal({
      kind: "rota-swap",
      title: `Ask ${o.name} to swap shifts`,
      lines: [
        `Your ${dayText(shift.iso)}: ${shiftText(shift)}`,
        `${o.name.split(" ")[0]}'s ${o.label}`,
        o.changesHours ? "It changes someone's hours, so the coordinator will also need to agree." : "No one's hours change, so it goes through once they say yes.",
      ],
      requiredCapability: null,
      confirmLabel: `Ask ${o.name.split(" ")[0]}`,
      params: { from: { monday: shift.monday, day: shift.day, key: shift.key }, to: { monday: o.monday, day: o.day, key: o.key }, fromLabel: shift.label, toLabel: o.label, withName: o.name },
    });
    return { stage: "propose", shift, proposal, text: `I'll ask ${o.name} to swap once you confirm. Nothing has been sent yet.` };
  }
  return {
    stage: "choose-swap", shift,
    text: `${plural(options.length, "swap")} would work for your ${dayText(shift.iso)} ${shift.label}. Which one?`,
    followUps: chosen.slice(0, 6).map((o) => ({ label: `${o.name}: ${o.label}`, ask: `${askFor(shift)} with ${String(o.name).split(/\s+/)[0].toLowerCase()} for ${DAY_LABELS[o.day]?.toLowerCase() || o.day} ${String(o.label || "").split(",")[0].toLowerCase()}`, color: "#0ea5e9" })),
  };
}
