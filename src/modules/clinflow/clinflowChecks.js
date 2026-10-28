import { calculateBmi, calculationGaps } from "./clinflowCalculations.js";

// "Check before you rely on this": the things ClinFlow could not do, or could not be sure of, on a letter. A gap is never left silent, because a missing result looks
// exactly like a normal one. Each is [{ id, title, detail }], shown above the letter until a person puts it away (which is on the audit trail). Pure (no screens).

// How many characters of a letter the AI reads (MAX_INPUT_CHARS in functions/services/azureOpenAiExtractionService.js: keep the two the same).
export const AI_READ_LIMIT = 12000;
export const LOW_CONFIDENCE = 0.85;
export const FEW_WORDS = 30;

const nothingFound = (e) => !["diagnoses", "currentMedications", "medicationInstructions", "actions", "observations"].some((key) => (e[key] || []).length) && !e.clinicalConclusion && !e.safetyNettingAdvice;
const list = (items) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

export function readingChecks(document) {
  const analysis = document?.clinflowAnalysis;
  const ocr = document?.syntheticOcr;
  if (!analysis || !ocr) return [];
  const checks = [];
  const content = String(ocr.content || "");

  if (ocr.llmExtractionError) {
    checks.push({ id: "ai-did-not-run", title: "The AI could not read this letter", detail: "No diagnoses, medicines or actions were picked out. Read the whole letter yourself before you rely on anything ClinFlow shows." });
  } else if (ocr.llmExtraction && nothingFound(ocr.llmExtraction)) {
    checks.push({ id: "ai-found-nothing", title: "The AI found nothing clinical in this letter", detail: "That may be right (an admin letter, say), or it may have missed something. Read the letter before you rely on this." });
  }
  if (ocr.llmExtraction && content.length > AI_READ_LIMIT) {
    checks.push({ id: "ai-partial-letter", title: "This letter is longer than the AI reads", detail: `Only the first ${AI_READ_LIMIT.toLocaleString("en-GB")} characters were read. Anything further down, including requests of the practice, may not be shown: read the rest of the letter.` });
  }
  const confidence = Number(ocr.averageConfidence);
  if (Number.isFinite(confidence) && confidence > 0 && confidence < LOW_CONFIDENCE) {
    checks.push({ id: "scan-quality", title: `The scan was hard to read (${Math.round(confidence * 100)}% sure of the words)`, detail: "Names, dates, doses and results may be misread. Check them against the original letter." });
  } else if (Number.isFinite(Number(ocr.wordCount)) && Number(ocr.wordCount) < FEW_WORDS) {
    checks.push({ id: "scan-quality", title: `Very little text could be read (${Number(ocr.wordCount)} words)`, detail: "The page may be blank, upside down or a poor scan. Check the original letter." });
  }

  const patient = { birthDate: analysis.docmanDraft?.patient?.birthDate, gender: analysis.docmanDraft?.patient?.gender, letterDate: analysis.docmanDraft?.document?.eventDate };
  const gaps = calculationGaps(content, patient);
  if (gaps.length) {
    checks.push({
      id: "calculation-gap", title: "Some figures could not be worked out",
      detail: `${gaps.map((g) => `${g.label}: the letter does not give ${list(g.needs)}`).join(". ")}. A missing figure is not a normal one: check the letter and the patient's record.`,
    });
  }
  const bmi = calculateBmi(content);
  if (bmi?.notes.some((note) => /does not match/.test(note))) {
    checks.push({ id: "bmi-mismatch", title: "The BMI in the letter does not match its weight and height", detail: bmi.notes.find((note) => /does not match/.test(note)) });
  }
  return checks;
}
