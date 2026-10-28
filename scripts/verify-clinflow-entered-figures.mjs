import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyseClinFlowOcr } from "../src/modules/clinflow/clinflowAnalysisService.js";
import { reviewCandidates } from "../src/modules/clinflow/clinflowCodeReview.js";
import { readingChecks } from "../src/modules/clinflow/clinflowChecks.js";
import { calculationGaps } from "../src/modules/clinflow/clinflowCalculations.js";
import { ENTERED, cleanEnteredFigures, fieldsForGaps } from "../src/modules/clinflow/clinflowEnteredFigures.js";
import { LETTERS } from "./calculator-test-letters.mjs";

// A letter that gives only part of what a calculation needs: the person enters the rest from the clinical record, and the answer is the same as when the letter gave it.
let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const E = { patientName: "Test Patient", diagnoses: [], currentMedications: [], medicationInstructions: [], actions: [], observations: ["Seen in clinic"], clinicalConclusion: null, documentUrgent: false, medicationChangePresent: false, safetyNettingAdvice: null, requestsOfPractice: [], noActionRequired: false, noActionQuote: null };
const expected = (slug, kind) => LETTERS.find((l) => l.slug === slug).expect.find(([k]) => k === kind)[1];

const doc = (content, values) => {
  const ocr = { content, document: { id: "x" }, llmExtraction: E, averageConfidence: 0.97, wordCount: 100 };
  const analysis = analyseClinFlowOcr(ocr);
  return { id: "d", syntheticOcr: ocr, clinflowAnalysis: values ? { ...analysis, recordFigures: { values, byName: "Sam Jones", at: "2026-10-28T09:00:00Z" } } : analysis };
};
const calculated = (d) => reviewCandidates(d.clinflowAnalysis, d.syntheticOcr.content).filter((c) => c.calculated);
const valueOf = (d, kind) => { const c = calculated(d).find((x) => x.calculated.kind === kind); return c ? Number.parseFloat(c.sourceValue) : undefined; };

t("what is typed is checked: believable numbers only, both blood pressures or neither, systolic above diastolic, real choices", () => {
  assert.deepEqual(cleanEnteredFigures({ age: "78", sex: "female", albumin: "31,5" }).values, { age: 78, sex: "female", albumin: 31.5 });
  assert.deepEqual(cleanEnteredFigures({ age: "", sex: "" }).values, {}, "blank fields are left out");
  assert.match(cleanEnteredFigures({ age: 7 }).problems[0], /Age should be between 18 and 110/);
  assert.match(cleanEnteredFigures({ temperature: 12 }).problems[0], /Temperature/);
  assert.match(cleanEnteredFigures({ systolic: 120 }).problems[0], /both blood pressure numbers/);
  assert.match(cleanEnteredFigures({ systolic: 80, diastolic: 120 }).problems[0], /systolic pressure should be higher/);
  assert.match(cleanEnteredFigures({ sex: "x" }).problems[0], /Sex is not one of the choices/);
  assert.deepEqual(cleanEnteredFigures({ age: 7, albumin: 30 }).values, {}, "nothing is kept if anything is wrong");
});

t("entering the age finishes the eGFR, and the answer matches the letter that gave the age", () => {
  const text = "Mr Hywel Thomas. Creatinine 142 umol/L.";
  assert.equal(valueOf(doc(text), "egfr"), undefined);
  const d = doc(text, { age: 68 });
  assert.equal(valueOf(d, "egfr"), expected("egfr", "egfr"));
  const found = calculated(d).find((c) => c.calculated.kind === "egfr").calculated;
  assert.ok(found.from.some((q) => q.includes(ENTERED)), "the working says the age was entered from the record");
  assert.ok(found.notes.some((note) => /entered from the clinical record/.test(note)), "and a note says to check it");
});

t("entering the age finishes CHA2DS2-VASc and HAS-BLED; entering the sex too adds the point for being female", () => {
  const text = "Mrs Glenys Davies has atrial fibrillation. She has hypertension and type 2 diabetes and a previous stroke in 2019. She takes apixaban.";
  assert.equal(valueOf(doc(text), "chadsvasc"), undefined);
  const d = doc(text, { age: 78 });
  assert.equal(valueOf(d, "chadsvasc"), expected("chadsvasc-high", "chadsvasc"));
  assert.equal(valueOf(d, "hasbled"), expected("chadsvasc-high", "hasbled"));
  const man = doc("Atrial fibrillation with hypertension.", { age: 70, sex: "male" });
  const woman = doc("Atrial fibrillation with hypertension.", { age: 70, sex: "female" });
  assert.equal(valueOf(woman, "chadsvasc") - valueOf(man, "chadsvasc"), 1);
});

