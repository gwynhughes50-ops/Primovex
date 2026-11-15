// Covers Ask Primovex "what do I do next?" on a concern or a SAR: the rules are written down, read only, and name references and staff, never patients.
import assert from "node:assert/strict";
import { concernNext, dayOf, myCasesNext, parseNextSteps, sarNext } from "../src/ai/governance/nextSteps.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const CHECKLIST = [{ key: "identity_checked", label: "Identity / authority checked" }, { key: "information_extracted", label: "Information extracted" }, { key: "quality_checked", label: "Quality checked" }, { key: "sent", label: "Response sent" }, { key: "recorded", label: "Completion recorded" }];
const NOW = new Date("2026-11-13T09:00:00");

t("asks about next steps are understood, with a reference or about 'my' cases; how-to and unrelated questions are left alone", () => {
  const p = (q) => parseNextSteps(q);
  assert.deepEqual(p("What's next for CN-2026-1105101010?").input, { kind: "concern", reference: "CN-2026-1105101010", mine: false });
  assert.deepEqual(p("what do I need to do on SAR-2026-1101120000").input, { kind: "sar", reference: "SAR-2026-1101120000", mine: false });
  assert.equal(p("next steps for cn-2026-55").input.reference, "CN-2026-55");
  assert.deepEqual(p("what should I do next on my concerns").input, { kind: "concern", reference: "", mine: true });
  assert.deepEqual(p("what is left to do on my SARs").input, { kind: "sar", reference: "", mine: true });
  assert.equal(p("what do I need to do on my complaints").input.kind, "concern");
  for (const q of ["how do I close a concern", "where do I update a case", "what is a SAR", "How many SARs are outstanding?", "what's next in the rota", "show CN-2026-1105101010", "what should I do next", ""]) assert.equal(p(q), null, q);
});

t("a day is read from a timestamp, a date or a string", () => {
  assert.equal(dayOf({ toDate: () => new Date("2026-11-20T10:00:00") }), "2026-11-20");
  assert.equal(dayOf("2026-11-20"), "2026-11-20");
  assert.equal(dayOf(null), "");
  assert.equal(dayOf("nonsense"), "");
});

t("a concern just received: own it, acknowledge it, offer a listening discussion", () => {
  const a = concernNext({ concern: { reference: "CN-2026-1", status: "received", ownerName: "Unassigned", acknowledgementDueAt: "2026-11-15", learningRequired: true }, steps: [], deadline: { label: "Acknowledgement due tomorrow", status: "warning" }, now: NOW });
  assert.match(a.text, /^CN-2026-1: Received\. Acknowledgement due tomorrow\./);
  assert.match(a.text, /1\. Nobody owns it yet/);
  assert.match(a.text, /2\. Acknowledge it \(due 15\/11\/2026\)/);
  assert.match(a.text, /3\. Offer a listening discussion/);
  assert.match(a.text, /press Update/);
});

t("a concern past a deadline says so first", () => {
  const a = concernNext({ concern: { reference: "CN-2026-2", status: "investigation", ownerUid: "u1", ownerName: "Sam Lee", acknowledgedAt: "2026-10-01", listeningDiscussionOfferedAt: "2026-10-02" }, deadline: { label: "Final response overdue by 3 days", status: "critical" }, now: NOW });
  assert.match(a.text, /owned by Sam Lee/);
  assert.match(a.text, /It is past a deadline, so deal with that first\./);
  assert.match(a.text, /Finish the investigation/);
});

t("outside parties still to reply hold up the final response, in words", () => {
  const steps = [{ id: "s1", party: "indemnity", action: "sent", occurredOn: "2026-11-01", createdAtMs: 1 }];
  const a = concernNext({ concern: { reference: "CN-2026-3", status: "response", ownerUid: "u1", ownerName: "Sam Lee", acknowledgedAt: "x", listeningDiscussionOfferedAt: "x", mddusRequired: true }, steps, now: NOW });
  assert.match(a.text, /Outside parties, .*waiting for a reply since 01\/11\/2026/i);
});

t("a concern whose outside parties have all accepted is ready for the final response letter", () => {
  const steps = [{ id: "s1", party: "indemnity", action: "sent", occurredOn: "2026-11-01", createdAtMs: 1 }, { id: "s2", party: "indemnity", action: "accepted", occurredOn: "2026-11-03", createdAtMs: 2 }];
  const a = concernNext({ concern: { reference: "CN-2026-4", status: "response", ownerUid: "u1", ownerName: "Sam Lee", acknowledgedAt: "x", listeningDiscussionOfferedAt: "x", mddusRequired: true }, steps, now: NOW });
  assert.match(a.text, /The final response letter is ready to send/);
});

