import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyseClinFlowOcr } from "../src/modules/clinflow/clinflowAnalysisService.js";
import { reviewCandidates } from "../src/modules/clinflow/clinflowCodeReview.js";
import { readingChecks } from "../src/modules/clinflow/clinflowChecks.js";
import { LETTERS, fullTextOf } from "./calculator-test-letters.mjs";

// "Check this letter yourself": ClinFlow says so when it could not read or work out something, and stays quiet when it did.
let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const E = (o = {}) => ({ patientName: "Test Patient", diagnoses: ["Hypertension"], currentMedications: [], medicationInstructions: [], actions: [], observations: [], clinicalConclusion: null, documentUrgent: false, medicationChangePresent: false, safetyNettingAdvice: null, requestsOfPractice: [], noActionRequired: false, noActionQuote: null, ...o });
const letter = (content, llm = E(), ocrExtra = {}) => {
  const ocr = { content, document: { id: "x" }, llmExtraction: llm, averageConfidence: 0.97, wordCount: 120, pageCount: 1, ...ocrExtra };
  return { id: "d", syntheticOcr: ocr, clinflowAnalysis: analyseClinFlowOcr(ocr) };
};
const ids = (doc) => readingChecks(doc).map((c) => c.id);
const detail = (doc, id) => readingChecks(doc).find((c) => c.id === id)?.detail || "";

t("when the AI could not run, or found nothing clinical, the person is told to read the letter", () => {
  assert.deepEqual(ids(letter("Seen today. Plan unchanged.", E(), { llmExtraction: undefined, llmExtractionError: "Azure OpenAI rejected the request (429)." })), ["ai-did-not-run"]);
  assert.deepEqual(ids(letter("Seen today. Plan unchanged.", E({ diagnoses: [] }))), ["ai-found-nothing"]);
  assert.deepEqual(ids(letter("Seen today.", E({ diagnoses: [], clinicalConclusion: "Stable." }))), [], "a conclusion counts as something found");
  assert.ok(!detail(letter("x", E(), { llmExtraction: undefined, llmExtractionError: "secret internal error text" }), "ai-did-not-run").includes("secret"), "the raw error is not shown");
});

t("a letter longer than the AI reads, a poor scan and a nearly empty page are each said", () => {
  assert.ok(ids(letter(`Seen today. ${"The examination was unremarkable. ".repeat(450)}`)).includes("ai-partial-letter"));
  assert.ok(!ids(letter("Seen today.")).includes("ai-partial-letter"));
  const poor = letter("Seen today with raised blood pressure.", E(), { averageConfidence: 0.71 });
  assert.deepEqual(ids(poor), ["scan-quality"]);
  assert.match(readingChecks(poor)[0].title, /71%/);
  assert.deepEqual(ids(letter("Seen.", E(), { wordCount: 4 })), ["scan-quality"]);
  assert.deepEqual(ids(letter("Seen today.", E(), { averageConfidence: 0.9, wordCount: 200 })), []);
});

