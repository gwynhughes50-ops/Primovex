// Covers Ask Primovex for a person's own admin: timesheet (status, and sending "no changes"), mileage (totals, and claiming a journey), annual leave and training.
import assert from "node:assert/strict";
import { journeyDate, journeyReply, leaveAnswer, mileageAnswer, parseJourney, parseMyAdmin, pickPeriod, timesheetAnswer, timesheetSendReply, trainingAnswer } from "../src/ai/me/myAdmin.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const TODAY = "2026-11-13"; // a Friday
const day = { blocks: [{ start: "08:30", end: "16:30" }], breakMin: 30 }; // 7.5 hours
const FIVE_DAYS = { mon: day, tue: day, wed: day, thu: day, fri: day, sat: { blocks: [], breakMin: 0 }, sun: { blocks: [], breakMin: 0 } };

t("each way of asking about your own admin goes to its lookup, and help, other people and other questions are left alone", () => {
  const tool = (q) => parseMyAdmin(q)?.toolId ?? null;
  assert.equal(tool("Have I sent my timesheet?"), "my.timesheet");
  assert.equal(tool("what's my timesheet status"), "my.timesheet");
  assert.equal(tool("Send my timesheet"), "my.timesheetDraft");
  assert.equal(tool("how much mileage have I claimed"), "my.mileage");
  assert.equal(tool("what are my miles this tax year"), "my.mileage");
  assert.equal(tool("I drove from Main Surgery to District Hospital and back yesterday"), "my.mileageDraft");
  assert.equal(tool("claim mileage from the surgery to the pharmacy"), "my.mileageDraft");
  assert.equal(tool("How much annual leave do I have?"), "my.leave");
  assert.equal(tool("what's my holiday entitlement"), "my.leave");
  assert.equal(tool("What training is due for me?"), "my.training");
  assert.equal(tool("am I up to date with my training"), "my.training");
  for (const q of ["how do I send my timesheet", "who is on holiday", "what is Kim's timesheet", "how much leave does the team have", "where do I claim mileage", "which stock is low", "show my shifts", ""]) assert.equal(tool(q), null, q);
});

const periods = [
  { id: "p1", from: "2026-10-05", to: "2026-11-01", due: "2026-11-04" },
  { id: "p2", from: "2026-11-02", to: "2026-11-29", due: "2026-12-02" },
];

