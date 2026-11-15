// Covers Ask Primovex logging overtime: understanding "I did some overtime can you log it for me", asking one short question at a time (how much, which day, which rate,
// was it approved and, if not, why), the card that adds one draft line to the person's own timesheet, and the checks before and after.
import assert from "node:assert/strict";
import { acceptsOvertimeAnswer, hoursWords, mergeOvertimeAnswer, overtimeLine, overtimeReply, parseOvertimeAsk, readOvertime, withOvertimeLine } from "@/ai/me/overtime";
import { routeApprovedTool } from "@/ai/tools/intentRouter";
import { routePendingDetails } from "@/ai/tools/pendingDetails";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const TODAY = "2026-11-13"; // a Friday
const periods = [{ id: "pp-2026-11-01", from: "2026-11-01", to: "2026-11-28", due: "2026-11-30" }, { id: "pp-2026-10-04", from: "2026-10-04", to: "2026-10-31", due: "2026-11-02" }];
const me = { id: "s1", uid: "u1", name: "Sam Lee", payrollNo: "123", managerUid: "m1", patterns: [] };
const reply = (question, extra = {}) => overtimeReply({ question, periods, sheets: [], me, uid: "u1", today: TODAY, ...extra });

t("the many ways of saying it are understood, and how-to questions, other people and totals are left alone", () => {
  const yes = ["i did some overtime can you log it for me", "I did 2 hours overtime yesterday", "log my overtime", "can you add 1 hour of overtime to my timesheet", "I worked extra hours on Tuesday, can you record them", "put 3 hours overtime on my timesheet for yesterday", "record my overtime please", "I've done overtime", "I did overtime last night", "I stayed late yesterday can you log it as overtime", "add 30 minutes overtime", "I worked late on Monday, can you add it to my timesheet"];
  for (const q of yes) assert.equal(parseOvertimeAsk(q)?.toolId, "my.overtimeDraft", q);
  const no = ["how do I record overtime", "where do I log overtime", "how much overtime have I done", "how many hours of overtime does the team have", "who did overtime yesterday", "what is overtime", "Sarah did some overtime", "show my shifts", "I stayed late", "send my timesheet", ""];
  for (const q of no) assert.equal(parseOvertimeAsk(q), null, q);
});

t("through the real router it goes to the overtime tool, and nothing else is stolen", () => {
  assert.equal(routeApprovedTool("i did some overtime can you log it for me", { conversation: [] })?.toolId, "my.overtimeDraft");
  assert.equal(routeApprovedTool("I did 2 hours overtime yesterday", { conversation: [] })?.toolId, "my.overtimeDraft");
  assert.equal(routeApprovedTool("send my timesheet", { conversation: [] })?.toolId, "my.timesheetDraft");
  assert.equal(routeApprovedTool("have I sent my timesheet", { conversation: [] })?.toolId, "my.timesheet");
  assert.notEqual(routeApprovedTool("how do I record overtime", { conversation: [] })?.toolId, "my.overtimeDraft");
});

t("hours are read from everyday wording", () => {
  const h = (q) => readOvertime(q, TODAY).hours;
  assert.equal(h("2 hours"), 2); assert.equal(h("1.5 hours"), 1.5); assert.equal(h("two hours overtime"), 2); assert.equal(h("an hour"), 1); assert.equal(h("half an hour"), 0.5);
  assert.equal(h("an hour and a half"), 1.5); assert.equal(h("2 and a half hours"), 2.5); assert.equal(h("90 minutes"), 1.5); assert.equal(h("45 mins"), 0.75);
  assert.equal(h("1 hour 30"), 1.5); assert.equal(h("2h"), 2); assert.equal(h("i did some overtime"), null);
});

