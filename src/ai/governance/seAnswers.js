import { ACTION_STATUSES, MEETING_STATUSES, REVIEW_STATUSES, SE_STATUSES, actionTone, stageLabel } from "../../modules/governance/seModel";
import { joinList, plural } from "../tools/answerWording";

// What the Orb says about significant events. It only ever sees the events the person is allowed to
// open (the database rules decide that when the data is read), so every answer is about "your" view:
// the whole practice for the significant events team and oversight, otherwise the events they
// reported, lead, are named on or were asked to review. Answers use references and stages, and an
// event's title only when asked about that one event. Pure, so it can be tested.

export const SE_REFERENCE = /\bse-\d{4}-\d{4,}\b/i;

const has = (text, words) => words.some((w) => text.includes(w));

// What is being asked. "mine" = about the person themselves rather than the practice.
export function parseSeQuestion(question) {
  const text = String(question || "").toLowerCase();
  const ref = text.match(SE_REFERENCE);
  if (ref) return { kind: "event", reference: ref[0].toUpperCase() };
  const mine = has(text, [" my ", " me ", " i ", "assigned to me", "asked me", "for me", "i've", "i have", "i need"]) || /^(my|do i|have i|am i)\b/.test(text);
  if (has(text, ["review"])) return { kind: "review", mine: true };
  if (has(text, ["action"])) return { kind: "actions", mine, overdue: has(text, ["overdue", "late", "behind", "outstanding"]) };
  if (has(text, ["meeting", "minutes", "agenda"])) return { kind: "meeting" };
  return { kind: "summary", mine };
}

const OPEN = (e) => e.status !== SE_STATUSES.closed;

function summaryAnswer({ events, actions, uid, seesAll, mine }) {
  const openEvents = events.filter(OPEN);
  if (!events.length) {
    return { text: seesAll ? "No significant events have been reported." : "You haven't reported any significant events, and none involve you.", followUps: [] };
  }
  const count = (status) => events.filter((e) => e.status === status).length;
  const overdue = actions.filter((a) => actionTone(a).id === "overdue").length;
  const lines = [];
  if (seesAll && !mine) {
    lines.push(`${plural(openEvents.length, "significant event")} ${openEvents.length === 1 ? "is" : "are"} open${events.length > openEvents.length ? ` (${events.length - openEvents.length} closed)` : ""}.`);
    const parts = [
      [count(SE_STATUSES.reported), "waiting to be triaged"],
      [count(SE_STATUSES.investigating), "being investigated"],
      [count(SE_STATUSES.in_review), "in review"],
      [count(SE_STATUSES.awaiting_meeting), "waiting for a meeting"],
      [count(SE_STATUSES.actions_open), "with actions still open"],
    ].filter(([n]) => n > 0).map(([n, label]) => `${n} ${label}`);
    if (parts.length) lines.push(`${joinList(parts, 5)}.`);
    if (overdue) lines.push(`${plural(overdue, "action")} ${overdue === 1 ? "is" : "are"} overdue.`);
  } else {
    const mineEvents = events.filter((e) => e.reportedByUid === uid || e.leadUid === uid || (e.involvedUserIds || []).includes(uid) || (e.reviewerUids || []).includes(uid));
    const open = mineEvents.filter(OPEN);
    lines.push(`You're involved in ${plural(mineEvents.length, "significant event")}, ${open.length} still open.`);
    const reportedOpen = open.filter((e) => e.reportedByUid === uid);
    if (reportedOpen.length) lines.push(`Of the ones you reported: ${joinList(reportedOpen.slice(0, 5).map((e) => `${e.reference} is ${stageLabel(e.status).toLowerCase()}`), 5)}.`);
    const myOverdue = actions.filter((a) => a.ownerUid === uid && actionTone(a).id === "overdue").length;
    if (myOverdue) lines.push(`${plural(myOverdue, "action")} of yours ${myOverdue === 1 ? "is" : "are"} overdue.`);
  }
  return { text: lines.join(" "), followUps: seesAll ? ["which significant event actions are overdue", "when is the next significant event meeting"] : ["do I have any significant event reviews to do"] };
}

