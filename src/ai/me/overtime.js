// "I did 2 hours overtime yesterday, can you log it for me?" for Ask Primovex. It works out what was said (hours, the day, the rate, whether it was approved and, if not, why),
// asks for whatever is missing one short question at a time (with buttons to tap), and then prepares a card. Confirming the card adds one line to the person's own timesheet
// as a DRAFT: nothing goes to the line manager until they open Timesheet and press Send. The line says whether the overtime was approved, so the line manager sees it
// when signing off.
//
// Pure (no React, no Firestore): the lookup in readOnlyTools.js reads the person's own staff record, pay periods and timesheets and hands them in, and the confirm in
// actionExecutors.js writes under their own account.

import { CODES, STATE_LABEL, lineProblem, needsStaff, periodLabel } from "../../modules/timesheets/timesheet.js";
import { journeyDate } from "./myAdmin.js";
import { dateKey } from "../../modules/mileage/mileage.js";
import { createProposal } from "../../orb/actionProposals.js";

const clean = (prompt) => String(prompt || "").toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
const NOT_LINKED = "Your sign-in isn't linked to a staff record yet, so I can't add to your timesheet. Ask the Practice Manager to link it (Timesheets, then People).";
const MAX_REASON = 100;
const RATES = { B: "standard rate", C: "time and a half" };
const WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const uk = (key) => (key ? String(key).split("-").reverse().join("/") : "");
const weekdayOf = (key) => { const [y, m, d] = String(key).split("-").map(Number); return WEEKDAY[new Date(y, m - 1, d).getDay()]; };
const round2 = (n) => Math.round(n * 100) / 100;
export function hoursWords(hours) {
  const whole = Math.floor(hours + 1e-9); const minutes = Math.round((hours - whole) * 60);
  const parts = [];
  if (whole) parts.push(`${whole} ${whole === 1 ? "hour" : "hours"}`);
  if (minutes) parts.push(`${minutes} minutes`);
  return parts.join(" ") || "0 hours";
}

// ---- is this someone logging overtime? ----
// null when it is not. How-to questions, other people's overtime and "how much overtime have I done" are left alone.
export function parseOvertimeAsk(prompt) {
  const t = clean(prompt).replace(/[?.!]+$/g, "");
  if (!t) return null;
  if (/\bhow\s+(?:do|to|can|should)\b|\bwhere\s+do\s+i\b|\bhow\s+(?:much|many)\b|\b(?:who|everyone|everybody|someone|team|staff|his|her|their|he|she|they)\b/.test(t)) return null;
  const overtime = /\b(?:overtime|over\s*time|extra\s+hours)\b/.test(t);
  const lateWork = /\b(?:worked|stayed|working|staying)\s+(?:late|over|extra|behind|on|past)\b/.test(t) && /\b(?:log|add|record|enter|put|claim|timesheet)\b/.test(t);
  if (!overtime && !lateWork) return null;
  if (!/\b(?:i|i've|ive|i'd|my|me|log|add|record|enter|put|claim)\b/.test(t)) return null;
  return { toolId: "my.overtimeDraft", input: { question: String(prompt) } };
}