t("the day, the rate and whether it was approved are read, and only when they are said", () => {
  assert.equal(readOvertime("yesterday", TODAY).date, "2026-11-12");
  assert.equal(readOvertime("last night", TODAY).date, "2026-11-12");
  assert.equal(readOvertime("today", TODAY).date, TODAY);
  assert.equal(readOvertime("on Tuesday", TODAY).date, "2026-11-10");
  assert.equal(readOvertime("on 5/11", TODAY).date, "2026-11-05");
  assert.equal(readOvertime("i did some overtime", TODAY).date, null);
  assert.equal(readOvertime("time and a half", TODAY).code, "C");
  assert.equal(readOvertime("standard rate", TODAY).code, "B");
  assert.equal(readOvertime("2 hours", TODAY).code, null);
  assert.equal(readOvertime("it was approved", TODAY).approved, true);
  assert.equal(readOvertime("my manager agreed it", TODAY).approved, true);
  assert.equal(readOvertime("it wasn't approved", TODAY).approved, false);
  assert.equal(readOvertime("not approved", TODAY).approved, false);
  assert.equal(readOvertime("no approval", TODAY).approved, false);
  assert.equal(readOvertime("it was unapproved", TODAY).approved, false);
  assert.equal(readOvertime("2 hours", TODAY).approved, null);
});

t("it asks one short question at a time, in order, with buttons to tap and a way out", () => {
  const first = reply("i did some overtime can you log it for me");
  assert.equal(first.text, "How much overtime was it?");
  assert.equal(first.pending.asking, "hours");
  assert.ok(first.followUps.some((f) => f.ask === "2 hours"));
  assert.equal(first.followUps.at(-1).ask, "never mind");
  const second = reply("i did some overtime can you log it for me 2 hours");
  assert.equal(second.text, "Which day was it?");
  assert.deepEqual(second.followUps.slice(0, 2).map((f) => f.ask), ["today", "yesterday"]);
  assert.deepEqual(second.followUps.slice(2, 4).map((f) => f.ask), ["on Wednesday", "on Tuesday"], "the two days before yesterday, by name");
  assert.equal(reply("2 hours yesterday").text, "Which rate was it?");
  assert.deepEqual(reply("2 hours yesterday").followUps.slice(0, 2).map((f) => f.ask), ["standard rate", "time and a half"]);
  const approval = reply("2 hours yesterday standard rate");
  assert.equal(approval.text, "Was the overtime approved?");
  assert.deepEqual(approval.followUps.slice(0, 2).map((f) => f.label), ["Yes, it was approved", "No, it wasn't approved"]);
  assert.equal(approval.pending.asking, "approved");
});

t("approved means a card with no reason needed", () => {
  const r = reply("2 hours yesterday standard rate it was approved");
  assert.equal(r.proposal.kind, "timesheet-overtime");
  assert.deepEqual(r.proposal.params.line, { date: "2026-11-12", code: "B", hours: 2, comment: "Approved overtime" });
  assert.equal(r.proposal.params.period.id, "pp-2026-11-01");
  assert.match(r.proposal.lines[0], /^Overtime, standard rate: 2 hours on Thursday 12\/11\/2026$/);
  assert.equal(r.proposal.lines[1], "Approved in advance: yes");
  assert.match(r.proposal.lines[2], /as a draft/);
  assert.match(r.proposal.lines[3], /Nothing goes to your line manager until you open Timesheet and press Send/);
  assert.equal(r.proposal.confirmLabel, "Add to my timesheet");
  assert.equal(r.proposal.requiredCapability, null);
  assert.match(r.text, /Nothing has been added or sent yet/);
});

t("not approved asks why, takes a short reason, and puts it on the line for the line manager to see", () => {
  const asks = reply("2 hours yesterday time and a half it wasn't approved");
  assert.equal(asks.text, "Why wasn't it approved? A short reason is fine: tap one, or type your own.");
  assert.equal(asks.pending.asking, "reason");
  assert.deepEqual(asks.followUps.slice(0, 4).map((f) => f.label), ["Urgent patient need", "Manager not available", "Unplanned or emergency", "Short notice"]);
  assert.equal(asks.proposal, undefined, "no card until there is a reason");
  const done = reply("2 hours yesterday time and a half it wasn't approved [reason: Manager not available]");
  assert.deepEqual(done.proposal.params.line, { date: "2026-11-12", code: "C", hours: 2, comment: "Not pre-approved: Manager not available" });
  assert.equal(done.proposal.lines[1], "Approved in advance: no. Reason: Manager not available");
  assert.match(done.proposal.lines[0], /^Overtime, time and a half: 2 hours/);
});

