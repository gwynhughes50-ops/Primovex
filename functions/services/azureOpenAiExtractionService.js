const MAX_INPUT_CHARS = 12000;
const MAX_THROTTLE_ATTEMPTS = 6;

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

// Letters arrive in batches at the practice, not steadily through the day,
// so a burst of requests hitting the deployment's rate limit is expected
// behaviour, not an edge case — this mirrors the same retry-after handling
// azureDocumentIntelligenceService.js already uses for the OCR call.
function retryDelayMs(response, throttleAttempt = 0) {
  const retryAfterMs = Number(response?.headers?.get?.("x-ms-retry-after-ms"));
  if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) return Math.min(retryAfterMs, 30000);
  const retryAfter = response?.headers?.get?.("retry-after");
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, 30000);
  return Math.min(4000 * (2 ** throttleAttempt), 30000);
}

const SYSTEM_PROMPT = [
  "You are a clinical letter triage assistant helping a UK GP practice review incoming correspondence.",
  "You will be given raw OCR text extracted from a scanned letter. Extract only what is explicitly stated in the text — never infer, guess, or add clinical information that is not written down.",
  "Never phrase anything more diagnostically assertive than the source text. If the letter is uncertain, tentative or lists a possible cause among others, your wording must carry the same uncertainty — do not upgrade a suspicion into a stated fact.",
  "Respond with a single JSON object and nothing else, matching exactly this shape:",
  '{"patientName": string or null, "diagnoses": string[], "currentMedications": string[], "medicationInstructions": string[], "actions": string[], "observations": string[], "clinicalConclusion": string or null, "documentUrgent": boolean, "medicationChangePresent": boolean, "safetyNettingAdvice": string or null}',
  "- patientName: the patient's full name if stated, else null. Never invent a name.",
  "- diagnoses: confirmed or suspected diagnoses/conditions named in the letter, as short phrases. If the letter questions or is investigating a diagnosis rather than confirming it (e.g. 'query SIADH'), keep the questioning wording — do not state it as if confirmed.",
  "- currentMedications: medicines mentioned as the patient's existing or ongoing medication, given for context (dose/frequency where stated) — whether or not they are also mentioned elsewhere as being investigated as a contributing cause, paused for a test, or otherwise discussed.",
  "- medicationInstructions: explicit instructions about a medicine — start, stop, increase, reduce, restart, or a TEMPORARY hold/withhold for test preparation — exactly as stated (e.g. 'Stop Spiolto 3-5 days before 9am cortisol, if possible', 'Withhold steroid preparations before cortisol testing'). Include temporary test-preparation holds here as instructions, but see medicationChangePresent below for how to flag them.",
  "- actions: follow-up actions, outstanding results, tests, or next steps described in the letter (e.g. 'repeat U&E in 2 weeks').",
  "- observations: clinical observations, vital signs, or investigation results mentioned (e.g. 'oxygen saturation 94%').",
  "- clinicalConclusion: the author's own overall assessment or management conclusion, in their own words or a close paraphrase, if the letter states one (e.g. 'Chronic hyponatraemia; sodium >=126 may be acceptable if asymptomatic. No active treatment currently required.'). This is often the single most clinically important sentence in the letter and is easy to miss — look for it specifically. Use null only if the letter genuinely states no overall conclusion or plan. Match the letter's own level of certainty — never phrase a possibility more assertively than the source text. For example, if the letter suspects a medicine may be contributing to a condition, write 'potentially contributory medications' or similar, not 'culprit medications'; keep hedging words like 'possible', 'query', 'likely' or 'multifactorial' from the source rather than dropping them.",
  "- documentUrgent: true ONLY if the letter itself says the CURRENT situation needs prompt, same-day, or immediate action right now (e.g. 'please see urgently', 'requires same-day assessment', an actively dangerous result needing immediate escalation). This must be false if the only urgent-sounding wording is conditional safety-netting about what to do IF something worsens in future (e.g. 'attend hospital urgently if severe symptoms develop') — that kind of advice belongs in safetyNettingAdvice instead and does NOT make the document itself urgent. Read the whole sentence's condition before deciding, don't just pattern-match the word 'urgent'.",
  "- medicationChangePresent: true ONLY if a medicine is being started, stopped, increased, reduced, or restarted as a lasting change to the patient's regular regimen. This must be false if the only medication instruction is a TEMPORARY hold purely for test preparation (e.g. stopping an inhaler for a few days before a test, then presumably resuming) — that still belongs in medicationInstructions, just don't set this flag for it.",
  "- safetyNettingAdvice: any conditional escalation advice given for future deterioration (e.g. 'attend hospital if severe symptoms of hyponatraemia develop'), reproduced closely, or null if none is given.",
  "The OCR text may contain scanning artefacts: stray characters, words broken across a line break, doubled or missing spaces, or misread letters (e.g. 'rn' read as 'm', '0' read as 'O'). When you reproduce text, normalise these obvious typographical artefacts so it reads as a real word or phrase, but never change what it clinically means, substitute a different condition or drug, or invent a correction you are not confident of — if you are not sure what the correct word is, reproduce the OCR text exactly as it appears rather than guessing.",
  "If an array field has nothing to report, return an empty array (never null, never omit the key). Keep every string under 300 characters.",
].join("\n");