// ---- what was said ----
const REASON = /\[reason:\s*([^\]]{1,200})\]/i;
export function readOvertime(text, today = dateKey(new Date())) {
  const raw = String(text || "");
  const reasonMatch = REASON.exec(raw);
  const cancelled = /\[cancel\]/i.test(raw);
  const t = clean(raw.replace(REASON, " ").replace(/\[cancel\]/gi, " "));

  // hours: "2 hours", "an hour", "half an hour", "1.5 hours", "90 minutes", "1 hour 30", "2h", "two and a half hours", "an hour and a half"
  let hours = null;
  const word = "(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)";
  const num = (s) => (WORDS[s] !== undefined ? WORDS[s] : Number(s));
  let m;
  if ((m = new RegExp(`\\b(${word}|\\d+(?:\\.\\d+)?)\\s+and\\s+a\\s+half(?:\\s+hours?)?\\b`).exec(t))) hours = num(m[1]) + 0.5;
  else if ((m = new RegExp(`\\b(${word})\\s+hours?\\s+and\\s+a\\s+half\\b|\\b(hour)\\s+and\\s+a\\s+half\\b`).exec(t))) hours = (m[1] ? num(m[1]) : 1) + 0.5;
  else if (/\bhalf\s+(?:an?\s+)?hour\b/.test(t)) hours = 0.5;
  else if (/\bquarter\s+(?:of\s+)?an?\s+hour\b/.test(t)) hours = 0.25;
  else if ((m = /\b(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hours?)\b(?:\s*(?:and\s*)?(\d{1,2})\s*(?:m|mins?|minutes?)?\b)?/.exec(t))) hours = Number(m[1]) + (m[2] ? Number(m[2]) / 60 : 0);
  else if ((m = new RegExp(`\\b(${word})\\s+hours?\\b`).exec(t))) hours = num(m[1]);
  else if ((m = /\b(\d{1,3})\s*(?:m|mins?|minutes?)\b/.exec(t))) hours = Number(m[1]) / 60;
  if (hours !== null) hours = round2(hours);

  // the day: only when one is named
  let date = null;
  if (/\blast\s+night\b/.test(t)) date = journeyDate("yesterday", today);
  else if (/\b(?:yesterday|today|tonight|this\s+(?:morning|afternoon|evening)|(?:on\s+|last\s+)?(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)|\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?)\b/.test(t)) date = journeyDate(t, today) || null;

  // the rate
  let code = null;
  if (/\btime\s+and\s+a\s+half\b|\b1\.5\s*x?\b|\bone\s+and\s+a\s+half\s+times\b|\bx\s*1\.5\b/.test(t)) code = "C";
  else if (/\bstandard\b|\bnormal\s+rate\b|\bbasic\s+rate\b|\bplain\s+time\b|\bflat\s+rate\b/.test(t)) code = "B";

  // was it approved (the "not" forms first)
  let approved = null;
  if (/\b(?:not|wasn'?t|was\s+not|isn'?t|weren'?t|never|without|no|wasnt)\s+(?:been\s+)?(?:pre[- ]?)?(?:approved|authori[sz]ed|agreed|signed\s+off|cleared)\b|\bunapproved\b|\bno\s+approval\b|\bnot\s+approved\b/.test(t)) approved = false;
  else if (/\b(?:pre[- ]?)?(?:approved|authori[sz]ed|agreed|signed\s+off|cleared)\b/.test(t)) approved = true;

  const reason = reasonMatch ? reasonMatch[1].replace(/\s+/g, " ").trim().slice(0, MAX_REASON) : "";
  return { hours, date, code, approved, reason, cancelled };
}

// ---- the questions ----
const dayButtons = (today) => {
  const out = [{ label: "Today", ask: "today" }, { label: "Yesterday", ask: "yesterday" }];
  for (const back of [2, 3]) { const key = journeyDate("yesterday", today).split("-"); const d = new Date(Number(key[0]), Number(key[1]) - 1, Number(key[2]) - (back - 1)); const name = WEEKDAY[d.getDay()]; out.push({ label: name, ask: `on ${name}` }); }
  return out;
};
const QUESTIONS = {
  hours: { text: "How much overtime was it?", buttons: () => [{ label: "30 minutes", ask: "30 minutes" }, { label: "1 hour", ask: "1 hour" }, { label: "1½ hours", ask: "1.5 hours" }, { label: "2 hours", ask: "2 hours" }, { label: "3 hours", ask: "3 hours" }] },
  date: { text: "Which day was it?", buttons: (today) => dayButtons(today) },
  rate: { text: "Which rate was it?", buttons: () => [{ label: "Standard rate", ask: "standard rate" }, { label: "Time and a half", ask: "time and a half" }] },
  approved: { text: "Was the overtime approved?", buttons: () => [{ label: "Yes, it was approved", ask: "it was approved" }, { label: "No, it wasn't approved", ask: "it wasn't approved" }] },
  reason: { text: "Why wasn't it approved? A short reason is fine: tap one, or type your own.", buttons: () => [{ label: "Urgent patient need", ask: "Urgent patient need" }, { label: "Manager not available", ask: "Manager not available" }, { label: "Unplanned or emergency", ask: "Unplanned or emergency" }, { label: "Short notice", ask: "Short notice" }] },
};
const withColours = (buttons) => [...buttons.map((b) => ({ ...b, color: "#0ea5e9" })), { label: "Never mind", ask: "never mind", color: "#94a3b8" }];

// ---- the answer to one of those questions, typed or tapped ----
const COMMAND_START = /^(?:what|how|who|which|where|when|why|show|go|open|take|remind|tell|send|swap|count|which|is|are|do|does|can|could|please)\b/;
const CANCEL = /^(?:never\s*mind|nevermind|cancel|forget\s+it|stop|leave\s+it|no\s+thanks?|skip\s+it)$/;

// a bare answer is given the words it needs, so "2" after "how much?" reads as "2 hours"
function answerText(prompt, asking) {
  const t = clean(prompt).replace(/[?.!]+$/g, "");
  if (asking === "hours") { if (/^\d+(?:\.\d+)?$/.test(t)) return `${t} hours`; if (/^half$/.test(t)) return "half an hour"; if (new RegExp("^(?:a|an|one|two|three|four|five|six|seven|eight)$").test(t)) return `${t} hours`; }
  if (asking === "approved") { if (/^(?:yes|yeah|yep|yup|y|approved|it was|it was approved|of course)$/.test(t)) return "it was approved"; if (/^(?:no|nope|nah|n|not approved|it wasn'?t|it wasn'?t approved)$/.test(t)) return "it wasn't approved"; }
  if (asking === "rate") { if (/^(?:standard|normal|basic|plain|b)$/.test(t)) return "standard rate"; if (/^(?:1\.5|1\.5x|half|c)$/.test(t)) return "time and a half"; }
  return String(prompt || "").trim();
}

export function acceptsOvertimeAnswer(prompt, pending = {}) {
  const t = clean(prompt).replace(/[?.!]+$/g, "");
  if (!t) return false;
  if (CANCEL.test(t)) return true;
  if (pending.asking === "reason") return t.length >= 3 && t.length <= 160 && !/\?\s*$/.test(String(prompt)) && !COMMAND_START.test(t);
  const found = readOvertime(answerText(prompt, pending.asking));
  return [found.hours, found.date, found.code, found.approved].some((v) => v !== null);
}

export function mergeOvertimeAnswer(sentence, prompt, pending = {}) {
  const t = clean(prompt).replace(/[?.!]+$/g, "");
  if (CANCEL.test(t)) return `${sentence} [cancel]`;
  if (pending.asking === "reason") return `${sentence} [reason: ${String(prompt).replace(/[\[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_REASON)}]`;
  return `${sentence} ${answerText(prompt, pending.asking)}`;
}

// ---- the line that goes on the timesheet ----
export function overtimeLine({ date, code, hours, approved, reason }) {
  const comment = approved ? "Approved overtime" : `Not pre-approved: ${reason}`;
  return { date, code, hours, comment: comment.slice(0, 200) };
}

// the timesheet's lines with this one added, once (the same day, code and hours is not added twice)
export function withOvertimeLine(lines = [], line) {
  const kept = (lines || []).map((l) => ({ date: l.date, code: l.code, hours: l.hours, comment: l.comment || "" }));
  if (kept.some((l) => l.date === line.date && l.code === line.code && Number(l.hours) === Number(line.hours))) return { lines: kept, added: false };
  return { lines: [...kept, line].sort((a, b) => String(a.date).localeCompare(String(b.date))), added: true };
}

// ---- the reply: a question, or a card ----
// { text, followUps?, pending?, proposal? }
export function overtimeReply({ question = "", periods = [], sheets = [], me = null, uid = "", today = dateKey(new Date()) }) {
  if (!me?.id || me.uid !== uid) return { text: NOT_LINKED };
  const said = readOvertime(question, today);
  if (said.cancelled) return { text: "OK, I haven't added anything." };
  const sentence = String(question);
  const ask = (asking) => ({ text: QUESTIONS[asking].text, followUps: withColours(QUESTIONS[asking].buttons(today)), pending: { toolId: "my.overtimeDraft", sentence, asking } });

  if (said.hours === null) return ask("hours");
  if (said.hours <= 0 || said.hours > 24) return { text: said.hours > 24 ? "That is more than 24 hours in a day. Tell me how much overtime it was." : "Tell me how much overtime it was.", followUps: withColours(QUESTIONS.hours.buttons()), pending: { toolId: "my.overtimeDraft", sentence: sentence.replace(/\d+(?:\.\d+)?\s*(?:h|hr|hrs|hours?|m|mins?|minutes?)/gi, " "), asking: "hours" } };
  if (said.date === null) return ask("date");
  if (said.date > today) return { text: "That day hasn't happened yet. Which day was the overtime?", followUps: withColours(QUESTIONS.date.buttons(today)), pending: { toolId: "my.overtimeDraft", sentence: sentence.replace(/\b(?:tomorrow|on\s+\w+day|\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?)\b/gi, " "), asking: "date" } };
  if (said.code === null) return ask("rate");
  if (said.approved === null) return ask("approved");
  if (said.approved === false && !said.reason) return ask("reason");

  const period = periods.find((p) => p.from <= said.date && said.date <= p.to);
  if (!period) return { text: `No pay period covers ${uk(said.date)} yet, so there is no timesheet to add it to. Ask whoever sets up the pay periods.` };
  const sheet = sheets.find((s) => s.periodId === period.id) || null;
  if (sheet && !needsStaff(sheet.state)) return { text: `Your timesheet for ${periodLabel(period)} is ${String(STATE_LABEL[sheet.state] || sheet.state).toLowerCase()}, so I can't add to it. If it needs changing, ask your line manager to decline it so you can edit it.` };
  const line = overtimeLine({ date: said.date, code: said.code, hours: said.hours, approved: said.approved, reason: said.reason });
  const problem = lineProblem(line, period);
  if (problem) return { text: problem };
  const merged = withOvertimeLine(sheet?.lines || [], line);
  if (!merged.added) return { text: `That is already on your timesheet for ${periodLabel(period)}, so I haven't added it again.` };

  const proposal = createProposal({
    kind: "timesheet-overtime",
    title: "Add overtime to my timesheet",
    lines: [
      `${CODES.find((c) => c.code === said.code).label}: ${hoursWords(said.hours)} on ${weekdayOf(said.date)} ${uk(said.date)}`,
      said.approved ? "Approved in advance: yes" : `Approved in advance: no. Reason: ${said.reason}`,
      `Saved on your timesheet for ${periodLabel(period)} as a draft`,
      "Nothing goes to your line manager until you open Timesheet and press Send",
    ],
    requiredCapability: null,
    confirmLabel: "Add to my timesheet",
    params: { period: { id: period.id, from: period.from, to: period.to, due: period.due }, me: { id: me.id, uid: me.uid, name: me.name, payrollNo: me.payrollNo || "", managerUid: me.managerUid || null, patterns: me.patterns || [] }, line },
  });
  return { proposal, text: `I'll add this to your timesheet once you confirm. Nothing has been added or sent yet.` };
}

export { RATES };