t("a reason is kept short and cannot break the sentence it is stored in, and a reason's own words are never read as hours, days or rates", () => {
  const merged = mergeOvertimeAnswer("2 hours yesterday standard it wasn't approved", "Left at 8pm [on Tuesday] for 3 hours, time and a half, approved later", { asking: "reason" });
  assert.match(merged, /\[reason: Left at 8pm on Tuesday for 3 hours, time and a half, approved later\]$/);
  const said = readOvertime(merged, TODAY);
  assert.equal(said.hours, 2); assert.equal(said.date, "2026-11-12"); assert.equal(said.code, "B"); assert.equal(said.approved, false);
  assert.ok(said.reason.length <= 100);
  const long = mergeOvertimeAnswer("x", "y".repeat(400), { asking: "reason" });
  assert.ok(readOvertime(long, TODAY).reason.length <= 100);
});

t("answers can be typed as well as tapped: a bare number, yes, no, and a rate", () => {
  assert.equal(acceptsOvertimeAnswer("2", { asking: "hours" }), true);
  assert.equal(mergeOvertimeAnswer("log my overtime", "2", { asking: "hours" }), "log my overtime 2 hours");
  assert.equal(mergeOvertimeAnswer("log my overtime", "half", { asking: "hours" }), "log my overtime half an hour");
  assert.equal(acceptsOvertimeAnswer("yes", { asking: "approved" }), true);
  assert.equal(readOvertime(mergeOvertimeAnswer("x", "yes", { asking: "approved" })).approved, true);
  assert.equal(readOvertime(mergeOvertimeAnswer("x", "no", { asking: "approved" })).approved, false);
  assert.equal(readOvertime(mergeOvertimeAnswer("x", "standard", { asking: "rate" })).code, "B");
  assert.equal(readOvertime(mergeOvertimeAnswer("x", "1.5", { asking: "rate" })).code, "C");
  assert.equal(acceptsOvertimeAnswer("yesterday", { asking: "date" }), true);
  assert.equal(acceptsOvertimeAnswer("banana", { asking: "hours" }), false, "something else is a new question");
  assert.equal(acceptsOvertimeAnswer("yes", { asking: "hours" }), false, "yes does not answer how much");
});

t("a reason is taken from what was typed, but a new question or command while asking is not mistaken for one", () => {
  assert.equal(acceptsOvertimeAnswer("Waiting for a locum to arrive", { asking: "reason" }), true);
  for (const q of ["what's low in stock?", "show my shifts", "how do I add stock", "remind me on Monday to ring the pharmacy", "which fridges are ok", "ok", ""]) assert.equal(acceptsOvertimeAnswer(q, { asking: "reason" }), false, q);
});

t("never mind stops it with nothing added", () => {
  assert.equal(acceptsOvertimeAnswer("never mind", { asking: "hours" }), true);
  assert.equal(acceptsOvertimeAnswer("Cancel", { asking: "reason" }), true);
  const r = reply(mergeOvertimeAnswer("log my overtime 2 hours", "never mind", { asking: "date" }));
  assert.equal(r.text, "OK, I haven't added anything.");
  assert.equal(r.proposal, undefined); assert.equal(r.pending, undefined);
});