t("a calculation the letter points at but cannot be worked out is said, with what is missing", () => {
  const gap = (text) => detail(letter(text), "calculation-gap");
  assert.match(gap("Mr Hall. Creatinine 142 umol/L."), /eGFR: the letter does not give the patient's age/);
  assert.match(gap("Mrs Jones has atrial fibrillation. Blood pressure 130/80."), /CHA2DS2-VASc score: the letter does not give the patient's age.*HAS-BLED score/);
  assert.match(gap("Mr Evans, aged 70. Calcium 2.31 mmol/L."), /Corrected calcium: the letter does not give an albumin result/);
  assert.match(gap("Mrs Roberts, aged 58. AST 62 U/L, ALT 48 U/L."), /FIB-4 index: the letter does not give a platelet count/);
  assert.match(gap("Mr Khan has pneumonia."), /CURB-65 score: the letter does not give the patient's age/);
  assert.match(gap("Mrs Davies, aged 71. Respiratory rate 22, pulse 112, blood pressure 105/60, SpO2 94% on room air."), /NEWS2 score: the letter does not give a temperature/);
  assert.match(gap("Mr Parry, aged 61. Ambulatory blood pressure monitoring: 134/82, 138/84, 142/88."), /Average blood pressure: the letter does not give four or more readings/);
  assert.match(gap("Mr Hall. Creatinine 142 umol/L."), /not a normal one/);
});

t("it says nothing when a letter never mentions the ingredients, or already states the answer", () => {
  assert.deepEqual(ids(letter("Mr Hall, aged 68. Seen for review. Blood pressure 130/80.")), []);
  assert.deepEqual(ids(letter("Mr Hall, aged 68. Creatinine 142 umol/L, eGFR 43.")), []);
  assert.deepEqual(ids(letter("Mrs Jones has atrial fibrillation. CHA2DS2-VASc 4. HAS-BLED 2.")), []);
});

t("a BMI in the letter that disagrees with its weight and height is never hidden, even when the AI has read the stated BMI", () => {
  const text = "Mrs Hughes, aged 51. Weight 70 kg. Height 165 cm. BMI 31 was recorded.";
  const doc = letter(text, E({ observations: ["BMI 31"] }));
  assert.ok(ids(doc).includes("bmi-mismatch"));
  assert.ok(reviewCandidates(doc.clinflowAnalysis, text).some((c) => c.calculated?.kind === "bmi"), "the worked-out BMI is kept so the person sees both");
  const agrees = letter("Mrs Hughes, aged 51. Weight 70 kg. Height 165 cm. BMI 25.7 recorded.", E({ observations: ["BMI 25.7"] }));
  assert.ok(!ids(agrees).includes("bmi-mismatch"));
  assert.ok(!reviewCandidates(agrees.clinflowAnalysis, "Weight 70 kg. Height 165 cm. BMI 25.7 recorded.").some((c) => c.calculated?.kind === "bmi"), "an agreeing stated BMI is not repeated");
});

t("none of the 20 calculator test letters gets a false alarm; the one with no age gets exactly the right warning", () => {
  for (const l of LETTERS) {
    const doc = letter(fullTextOf(l), E({ observations: ["Seen in clinic"] }));
    const got = ids(doc).filter((id) => id !== "bmi-mismatch");
    if (l.slug === "NEGATIVE-missing-age") assert.deepEqual(got, ["calculation-gap"], l.slug);
    else assert.deepEqual(got, [], `${l.slug} should give no warning, gave ${got}`);
  }
  assert.ok(ids(letter(fullTextOf(LETTERS.find((l) => l.slug === "bmi-disagrees-with-stated")), E({ observations: ["Seen in clinic"] }))).includes("bmi-mismatch"));
});

t("the warnings are on the screen, can be put away like the other notices, and are on the audit trail", () => {
  const ws = readFileSync(new URL("../src/modules/clinflow/ClinFlowWorkspace.jsx", import.meta.url), "utf8");
  assert.match(ws, /const checks = useMemo\(\(\) => readingChecks\(selected\), \[selected\]\);/);
  assert.ok(ws.indexOf("const selected = documents.find(") < ws.indexOf("const checks = useMemo"), "the letter exists before the checks use it");
  assert.match(ws, /checks\.length > 0 && !noticesFor\(selected\.id\)\.includes\("checks"\)/);
  assert.match(ws, /dismissNotice\("checks"\)/);
  assert.match(ws, /readingChecks: checks\.map\(\(c\) => c\.id\)\.join\(","\)/);
  assert.match(ws, /Check this letter yourself/);
  const triage = readFileSync(new URL("../src/modules/clinflow/clinflowTriageService.js", import.meta.url), "utf8");
  assert.match(triage, /import \{ AI_READ_LIMIT \} from "\.\/clinflowChecks\.js"/, "one limit for what the AI reads");
});

console.log(`\n${n} passed`);
