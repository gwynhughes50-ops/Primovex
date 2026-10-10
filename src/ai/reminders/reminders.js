import { createProposal } from "../../orb/actionProposals";
import { looksIdentifying } from "../stock/stockAsk";

// "Remind me to check the vaccine fridge tomorrow at 9" -> a reminder card; confirming saves it as one of
// the person's own quick notes (or a shared practice note for "remind everyone ..."). Pure.

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const NUM_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fifteen: 15, twenty: 20, thirty: 30, forty: 40, sixty: 60 };
const PARTS = { morning: [9, 0], afternoon: [14, 0], evening: [18, 0], tonight: [20, 0], "end of the day": [17, 0], "end of day": [17, 0], eod: [17, 0], lunchtime: [12, 30], noon: [12, 0], midday: [12, 0] };
const QUESTION_START = /^(?:what|which|who|how|is|are|do|does|did|can|could|where|when|why|show|list|tell me)\b/i;

const addDays = (date, days) => { const d = new Date(date); d.setDate(d.getDate() + days); return d; };
const at = (date, hour, minute = 0) => { const d = new Date(date); d.setHours(hour, minute, 0, 0); return d; };

// ---- when ------------------------------------------------------------------------------------------------------

// { date: Date|null, rest: the text with the time words taken out, explicitTime: boolean }
export function parseWhen(text, now = new Date()) {
  let rest = ` ${String(text || "")} `;
  let date = null;
  let time = null; // [h, m]
  let dated = false;
  const take = (re) => { const m = rest.match(re); if (m) rest = rest.replace(m[0], " "); return m; };

  // in two hours / in 30 minutes / in 3 days / in a week
  let m = take(/\s(?:in|after)\s+(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|forty|sixty)\s+(minute|min|hour|hr|day|week)s?\b/i);
  if (m) {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUM_WORDS[m[1].toLowerCase()];
    const unit = m[2].toLowerCase();
    if (unit.startsWith("min")) return { date: new Date(now.getTime() + n * 60000), rest: tidy(rest), explicitTime: true };
    if (unit.startsWith("h")) return { date: new Date(now.getTime() + n * 3600000), rest: tidy(rest), explicitTime: true };
    date = addDays(now, unit === "week" ? n * 7 : n); dated = true;
  }

  // a part of the day: this morning / tomorrow afternoon / tonight / end of the day
  const part = take(/\s(this\s+morning|this\s+afternoon|this\s+evening|tonight|end of (?:the )?day|eod|lunchtime|at noon|at midday)\b/i);
  if (part) {
    const key = part[1].toLowerCase().replace(/^this\s+|^at\s+/, "");
    time = PARTS[key] || PARTS[key.replace("the ", "")] || null;
    if (!dated) { date = new Date(now); dated = true; }
  }

  if (!dated) {
    if (take(/\s(tomorrow)\b/i)) { date = addDays(now, 1); dated = true; }
    else if (take(/\s(today)\b/i)) { date = new Date(now); dated = true; }
    else if (take(/\s(day after tomorrow)\b/i)) { date = addDays(now, 2); dated = true; }
  }
  // tomorrow morning / on monday morning
  const later = take(/\s(morning|afternoon|evening)\b/i);
  if (later && !time) time = PARTS[later[1].toLowerCase()];

  if (!dated) {
    m = take(/\s(?:on\s+|by\s+|this\s+)?(next\s+|this\s+|on\s+|by\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
    if (m) {
      const target = DAY_NAMES.indexOf(m[2].toLowerCase());
      let diff = (target - now.getDay() + 7) % 7;
      if (diff === 0) diff = 7; // the same weekday as today means a week from now
      date = addDays(now, diff); dated = true;
    }
  }
  if (!dated) {
    // on the 14th / 14th of october / 14 october
    m = take(/\s(?:on\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?(?:\s+of)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/i);
    if (m) {
      const month = MONTHS.indexOf(m[2].toLowerCase());
      let year = now.getFullYear();
      let d = new Date(year, month, Number(m[1]));
      if (d < at(now, 0)) d = new Date(year + 1, month, Number(m[1]));
      date = d; dated = true;
    } else {
      m = take(/\s(?:on\s+)?the\s+(\d{1,2})(?:st|nd|rd|th)\b/i);
      if (m) {
        let d = new Date(now.getFullYear(), now.getMonth(), Number(m[1]));
        if (d < at(now, 0)) d = new Date(now.getFullYear(), now.getMonth() + 1, Number(m[1]));
        date = d; dated = true;
      }
    }
  }

  // a clock time: at 3pm, 3:30pm, at 15:30, at 9
  m = take(/\s(?:at\s+)?(\d{1,2})[:.](\d{2})\s*(am|pm)?\b/i) || take(/\sat\s+(\d{1,2})\s*(am|pm)?\b/i) || take(/\s(\d{1,2})\s*(am|pm)\b/i);
  if (m) {
    const hasMinutes = m.length >= 4 && /^\d{2}$/.test(m[2] || "");
    let hour = Number(m[1]);
    const minute = hasMinutes ? Number(m[2]) : 0;
    const meridiem = (hasMinutes ? m[3] : m[2]) || "";
    if (/pm/i.test(meridiem) && hour < 12) hour += 12;
    if (/am/i.test(meridiem) && hour === 12) hour = 0;
    if (!meridiem && hour >= 1 && hour <= 6) hour += 12; // "at 3" in a working day means the afternoon
    if (hour <= 23 && minute <= 59) time = [hour, minute];
  }

  if (!dated && !time) return { date: null, rest: tidy(rest), explicitTime: false };
  let result = date ? new Date(date) : new Date(now);
  if (time) result = at(result, time[0], time[1]);
  else result = at(result, 9, 0);
  // a time with no day that has already passed today means tomorrow
  if (!dated && time && result <= now) result = addDays(result, 1);
  return { date: result, rest: tidy(rest), explicitTime: Boolean(time) };
}

const tidy = (text) => String(text).replace(/\s+/g, " ").replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, "").replace(/\b(?:on|by|at|for)$/i, "").trim();

// ---- the sentence --------------------------------------------------------------------------------------------------

const TRIGGER = /^(?:(?:can|could|would|will) you\s+|please\s+|orb[,\s]+|ok(?:ay)?[,\s]+)*(?:remind me|set (?:me )?a reminder|set a reminder for me|add a reminder|make a (?:note|reminder)|note to self|put (?:this |it )?on my (?:list|to ?do list))\s*(?:for me)?\s*(?:to|that|about|:|-|,)?\s*(.*)$/i;
const PRACTICE_TRIGGER = /^(?:(?:can|could|would|will) you\s+|please\s+|orb[,\s]+)*(?:remind|tell)\s+(?:everyone|everybody|the (?:whole )?(?:practice|team|staff)|all (?:staff|of us)|us all|us)\s+(?:to|that|about|:|-|,)?\s*(.*)$/i;

// { kind: 'private' | 'practice', task, ... } or null when it isn't a reminder request
export function extractReminder(text) {
  const t = String(text || "").trim().replace(/\s+/g, " ").replace(/[.!?]+$/g, "");
  if (!t || (QUESTION_START.test(t) && !/^(?:can|could|would|will) you\b/i.test(t))) return null;
  let m = t.match(PRACTICE_TRIGGER);
  if (m) return { scope: "practice", body: m[1] };
  m = t.match(TRIGGER);
  if (m) return { scope: "private", body: m[1] };
  return null;
}

export const looksLikeReminder = (text) => Boolean(extractReminder(text));

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const whenLabel = (date, now) => {
  const days = Math.round((at(date, 0) - at(now, 0)) / 86400000);
  const day = days === 0 ? "today" : days === 1 ? "tomorrow" : date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  return `${day} at ${date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
};

export function buildReminderDraft(input = {}, { now = new Date() } = {}) {
  const found = extractReminder(input.question);
  if (!found) return { text: "Tell me what to remind you of, for example “remind me to check the vaccine fridge tomorrow at 9”.", followUps: [] };
  const { date, rest } = parseWhen(found.body, now);
  const task = cap(rest.replace(/^(?:to|that|about)\s+/i, "").trim());
  if (!task) return { text: "What should I remind you about? For example “remind me to order gloves on Friday”.", followUps: [] };
  if (task.length > 200) return { text: "That reminder is too long. Keep it to a sentence.", followUps: [] };
  if (looksIdentifying(task)) return { text: "That has a number, date, email address or phone number in it. Please say it without those, and don't put patient details in a reminder.", followUps: [] };
  const shared = found.scope === "practice";
  const proposal = createProposal({
    kind: "reminder",
    title: shared ? "Add a practice reminder" : "Add a reminder",
    lines: [`Reminder: ${task}`, date ? `When: ${whenLabel(date, now)}` : "When: no time set", shared ? "Who sees it: everyone in the practice (shared Quick note)" : "Who sees it: only you (your Quick notes)"],
    requiredCapability: "dashboard.read",
    confirmLabel: "Save reminder",
    params: { text: task, dueAt: date ? date.toISOString() : null, scope: shared ? "practice" : "private" },
  });
  return {
    text: `I'll save “${task}” ${date ? `for ${whenLabel(date, now)}` : "with no time set"}. Nothing has been saved yet.${date ? "" : " Say the time too if you want one, for example “remind me to … tomorrow at 9”."}`,
    proposal,
    followUps: [],
  };
}