t("the whole conversation: each answer is picked up as the answer to the question just asked, and a new question is not", () => {
  const conversation = [];
  const say = (prompt) => routePendingDetails(prompt, conversation);
  let r = reply("i did some overtime can you log it for me");
  conversation.push({ role: "assistant", pending: r.pending, proposal: null });
  let routed = say("2 hours");
  assert.equal(routed.toolId, "my.overtimeDraft");
  r = reply(routed.input.question);
  assert.equal(r.text, "Which day was it?");
  conversation.push({ role: "assistant", pending: r.pending, proposal: null });
  routed = say("yesterday"); r = reply(routed.input.question);
  assert.equal(r.text, "Which rate was it?");
  conversation.push({ role: "assistant", pending: r.pending, proposal: null });
  routed = say("time and a half"); r = reply(routed.input.question);
  assert.equal(r.text, "Was the overtime approved?");
  conversation.push({ role: "assistant", pending: r.pending, proposal: null });
  routed = say("no"); r = reply(routed.input.question);
  assert.equal(r.pending.asking, "reason");
  conversation.push({ role: "assistant", pending: r.pending, proposal: null });
  assert.equal(say("which stock is low?"), null, "a new question is not taken as the reason");
  routed = say("Short notice"); r = reply(routed.input.question);
  assert.deepEqual(r.proposal.params.line, { date: "2026-11-12", code: "C", hours: 2, comment: "Not pre-approved: Short notice" });
});

t("nothing is added to a timesheet that is not the person's to change, or that cannot hold it", () => {
  const full = "2 hours yesterday standard rate it was approved";
  assert.match(reply(full, { me: null }).text, /isn't linked to a staff record/);
  assert.match(reply(full, { me: { ...me, uid: "someone-else" } }).text, /isn't linked to a staff record/);
  assert.match(reply("2 hours on 1/9 standard rate it was approved").text, /No pay period covers 01\/09\/2026/);
  assert.match(reply("2 hours tomorrow standard rate approved").text, /hasn't happened yet|Which day/);
  assert.match(reply("30 hours yesterday standard rate approved").text, /more than 24 hours in a day/);
  const sent = reply(full, { sheets: [{ periodId: "pp-2026-11-01", state: "submitted", lines: [] }] });
  assert.match(sent.text, /is waiting for your line manager, so I can't add to it/i);
  assert.equal(sent.proposal, undefined);
  const approvedSheet = reply(full, { sheets: [{ periodId: "pp-2026-11-01", state: "approved", lines: [] }] });
  assert.match(approvedSheet.text, /so I can't add to it/);
  const draft = reply(full, { sheets: [{ periodId: "pp-2026-11-01", state: "draft", lines: [{ date: "2026-11-03", code: "D", hours: 7.5, comment: "" }] }] });
  assert.equal(draft.proposal.kind, "timesheet-overtime");
  const declined = reply(full, { sheets: [{ periodId: "pp-2026-11-01", state: "declined", lines: [] }] });
  assert.equal(declined.proposal.kind, "timesheet-overtime");
});

t("the same overtime is never added twice, and existing lines are kept and kept in date order", () => {
  const line = overtimeLine({ date: "2026-11-12", code: "B", hours: 2, approved: true, reason: "" });
  const existing = [{ date: "2026-11-20", code: "D", hours: 7.5, comment: "Leave" }, { date: "2026-11-03", code: "A", hours: 7.5, comment: "" }];
  const once = withOvertimeLine(existing, line);
  assert.equal(once.added, true);
  assert.deepEqual(once.lines.map((l) => l.date), ["2026-11-03", "2026-11-12", "2026-11-20"]);
  assert.equal(withOvertimeLine(once.lines, line).added, false);
  assert.equal(withOvertimeLine(once.lines, { ...line, hours: 3 }).added, true, "a different amount on the same day is a different line");
  const dup = reply("2 hours yesterday standard rate it was approved", { sheets: [{ periodId: "pp-2026-11-01", state: "draft", lines: [line] }] });
  assert.match(dup.text, /already on your timesheet/);
  assert.equal(dup.proposal, undefined);
});

t("hours are put into words", () => {
  assert.equal(hoursWords(2), "2 hours"); assert.equal(hoursWords(1), "1 hour"); assert.equal(hoursWords(0.5), "30 minutes"); assert.equal(hoursWords(1.5), "1 hour 30 minutes"); assert.equal(hoursWords(2.25), "2 hours 15 minutes");
});

console.log(`\n${n} tests passed`);