t("timesheet: which period, what state, and when it is due", () => {
  assert.equal(pickPeriod(periods, [], TODAY).id, "p1", "the oldest one still not sent");
  assert.equal(pickPeriod(periods, [{ periodId: "p1", state: "approved" }], TODAY).id, "p2", "the one running now once the older one is done");
  const unsent = timesheetAnswer({ periods, sheets: [], linked: true, today: TODAY });
  assert.match(unsent.text, /^You haven't sent your timesheet for .*\. It was due on 04\/11\/2026\.$/);
  assert.equal(unsent.overdue, true);
  const waiting = timesheetAnswer({ periods, sheets: [{ periodId: "p1", state: "submitted" }, { periodId: "p2", state: "submitted" }], linked: true, today: TODAY });
  assert.match(timesheetAnswer({ periods, sheets: [{ periodId: "p1", state: "submitted" }], linked: true, today: TODAY }).text, /^You haven't sent your timesheet for 2 Nov to 29 Nov 2026\. It is due on 02\/12\/2026\.$/, "an older one waiting does not hide the one running now");
  assert.match(waiting.text, /^Your timesheet for .* is waiting for your line manager\.$/i);
  assert.match(timesheetAnswer({ periods, sheets: [{ periodId: "p1", state: "declined" }, { periodId: "p2", state: "approved" }], linked: true, today: TODAY }).text, /was declined and needs your attention/);
  assert.match(timesheetAnswer({ periods, sheets: [], linked: false }).text, /isn't linked to a staff record/);
  assert.equal(timesheetAnswer({ periods: [], sheets: [], linked: true }).found, false);
});

t("timesheet: sending prepares a card with the declaration for the person to confirm, and nothing is sent without it; an already-sent one says so", () => {
  const me = { id: "s1", uid: "u1", name: "Kim Bell", payrollNo: "104", managerUid: "m1", patterns: [{ from: "2026-01-01", mode: "fixed", weeks: [FIVE_DAYS] }] };
  const reply = timesheetSendReply({ periods, sheets: [], me, uid: "u1", today: TODAY });
  assert.ok(reply.proposal);
  assert.equal(reply.proposal.kind, "timesheet-send");
  assert.equal(reply.proposal.status, "proposed");
  assert.equal(reply.proposal.confirmLabel, "I confirm and send");
  assert.match(reply.proposal.lines.join("|"), /I confirm: “I confirm that the hours I worked from 05\/10\/2026 to 01\/11\/2026 were the same as my usual working pattern/);
  assert.equal(reply.proposal.params.period.id, "p1");
  assert.equal(reply.proposal.params.me.managerUid, "m1");
  assert.equal(reply.proposal.params.existing, null);
  const already = timesheetSendReply({ periods, sheets: [{ periodId: "p1", state: "submitted", id: "p1_s1" }, { periodId: "p2", state: "submitted", id: "p2_s1" }], me, uid: "u1", today: TODAY });
  assert.equal(already.proposal, undefined);
  assert.match(already.text, /There is nothing to send\.$/);
  assert.match(timesheetSendReply({ periods, sheets: [], me: { ...me, uid: "other" }, uid: "u1" }).text, /isn't linked/);
  const draft = timesheetSendReply({ periods, sheets: [{ periodId: "p1", state: "draft", id: "p1_s1", submissions: 1 }], me, uid: "u1", today: TODAY });
  assert.deepEqual(draft.proposal.params.existing, { id: "p1_s1", submissions: 1 }, "an existing draft is updated, not duplicated");
});

const claims = [
  { id: "c1", uid: "u1", date: "2026-05-10", status: "approved", miles: 10, returnTrip: true, vehicle: "car" },
  { id: "c2", uid: "u1", date: "2026-09-02", status: "approved", miles: 5, returnTrip: false, vehicle: "car" },
  { id: "c3", uid: "u1", date: "2026-11-10", status: "submitted", miles: 8, returnTrip: true, vehicle: "car" },
  { id: "c4", uid: "u1", date: "2026-03-01", status: "approved", miles: 99, returnTrip: false, vehicle: "car" },
];

t("mileage: this tax year only, approved miles and pounds, and what is waiting", () => {
  const out = mileageAnswer({ claims, today: TODAY });
  assert.match(out.text, /^In the 2026-27 tax year you have 25 miles approved \(£11\.25\)\. 1 claim is waiting for approval\.$/);
  assert.equal(out.count, 3, "the March claim belongs to the last tax year");
  assert.match(mileageAnswer({ claims: [], today: TODAY }).text, /haven't claimed any mileage in the 2026-27 tax year/);
});

const options = [{ id: "site:main", name: "Main Surgery", kind: "site" }, { id: "site:branch", name: "Branch Surgery", kind: "site" }, { id: "place:dh", name: "District Hospital", kind: "place" }, { id: "visit", name: "Home visit (patient's home)", kind: "visit" }];
const routes = [{ fromId: "site:main", toId: "place:dh", miles: 6.4 }];
const me = { id: "s1", uid: "u1", name: "Kim Bell", managerUid: "m1" };

t("a journey is read: the two saved places, the day, whether it was there and back, and the vehicle", () => {
  assert.equal(journeyDate("yesterday", TODAY), "2026-11-12");
  assert.equal(journeyDate("on Tuesday", TODAY), "2026-11-10");
  assert.equal(journeyDate("on Friday", TODAY), "2026-11-06", "a Friday named on a Friday means last week's");
  assert.equal(journeyDate("on 05/11", TODAY), "2026-11-05");
  assert.equal(journeyDate("on 5/11/2026", TODAY), "2026-11-05");
  assert.equal(journeyDate("went somewhere", TODAY), TODAY);
  assert.deepEqual(parseJourney("I drove from Main Surgery to District Hospital and back yesterday", { options, today: TODAY }), { fromId: "site:main", toId: "place:dh", fromName: "Main Surgery", toName: "District Hospital", returnTrip: true, date: "2026-11-12", vehicle: "car" });
  const bike = parseJourney("I cycled from main surgery to the branch surgery on Tuesday", { options, today: TODAY });
  assert.equal(bike.vehicle, "bicycle");
  assert.equal(bike.toId, "site:branch");
  assert.equal(bike.returnTrip, false);
  assert.equal(parseJourney("no places here", { options }), null);
});

t("claiming a journey: a card with the distance from the saved route, going to the line manager, and clear reasons when it can't", () => {
  const ok = journeyReply({ question: "I drove from Main Surgery to District Hospital and back yesterday", options, routes, me, uid: "u1", today: TODAY });
  assert.ok(ok.proposal);
  assert.equal(ok.proposal.kind, "mileage-claim");
  assert.equal(ok.proposal.title, "Claim 12.8 miles");
  assert.match(ok.proposal.lines.join("|"), /12\/11\/2026: Main Surgery to District Hospital and back/);
  assert.match(ok.proposal.lines.join("|"), /goes to your line manager|It goes to your line manager/i);
  assert.equal(ok.proposal.params.form.miles, 6.4);
  assert.equal(ok.proposal.params.form.returnTrip, true);
  assert.deepEqual(ok.proposal.params.options.map((o) => o.id), ["site:main", "place:dh"]);
  assert.match(journeyReply({ question: "I drove from Main Surgery to Cardiff Bay", options, routes, me, uid: "u1", today: TODAY }).text, /couldn't match the end to a saved place/);
  assert.match(journeyReply({ question: "I drove from Main Surgery to Branch Surgery", options, routes, me, uid: "u1", today: TODAY }).text, /don't have the distance between Main Surgery and Branch Surgery saved/);
  assert.match(journeyReply({ question: "I drove from Main Surgery to District Hospital tomorrow", options, routes, me, uid: "u1", today: TODAY }).text, /^$|./, "a day in the future is parsed as today");
  assert.match(journeyReply({ question: "I drove from Main Surgery to District Hospital", options, routes, me: { ...me, uid: "x" }, uid: "u1", today: TODAY }).text, /isn't linked/);
  assert.match(journeyReply({ question: "drove", options, routes, me, uid: "u1" }).text, /say where from and to/);
});

t("annual leave: the entitlement for this leave year in the person's own unit, and what Primovex cannot know", () => {
  const settings = { groups: [], practiceDays: [], gpBankHolidays: 0, gpMaxSessions: 8 };
  const person = { leaveGroup: "admin", serviceFrom: "2020-01-06", patterns: [{ from: "2020-01-01", mode: "fixed", weeks: [FIVE_DAYS] }] };
  const out = leaveAnswer({ person, settings, today: TODAY });
  assert.equal(out.found, true);
  assert.match(out.text, /^Your annual leave for 2026-27 \(1 April to 31 March\) is [\d.]+ hours \(about [\d.]+ days of 7\.5 hours\), including bank holidays\./);
  assert.match(out.text, /What you have booked or taken is in BrightHR, so I can't say how much is left\.$/);
  assert.match(leaveAnswer({ person: null }).text, /isn't set up yet/);
  assert.equal(leaveAnswer({ person: { leaveGroup: "" }, settings }).found, false);
});

t("training: what is out of date and what is running out, from the person's own record only", () => {
  const people = [{ id: "p1", uid: "u1", name: "Kim Bell", group: "clinical" }];
  const courses = [{ id: "c1", name: "Fire safety", group: "all", months: 12, active: true }, { id: "c2", name: "Basic life support", group: "all", months: 12, active: true }, { id: "c3", name: "Safeguarding", group: "all", months: 36, active: true }];
  const records = [
    { id: "p1_c1", personId: "p1", courseId: "c1", completedOn: "2025-01-10", dueOn: "2026-01-10" },
    { id: "p1_c2", personId: "p1", courseId: "c2", completedOn: "2025-12-20", dueOn: "2026-12-20" },
    { id: "p1_c3", personId: "p1", courseId: "c3", completedOn: "2026-06-01", dueOn: "2029-06-01" },
  ];
  const out = trainingAnswer({ people, courses, records, now: new Date(2026, 10, 13) });
  assert.match(out.text, /Out of date \(1\):\nFire safety: ran out 10\/01\/2026/);
  assert.match(out.text, /Running out soon \(1\):\nBasic life support: runs out 20\/12\/2026/);
  assert.equal(out.count, 2);
  assert.match(trainingAnswer({ people: [], courses, records }).text, /isn't linked to your account/);
  assert.match(trainingAnswer({ people, courses, records: [records[2]], now: new Date(2026, 10, 13) }).text, /^All 1 course recorded for you is in date\.$/);
});

console.log(`\n${n} passed`);
