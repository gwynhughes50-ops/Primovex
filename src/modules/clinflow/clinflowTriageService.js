import { AI_READ_LIMIT } from "./clinflowChecks.js";

const RULESET_VERSION = "clinflow-triage-2026.08-cf43-governed";

const ROUTES = {
  urgent: { label: "Urgent", destination: "Urgent clinical review", priority: "high" },
  workflow_required: { label: "Workflow required", destination: "Workflow Team", priority: "routine" },
  no_workflow: { label: "NFWF", destination: "NFWF", priority: "routine" },
  review_required: { label: "Human review required", destination: "Workflow review", priority: "routine" },
};

const INFORMATION_ONLY_SIGNALS = [
  ["for information only", 35], ["no action required", 45], ["no further action", 45],
  ["no gp action", 45], ["copy letter", 16], ["no change in treatment", 22],
  ["continue current treatment", 18], ["hospital follow-up arranged", 28],
  ["follow-up arranged by hospital", 28], ["follow up arranged by hospital", 28],
  ["patient informed", 12], ["results discussed", 10], ["discharged from clinic", 20],
];

const COMPLETED_ACTION_SIGNALS = [
  ["action completed", 35], ["already actioned", 35], ["already completed", 32],
  ["completed by pharmacist", 32], ["completed by gp", 32], ["bloods arranged", 22],
  ["blood test arranged", 22], ["prescription issued", 24], ["medication updated", 24],
  ["review completed", 20], ["task completed", 20], ["filed after action", 25],
];

const WORKFLOW_SIGNALS = [
  ["please arrange", "Practice action requested"], ["gp to arrange", "GP action requested"],
  ["practice to arrange", "Practice action requested"], ["please prescribe", "Prescribing request"],
  ["gp to prescribe", "Prescribing request"], ["arrange repeat", "Repeat investigation requested"],
  ["monitoring required", "Monitoring requested"], ["repeat blood", "Blood monitoring requested"],
  ["repeat u&e", "Renal monitoring requested"], ["repeat u&es", "Renal monitoring requested"],
  ["repeat fbc", "FBC monitoring requested"], ["repeat lft", "LFT monitoring requested"],
  ["pending result", "Pending result requires review"], ["outstanding result", "Outstanding result requires review"],
  ["refer to", "Referral action requested"], ["referral required", "Referral action requested"],
  ["gp review", "GP review requested"], ["practice review", "Practice review requested"],
];

const URGENT_SIGNALS = [
  ["call 999", "Emergency instruction"],
  ["immediate escalation", "Immediate escalation instruction"], ["escalate immediately", "Immediate escalation instruction"],
  ["same-day assessment", "Same-day assessment requested"], ["same day assessment", "Same-day assessment requested"],
  ["same-day review", "Same-day review requested"], ["same day review", "Same-day review requested"],
  ["suspected cancer", "Suspected cancer pathway"], ["two week wait", "Suspected cancer pathway"],
  ["2ww", "Suspected cancer pathway"], ["safeguarding", "Safeguarding concern"],
  ["child protection", "Child-protection concern"],
];

// Wording that shows nothing is left for the practice to do. The phrase lists above are exact words; these catch the ordinary ways a clinician says it
// ("nothing further is required from your practice", "the study was normal", "I will not be arranging a further review"). Each is [pattern, points].
const INFORMATION_PATTERNS = [
  [/\bnothing (?:further|more)\b/, 45], [/\bno need for (?:any )?further\b/, 40], [/\bno further (?:investigations?|follow.?up|review|treatment)\b/, 35],
  [/\bno follow.?up (?:is |was )?(?:arranged|required|needed|planned)(?: or (?:required|needed))?\b/, 40],
  [/\bfor your (?:records|information|files)\b/, 35], [/\bfor information\b/, 30],
  [/\bno abnormalit(?:y|ies)\b/, 30], [/\b(?:was|were|is|are) (?:all )?normal\b/, 20], [/\bbenign\b/, 25], [/\breassur(?:ed|ing)\b/, 15], [/\bnegative\b/, 15],
  [/\b(?:no|not made any) changes? (?:in|to) (?:his |her |their |the )?(?:treatment|medication|medicines?)\b/, 25],
  [/\bnot be arranging\b/, 30], [/\b(?:we|i) will (?:arrange|review|see|contact|book|write|send)\b/, 25], [/\bhas been booked with (?:the )?(?:clinic|hospital|team)\b/, 25],
  [/\bdischarged (?:him |her |them )?(?:from|home)\b/, 15], [/\bscreening (?:service|programme)\b/, 20], [/\brecall in \d+ years?\b/, 30],
];

