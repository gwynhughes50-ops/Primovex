import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildScorecard, scorecardCsv } from "../src/modules/clinflow/clinflowScorecard.js";
import { decide, reviewCandidates } from "../src/modules/clinflow/clinflowCodeReview.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const record = (extra = {}) => ({
  id: `r${Math.random()}`, createdAt: "2026-10-26T10:00:00.000Z", documentProfile: "cf-001", suggestedDecision: "urgent", confirmedDecision: "urgent",
  suggestedDestination: "GP", confirmedDestination: "GP", nfwfCategory: "Not NFWF", correctionReason: "", correctedSummary: "", learningNotes: "",
  accuracyChecks: { identity: true, summary: true, medicines: true, actions: true, urgency: true, coding: false }, rulesetVersion: "v1", governanceStatus: "awaiting_governed_review", ...extra,
});

t("the scorecard counts how often triage was right, what was accurate, and how the destination changed", () => {
  const card = buildScorecard({ teaching: [
    record(), record(),
    record({ confirmedDecision: "workflow_required", confirmedDestination: "Admin", correctionReason: "Routine, no action", accuracyChecks: { identity: true, summary: false, medicines: true, actions: false, urgency: false, coding: false } }),
    record({ accuracyChecks: {} }),
  ] });
  assert.equal(card.triage.total, 4);
  assert.equal(card.triage.agreed, 3);
  assert.equal(card.triage.corrected, 1);
  assert.equal(card.triage.rightPct, 75);
  assert.equal(card.triage.destinationChanged, 1);
  assert.deepEqual(card.triage.byDecision.map((d) => [d.label, d.count]).sort(), [["Urgent", 3], ["Workflow required", 1]]);
  assert.equal(card.scoredCount, 3, "a case where nobody ticked anything is not counted as wrong");
  const identity = card.areas.find((a) => a.key === "identity");
  assert.deepEqual([identity.right, identity.total, identity.pct], [3, 3, 100]);
  assert.equal(card.areas.find((a) => a.key === "urgency").pct, 67);
  assert.equal(card.areas.find((a) => a.key === "coding").pct, 0);
});

t("it says 'no data' rather than 0% when nothing has been recorded", () => {
  const card = buildScorecard({});
  assert.equal(card.triage.rightPct, null);
  assert.equal(card.coding.rightPct, null);
  assert.ok(card.areas.every((a) => a.pct === null));
  assert.deepEqual(card.corrections, []);
});

t("the coder's decisions count: accepted, removed and added codes give the percentage the reader was right", () => {
  const analysis = { terminologyCandidates: [{ sourceLabel: "Diagnosis", sourceValue: "asthma", searchTerm: "asthma", conceptId: "195967001", preferredTerm: "Asthma" }, { sourceLabel: "Diagnosis", sourceValue: "quantum flux", searchTerm: "quantum flux", conceptId: null }, { sourceLabel: "Diagnosis", sourceValue: "angina", searchTerm: "angina", conceptId: null }], medicationCandidates: [] };
  const candidates = reviewCandidates(analysis, "");
  let review = decide(null, candidates[0], "accepted", { uid: "u", name: "Dr Example", pick: { conceptId: "195967001", term: "Asthma", descriptionId: "301001" } });
  review = decide(review, candidates[1], "removed", { uid: "u", name: "Dr Example" });
  const touched = { id: "d1", clinflowAnalysis: analysis, codeReview: { ...review, added: [{ id: "a", term: "COPD" }] }, syntheticOcr: { content: "" } };
  const untouched = { id: "d2", clinflowAnalysis: analysis, codeReview: null };
  const card = buildScorecard({ documents: [touched, untouched] });
  assert.deepEqual([card.coding.documents, card.coding.accepted, card.coding.removed, card.coding.added, card.coding.waiting], [1, 1, 1, 1, 1]);
  assert.equal(card.coding.rightPct, 50);
  assert.equal(card.coding.missedPct, 50);
});

t("corrections are listed newest first with the reason, the corrected summary and the note for the reviewer", () => {
  const card = buildScorecard({ teaching: [
    record({ createdAt: "2026-10-20T09:00:00Z", confirmedDecision: "no_workflow", correctionReason: "Information only", correctedSummary: "Routine result, no action", confirmedDestination: "NFWF" }),
    record({ createdAt: "2026-10-25T09:00:00Z", learningNotes: "Look at the word 'urgent' near a negation" }),
    record(),
  ] });
  assert.equal(card.corrections.length, 2, "an agreed case with nothing written is not a correction");
  assert.equal(card.corrections[0].notes, "Look at the word 'urgent' near a negation");
  assert.equal(card.corrections[1].suggested, "Urgent");
  assert.equal(card.corrections[1].confirmed, "NFWF");
  assert.equal(card.corrections[1].summary, "Routine result, no action");
});

t("the CSV carries every record, and what a person typed can never run as a spreadsheet formula", () => {
  const teaching = [record({ createdAt: "2026-10-20T09:00:00Z", correctionReason: "=HYPERLINK(\"http://x\")", correctedSummary: "Said \"urgent\", but routine\nsecond line", learningNotes: "+1 note" })];
  const csv = scorecardCsv(buildScorecard({ teaching }), teaching);
  assert.ok(csv.startsWith("﻿"), "opens in Excel with the right characters");
  assert.match(csv, /ClinFlow scorecard/);
  assert.match(csv, /Triage right first time,100%/);
  assert.match(csv, /'=HYPERLINK/, "a leading = is made harmless");
  assert.match(csv, /'\+1 note/);
  assert.match(csv, /"Said ""urgent"", but routine second line"/, "quotes and commas are escaped, line breaks flattened");
  assert.equal(csv.split("\r\n").filter((line) => line.startsWith("2026-10-20")).length, 1, "one line per record");
  assert.ok(!/fetch\(|axios|XMLHttpRequest/.test(read("src/modules/clinflow/clinflowScorecard.js")), "nothing is sent anywhere");
  assert.match(read("src/modules/clinflow/ClinFlowWorkspace.jsx"), /<Scorecard documents=\{documents\}/);
});

console.log(`\n${n} passed`);
