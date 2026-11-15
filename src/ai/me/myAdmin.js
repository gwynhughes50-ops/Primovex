// "My own admin" for Ask Primovex: a member of staff asks about their own timesheet, mileage, annual leave and training, and can have a timesheet sent or a
// journey claimed. Pure (no React, no Firestore): the lookups in readOnlyTools.js read the person's own records and hand them in. Anything that changes a record
// is a card the person confirms first, and the executors check again, under the person's own permissions.

import { addDays as addDaysKey } from "../../modules/rota/rotaModel.js";
import { STATE, STATE_LABEL, declarationText, dueStatus, expectedFor, needsStaff, payPeriodGap, payPeriodGapWords, periodLabel } from "../../modules/timesheets/timesheet.js";
import { DEFAULT_RATES, PURPOSES, VEHICLES, VISIT_PLACE, claimProblem, dateKey, money, parseKey, priceClaims, routeMiles, STATUS as CLAIM, taxYearOf, totalMiles } from "../../modules/mileage/mileage.js";
import { calculateEntitlement, leaveYearFor } from "../../modules/leave/leaveEntitlement.js";
import { LIGHT, STATUS as TRAIN, STATUS_LABEL as TRAIN_LABEL, buildMatrix } from "../../modules/training/training.js";
import { createProposal } from "../../orb/actionProposals.js";

const clean = (prompt) => String(prompt || "").toLowerCase().replace(/[’‘]/g, "'").trim().replace(/[?.!]+$/g, "");
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const uk = (key) => (key ? String(key).split("-").reverse().join("/") : "");
const NOT_LINKED = "Your sign-in isn't linked to a staff record yet, so I can't look at that. Ask the Practice Manager to link it (Timesheets, then People).";

// ---- what was asked ----
// null when it is not one of these. Otherwise { toolId, input }. "How do I..." questions are help, and anything about someone else is not this.
export function parseMyAdmin(prompt) {
  const t = clean(prompt);
  if (!t) return null;
  if (/\b(?:how\s+(?:do|to|can)|where\s+do\s+i|who|everyone|someone|team|staff|his|her|their)\b/.test(t)) return null;
  if (/\b(?:send|submit|hand\s+in|post)\s+(?:in\s+)?my\s+timesheet\b/.test(t)) return { toolId: "my.timesheetDraft", input: {} };
  if (/\bmy\s+timesheet\b|\btimesheet\s+(?:status|due|signed\s+off)\b/.test(t)) return { toolId: "my.timesheet", input: {} };
  if (/\b(?:i\s+)?(?:drove|travell?ed|went|cycled|did\s+a\s+(?:journey|trip))\b.*\bfrom\b.+\bto\b/.test(t) || /\b(?:log|add|claim|record)\b.*\b(?:journey|mileage|trip|miles)\b.*\bfrom\b.+\bto\b/.test(t) || /\bmileage\s+from\b.+\bto\b/.test(t)) return { toolId: "my.mileageDraft", input: { question: String(prompt) } };
  if (/\bmy\s+(?:mileage|miles|journeys|claims?)\b/.test(t) || (/\bmileage\b/.test(t) && /\b(?:how\s+many|how\s+much|total|this\s+year|tax\s+year|waiting|claimed|so\s+far)\b/.test(t))) return { toolId: "my.mileage", input: {} };
  if ((/\b(?:annual\s+leave|leave\s+entitlement|holiday\s+entitlement|holidays?\s+allowance|days?\s+(?:of\s+)?holiday|hours?\s+(?:of\s+)?holiday)\b/.test(t) || /\bhow\s+much\s+(?:annual\s+)?leave\b/.test(t)) && /\b(?:my|i|do\s+i|have\s+i|left|get|got)\b/.test(t)) return { toolId: "my.leave", input: {} };
  if (/\bmy\s+training\b/.test(t) || /\b(?:what|which)\s+(?:training|courses?)\b.*\b(?:due|overdue|out\s+of\s+date|need|expir)/.test(t) || /\b(?:am\s+i\s+up\s+to\s+date|is\s+my\s+training\s+(?:up\s+to\s+date|in\s+date))\b/.test(t)) return { toolId: "my.training", input: {} };
  return null;
}

