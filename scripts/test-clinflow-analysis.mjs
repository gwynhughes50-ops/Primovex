import assert from "node:assert/strict";
import { analyseClinFlowOcr } from "../src/modules/clinflow/clinflowAnalysisService.js";

const cases = [
  ["respiratory-clinic-letter", "Persistent cough and exertional breathlessness. oxygen saturation 97%. Spirometry was technically limited. repeat spirometry with reversibility. CRP 4 mg/L. salbutamol inhaler 100 micrograms. review in eight weeks.", 7, 1, "workflow_required"],
  ["faxed-discharge-summary", "Community-acquired pneumonia. acute kidney injury, resolved. Presented with fever, productive cough and reduced oral intake. right lower-zone opacity. amoxicillin 500 mg, doxycycline 100 mg, paracetamol 500 mg, ramipril 5 mg. sputum culture. repeat U&E in 5-7 days. radiograph in 6 weeks.", 12, 2, "workflow_required"],
  ["handwritten-ward-review", "SOB walking. HR 96, BP 128/74. coarse crackles R base. eating little. continue oral antibiotics. repeat U&E and check CRP. fluid chart. physio review. sats below 92%.", 9, 1, "workflow_required"],
  ["annotated-cardiology-letter", "Intermittent palpitations. sinus rhythm with occasional ventricular ectopics. no sustained arrhythmia. normal left ventricular function. mild mitral regurgitation. no pericardial effusion. bisoprolol 2.5 mg once daily after checking resting pulse and blood pressure. two weeks after starting. renal profile and thyroid function. follow-up four months.", 10, 2, "workflow_required"],
  ["emergency-handover-form", "Central chest tightness and nausea. NEWS2 3. HR 108. 146/88. RR 22. 95% RA. 36.8. sinus tach, no ST elevation. Aspirin 300 mg at 21:31. first troponin 7 ng/L. repeat due 00:30. CXR requested. senior review. escalate immediately.", 13, 1, "urgent"],
];

for (const [id, content, minimumFindings, qualityPromptCount, triageDecision] of cases) {
  const analysis = analyseClinFlowOcr({
    document: { id },
    content,
    groundTruth: [{ label: "Patient", expected: "Synthetic Patient", matched: true }],
  });
  const findingCount = analysis.diagnoses.length + analysis.observations.length + analysis.medicines.length + analysis.actions.length;
  assert.ok(findingCount >= minimumFindings, `${id}: expected at least ${minimumFindings} findings, received ${findingCount}`);
  assert.ok(analysis.terminologyCandidates.length >= 1, `${id}: expected terminology candidates`);
  assert.equal(analysis.qualityPrompts.length, qualityPromptCount, `${id}: unexpected quality prompt count`);
  assert.equal(analysis.qaifOpportunities.length, 0, `${id}: a letter alone must not confirm a QAIF opportunity`);
  assert.equal(analysis.triage.decision, triageDecision, `${id}: unexpected triage suggestion`);
  assert.equal(analysis.triage.requiresHumanConfirmation, true, `${id}: triage must require human confirmation`);
  if (id === "handwritten-ward-review" || id === "emergency-handover-form") {
    const expected = id === "handwritten-ward-review" ? [128, 74] : [146, 88];
    const bp = analysis.structuredObservations.find((item) => item.type === "blood_pressure");
    assert.ok(bp, `${id}: expected a structured blood-pressure observation`);
    assert.deepEqual([bp.systolic.value, bp.diastolic.value], expected, `${id}: incorrect BP values`);
    assert.equal(bp.conceptId, "75367002", `${id}: incorrect blood-pressure concept`);
    assert.equal(bp.systolic.conceptId, "271649006", `${id}: incorrect systolic concept`);
    assert.equal(bp.diastolic.conceptId, "271650006", `${id}: incorrect diastolic concept`);
    assert.equal(bp.unit.ucumCode, "mm[Hg]", `${id}: incorrect BP UCUM unit`);
  }
  if (id === "emergency-handover-form") {
    const expectedVitals = new Map([
      ["heart_rate", [108, "364075005", "/min"]],
      ["respiratory_rate", [22, "86290005", "/min"]],
      ["oxygen_saturation", [95, "431314004", "%"]],
      ["body_temperature", [36.8, "386725007", "Cel"]],
    ]);
    expectedVitals.forEach(([value, conceptId, unit], type) => {
      const vital = analysis.structuredObservations.find((item) => item.type === type);
      assert.ok(vital, `${id}: expected structured ${type}`);
      assert.equal(vital.value, value, `${id}: incorrect ${type} value`);
      assert.equal(vital.conceptId, conceptId, `${id}: incorrect ${type} concept`);
      assert.equal(vital.unit.ucumCode, unit, `${id}: incorrect ${type} unit`);
    });
  }
}

const noWorkflow = analyseClinFlowOcr({
  document: { id: "respiratory-clinic-letter" },
  content: "Persistent cough.",
  groundTruth: [{ label: "Patient", expected: "Synthetic Patient", matched: true }],
});
assert.equal(noWorkflow.triage.decision, "no_workflow", "information-only correspondence should produce an NWF suggestion");

const needsReview = analyseClinFlowOcr({ document: { id: "unknown-document" }, content: "", groundTruth: [] });
assert.equal(needsReview.triage.decision, "review_required", "missing evidence must never be classified as NWF");

console.log(`ClinFlow governed analysis smoke test passed for ${cases.length} synthetic document profiles.`);
