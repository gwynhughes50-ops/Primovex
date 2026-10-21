import assert from "node:assert/strict";
import {
  CLOSE_STEPS, PARTIES, buildClosePatch, buildStep, closeProblems, closeStepProblems, closeStepsFor, involvedParties, isStatementOnly, orderedSteps, partyState, reviewStatus, sentCount, ukDay, updateChoices,
} from "../src/modules/governance/concernCase.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const NOW = new Date(2026, 9, 20, 10, 0); // Tuesday 20 October 2026
let seq = 0;
const step = (party, action, occurredOn, extra = {}) => ({ id: `s${(seq += 1)}`, party, action, occurredOn, createdAtMs: seq, ...extra });

t("a step needs a party, what happened, a date that is not in the future, and a note when they want changes", () => {
  assert.deepEqual(buildStep({ party: "indemnity", action: "sent", occurredOn: "2026-10-20", what: "draft_response", note: "  Draft  v2 ", now: NOW }), { party: "indemnity", action: "sent", occurredOn: "2026-10-20", what: "draft_response", note: "Draft v2", round: null });
  assert.throws(() => buildStep({ party: "nobody", action: "sent", occurredOn: "2026-10-20", now: NOW }), /who it was with/);
  assert.throws(() => buildStep({ party: "gmpi", action: "bogus", occurredOn: "2026-10-20", now: NOW }), /what happened/);
  assert.throws(() => buildStep({ party: "gmpi", action: "sent", occurredOn: "20/10/2026", now: NOW }), /date it happened/);
  assert.throws(() => buildStep({ party: "gmpi", action: "sent", occurredOn: "2026-10-21", now: NOW }), /in the future/);
  assert.throws(() => buildStep({ party: "indemnity", action: "changes", occurredOn: "2026-10-20", now: NOW }), /what changes/);
  assert.throws(() => buildStep({ party: "indemnity", action: "info", occurredOn: "2026-10-20", now: NOW }), /more information/);
  assert.throws(() => buildStep({ party: "indemnity", action: "instructed", occurredOn: "2026-10-20", now: NOW }), /Only GMPI/);
  assert.equal(buildStep({ party: "indemnity", action: "accepted", occurredOn: "2026-10-20", what: "ignored", now: NOW }).what, "", "what was sent only means something for 'sent'");
  assert.throws(() => buildStep({ party: "indemnity", action: "sent", occurredOn: "2026-10-20", what: "bogus", now: NOW }), /what was sent/);
});

t("a party goes round and round until it accepts: with them, back to us, with them again, accepted", () => {
  const steps = [];
  assert.deepEqual(partyState(steps, "indemnity", NOW), { party: "indemnity", state: "none", rounds: 0, instructed: false, lastOn: "", lastAction: "", lastNote: "", waitingDays: 0 });
  steps.push(step("indemnity", "sent", "2026-10-01"));
  let s = partyState(steps, "indemnity", NOW);
  assert.deepEqual([s.state, s.rounds, s.waitingDays], ["with-them", 1, 19]);
  steps.push(step("indemnity", "changes", "2026-10-08", { note: "Soften the second paragraph" }));
  s = partyState(steps, "indemnity", NOW);
  assert.deepEqual([s.state, s.lastNote], ["back-to-us", "Soften the second paragraph"]);
  steps.push(step("indemnity", "sent", "2026-10-12"));
  steps.push(step("indemnity", "info", "2026-10-15", { note: "Dates of the appointments" }));
  steps.push(step("indemnity", "sent", "2026-10-16"));
  s = partyState(steps, "indemnity", NOW);
  assert.deepEqual([s.state, s.rounds, s.waitingDays], ["with-them", 3, 4], "third time sent");
  steps.push(step("indemnity", "accepted", "2026-10-19"));
  s = partyState(steps, "indemnity", NOW);
  assert.deepEqual([s.state, s.rounds, s.waitingDays], ["accepted", 3, 0]);
  assert.equal(sentCount(steps, "indemnity"), 3);
  assert.equal(partyState(steps, "gmpi", NOW).state, "none", "another party is untouched");
});