// ---- timesheet ----
// The period to talk about: the oldest one that has finished (or is running) and still needs sending, else the one that includes today, else the latest
export function pickPeriod(periods = [], sheets = [], today = dateKey(new Date())) {
  const byId = new Map(sheets.map((s) => [s.periodId, s]));
  const started = [...periods].filter((p) => p.from <= today).sort((a, b) => a.from.localeCompare(b.from));
  const waiting = started.find((p) => needsStaff(byId.get(p.id)?.state || STATE.draft) && p.to <= addDaysKey(today, 0));
  if (waiting) return waiting;
  return started.find((p) => p.from <= today && today <= p.to) || started[started.length - 1] || null;
}

// The answer, and when no pay period covers today (nobody has set up the next) a sentence saying so, so an answer about an old period is not taken for this one
export function timesheetAnswer(args = {}) {
  const answer = timesheetAnswerFor(args);
  const today = args.today || dateKey(new Date());
  const gap = answer.found ? payPeriodGapWords(payPeriodGap(args.periods || [], today))?.staff : "";
  return gap ? { ...answer, text: `${answer.text}

${gap}`, payPeriodGap: true } : answer;
}

function timesheetAnswerFor({ periods = [], sheets = [], linked = true, today = dateKey(new Date()) }) {
  if (!linked) return { found: false, text: NOT_LINKED };
  const period = pickPeriod(periods, sheets, today);
  if (!period) return { found: false, text: "No pay period has been set up yet, so there is no timesheet to send. Ask whoever manages timesheets." };
  const sheet = sheets.find((s) => s.periodId === period.id) || null;
  const state = sheet?.state || STATE.draft;
  const label = periodLabel(period);
  const status = dueStatus(period, state, today);
  if (!needsStaff(state)) return { found: true, state, period, sheet, text: `Your timesheet for ${label} is ${STATE_LABEL[state].toLowerCase()}.` };
  const due = `${uk(period.due)}`;
  const when = status === "overdue" ? `It was due on ${due}.` : status === "due-soon" ? `It is due on ${due}, so soon.` : `It is due on ${due}.`;
  const stateText = state === STATE.draft ? "You haven't sent your timesheet" : state === STATE.declined ? "Your timesheet was declined and needs your attention" : "Your timesheet was returned by payroll and needs your attention";
  return { found: true, state, overdue: status === "overdue", text: `${stateText} for ${label}. ${when}`, period, sheet };
}

// The card that sends "no changes": the person confirms the declaration themselves, by name, before anything is sent
export function timesheetSendReply({ periods = [], sheets = [], me = null, uid = "", today = dateKey(new Date()) }) {
  if (!me?.id || me.uid !== uid) return { text: NOT_LINKED };
  const answer = timesheetAnswer({ periods, sheets, linked: true, today });
  if (!answer.period) return { text: answer.text };
  if (!needsStaff(answer.state)) return { text: `${answer.text} There is nothing to send.` };
  const period = answer.period;
  const expected = expectedFor(me.patterns || [], period);
  const proposal = createProposal({
    kind: "timesheet-send",
    title: `Send my timesheet for ${periodLabel(period)}`,
    lines: [
      "Same as my usual hours: no changes, nothing different to report",
      `Usual hours in this period: ${expected.hours}`,
      `I confirm: “${declarationText("no-change", period)}”`,
      "It goes to your line manager to sign off",
    ],
    requiredCapability: null,
    confirmLabel: "I confirm and send",
    params: { period: { id: period.id, from: period.from, to: period.to, due: period.due }, me: { id: me.id, uid: me.uid, name: me.name, payrollNo: me.payrollNo || "", managerUid: me.managerUid || null, patterns: me.patterns || [] }, existing: answer.sheet ? { id: answer.sheet.id, submissions: answer.sheet.submissions || 0 } : null },
  });
  return { proposal, text: `${answer.text} If your hours were exactly your usual ones, I can send it: check the card, and the declaration on it is yours to confirm. If anything was different (overtime, leave, sickness), send it from the Timesheet page instead.` };
}