// Things that mean the letter is not simply "no action", whatever else it says. Each is [pattern, label]; none of these is a request, so they are checked separately.
const OPEN_ITEM_PATTERNS = [
  [/\b(?:did not attend|failed to attend|non.?attendance|dna)\b/, "Missed appointment"], [/\bdischarged back to (?:your|the gp|primary)/, "Discharged back to the practice"],
  [/\b(?:passed away|has died|died on|deceased)\b/, "A death is reported"], [/\b(?:awaiting|awaited|pending result|will write again)\b/, "A result is still awaited"],
  [/\b(?:newly diagnosed|new diagnosis)\b/, "A new diagnosis to record"],
];

// Sentences that ask, advise or expect something of the GP or practice, including the soft ones ("consider", "I would be grateful", "GP to monitor").
// A "no action" frame is removed from a sentence first, so "No action needed from the hospital, but please could the GP repeat it" still counts as a request.
const NO_ACTION_FRAME = /\b(?:no|nothing|not)\b[^.;]{0,40}?\b(?:needed|required|necessary|arranged|planned)\b|\bno need for\b[^.;]*|\bno (?:gp |practice )?action\b/g;
const REQUEST_PATTERNS = [
  /\bplease\b(?! (?:note|find|see|accept|do not|don't|contact|be advised))/, /\b(?:could|can|would|will) you\b/, /\b(?:would be|be) (?:very )?(?:grateful|appreciated|helpful)\b/, /\bgrateful if\b/,
  /\b(?:we|i) would (?:ask|suggest|recommend|advise|request)\b/, /\b(?:gp|practice|surgery|primary care|your team)\b[^.]{0,25}\b(?:to|should|must|may wish|could|can|needs? to|will need to)\b/,
  /\bconsider (?:starting|referring|stopping|adding|increasing|reducing|checking|repeating|changing|switching|restarting|a|an|the|further)\b/,
  /\bshould (?:be )?(?:reviewed|checked|monitored|repeated|referred|recalled|added|updated)\b/, /\bupdate (?:her|his|their|the) (?:record|records|notes|medication|medicines|problem list|allergy)\b/,
  /\b(?:continue|ongoing|take over|taken over) (?:prescribing|monitoring|supply)\b/, /\bshared care\b/, /\b(?:needs?|requires?) (?:to be )?(?:repeated|rechecked|monitored|checked)\b/,
];
const HOSPITAL_OWNED = /\b(?:we|i|our|hospital|clinic|department|team|service|consultant|specialist|anticoagulation)\b|\bwill be (?:arranged|booked|sent|seen)\b|\bhas been (?:booked|arranged)\b/;
const PRACTICE_MENTION = /\b(?:gp|practice|surgery|primary care|your)\b|\bplease\b/;

function sentencesOf(raw) {
  return String(raw || "").replace(/\s*\n\s*/g, " ").split(/(?<=[.!?:])\s+/).map((s) => s.trim()).filter(Boolean);
}

// The sentences in the letter that ask something of the practice: [{ sentence, label }]. Exported so the tests and the screen can show the exact words.
export function findPracticeRequests(raw) {
  const found = [];
  sentencesOf(raw).forEach((sentence) => {
    const lower = normalise(sentence).replace(NO_ACTION_FRAME, " ");
    if (REQUEST_PATTERNS.some((pattern) => pattern.test(lower))) found.push({ sentence: sentence.slice(0, 200), label: "Asks something of the practice" });
  });
  return found;
}

// "Attend the Emergency Department" is an instruction; "attended the Emergency Department" (it happened) and "go to the Emergency Department if it gets worse" (advice
// for later) are not, so neither makes the letter urgent. The AI's own urgent flag still decides the real cases.
function emergencyInstruction(raw) {
  return sentencesOf(raw).some((sentence) => {
    const lower = normalise(sentence);
    return /\b(?:emergency department|a&e)\b/.test(lower) && /\b(?:go|attend|send|sent|take|taken|refer|referred|admit|call|dial)\b/.test(lower)
      && !/\b(?:attended|presented|seen in|brought|admitted|discharged from|was seen|were seen)\b/.test(lower) && !/\b(?:if|should|unless|in case|were to|whenever)\b/.test(lower);
  });
}

function matchPatterns(text, patterns) {
  return patterns.map(([pattern, value]) => [text.match(pattern)?.[0], value]).filter(([found]) => found);
}

// Is this quoted sentence really in the letter? The AI is asked for a word-for-word quote, so a made-up one is ignored.
function quoteIsInLetter(quote, content) {
  const wanted = normalise(quote).replace(/[“”"']/g, "");
  return wanted.length >= 12 && normalise(content).replace(/[“”"']/g, "").includes(wanted);
}

const MEDICATION_CHANGE_PATTERN =/\b(start(?:ed)?|commenc(?:ed)?|initiated|newly prescribed|stop(?:ped)?|discontinued|ceased|restart(?:ed)?|increas(?:ed)?|decreas(?:ed)?|reduc(?:ed)?|dose changed|changed from|changed to)\b/i;

function normalise(value) {
  return String(value || "").toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
}

function evidence(key, label, detail, weight, source = "governed_rule") {
  return { key, label, detail, weight, source };
}

function matchSignals(text, signals) {
  return signals.filter(([phrase]) => text.includes(phrase));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function recommendedDestination({ text, urgentHits, medicationChanged, actions, diagnoses = [], observations = [] }) {
  if (text.includes("safeguarding") || text.includes("child protection")) return "Child Protection";
  if (urgentHits.length) return "GP";
  // A letter that only mentions medicines with no other clinical substance
  // (diagnoses, observations, broader actions) is a medicines-management
  // letter and belongs with the pharmacist. But a letter with real clinical
  // complexity alongside its medication mentions — new/query diagnoses,
  // observations, investigations — needs the GP's judgement on the whole
  // picture, not just the medicines line; pharmacist can follow afterwards.
  const clinicalComplexity = diagnoses.length + observations.length;
  const medicationLed = medicationChanged || /\b(medicine|medication|prescrib|dose|anticoagul)/.test(text);
  if (medicationLed && clinicalComplexity === 0) return "Pharmacist";
  if (clinicalComplexity > 0 || actions.length) return "GP";
  if (/\b(registration|register patient|new patient)\b/.test(text)) return "Registration Forms";
  if (/\b(respiratory|copd|asthma|smoking cessation|wound|dressing)\b/.test(text) && actions.length) return "Nurse / HCA";
  if (/\b(book|appointment|recall|send|contact patient|letter)\b/.test(text) && actions.length) return "Admin";
  return "Workflow Team";
}

export function createClinFlowTriage({ ocr, actions = [], medicines = [], diagnoses = [], observations = [], urgent = false, medicationChanged = false }) {
  const rawContent = String(ocr?.content || "");
  const content = normalise(ocr?.content);
  // The AI's reading of whether anything is asked of the practice. Present only for letters read by the AI; the curated sample letters rely on the rules alone.
  const extraction = ocr?.llmExtraction;
  const aiReadNoAction = typeof extraction?.noActionRequired === "boolean";
  const aiRequests = Array.isArray(extraction?.requestsOfPractice) ? extraction.requestsOfPractice : [];
  const documentId = normalise(ocr?.document?.id);
  const actionText = actions.map((item) => normalise(item?.value || item)).join(" ");
  const medicineText = medicines.map((item) => normalise(item?.value || item)).join(" ");
  const text = `${content} ${actionText} ${medicineText}`.trim();
  const reasons = [];
  const clinicalTriggers = [];

  const urgentHits = [...matchSignals(text, URGENT_SIGNALS), ...(emergencyInstruction(rawContent) ? [["emergency department", "Emergency-department escalation"]] : [])];
  const workflowHits = matchSignals(text, WORKFLOW_SIGNALS);
  const quoteVerified = aiReadNoAction && extraction.noActionRequired && quoteIsInLetter(extraction.noActionQuote, content);
  const informationHits = [...matchSignals(text, INFORMATION_ONLY_SIGNALS), ...matchPatterns(text, INFORMATION_PATTERNS), ...(quoteVerified ? [[`the AI read “${String(extraction.noActionQuote).slice(0, 140)}”`, 40]] : [])];
  const completedHits = matchSignals(text, COMPLETED_ACTION_SIGNALS);
  const requestHits = [...findPracticeRequests(rawContent), ...aiRequests.slice(0, 4).map((sentence) => ({ sentence: String(sentence).slice(0, 200), label: "The AI found a request of the practice" }))];
  const openItems = OPEN_ITEM_PATTERNS.filter(([pattern]) => pattern.test(content)).map(([, label]) => label);
  // When the AI has read the letter, an action it lists only blocks "no action" if it could be the practice's: one the hospital or clinic says it is doing itself does not.
  const practiceActions = aiReadNoAction ? actions.filter((item) => { const value = normalise(item?.value || item); return !HOSPITAL_OWNED.test(value) || PRACTICE_MENTION.test(value); }) : actions;
  // Real letters trust the caller's already-refined medicationChanged flag
  // (from the LLM's medicationChangePresent, which distinguishes a lasting
  // change from a temporary test-prep hold) rather than re-deriving it with
  // this blunt start/stop/restart pattern, which would flag a temporary
  // "stop the inhaler for a few days before your test" instruction the same
  // as a real ongoing medication change. The curated synthetic profiles have
  // no llmExtraction and keep the original pattern-based detection.
  const detectedMedicationChange = ocr?.llmExtraction
    ? Boolean(medicationChanged)
    : Boolean(medicationChanged || (medicines.length && MEDICATION_CHANGE_PATTERN.test(`${medicineText} ${content}`)));

  urgentHits.forEach(([phrase, label]) => clinicalTriggers.push({ type: "urgent", label, evidence: phrase }));
  workflowHits.forEach(([phrase, label]) => clinicalTriggers.push({ type: "workflow", label, evidence: phrase }));
  if (detectedMedicationChange) clinicalTriggers.push({ type: "medication", label: "Medication change wording detected", evidence: "start/stop/restart/dose-change language" });
  informationHits.forEach(([phrase]) => clinicalTriggers.push({ type: "information_only", label: "Information-only wording detected", evidence: phrase }));
  completedHits.forEach(([phrase]) => clinicalTriggers.push({ type: "completed_action", label: "Completed-action wording detected", evidence: phrase }));

  const nfwfReasons = [];
  const nfwfBlockers = [];
  let nfwfScore = 30;
  informationHits.forEach(([phrase, points]) => { nfwfScore += points; nfwfReasons.push(`Information-only signal: ${phrase}`); });
  completedHits.forEach(([phrase, points]) => { nfwfScore += points; nfwfReasons.push(`Completed-action signal: ${phrase}`); });
  workflowHits.forEach(([, label]) => { nfwfScore -= 35; nfwfBlockers.push(label); });
  if (practiceActions.length) { nfwfScore -= 35; nfwfBlockers.push("Extracted actions require review"); }
  requestHits.slice(0, 3).forEach(({ sentence, label }) => { nfwfScore -= 40; nfwfBlockers.push(`${label}: “${sentence}”`); });
  openItems.forEach((label) => { nfwfScore -= 30; nfwfBlockers.push(label); });
  // The AI is only sent the first part of a long letter, so for one longer than that it cannot vouch that nothing further down asks for something.
  if (aiReadNoAction && rawContent.length > AI_READ_LIMIT) { nfwfScore -= 30; nfwfBlockers.push("The letter is longer than the part the AI read"); }
  if (aiReadNoAction && !extraction.noActionRequired) { nfwfScore -= 20; nfwfBlockers.push("The AI could not confirm that nothing is needed"); }
  if (detectedMedicationChange) { nfwfScore -= 40; nfwfBlockers.push("Possible medication change"); }
  // Whatever the AI decided, medication-change wording in the letter itself stops "no action": it costs a person a quick look, and a missed change costs far more.
  else if (MEDICATION_CHANGE_PATTERN.test(content)) { nfwfScore -= 40; nfwfBlockers.push("Medication-change wording in the letter"); }
  if (urgent || documentId.includes("emergency") || urgentHits.length) { nfwfScore = 0; nfwfBlockers.push("Urgent or safety-critical context"); }
  nfwfScore = Math.max(0, Math.min(99, nfwfScore));
  const blockers = unique(nfwfBlockers);
  const nfwfCategory = blockers.length ? "Workflow required"
    : completedHits.length && nfwfScore >= 70 ? "Action already completed"
      : informationHits.length && nfwfScore >= 70 ? "Information only"
        : nfwfScore >= 90 ? "Likely NFWF"
          : nfwfScore >= 70 ? "Possible NFWF - spot check"
            : "Human review required";

  let decision = "review_required";
  let confidence = 0.45;
  let destination = "Workflow review";
  let priority = "routine";

  if (!content) {
    reasons.push(evidence("insufficient_evidence", "Insufficient evidence", "No usable OCR text was available for triage.", 1));
  } else if (urgent || documentId.includes("emergency") || urgentHits.length) {
    decision = "urgent";
    confidence = urgentHits.length ? 0.96 : 0.88;
    destination = recommendedDestination({ text, urgentHits, medicationChanged: detectedMedicationChange, actions, diagnoses, observations });
    priority = "high";
    reasons.push(evidence("urgent_context", "Urgent or safety-critical context", urgentHits.map(([, label]) => label).join("; ") || "Governed emergency document profile.", 1));
  } else if (practiceActions.length || workflowHits.length || requestHits.length || detectedMedicationChange) {
    decision = "workflow_required";
    confidence = Math.min(0.96, 0.74 + Math.min(practiceActions.length + requestHits.length, 3) * 0.04 + (detectedMedicationChange ? 0.08 : 0) + Math.min(workflowHits.length, 2) * 0.03);
    destination = recommendedDestination({ text, urgentHits, medicationChanged: detectedMedicationChange, actions, diagnoses, observations });
    reasons.push(evidence("outstanding_work", "Outstanding workflow detected", unique([
      ...workflowHits.map(([, label]) => label),
      requestHits.length ? `The letter asks something of the practice: “${requestHits[0].sentence}”` : "",
      practiceActions.length ? `${practiceActions.length} extracted action(s) require confirmation` : "",
      detectedMedicationChange ? "Possible medication change requires reconciliation" : "",
    ]).join("; "), 0.9));
  } else if (nfwfScore >= 70 && !blockers.length && (informationHits.length || completedHits.length)) {
    decision = "no_workflow";
    confidence = Math.min(0.95, nfwfScore / 100);
    destination = "NFWF";
    reasons.push(evidence("nfwf_evidence", nfwfCategory, nfwfReasons.join("; "), 0.8));
  } else if (diagnoses.length || observations.length || medicines.length) {
    reasons.push(evidence("clinical_information_without_route", "Clinical information needs classification", "Clinical content was extracted, but no sufficiently strong action or NFWF evidence was found.", 0.8));
  } else {
    reasons.push(evidence("no_clinical_structure", "No reliable clinical structure", "The document needs human classification before any route can be considered.", 0.9));
  }

  const route = ROUTES[decision];
  const stillNeedsWorkflow = decision === "no_workflow" ? "No" : decision === "review_required" ? "Maybe" : "Yes";
  return {
    ...route,
    destination,
    priority,
    decision,
    confidence,
    reasons,
    rulesetVersion: RULESET_VERSION,
    status: "ai_suggestion_human_confirmation_required",
    requiresHumanConfirmation: true,
    clinicalTriggers,
    nfwf: { score: nfwfScore, category: nfwfCategory, reasons: nfwfReasons.slice(0, 8), blockers: blockers.slice(0, 8) },
    workflowDecision: {
      stillNeedsWorkflow,
      category: decision === "urgent" ? "Urgent workflow required" : decision === "workflow_required" ? "Workflow action required" : nfwfCategory,
      suggestedDestination: destination,
      reasons: reasons.map((item) => item.detail),
      blockers: blockers.slice(0, 8),
    },
    learningPolicy: "Corrections are stored as governed evidence. They never alter live routing until an authorised reviewer approves a versioned ruleset change.",
  };
}

export function triageLabel(decision) {
  return ROUTES[decision]?.label || ROUTES.review_required.label;
}

export { RULESET_VERSION };