t("learning still to record is the last step before closing", () => {
  const a = concernNext({ concern: { reference: "CN-2026-5", status: "learning", ownerUid: "u1", ownerName: "Sam Lee", acknowledgedAt: "x", listeningDiscussionOfferedAt: "x", learningRequired: true, learningRecordedAt: null }, now: NOW });
  assert.match(a.text, /Record what the practice has learned/);
  assert.match(a.text, /Record the learning before closing it/);
});

t("a closed concern has nothing left", () => {
  const a = concernNext({ concern: { reference: "CN-2026-6", status: "closed" } });
  assert.equal(a.done, true);
  assert.match(a.text, /is closed/);
});

t("no more than four steps are listed, and the rest are counted", () => {
  const steps = ["indemnity", "gmpi"].map((party, i) => ({ id: `s${i}`, party, action: "sent", occurredOn: "2026-11-01", createdAtMs: i }));
  const a = concernNext({ concern: { reference: "CN-2026-7", status: "response", acknowledgedAt: "", listeningDiscussionOfferedAt: null, mddusRequired: true, gmpiReference: "G1", learningRequired: true }, steps, now: NOW });
  assert.equal((a.text.match(/^\d\. /gm) || []).length, 4);
  assert.match(a.text, /…and \d+ more steps? after those/);
});

t("a SAR: assign it, then the checklist in order", () => {
  const a = sarNext({ sar: { reference: "SAR-2026-9", status: "new", assignedToName: "Unassigned", checklist: {} }, checklist: CHECKLIST, deadline: { label: "6 days left", status: "warning" } });
  assert.match(a.text, /^SAR-2026-9: New\. 6 days left\./);
  assert.match(a.text, /1\. Assign it to someone/);
  assert.match(a.text, /2\. Next on the checklist: identity \/ authority checked/);
  assert.match(a.text, /Checklist: 0 of 5 done/);
  const b = sarNext({ sar: { reference: "SAR-2026-9", status: "in_progress", assignedToUid: "u1", assignedToName: "Ann Evans", checklist: { identity_checked: true, information_extracted: true } }, checklist: CHECKLIST, deadline: { label: "Due today", status: "critical" } });
  assert.match(b.text, /assigned to Ann Evans/);
  assert.match(b.text, /this needs doing first/);
  assert.match(b.text, /Next on the checklist: quality checked/);
  assert.match(b.text, /After that: response sent, then completion recorded/);
  assert.match(b.text, /2 of 5|Checklist: 2 of 5 done/);
});

t("a SAR with every item done is ready to complete; a completed one has nothing left", () => {
  const all = Object.fromEntries(CHECKLIST.map((c) => [c.key, true]));
  assert.match(sarNext({ sar: { reference: "S", status: "quality_check", assignedToUid: "u", assignedToName: "A", checklist: all }, checklist: CHECKLIST }).text, /mark the SAR as completed/);
  assert.equal(sarNext({ sar: { reference: "S", status: "completed" }, checklist: CHECKLIST }).done, true);
});

t("my cases: most urgent first, only open ones, one line each with the first step", () => {
  const tone = { "SAR-A": { label: "Overdue by 2 days", status: "critical" }, "SAR-B": { label: "20 days left", status: "success" } };
  const a = myCasesNext({ kind: "sar", checklist: CHECKLIST, deadlineOf: (c) => tone[c.reference], cases: [
    { id: "b", reference: "SAR-B", status: "assigned", assignedToUid: "u", assignedToName: "Me", checklist: {} },
    { id: "a", reference: "SAR-A", status: "in_progress", assignedToUid: "u", assignedToName: "Me", checklist: { identity_checked: true } },
    { id: "c", reference: "SAR-C", status: "completed" },
  ] });
  assert.equal(a.count, 2);
  const lines = a.text.split("\n").filter((l) => l.startsWith("•"));
  assert.match(lines[0], /SAR-A \(Overdue by 2 days\): Next on the checklist: information extracted/);
  assert.match(lines[1], /SAR-B/);
  assert.match(a.text, /what's next for SAR-A/);
  assert.match(myCasesNext({ kind: "concern", cases: [] }).text, /no open concerns/);
});

console.log(`\n${n} tests passed`);
