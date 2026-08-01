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
  ["call 999", "Emergency instruction"], ["emergency department", "Emergency-department escalation"],
  ["immediate escalation", "Immediate escalation instruction"], ["escalate immediately", "Immediate escalation instruction"],
  ["same-day assessment", "Same-day assessment requested"], ["same day assessment", "Same-day assessment requested"],
  ["same-day review", "Same-day review requested"], ["same day review", "Same-day review requested"],
  ["suspected cancer", "Suspected cancer pathway"], ["two week wait", "Suspected cancer pathway"],
  ["2ww", "Suspected cancer pathway"], ["safeguarding", "Safeguarding concern"],
  ["child protection", "Child-protection concern"],
];

const MEDICATION_CHANGE_PATTERN = /\b(start(?:ed)?|commenc(?:ed)?|initiated|newly prescribed|stop(?:ped)?|discontinued|ceased|restart(?:ed)?|increas(?:ed)?|decreas(?:ed)?|reduc(?:ed)?|dose changed|changed from|changed to)\b/i;

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

function recommendedDestination({ text, urgentHits, medicationChanged, actions }) {
  if (text.includes("safeguarding") || text.includes("child protection")) return "Child Protection";
  if (urgentHits.length) return "GP";
  if (medicationChanged || /\b(medicine|medication|prescrib|dose|anticoagul)/.test(text)) return "Pharmacist";
  if (/\b(registration|register patient|new patient)\b/.test(text)) return "Registration Forms";
  if (/\b(respiratory|copd|asthma|smoking cessation|wound|dressing)\b/.test(text) && actions.length) return "Nurse / HCA";
  if (/\b(book|appointment|recall|send|contact patient|letter)\b/.test(text) && actions.length) return "Admin";
  return "Workflow Team";
}

export function createClinFlowTriage({ ocr, actions = [], medicines = [], diagnoses = [], observations = [], urgent = false, medicationChanged = false }) {
  const content = normalise(ocr?.content);
  const documentId = normalise(ocr?.document?.id);
  const actionText = actions.map((item) => normalise(item?.value || item)).join(" ");
  const medicineText = medicines.map((item) => normalise(item?.value || item)).join(" ");
  const text = `${content} ${actionText} ${medicineText}`.trim();
  const reasons = [];
  const clinicalTriggers = [];

  const urgentHits = matchSignals(text, URGENT_SIGNALS);
  const workflowHits = matchSignals(text, WORKFLOW_SIGNALS);
  const informationHits = matchSignals(text, INFORMATION_ONLY_SIGNALS);
  const completedHits = matchSignals(text, COMPLETED_ACTION_SIGNALS);
  const detectedMedicationChange = Boolean(medicationChanged || (medicines.length && MEDICATION_CHANGE_PATTERN.test(`${medicineText} ${content}`)));

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
  if (actions.length) { nfwfScore -= 35; nfwfBlockers.push("Extracted actions require review"); }
  if (detectedMedicationChange) { nfwfScore -= 40; nfwfBlockers.push("Possible medication change"); }
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
    destination = recommendedDestination({ text, urgentHits, medicationChanged: detectedMedicationChange, actions });
    priority = "high";
    reasons.push(evidence("urgent_context", "Urgent or safety-critical context", urgentHits.map(([, label]) => label).join("; ") || "Governed emergency document profile.", 1));
  } else if (actions.length || workflowHits.length || detectedMedicationChange) {
    decision = "workflow_required";
    confidence = Math.min(0.96, 0.74 + Math.min(actions.length, 3) * 0.04 + (detectedMedicationChange ? 0.08 : 0) + Math.min(workflowHits.length, 2) * 0.03);
    destination = recommendedDestination({ text, urgentHits, medicationChanged: detectedMedicationChange, actions });
    reasons.push(evidence("outstanding_work", "Outstanding workflow detected", unique([
      ...workflowHits.map(([, label]) => label),
      actions.length ? `${actions.length} extracted action(s) require confirmation` : "",
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
