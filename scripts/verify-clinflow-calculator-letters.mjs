import assert from "node:assert/strict";
import { analyseClinFlowOcr } from "../src/modules/clinflow/clinflowAnalysisService.js";
import { reviewCandidates } from "../src/modules/clinflow/clinflowCodeReview.js";
import { KINDS, LETTERS, fullTextOf } from "./calculator-test-letters.mjs";

// The calculator test letters, run through ClinFlow the way the app does (analysis, then the list of codes to review): every calculation each letter should give, with the
// answer worked out separately in calculator-test-letters.mjs, and no calculation that it should not give.
let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const E = { patientName: "Test Patient", diagnoses: [], currentMedications: [], medicationInstructions: [], actions: [], observations: [], clinicalConclusion: null, documentUrgent: false, medicationChangePresent: false, safetyNettingAdvice: null, requestsOfPractice: [], noActionRequired: false, noActionQuote: null };

const calculated = (letter) => {
  const content = fullTextOf(letter);
  const analysis = analyseClinFlowOcr({ content, document: { id: "x" }, llmExtraction: E });
  return reviewCandidates(analysis, content).filter((c) => c.calculated).map((c) => ({
    kind: c.calculated.kind === "bp-average" ? (/systolic/i.test(c.sourceLabel) ? "bp-systolic" : "bp-diastolic") : c.calculated.kind,
    value: Number.parseFloat(c.sourceValue), notes: c.calculated.notes.join(" "), label: c.sourceLabel,
  }));
};
const sorted = (rows) => rows.map(([kind, value]) => `${kind}=${value}`).sort();

for (const letter of LETTERS) {
  t(`${letter.slug}: ${letter.tests}`, () => {
    const got = calculated(letter);
    assert.deepEqual(sorted(got.map((g) => [g.kind, g.value])), sorted(letter.expect), `${letter.slug} gave ${JSON.stringify(got.map((g) => [g.kind, g.value]))}`);
    for (const g of got) {
      if (g.kind.startsWith("bp-")) assert.equal(/^Average (?:24 hour|home|ambulatory) (systolic|diastolic) blood pressure \(calculated\)$/.exec(g.label)?.[1], g.kind.slice(3), g.label);
      else assert.equal(g.label, KINDS[g.kind][0], `${g.kind} is labelled as a calculated value`);
    }
  });
}

t("the warnings and bands the letters are meant to show are there", () => {
  const notes = (slug, kind) => calculated(LETTERS.find((l) => l.slug === slug)).find((g) => g.kind === kind)?.notes || "";
  assert.match(notes("bmi-metric", "bmi"), /obesity class 1/);
  assert.match(notes("bmi-disagrees-with-stated", "bmi"), /does not match/);
  assert.match(notes("bp-average-home", "bp-systolic"), /at least 14/);
  assert.doesNotMatch(notes("bp-average-24-hour", "bp-systolic"), /at least 14/);
  assert.match(notes("egfr", "egfr"), /G3b/);
  assert.match(notes("fib4", "fib4"), /high risk/);
  assert.match(notes("news2-urgent", "news2"), /3 on its own/);
  assert.match(notes("curb65-high", "curb65"), /high risk/);
  assert.match(notes("chadsvasc-high", "chadsvasc"), /At least/);
});

t("a published example agrees: a 50 year old man with creatinine 1.0 mg/dL (88.4 umol/L) has a CKD-EPI 2009 eGFR of 87", () => {
  const letter = { slug: "ref", from: "Test Hospital", dept: "Renal", who: "Mr Test", dob: "01 January 1976", nhs: "943 476 0000", body: ["Mr Test, aged 50.", "Creatinine 88.4 umol/L."] };
  assert.equal(calculated(letter).find((g) => g.kind === "egfr")?.value, 87);
});

console.log(`\n${n} passed`);