t("entering the albumin, the platelets, the age and the temperature finishes corrected calcium, FIB-4, CURB-65 and NEWS2", () => {
  assert.equal(valueOf(doc("Mr Emrys Lloyd. Calcium 2.31 mmol/L.", { albumin: 31 }), "corrected-calcium"), expected("corrected-calcium", "corrected-calcium"));
  assert.equal(valueOf(doc("Mrs Bethan Owen, aged 58. AST 62 U/L, ALT 48 U/L.", { platelets: 140 }), "fib4"), expected("fib4", "fib4"));
  assert.equal(valueOf(doc("Mrs Sian Roberts was admitted with community-acquired pneumonia. She was confused. Urea 9.2 mmol/L, respiratory rate 32, blood pressure 98/58.", { age: 81 }), "curb65"), expected("curb65-high", "curb65"));
  const news = "Mrs Eirian Jones, aged 71. Observations: respiratory rate 22, SpO2 94% on room air, blood pressure 105/60, pulse 112 bpm, alert.";
  assert.equal(valueOf(doc(news), "news2"), undefined);
  assert.equal(valueOf(doc(news, { temperature: 38.4 }), "news2"), expected("news2-moderate", "news2"));
});

t("a missing blood pressure and pulse for NEWS2 are entered as a pair and a number", () => {
  const text = "Mr Imran Khan, aged 59. Respiratory rate 26, SpO2 89% on 4 L oxygen, temperature 38.2. He was confused.";
  const d = doc(text, { systolic: 88, diastolic: 50, pulse: 132 });
  assert.equal(valueOf(d, "news2"), expected("news2-urgent", "news2"));
});

t("a figure the letter gives is never replaced by one that was entered", () => {
  const d = doc("Mr Dewi Evans, aged 68. Creatinine 142 umol/L.", { age: 40 });
  assert.equal(valueOf(d, "egfr"), expected("egfr", "egfr"), "the letter's age of 68 is used, not 40");
  const found = calculated(d).find((c) => c.calculated.kind === "egfr").calculated;
  assert.ok(!found.from.some((q) => q.includes(ENTERED)));
  assert.ok(!found.notes.some((note) => /entered from the clinical record/.test(note)));
});

t("the gap, and the notice, go away once the figures are entered, and come back if they are removed", () => {
  const text = "Mr Hywel Thomas. Creatinine 142 umol/L.";
  assert.ok(readingChecks(doc(text)).some((c) => c.id === "calculation-gap"));
  assert.deepEqual(calculationGaps(text, {}, { age: 68 }), []);
  assert.ok(!readingChecks(doc(text, { age: 68 })).some((c) => c.id === "calculation-gap"));
  const gap = readingChecks(doc(text)).find((c) => c.id === "calculation-gap");
  assert.deepEqual(gap.gaps[0].inputs, ["age"], "it says which figure it needs");
});

t("the form offers exactly what is missing, and what would only help", () => {
  const gaps = calculationGaps("The patient has atrial fibrillation. Blood pressure 130/80.", {});
  const { required, optional } = fieldsForGaps(gaps);
  assert.deepEqual(required, ["age"], "the age once, though two scores need it");
  assert.deepEqual(optional, ["sex"]);
  const news = fieldsForGaps(calculationGaps("Aged 71. Respiratory rate 22, pulse 112, blood pressure 105/60, SpO2 94%.", {}));
  assert.deepEqual(news.required, ["temperature"]);
  assert.deepEqual(news.optional, ["oxygen", "consciousness"]);
  const bp = fieldsForGaps(calculationGaps("Aged 71. Respiratory rate 22, pulse 112, SpO2 94%, temperature 38.4.", {}));
  assert.deepEqual(bp.required, ["systolic", "diastolic"]);
});

t("on the screen: saved on the letter with who and when, only a person who may process letters can do it, and the audit trail has which figures but never their values", () => {
  const ws = readFileSync(new URL("../src/modules/clinflow/ClinFlowWorkspace.jsx", import.meta.url), "utf8");
  assert.match(ws, /async function saveRecordFigures\(values\) \{\s+if \(!can\("clinflow\.workflow"\)\)/);
  assert.match(ws, /recordFigures = \{ values: merged\.values, byUid: user\?\.uid \|\| "", byName: displayName \|\| user\?\.email \|\| "", at: new Date\(\)\.toISOString\(\) \}/);
  assert.match(ws, /record\("clinflow\.figures\.entered", "[^"]+", \{ kinds: Object\.keys\(values\)\.join\(","\), count: Object\.keys\(merged\.values\)\.length \}\)/);
  assert.match(ws, /record\("clinflow\.figures\.removed", "[^"]+", \{ count: /);
  assert.match(ws, /<RecordFigures gaps=\{checks\.find/);
  assert.ok(!/record\("clinflow\.figures\.entered"[^)]*merged\.values\b[^)]*,[^)]*values:/.test(ws), "values are never sent to the audit trail");
  const form = readFileSync(new URL("../src/modules/clinflow/RecordFigures.jsx", import.meta.url), "utf8");
  assert.match(form, /A figure already in the letter is never replaced/);
  assert.match(form, /type="number"/, "numbers are typed into number boxes, not free text");
});

console.log(`\n${n} passed`);
