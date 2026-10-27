import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyseClinFlowOcr } from "../src/modules/clinflow/clinflowAnalysisService.js";
import { LANES, inLane, laneOf, lanesFor } from "../src/modules/clinflow/clinflowLanes.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const E = (o = {}) => ({ patientName: "Test Patient", diagnoses: [], currentMedications: [], medicationInstructions: [], actions: [], observations: [], clinicalConclusion: null, documentUrgent: false, medicationChangePresent: false, safetyNettingAdvice: null, ...o });
// a letter as the queue holds it, analysed by the real code
const letter = (id, content, llm, extra = {}) => {
  const ocr = { content, document: { id }, llmExtraction: llm };
  const analysis = analyseClinFlowOcr(ocr);
  return { id, status: "awaiting_review", priority: analysis.triage.priority, destination: analysis.triage.destination, clinflowAnalysis: analysis, syntheticOcr: ocr, ...extra };
};
const urgent = () => letter("u", "Urgent two week wait referral: suspected cancer. Please see her this week.", E({ documentUrgent: true }));
const medium = () => letter("m", "Please could the GP repeat his sodium in two weeks.", E({ actions: ["Repeat sodium in two weeks"] }));
const low = () => letter("l", "Follow-up appointment has been booked by the hospital. Review in clinic in 3 months.", E({ actions: ["Hospital follow-up appointment booked"] }));
const nfw = () => letter("n", "I have discharged him from clinic. There are no changes to his medication. No action is required from the GP.", E({ noActionRequired: true, noActionQuote: "No action is required from the GP." }));
const unsure = () => letter("r", "Seen in clinic. Plan to be confirmed.", E({ observations: ["Seen in clinic"] }));

t("each letter is in one tab: urgent High, no action NFW, a clinician has to act Medium, only admin work Low", () => {
  assert.equal(laneOf(urgent()), "high");
  assert.equal(laneOf(nfw()), "nfw");
  assert.equal(laneOf(medium()), "medium");
  assert.equal(laneOf(low()), "low");
});

t("a letter ClinFlow cannot decide on is never tucked away in Low: a person has to look, so it is Medium", () => {
  assert.equal(unsure().clinflowAnalysis.triage.decision, "review_required");
  assert.equal(laneOf(unsure()), "medium");
  assert.equal(laneOf({ status: "awaiting_review", destination: "GP" }), "medium", "no analysis at all");
});

t("marking a letter urgent makes it High; a person's confirmed outcome and destination beat the suggestion", () => {
  assert.equal(laneOf({ ...low(), priority: "high" }), "high");
  assert.equal(laneOf({ ...medium(), triageReview: { status: "human_confirmed", confirmedDecision: "no_workflow", confirmedDestination: "NFWF" } }), "nfw");
  const no = { status: "human_confirmed", confirmedDecision: "workflow_required" };
  assert.equal(laneOf({ ...nfw(), triageReview: { ...no, confirmedDestination: "Workflow Team" } }), "low", "'No, action is needed' sent to the workflow team");
  assert.equal(laneOf({ ...nfw(), triageReview: { ...no, confirmedDestination: "GP" } }), "medium", "'No, action is needed' sent to the GP");
  assert.equal(laneOf({ ...nfw(), triageReview: { status: "pending", confirmedDecision: "workflow_required" } }), "nfw", "an unconfirmed review does not count");
});

t("a finished letter is only in Finished; Active is everything not finished; the counts add up and nothing is lost", () => {
  const all = [urgent(), medium(), low(), nfw(), unsure(), { ...urgent(), status: "completed" }];
  const { byId, counts } = lanesFor(all.map((d, i) => ({ ...d, id: `d${i}` })));
  assert.deepEqual(counts, { all: 5, high: 1, medium: 2, low: 1, nfw: 1, finished: 1 });
  assert.equal(counts.high + counts.medium + counts.low + counts.nfw, counts.all);
  assert.equal(byId.size, 6);
  assert.equal(inLane("medium", "all"), true);
  assert.equal(inLane("finished", "all"), false);
  assert.equal(inLane("nfw", "nfw"), true);
  assert.deepEqual(LANES.map(([key]) => key), ["all", "high", "medium", "low", "nfw", "finished"]);
});

t("the letters list uses the tabs, works them out once per change, and there is no GP tab", () => {
  const source = readFileSync(new URL("../src/modules/clinflow/ClinFlowWorkspace.jsx", import.meta.url), "utf8");
  assert.match(source, /LANES\.map\(\(\[key, label\]\)/);
  assert.match(source, /const lanes = useMemo\(\(\) => lanesFor\(documents\), \[documents\]\);/);
  assert.match(source, /if \(!inLane\(lanes\.byId\.get\(item\.id\), filter\)\) return false;/);
  assert.ok(!/\['gp', `GP \(/.test(source), "the GP tab is gone");
  assert.ok(source.indexOf("const [documents, setDocuments]") < source.indexOf("const lanes = useMemo"), "documents exist before the tabs use them");
});

console.log(`\n${n} passed`);