// ---- mileage ----
export function mileageAnswer({ claims = [], rates = DEFAULT_RATES, today = dateKey(new Date()) }) {
  const year = taxYearOf(today);
  if (!year) return { found: false, text: "I couldn't work out today's date." };
  const mine = claims.filter((c) => c.date >= year.from && c.date <= year.to);
  const priced = priceClaims(mine, rates);
  const approved = mine.filter((c) => c.status === CLAIM.approved);
  const miles = Math.round(approved.reduce((n, c) => n + totalMiles(c), 0) * 10) / 10;
  const pence = approved.reduce((n, c) => n + (priced.get(c.id)?.pence || 0), 0);
  const waiting = mine.filter((c) => c.status === CLAIM.submitted);
  const turnedDown = mine.filter((c) => c.status === CLAIM.rejected);
  if (!mine.length) return { found: true, count: 0, text: `You haven't claimed any mileage in the ${year.label} tax year (${uk(year.from)} to ${uk(year.to)}).` };
  const parts = [`In the ${year.label} tax year you have ${miles} ${miles === 1 ? "mile" : "miles"} approved (${money(pence)}).`];
  if (waiting.length) parts.push(`${plural(waiting.length, "claim")} ${waiting.length === 1 ? "is" : "are"} waiting for approval.`);
  if (turnedDown.length) parts.push(`${plural(turnedDown.length, "claim")} ${turnedDown.length === 1 ? "was" : "were"} not approved.`);
  return { found: true, count: mine.length, text: parts.join(" ") };
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
// "yesterday", "today", "on Tuesday" (the most recent one), "on 12/11" or "on 12/11/2026" -> a day key, or "" (today when nothing is said)
export function journeyDate(text, today = dateKey(new Date())) {
  const t = clean(text);
  if (/\byesterday\b/.test(t)) return addDaysKey(today, -1);
  if (/\btoday\b|\bthis\s+morning\b|\bthis\s+afternoon\b/.test(t)) return today;
  const named = t.match(/\b(?:on\s+|last\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (named) {
    const target = WEEKDAYS.indexOf(named[1]);
    const now = parseKey(today);
    let back = (now.getDay() - target + 7) % 7;
    if (back === 0 && !/\bthis\b/.test(t) && !/\btoday\b/.test(t)) back = 7;
    return addDaysKey(today, -back);
  }
  const date = t.match(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/);
  if (date) {
    const year = date[3] ? (date[3].length === 2 ? 2000 + Number(date[3]) : Number(date[3])) : Number(today.slice(0, 4));
    const key = `${year}-${String(date[2]).padStart(2, "0")}-${String(date[1]).padStart(2, "0")}`;
    return parseKey(key) ? key : "";
  }
  return today;
}

const norm = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
// the saved place a phrase names: the longest saved name found inside it, or one whose words are all in it
function placeIn(phrase, options) {
  const p = ` ${norm(phrase)} `;
  const exact = options.filter((o) => p.includes(` ${norm(o.name)} `)).sort((a, b) => norm(b.name).length - norm(a.name).length);
  if (exact.length) return exact[0];
  const words = options.filter((o) => norm(o.name).split(" ").filter((w) => w.length > 2).every((w) => p.includes(` ${w} `)) && norm(o.name).split(" ").some((w) => w.length > 2));
  return words.sort((a, b) => norm(b.name).length - norm(a.name).length)[0] || null;
}

export function parseJourney(prompt, { options = [], today = dateKey(new Date()) } = {}) {
  const t = String(prompt || "").replace(/\s+/g, " ").trim();
  const m = /\bfrom\b(.+?)\bto\b(.+)$/i.exec(t);
  if (!m) return null;
  const toPhrase = m[2].replace(/\b(?:and\s+back|and\s+return|return|there\s+and\s+back|round\s+trip)\b/gi, " ").replace(/\b(?:yesterday|today|on\s+\w+day|last\s+\w+day|\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?)\b/gi, " ");
  const from = placeIn(m[1], options);
  const to = placeIn(toPhrase, options);
  const vehicle = /\b(?:motorbike|motorcycle|moped)\b/i.test(t) ? "motorcycle" : /\b(?:bike|bicycle|cycled)\b/i.test(t) ? "bicycle" : "car";
  return { fromId: from?.id || "", toId: to?.id || "", fromName: from?.name || "", toName: to?.name || "", returnTrip: /\b(?:and\s+back|and\s+return|round\s+trip|there\s+and\s+back|return)\b/i.test(t), date: journeyDate(t, today), vehicle };
}

export function journeyReply({ question, options = [], routes = [], me = null, uid = "", today = dateKey(new Date()) }) {
  if (!me?.id || me.uid !== uid) return { text: NOT_LINKED };
  const parsed = parseJourney(question, { options, today });
  if (!parsed) return { text: "To claim a journey, say where from and to, for example “I drove from Main Surgery to District Hospital and back yesterday”." };
  if (!parsed.fromId || !parsed.toId) {
    const named = options.filter((o) => o.kind !== "visit").slice(0, 6).map((o) => o.name).join(", ");
    return { text: `I couldn't match ${!parsed.fromId && !parsed.toId ? "either place" : !parsed.fromId ? "the start" : "the end"} to a saved place. Use the names as they are saved${named ? ` (for example ${named})` : ""}, or add the journey on the Mileage page.` };
  }
  const miles = routeMiles(routes, parsed.fromId, parsed.toId);
  if (miles === null) return { text: `I don't have the distance between ${parsed.fromName} and ${parsed.toName} saved yet, so I can't claim it. Add the journey on the Mileage page once and I'll know it next time.` };
  const form = { date: parsed.date, fromId: parsed.fromId, toId: parsed.toId, miles, returnTrip: parsed.returnTrip, vehicle: parsed.vehicle, purpose: PURPOSES[PURPOSES.length - 1], note: "" };
  const problem = claimProblem(form, { today });
  if (problem) return { text: problem };
  const total = totalMiles(form);
  const proposal = createProposal({
    kind: "mileage-claim",
    title: `Claim ${total} miles`,
    lines: [
      `${uk(parsed.date)}: ${parsed.fromName} to ${parsed.toName}${parsed.returnTrip ? " and back" : ""}`,
      `${total} miles by ${VEHICLES.find((v) => v.key === parsed.vehicle)?.label.toLowerCase() || parsed.vehicle}`,
      `Reason: ${form.purpose} (change it on the Mileage page if it was something else)`,
      "It goes to your line manager to approve",
    ],
    requiredCapability: null,
    confirmLabel: "Send the claim",
    params: { form, me: { id: me.id, uid: me.uid, name: me.name, managerUid: me.managerUid || null }, options: [{ id: parsed.fromId, name: parsed.fromName }, { id: parsed.toId, name: parsed.toName }] },
  });
  return { proposal, text: `I'll send this claim once you confirm. Nothing has been sent yet.` };
}

// ---- annual leave ----
const two = (n) => Math.round(Number(n) * 100) / 100;
export function leaveAnswer({ person = null, settings = {}, today = dateKey(new Date()) }) {
  if (!person) return { found: false, text: "Your leave isn't set up yet. Ask the Practice Manager to link your account to your staff record in Annual leave." };
  const year = leaveYearFor(today);
  const result = calculateEntitlement(person, year, settings);
  if (!result.ready) return { found: false, text: `Your leave can't be worked out yet: ${result.warnings?.[0] || "something is missing from your record"}. Ask the Practice Manager.` };
  const unit = result.unit === "days" ? "days" : "hours";
  const total = result.total ?? result.rounded;
  const dayHours = 7.5;
  const alsoDays = unit === "hours" ? ` (about ${two(total / dayHours)} days of 7.5 hours)` : "";
  const parts = [`Your annual leave for ${year.key} (1 April to 31 March) is ${two(total)} ${unit}${alsoDays}, including bank holidays.`];
  if (result.carryOver) parts.push(`That includes ${two(result.carryOver)} ${unit} carried over.`);
  parts.push("That is your entitlement. What you have booked or taken is in BrightHR, so I can't say how much is left.");
  return { found: true, text: parts.join(" ") };
}

// ---- training ----
export function trainingAnswer({ people = [], courses = [], records = [], now = new Date() }) {
  if (!people.length) return { found: false, text: "Your training record isn't linked to your account yet. Ask the Practice Manager to link it (Staff training, then People)." };
  const cells = buildMatrix({ people, courses: courses.filter((c) => c.active !== false), records, now }).flatMap((row) => row.cells).filter((c) => c.status !== TRAIN.none);
  if (!cells.length) return { found: true, count: 0, text: "Nothing is recorded for you yet." };
  const overdue = cells.filter((c) => c.status === TRAIN.overdue);
  const soon = cells.filter((c) => c.status === TRAIN.dueSoon);
  if (!overdue.length && !soon.length) return { found: true, count: 0, text: `All ${plural(cells.length, "course")} recorded for you ${cells.length === 1 ? "is" : "are"} in date.` };
  const line = (c) => `${c.course.name}${c.due ? `: ${c.status === TRAIN.overdue ? "ran out" : "runs out"} ${uk(c.due)}` : ""}`;
  const parts = [];
  if (overdue.length) parts.push(`Out of date (${overdue.length}):\n${overdue.slice(0, 8).map(line).join("\n")}`);
  if (soon.length) parts.push(`Running out soon (${soon.length}):\n${soon.slice(0, 8).map(line).join("\n")}`);
  return { found: true, count: overdue.length + soon.length, text: parts.join("\n\n") };
}

export { LIGHT, TRAIN_LABEL, VISIT_PLACE };