t("steps are read in date order even if they were recorded out of order, and a late entry keeps its place", () => {
  const steps = [step("gmpi", "accepted", "2026-10-10"), step("gmpi", "sent", "2026-10-02"), step("gmpi", "changes", "2026-10-05", { note: "x" })];
  assert.deepEqual(orderedSteps(steps).map((s) => s.action), ["sent", "changes", "accepted"]);
  assert.equal(partyState(steps, "gmpi", NOW).state, "accepted");
  // two on the same day keep the order they were recorded in
  const same = [step("gmpi", "sent", "2026-10-10"), step("gmpi", "accepted", "2026-10-10")];
  assert.equal(partyState(same, "gmpi", NOW).state, "accepted");
});

t("GMPI instructing a solicitor is noted without changing where GMPI has got to", () => {
  const steps = [step("gmpi", "sent", "2026-10-01"), step("gmpi", "accepted", "2026-10-05"), step("gmpi", "instructed", "2026-10-06")];
  const s = partyState(steps, "gmpi", NOW);
  assert.deepEqual([s.state, s.instructed, s.rounds], ["accepted", true, 1]);
  assert.deepEqual(involvedParties({}, steps), ["gmpi", "solicitor"], "the solicitor is now part of it");
});

t("who is involved: whoever has steps, plus the indemnity flag and a GMPI reference on the case", () => {
  assert.deepEqual(involvedParties({}, []), []);
  assert.deepEqual(involvedParties({ mddusRequired: true }, []), ["indemnity"]);
  assert.deepEqual(involvedParties({ mddusRequired: true, gmpiReference: "GM/123" }, []), ["indemnity", "gmpi"]);
  assert.deepEqual(involvedParties({ gmpiReference: "   " }, []), []);
  assert.deepEqual(involvedParties({}, [step("solicitor", "sent", "2026-10-01")]), ["solicitor"]);
});

t("the case is ready for the final response only when everyone involved has accepted, and the blockers say what is outstanding", () => {
  assert.deepEqual(reviewStatus({}, [], NOW), { parties: [], ready: true, blockers: [] }, "no outside review needed");
  const waiting = reviewStatus({ mddusRequired: true, gmpiReference: "G1" }, [step("indemnity", "sent", "2026-10-01"), step("indemnity", "changes", "2026-10-05", { note: "x" }), step("indemnity", "sent", "2026-10-08")], NOW);
  assert.equal(waiting.ready, false);
  assert.deepEqual(waiting.blockers, ["Indemnity insurer: waiting for a reply since 08/10/2026 (sent 2 times).", "GMPI: nothing sent yet."]);
  const back = reviewStatus({}, [step("gmpi", "sent", "2026-10-01"), step("gmpi", "info", "2026-10-05", { note: "y" })], NOW);
  assert.deepEqual(back.blockers, ["GMPI: they came back needing more information, so it is back with us."]);
  const done = reviewStatus({ mddusRequired: true }, [step("indemnity", "sent", "2026-10-01"), step("indemnity", "accepted", "2026-10-03")], NOW);
  assert.deepEqual([done.ready, done.blockers], [true, []]);
  assert.equal(ukDay("2026-10-08"), "08/10/2026");
});

t("the update wizard puts replies we are waiting for, and what is back with us, first", () => {
  const steps = [step("indemnity", "sent", "2026-10-15"), step("gmpi", "sent", "2026-10-01"), step("gmpi", "changes", "2026-10-05", { note: "z" })];
  const keys = updateChoices({ mddusRequired: true }, steps, NOW).map((c) => c.key);
  assert.deepEqual(keys.slice(0, 2).sort(), ["reply:indemnity", "sent:gmpi"].sort(), "a reply to wait for, and one to send again");
  for (const key of ["asked_meeting", "asked_other", "contacted", "letter_ready", "extend", "owner", "share", "note", "stage", "sent:indemnity", "reply:indemnity", "sent:gmpi", "gmpi_instructed"]) assert.ok(keys.includes(key), key);
  assert.ok(!keys.includes("sent:solicitor"), "the solicitor only appears once there is one");
  assert.ok(!keys.includes("reply:gmpi"), "nothing to reply to when it is back with us");
  const fresh = updateChoices({}, [], NOW).map((c) => c.key);
  assert.ok(fresh.includes("sent:indemnity") && fresh.includes("sent:gmpi") && !fresh.some((k) => k.startsWith("reply:")));
  const instructed = updateChoices({}, [step("gmpi", "sent", "2026-10-01"), step("gmpi", "instructed", "2026-10-03")], NOW).map((c) => c.key);
  assert.ok(!instructed.includes("gmpi_instructed") && instructed.includes("sent:solicitor"));
  assert.equal(updateChoices({}, [], NOW).find((c) => c.key === "letter_ready").hint, "Everyone involved has accepted it");
  assert.match(updateChoices({ mddusRequired: true }, [], NOW).find((c) => c.key === "letter_ready").hint, /not all accepted/);
});

