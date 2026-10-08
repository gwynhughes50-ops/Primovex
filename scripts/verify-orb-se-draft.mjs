import assert from "node:assert/strict";
import { buildSeReportDraft, containsName, extractDescription, findSpace, looksLikeSeReport, parseEventDate, parseHarm, parseSeReport, guessCategory } from "../src/ai/governance/seDraft.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const NOW = new Date(2026, 9, 8, 14, 0); // Thu 8 Oct 2026
const spaces = [{ id: "r1", name: "Treatment Room 1" }, { id: "r2", name: "Treatment Room 2" }, { id: "st", name: "Staff Room" }];

t("it recognises someone asking to report one, and not other questions", () => {
  for (const p of ["report a significant event: wrong vaccine drawn up", "I need to report a near miss", "can you log an incident for me", "raise a significant event", "Significant event: the fridge was left open", "I'd like to report an SE"]) assert.equal(looksLikeSeReport(p), true, p);
  for (const p of ["how many significant events are open", "do I have any significant event reviews to do", "what is the status of SE-2026-10081405", "report on stock levels", "which significant event actions are overdue"]) assert.equal(looksLikeSeReport(p), false, p);
});

t("names are refused: titles with a name, and 'called X'", () => {
  assert.equal(containsName("Mrs Jones was given the wrong vaccine"), true);
  assert.equal(containsName("a patient called Peter was sent the wrong letter"), true);
  assert.equal(containsName("Dr Patel prescribed twice"), true);
  assert.equal(containsName("the nurse gave the wrong vaccine to patient EMIS 1234567"), false);
  assert.match(buildSeReportDraft("report a significant event: Mrs Jones got the wrong vaccine, no harm", { spaces, now: NOW }).text, /person's name/);
  assert.equal(buildSeReportDraft("report a significant event: Mrs Jones got the wrong vaccine, no harm", { spaces, now: NOW }).proposal, undefined);
});

t("the what-happened part is taken from the sentence", () => {
  assert.equal(extractDescription("Report a significant event: the wrong vaccine was drawn up"), "the wrong vaccine was drawn up");
  assert.equal(extractDescription("I need to report an incident that a fridge was left open"), "a fridge was left open");
  assert.equal(extractDescription("log a near miss where the label was wrong"), "the label was wrong");
});

t("dates: yesterday, today, weekdays, written dates, never in the future", () => {
  assert.deepEqual(parseEventDate("it happened yesterday", NOW), { date: "2026-10-07", assumed: false });
  assert.deepEqual(parseEventDate("this morning", NOW), { date: "2026-10-08", assumed: false });
  assert.deepEqual(parseEventDate("on Monday", NOW), { date: "2026-10-05", assumed: false });
  assert.deepEqual(parseEventDate("on Thursday", NOW), { date: "2026-10-01", assumed: false }, "a week ago, not today");
  assert.deepEqual(parseEventDate("on 3 October", NOW), { date: "2026-10-03", assumed: false });
  assert.deepEqual(parseEventDate("on the 30th of December", NOW), { date: "2025-12-30", assumed: false }, "December hasn't happened yet this year");
  assert.deepEqual(parseEventDate("on 03/10/2026", NOW), { date: "2026-10-03", assumed: false });
  assert.deepEqual(parseEventDate("the wrong vaccine", NOW), { date: "2026-10-08", assumed: true });
});

t("harm is only what was said, never guessed", () => {
  assert.equal(parseHarm("no harm"), "none");
  assert.equal(parseHarm("it was a near miss"), "none");
  assert.equal(parseHarm("minor harm to the patient"), "low");
  assert.equal(parseHarm("moderate harm"), "moderate");
  assert.equal(parseHarm("the patient died"), "severe");
  assert.equal(parseHarm("the wrong vaccine was drawn up"), null);
});

t("where, what kind, and the EMIS number", () => {
  assert.equal(findSpace("it was in treatment room 2 yesterday", spaces).id, "r2");
  assert.equal(findSpace("in the car park", spaces), null);
  assert.equal(guessCategory("wrong vaccine drawn up"), "medication");
  assert.equal(guessCategory("the fridge was left open"), "equipment_or_premises");
  assert.equal(guessCategory("something odd"), "other");
  const p = parseSeReport("report a significant event: wrong vaccine drawn up for patient EMIS 1234567 in treatment room 1 yesterday, no harm", { spaces, now: NOW });
  assert.equal(p.emisNumber, "1234567");
  assert.ok(!p.description.includes("1234567"), "the number is stored separately");
  assert.equal(p.locationName, "Treatment Room 1");
  assert.equal(p.eventDate, "2026-10-07");
  assert.equal(p.patientInvolved, true);
});

t("without a harm level it asks, with the answers ready to tap", () => {
  const r = buildSeReportDraft("report a significant event: the wrong vaccine was drawn up in treatment room 1 yesterday", { spaces, now: NOW });
  assert.equal(r.proposal, undefined);
  assert.match(r.text, /How much harm/);
  assert.equal(r.followUps.length, 4);
  assert.match(r.followUps[0], /, no harm$/);
  // tapping one gives a card
  const again = buildSeReportDraft(r.followUps[0], { spaces, now: NOW });
  assert.ok(again.proposal);
});

t("with everything it prepares a card and nothing is sent", () => {
  const r = buildSeReportDraft("Report a significant event: the wrong vaccine was drawn up in Treatment Room 1 yesterday, no harm", { spaces, now: NOW });
  assert.equal(r.proposal.kind, "significant-event");
  assert.equal(r.proposal.requiredCapability, null);
  assert.equal(r.proposal.status, "proposed");
  const f = r.proposal.params.form;
  assert.equal(f.harm, "none");
  assert.equal(f.description, "the wrong vaccine was drawn up in Treatment Room 1 yesterday", "the harm level is not repeated in the description");
  assert.equal(f.category, "medication");
  assert.equal(f.locationId, "r1");
  assert.equal(f.eventDate, "2026-10-07");
  assert.equal(f.patientInvolved, false);
  assert.match(r.proposal.lines.join("\n"), /Patient: none given/);
  assert.match(r.text, /Nothing has been reported yet/);
});

t("too little to go on, or nothing at all", () => {
  assert.match(buildSeReportDraft("report a significant event", { spaces, now: NOW }).text, /Tell me what happened/);
  assert.match(buildSeReportDraft("log an incident: stuff", { spaces, now: NOW }).text, /Tell me what happened/);
});

console.log(`\n${n} passed`);
