const DEFINITIONS = [
  {
    id: "diabetes", terms: ["type 2 diabetes", "diabetes mellitus", "hba1c", "diabetic"],
    title: "Diabetes coding and monitoring review", domain: "Diabetes / QAIF",
    rationale: "Diabetes or HbA1c wording was detected.",
    nextStep: "Check the matched GP record for diagnosis, current register status and relevant HbA1c, ACR, foot and retinal-screening activity.",
  },
  {
    id: "af", terms: ["atrial fibrillation", "cha2ds2", "apixaban", "rivaroxaban", "warfarin", "edoxaban", "dabigatran"],
    title: "Atrial fibrillation and anticoagulation review", domain: "Cardiovascular / QAIF",
    rationale: "AF or anticoagulant wording was detected.",
    nextStep: "Verify the diagnosis, anticoagulation status, renal monitoring and any contraindication coding in the matched GP record.",
  },
  {
    id: "copd", terms: ["copd", "chronic obstructive pulmonary disease", "fev1", "mrc score", "pulmonary rehabilitation"],
    title: "COPD register and review prompt", domain: "Respiratory / QAIF",
    rationale: "COPD or structured respiratory-review wording was detected.",
    nextStep: "Check the confirmed diagnosis, exacerbations, smoking status, MRC score and current review activity.",
  },
  {
    id: "asthma", terms: ["asthma", "peak flow", "act score", "saba", "ics inhaler", "inhaled corticosteroid", "salbutamol"],
    title: "Asthma diagnosis and monitoring prompt", domain: "Respiratory / QAIF",
    rationale: "Asthma, bronchodilator or inhaler-review wording was detected.",
    nextStep: "Do not infer asthma from treatment alone; check the diagnostic pathway, control review and current inhaler record.",
  },
  {
    id: "ckd", terms: ["chronic kidney disease", "ckd", "egfr", "renal function", "u&e", "u&es", "albumin creatinine ratio"],
    title: "Renal coding and monitoring prompt", domain: "CKD / Wales quality improvement",
    rationale: "Renal function, CKD or renal-monitoring wording was detected.",
    nextStep: "Check longitudinal results and the matched record before considering CKD staging, register status or monitoring completion.",
  },
  {
    id: "bp", terms: ["hypertension", "blood pressure", "ambulatory bp", "home bp"],
    title: "Blood pressure and hypertension review", domain: "Hypertension / QAIF",
    rationale: "Blood-pressure or hypertension wording was detected.",
    nextStep: "Verify the observation, coding context and current hypertension status in the matched GP record.",
  },
  {
    id: "smoking", terms: ["smoker", "smoking status", "ex-smoker", "never smoked", "smoking cessation", "tobacco"],
    title: "Smoking-status coding review", domain: "Public health / QAIF",
    rationale: "Smoking-status or cessation wording was detected.",
    nextStep: "Check whether the current smoking status and any cessation intervention are accurately coded.",
  },
  {
    id: "bmi", terms: ["body mass index", "bmi", "obese", "obesity"],
    title: "BMI and weight coding review", domain: "Long-term condition monitoring",
    rationale: "BMI, obesity or weight-management wording was detected.",
    nextStep: "Verify the measurement date, value and clinical context before accepting a code.",
  },
  {
    id: "priority", terms: ["cancer", "malignancy", "neoplasm", "tumour", "2ww", "palliative", "end of life", "dnacpr", "safeguarding", "child protection", "frailty", "learning disability"],
    title: "High-priority coding review", domain: "Clinical safety and registers",
    rationale: "Cancer, palliative, safeguarding, frailty or learning-disability style wording was detected.",
    nextStep: "A trained clinician must compare the source with the matched record and confirm the correct diagnosis or status coding.",
    priority: "high",
  },
];

function normalise(value) {
  return String(value || "").toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ");
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.domain}|${item.title}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function createClinFlowQualityPrompts({ ocr, findings = [], existingPrompts = [] }) {
  const text = normalise([
    ocr?.content,
    ...findings.map((item) => `${item?.label || ""} ${item?.value || item || ""}`),
  ].join(" "));
  const detected = DEFINITIONS.filter((definition) => definition.terms.some((term) => text.includes(term))).map((definition) => ({
    id: definition.id,
    title: definition.title,
    domain: definition.domain,
    rationale: definition.rationale,
    nextStep: definition.nextStep,
    priority: definition.priority || "routine",
    status: "patient_record_check_required",
    framework: "NHS Wales GMS Unified Contract and NHS England QOF/locally governed ruleset validation required",
    source: "clinflow_4_3_governed_prompt",
  }));
  const prompts = dedupe([...existingPrompts, ...detected]);
  return {
    prompts,
    awareness: {
      relevance: prompts.some((item) => item.priority === "high") ? "High" : prompts.length >= 2 ? "Medium" : prompts.length ? "Possible" : "Low",
      domains: [...new Set(prompts.map((item) => item.domain))],
      disclaimer: "These are record-check prompts, not confirmed QAIF/QOF opportunities or accepted clinical codes.",
    },
  };
}