const good = { responseSentOn: "2026-10-19", responseHow: "letter", learning: "yes", newLearning: ["Check the phone message wording"], lfe: "not_required", candourConsidered: true, candourTriggered: false, outcome: "partially_upheld" };

t("each step of closing says what is missing, in words", () => {
  const ctx = { concern: {}, steps: [], learningCount: 0, now: NOW };
  assert.deepEqual(closeStepProblems("response", { ...ctx, closing: good }), []);
  assert.match(closeStepProblems("response", { ...ctx, closing: {} })[0], /date the final response was sent/);
  assert.match(closeStepProblems("response", { ...ctx, closing: { ...good, responseSentOn: "2026-10-25" } })[0], /in the future/);
  assert.match(closeStepProblems("response", { ...ctx, closing: { ...good, responseHow: "" } })[0], /how it was sent/);
  assert.match(closeStepProblems("learning", { ...ctx, closing: {} })[0], /anything to learn/);
  assert.match(closeStepProblems("learning", { ...ctx, closing: { learning: "yes", newLearning: ["  "] } })[0], /at least one thing/);
  assert.deepEqual(closeStepProblems("learning", { ...ctx, closing: { learning: "yes" }, learningCount: 1 }), [], "one already on the case is enough");
  assert.match(closeStepProblems("learning", { ...ctx, closing: { learning: "none", learningNote: "a" } })[0], /why there is nothing to learn/);
  assert.deepEqual(closeStepProblems("learning", { ...ctx, closing: { learning: "none", learningNote: "A one-off, no pattern" } }), []);
  assert.match(closeStepProblems("lfe", { ...ctx, closing: {} })[0], /Welsh Risk Pool/);
  assert.deepEqual(closeStepProblems("lfe", { ...ctx, closing: { lfe: "in_progress" } }), []);
  assert.match(closeStepProblems("candour", { ...ctx, closing: {} })[0], /Duty of Candour was considered/);
  assert.match(closeStepProblems("candour", { ...ctx, closing: { candourConsidered: true } })[0], /whether the Duty of Candour was triggered/);
  assert.match(closeStepProblems("candour", { ...ctx, closing: { candourConsidered: true, candourTriggered: true } })[0], /how the patient was told/);
  assert.deepEqual(closeStepProblems("candour", { ...ctx, closing: { candourConsidered: true, candourTriggered: true, candourNote: "Told by phone on 18th" } }), []);
  assert.match(closeStepProblems("outcome", { ...ctx, closing: {} })[0], /Choose the outcome/);
  assert.deepEqual(closeStepProblems("check", { ...ctx, closing: {} }), []);
  assert.deepEqual(CLOSE_STEPS, ["response", "learning", "lfe", "candour", "outcome", "check"]);
});

t("sending the final response before an outside party has accepted needs a reason", () => {
  const concern = { mddusRequired: true };
  const steps = [step("indemnity", "sent", "2026-10-10")];
  const ctx = { concern, steps, learningCount: 0, now: NOW };
  const blocked = closeStepProblems("response", { ...ctx, closing: good });
  assert.match(blocked[0], /before everyone involved had accepted it \(Indemnity insurer: waiting for a reply since 10\/10\/2026\.\)\. Say why/);
  assert.deepEqual(closeStepProblems("response", { ...ctx, closing: { ...good, overrideReason: "Deadline today; agreed by phone" } }), []);
  assert.deepEqual(closeStepProblems("response", { ...ctx, steps: [...steps, step("indemnity", "accepted", "2026-10-12")], closing: good }), [], "once accepted there is nothing to explain");
});

