import assert from "node:assert/strict";
import { buildSeAnswer, parseSeQuestion } from "../src/ai/governance/seAnswers.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const NOW = Date.parse("2026-10-08T12:00:00Z");

const events = [
  { id: "e1", reference: "SE-2026-10010900", title: "Wrong vaccine drawn up", status: "reported", reportedByUid: "rep" },
  { id: "e2", reference: "SE-2026-10020900", title: "Fridge left open", status: "investigating", reportedByUid: "me", leadUid: "lead", leadName: "Lee Lead" },
  { id: "e3", reference: "SE-2026-10030900", title: "Late result", status: "awaiting_meeting", reportedByUid: "rep", reviewerUids: ["me", "r2"] },
  { id: "e4", reference: "SE-2026-10040900", title: "Closed one", status: "closed", reportedByUid: "rep" },
];
const actions = [
  { id: "a1", seId: "e3", seReference: "SE-2026-10030900", title: "Update checklist", ownerUid: "me", ownerName: "Me", status: "open", dueDate: "2026-10-01" },
  { id: "a2", seId: "e3", title: "Tell the team", ownerUid: "other", ownerName: "Other", status: "open", dueDate: "2026-12-01" },
  { id: "a3", seId: "e3", title: "Done already", ownerUid: "me", status: "done", dueDate: "2026-09-01" },
];
const reviews = [{ seId: "e3", seReference: "SE-2026-10030900", reviewerUid: "me", status: "requested" }];
const meetings = [{ id: "m1", title: "October SE meeting", status: "planned", meetingDate: "2026-10-20", eventIds: ["e3"] }, { id: "m0", title: "Old", status: "held", meetingDate: "2026-09-01", eventIds: [] }];

t("what is being asked is understood", () => {
  assert.equal(parseSeQuestion("what is the status of SE-2026-10081405").kind, "event");
  assert.equal(parseSeQuestion("what is the status of SE-2026-10081405").reference, "SE-2026-10081405");
  assert.equal(parseSeQuestion("do I have any significant event reviews to do").kind, "review");
  assert.equal(parseSeQuestion("which significant event actions are overdue").overdue, true);
  assert.equal(parseSeQuestion("what significant event actions do I have").mine, true);
  assert.equal(parseSeQuestion("when is the next significant event meeting").kind, "meeting");
  assert.equal(parseSeQuestion("how many significant events are open").kind, "summary");
});

t("the team sees the whole practice, without titles", () => {
  const a = buildSeAnswer("how many significant events are open", { events, actions, reviews, meetings, uid: "pm", seesAll: true, now: NOW });
  assert.match(a.text, /3 significant events are open \(1 closed\)/);
  assert.match(a.text, /1 waiting to be triaged/);
  assert.match(a.text, /1 being investigated/);
  assert.match(a.text, /1 waiting for a meeting/);
  assert.match(a.text, /1 action is overdue/);
  assert.ok(!/vaccine|fridge|result/i.test(a.text), "titles stay out of summaries");
});

t("someone who isn't on the team gets their own view", () => {
  const a = buildSeAnswer("how many significant events are open", { events: events.filter((e) => e.reportedByUid === "me" || (e.reviewerUids || []).includes("me")), actions: actions.filter((x) => x.ownerUid === "me"), reviews, meetings: [], uid: "me", seesAll: false, now: NOW });
  assert.match(a.text, /You're involved in 2 significant events, 2 still open/);
  assert.match(a.text, /SE-2026-10020900 is investigating/);
  assert.match(a.text, /1 action of yours is overdue/);
});

t("nothing reported", () => {
  assert.match(buildSeAnswer("significant events", { events: [], uid: "pm", seesAll: true }).text, /No significant events have been reported/);
  assert.match(buildSeAnswer("significant events", { events: [], uid: "me", seesAll: false }).text, /haven't reported any/);
});

t("reviews waiting for me", () => {
  assert.match(buildSeAnswer("do I have any significant event reviews to do", { events, reviews, uid: "me" }).text, /asked to review 1 significant event: SE-2026-10030900/);
  assert.match(buildSeAnswer("any significant event reviews for me", { events, reviews: [], uid: "me" }).text, /haven't been asked/);
});

t("actions: mine, overdue, everyone's", () => {
  const mine = buildSeAnswer("what significant event actions do I have", { actions, uid: "me", events }).text;
  assert.match(mine, /You have 1 open significant event action: Update checklist \(SE-2026-10030900\)/);
  const overdue = buildSeAnswer("which significant event actions are overdue", { actions, uid: "pm", seesAll: true, events }).text;
  assert.match(overdue, /1 overdue significant event action/);
  assert.match(overdue, /Update checklist/);
  assert.ok(!/Tell the team/.test(overdue));
  assert.match(buildSeAnswer("what significant event actions do I have", { actions: [], uid: "me", events }).text, /no open significant event actions/);
});

t("the next meeting", () => {
  const a = buildSeAnswer("when is the next significant event meeting", { meetings, now: NOW }).text;
  assert.match(a, /"October SE meeting" on 20\/10\/2026, with 1 event on the agenda/);
  assert.match(buildSeAnswer("when is the next significant event meeting", { meetings: [], now: NOW }).text, /No significant event meeting is planned/);
});

t("one event by reference; one that can't be seen is not described", () => {
  const a = buildSeAnswer("status of SE-2026-10020900", { events, uid: "pm", seesAll: true, actions, reviews: [] }).text;
  assert.match(a, /SE-2026-10020900 \(Fridge left open\) is investigating\. Lee Lead is leading/);
  assert.match(buildSeAnswer("status of SE-2026-99999999", { events: [], uid: "x" }).text, /couldn't find SE-2026-99999999 among the significant events you can see/);
});

console.log(`\n${n} passed`);