function reviewAnswer({ events, reviews }) {
  const waiting = reviews.filter((r) => r.status === REVIEW_STATUSES.requested);
  if (!waiting.length) return { text: "You haven't been asked to review any significant events, or you've done them all.", followUps: [] };
  const refs = waiting.map((r) => r.seReference || events.find((e) => e.id === r.seId)?.reference || "an event");
  return { text: `You've been asked to review ${plural(waiting.length, "significant event")}: ${joinList(refs.slice(0, 8), 8)}. Open Significant events to write your review.`, followUps: [] };
}

function actionsAnswer({ actions, uid, mine, overdue }) {
  let rows = actions.filter((a) => a.status !== ACTION_STATUSES.done);
  if (mine) rows = rows.filter((a) => a.ownerUid === uid);
  if (overdue) rows = rows.filter((a) => actionTone(a).id === "overdue");
  const who = mine ? "You have" : "There are";
  const kind = overdue ? "overdue " : "open ";
  if (!rows.length) return { text: mine ? `You have no ${kind}significant event actions.` : `There are no ${kind}significant event actions.`, followUps: [] };
  const sample = rows.slice(0, 5).map((a) => `${a.title}${a.seReference ? ` (${a.seReference})` : ""}${mine ? "" : ` - ${a.ownerName || "unassigned"}`}`);
  return { text: `${who} ${plural(rows.length, `${kind}significant event action`)}: ${joinList(sample, 5)}${rows.length > 5 ? `, and ${rows.length - 5} more` : ""}.`, followUps: [] };
}

function meetingAnswer({ meetings, now }) {
  const planned = meetings.filter((m) => m.status === MEETING_STATUSES.planned).map((m) => ({ ...m, when: m.meetingDate?.toDate ? m.meetingDate.toDate() : new Date(m.meetingDate) })).filter((m) => !Number.isNaN(m.when.getTime())).sort((a, b) => a.when - b.when);
  const next = planned.find((m) => m.when.getTime() >= now - 86400000) || planned[0];
  if (!next) return { text: "No significant event meeting is planned.", followUps: [] };
  const n = (next.eventIds || []).length;
  return { text: `The next significant event meeting is "${next.title}" on ${next.when.toLocaleDateString("en-GB")}, with ${plural(n, "event")} on the agenda.`, followUps: [] };
}

function eventAnswer({ events, reviews, actions, reference }) {
  const event = events.find((e) => String(e.reference || "").toUpperCase() === reference);
  if (!event) return { text: `I couldn't find ${reference} among the significant events you can see.`, followUps: [] };
  const mine = reviews.filter((r) => r.seId === event.id);
  const open = actions.filter((a) => a.seId === event.id && a.status !== ACTION_STATUSES.done).length;
  const parts = [`${event.reference} (${event.title}) is ${stageLabel(event.status).toLowerCase()}.`];
  if (event.leadName) parts.push(`${event.leadName} is leading the investigation.`);
  if ((event.reviewerUids || []).length) parts.push(`${(event.reviewerUids || []).length} reviewer${(event.reviewerUids || []).length === 1 ? "" : "s"} asked${mine.length ? `, ${mine.filter((r) => r.status === REVIEW_STATUSES.submitted).length} in` : ""}.`);
  if (open) parts.push(`${plural(open, "action")} still open.`);
  return { text: parts.join(" "), followUps: [] };
}

export function buildSeAnswer(question, data = {}) {
  const { events = [], actions = [], reviews = [], meetings = [], uid = null, seesAll = false, now = Date.now() } = data;
  const parsed = parseSeQuestion(question);
  const ctx = { events, actions, reviews, meetings, uid, seesAll, now, ...parsed };
  const result = parsed.kind === "event" ? eventAnswer(ctx)
    : parsed.kind === "review" ? reviewAnswer(ctx)
    : parsed.kind === "actions" ? actionsAnswer(ctx)
    : parsed.kind === "meeting" ? meetingAnswer(ctx)
    : summaryAnswer(ctx);
  return { ...result, kind: parsed.kind };
}