function truncate(text, max) {
  const value = String(text || "");
  return value.length > max ? value.slice(0, max) : value;
}

function cleanStringArray(value, maxItems = 12, maxLength = 300) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === "string" && item.trim())
    .slice(0, maxItems)
    .map((item) => item.trim().slice(0, maxLength));
}

function cleanNullableString(value, maxLength = 500) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : null;
}

function normaliseEndpoint(endpoint) {
  const value = String(endpoint || "").trim().replace(/\/+$/, "");
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(value)) {
    throw new Error("The Azure OpenAI endpoint is missing or invalid.");
  }
  return value;
}

/**
 * Reads a clinical letter's raw OCR text and extracts structured facts —
 * diagnoses, medicines, actions, observations — using Azure OpenAI. This is
 * a suggestion-only extraction: every field feeds into ClinFlow's existing
 * "human review required" workflow unchanged, nothing here files or acts on
 * anything automatically.
 */
async function extractClinicalFacts({ endpoint, key, deployment, ocrText, fetchImpl = fetch }) {
  if (!String(key || "").trim()) throw new Error("The Azure OpenAI key is missing.");
  if (!String(deployment || "").trim()) throw new Error("The Azure OpenAI deployment name is missing.");
  const serviceEndpoint = normaliseEndpoint(endpoint);
  const text = truncate(ocrText, MAX_INPUT_CHARS);
  if (!text.trim()) {
    return {
      patientName: null, diagnoses: [], currentMedications: [], medicationInstructions: [], actions: [], observations: [],
      clinicalConclusion: null, documentUrgent: false, medicationChangePresent: false, safetyNettingAdvice: null,
    };
  }

  // Azure's Responses API (not the older Chat Completions shape): the model/
  // deployment name is a body field, not part of the URL, and json_object
  // mode requires the word "json" to appear in `input` itself — an
  // instructions-only mention isn't enough (verified against a live call).
  const url = `${serviceEndpoint}/openai/v1/responses`;
  let response;
  for (let attempt = 0; attempt < MAX_THROTTLE_ATTEMPTS; attempt += 1) {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": key },
      body: JSON.stringify({
        model: deployment,
        instructions: SYSTEM_PROMPT,
        input: `Extract the clinical facts as JSON from this letter's OCR text:\n\n${text}`,
        text: { format: { type: "json_object" } },
        temperature: 0,
        max_output_tokens: 1300,
      }),
    });
    if (response.status !== 429) break;
    await sleep(retryDelayMs(response, attempt));
  }

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 1200);
    throw new Error(`Azure OpenAI rejected the extraction request (${response.status}). ${detail}`);
  }

  const payload = await response.json();
  const message = payload?.output?.find((item) => item.type === "message");
  const raw = message?.content?.find((item) => item.type === "output_text")?.text;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Azure OpenAI did not return valid structured output.");
  }

  return {
    patientName: typeof parsed?.patientName === "string" ? parsed.patientName.trim().slice(0, 160) || null : null,
    diagnoses: cleanStringArray(parsed?.diagnoses),
    currentMedications: cleanStringArray(parsed?.currentMedications),
    medicationInstructions: cleanStringArray(parsed?.medicationInstructions),
    actions: cleanStringArray(parsed?.actions),
    observations: cleanStringArray(parsed?.observations),
    clinicalConclusion: cleanNullableString(parsed?.clinicalConclusion),
    documentUrgent: Boolean(parsed?.documentUrgent),
    medicationChangePresent: Boolean(parsed?.medicationChangePresent),
    safetyNettingAdvice: cleanNullableString(parsed?.safetyNettingAdvice, 300),
  };
}

module.exports = { extractClinicalFacts };