t("a case cannot be closed with anything missing, and what closing writes is complete", () => {
  const args = { closing: good, concern: {}, steps: [], learningCount: 0, now: NOW };
  assert.deepEqual(closeProblems(args), []);
  assert.match(closeProblems({ ...args, closing: { ...good, outcome: "" } })[0], /Choose the outcome/);
  assert.equal(closeProblems({ ...args, closing: {} }).length, 6, "the response step has two (date and how), and each of the other four steps has one");
  assert.throws(() => buildClosePatch({ ...args, closing: { ...good, candourConsidered: false } }), /Duty of Candour was considered/);
  const patch = buildClosePatch(args);
  assert.deepEqual(patch, {
    outcome: "partially_upheld", finalResponseSentOn: "2026-10-19", finalResponseSentVia: "letter", sentBeforeAccepted: false, sentBeforeAcceptedReason: "",
    learningRequired: true, learningNote: "", lfeReportStatus: "not_required", dutyOfCandourConsidered: true, dutyOfCandourTriggered: false, dutyOfCandourNote: "",
  });
  const early = buildClosePatch({ ...args, concern: { mddusRequired: true }, steps: [step("indemnity", "sent", "2026-10-10")], closing: { ...good, overrideReason: "  Agreed by phone  " } });
  assert.deepEqual([early.sentBeforeAccepted, early.sentBeforeAcceptedReason], [true, "Agreed by phone"]);
  const none = buildClosePatch({ ...args, closing: { ...good, learning: "none", learningNote: "One-off", candourTriggered: true, candourNote: "Told by phone", lfe: "sent" } });
  assert.deepEqual([none.learningRequired, none.learningNote, none.dutyOfCandourTriggered, none.dutyOfCandourNote, none.lfeReportStatus], [false, "One-off", true, "Told by phone", "sent"]);
});

t("a case where they only want a statement closes once the statement has been sent, with no learning, Welsh Risk Pool or Duty of Candour steps", () => {
  const concern = { statementOnly: true };
  assert.equal(isStatementOnly(concern), true);
  assert.equal(isStatementOnly({}), false);
  assert.equal(isStatementOnly({ statementOnly: "yes" }), false, "only a real true counts");
  assert.deepEqual(closeStepsFor(concern), ["response", "check"]);
  assert.deepEqual(closeStepsFor({}), CLOSE_STEPS);
  assert.deepEqual(closeStepsFor(null), CLOSE_STEPS);
  const args = { closing: { responseSentOn: "2026-10-19", responseHow: "email" }, concern, steps: [], learningCount: 0, now: NOW };
  assert.deepEqual(closeProblems(args), [], "a date and how it went is all that is needed");
  assert.match(closeProblems({ ...args, closing: {} }).join(" "), /statement was sent/);
  assert.equal(closeProblems({ ...args, closing: {} }).length, 2);
  assert.match(closeProblems({ ...args, closing: { responseSentOn: "2026-10-25", responseHow: "email" } })[0], /statement has to have been sent/);
  // outside parties do not hold a statement up
  assert.deepEqual(closeProblems({ ...args, concern: { statementOnly: true, mddusRequired: true }, steps: [step("indemnity", "sent", "2026-10-10")] }), []);
  assert.deepEqual(buildClosePatch(args), {
    outcome: "statement_provided", finalResponseSentOn: "2026-10-19", finalResponseSentVia: "email", sentBeforeAccepted: false, sentBeforeAcceptedReason: "",
    learningRequired: false, learningNote: "Only a statement was requested; there was no investigation.", lfeReportStatus: "not_required",
    dutyOfCandourConsidered: false, dutyOfCandourTriggered: false, dutyOfCandourNote: "", statementOnly: true,
  });
  assert.throws(() => buildClosePatch({ ...args, closing: {} }), /statement was sent/);
  // the same date and how-sent on a full case still ask for everything
  assert.ok(closeProblems({ ...args, concern: {} }).length > 0);
});

t("the update wizard offers the switch to a statement-only case, and the switch back", () => {
  const on = updateChoices({}, []).find((c) => c.key === "statement_toggle");
  assert.match(on.label, /only want a statement/);
  const off = updateChoices({ statementOnly: true }, []).find((c) => c.key === "statement_toggle");
  assert.match(off.label, /full response/);
});

t("there are three parties, named in plain words", () => {
  assert.deepEqual(PARTIES.map((p) => p.key), ["indemnity", "gmpi", "solicitor"]);
  assert.ok(PARTIES.every((p) => p.label && p.short));
});

console.log(`\n${n} passed`);
