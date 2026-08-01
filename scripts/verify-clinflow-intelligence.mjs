import { createClinFlowTriage, RULESET_VERSION } from "../src/modules/clinflow/clinflowTriageService.js";
import { createClinFlowQualityPrompts } from "../src/modules/clinflow/clinflowQualityPromptService.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function triage(content, overrides = {}) {
  return createClinFlowTriage({
    ocr: { content, document: { id: overrides.documentId || "test-letter" } },
    actions: overrides.actions || [],
    medicines: overrides.medicines || [],
    diagnoses: overrides.diagnoses || [{ value: "Clinical review" }],
    observations: overrides.observations || [],
    urgent: Boolean(overrides.urgent),
    medicationChanged: Boolean(overrides.medicationChanged),
  });
}

const informationOnly = triage("For information only. No GP action. Hospital follow-up arranged.");
assert(informationOnly.decision === "no_workflow", "Information-only correspondence should be suggested as NFWF.");
assert(informationOnly.destination === "NFWF", "NFWF correspondence should use the NFWF destination.");
assert(informationOnly.nfwf.score >= 70 && informationOnly.nfwf.blockers.length === 0, "NFWF needs positive evidence and no blockers.");

const requestedAction = triage("Please arrange repeat U&Es and GP review after the pending result.", { actions: [{ value: "Repeat U&Es" }] });
assert(requestedAction.decision === "workflow_required", "An explicit practice action must remain in workflow.");
assert(requestedAction.workflowDecision.stillNeedsWorkflow === "Yes", "Action correspondence must say workflow is still required.");
assert(requestedAction.nfwf.blockers.length > 0, "Action correspondence must carry NFWF blockers.");

const medicineChange = triage("Bisoprolol was increased. Please reconcile medicines.", { medicines: [{ value: "Bisoprolol increased" }], medicationChanged: true });
assert(medicineChange.decision === "workflow_required", "A medicine change must require workflow.");
assert(medicineChange.destination === "Pharmacist", "A medicine change should suggest the pharmacist route.");

const safeguarding = triage("Safeguarding concern. Same-day review is required.");
assert(safeguarding.decision === "urgent", "Safeguarding language must produce an urgent suggestion.");
assert(safeguarding.destination === "Child Protection", "Safeguarding language must suggest Child Protection.");

const ambiguous = triage("The patient attended clinic and examination findings were recorded.");
assert(ambiguous.decision === "review_required", "Clinical content without action or NFWF evidence must require human review.");

const quality = createClinFlowQualityPrompts({
  ocr: { content: "Type 2 diabetes. Blood pressure 142/88. Current smoker." },
  findings: [],
});
assert(quality.prompts.some((item) => item.id === "diabetes"), "Diabetes should produce a governed record-check prompt.");
assert(quality.prompts.some((item) => item.id === "bp"), "Blood pressure should produce a governed record-check prompt.");
assert(quality.prompts.some((item) => item.id === "smoking"), "Smoking status should produce a governed coding prompt.");
assert(quality.prompts.every((item) => item.status === "patient_record_check_required"), "Quality findings must remain prompts, not confirmed opportunities.");
assert(RULESET_VERSION.includes("cf43-governed"), "The migrated ruleset must be explicitly versioned.");

console.log(`ClinFlow governed intelligence verified: ${RULESET_VERSION}`);
