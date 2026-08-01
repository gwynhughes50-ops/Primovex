import { createClinFlowTriage } from "./clinflowTriageService.js";
import { createClinFlowQualityPrompts } from "./clinflowQualityPromptService.js";

const TERM_LABELS = new Set([
  "Diagnosis", "Oxygen saturation", "Temperature", "Heart rate", "NEWS2",
  "Ejection fraction", "Ventricular ectopics", "Repeat troponin", "First troponin",
]);

const MEDICATION_LABELS = new Set(["Medication", "Aspirin"]);
const ACTION_LABELS = new Set(["Follow-up", "Outstanding result", "Restart date", "Blood tests", "Escalation threshold"]);

const SNOMED_SYSTEM = "http://snomed.info/sct";
const SNOMED_INTERNATIONAL_VERSION = "http://snomed.info/sct/900000000000207008/version/20260701";

// Governed baseline concepts verified active against the SNOMED International
// 2026-07-01 release. They remain candidates until validated against the live
// UK Edition and accepted by a trained clinician for the matched patient.
const GOVERNED_OBSERVATION_CONCEPTS = {
  bloodPressure: {
    conceptId: "75367002",
    preferredTerm: "Blood pressure",
    components: {
      systolic: { conceptId: "271649006", preferredTerm: "Systolic blood pressure" },
      diastolic: { conceptId: "271650006", preferredTerm: "Diastolic blood pressure" },
    },
    unit: { display: "mmHg", ucumCode: "mm[Hg]", system: "http://unitsofmeasure.org" },
  },
  heartRate: {
    conceptId: "364075005", preferredTerm: "Heart rate",
    unit: { display: "bpm", ucumCode: "/min", system: "http://unitsofmeasure.org" },
  },
  respiratoryRate: {
    conceptId: "86290005", preferredTerm: "Respiratory rate",
    unit: { display: "breaths/min", ucumCode: "/min", system: "http://unitsofmeasure.org" },
  },
  oxygenSaturation: {
    conceptId: "431314004", preferredTerm: "Peripheral oxygen saturation",
    unit: { display: "%", ucumCode: "%", system: "http://unitsofmeasure.org" },
  },
  bodyTemperature: {
    conceptId: "386725007", preferredTerm: "Body temperature",
    unit: { display: "°C", ucumCode: "Cel", system: "http://unitsofmeasure.org" },
  },
};

const SYNTHETIC_CLINICAL_PROFILES = {
  "respiratory-clinic-letter": {
    findings: [
      ["symptom", "Persistent cough", "persistent cough"],
      ["symptom", "Exertional breathlessness", "exertional breathlessness"],
      ["investigation", "Chest radiograph: no focal consolidation", "no focal consolidation", "negated"],
      ["investigation", "Spirometry technically limited", "spirometry was technically limited"],
      ["action", "Repeat spirometry with reversibility testing", "repeat spirometry with reversibility"],
      ["observation", "CRP 4 mg/L", "crp 4"],
      ["medication", "Trial salbutamol inhaler 100 micrograms", "salbutamol inhaler 100 micrograms"],
      ["action", "Respiratory clinic review in eight weeks", "eight weeks"],
    ],
    qualityPrompts: [
      ["Respiratory diagnosis/register review", "Respiratory", "Symptoms, a bronchodilator trial and repeat spirometry are documented, but asthma or COPD is not diagnosed in this letter.", "Check the patient record and diagnostic pathway before considering a chronic respiratory register."],
    ],
  },
  "faxed-discharge-summary": {
    findings: [
      ["diagnosis", "Community-acquired pneumonia", "community-acquired pneumonia"],
      ["condition", "Transient acute kidney injury - resolved", "acute kidney injury, resolved", "resolved"],
      ["symptom", "Fever", "presented with fever"],
      ["symptom", "Productive cough", "productive cough"],
      ["symptom", "Reduced oral intake", "reduced oral intake"],
      ["investigation", "Right lower-zone opacity on chest radiograph", "right lower-zone opacity"],
      ["medication", "Amoxicillin 500 mg three times daily", "amoxicillin 500 mg"],
      ["medication", "Doxycycline 100 mg once daily", "doxycycline 100 mg"],
      ["medication", "Paracetamol 1 g up to four times daily when required", "paracetamol 500 mg"],
      ["medication", "Ramipril 5 mg each morning - restart 02/08/2026", "ramipril 5 mg"],
      ["action", "Review pending sputum culture within 48 hours", "sputum culture"],
      ["action", "Repeat U&E in 5-7 days", "repeat u&e in 5"],
      ["action", "Repeat chest radiograph in 6 weeks", "radiograph in 6 weeks"],
    ],
    qualityPrompts: [
      ["Renal safety review", "CKD quality improvement", "A transient acute kidney injury is recorded as resolved and ramipril has a restart date.", "Check renal results and the current Wales CKD quality-improvement pathway; this letter alone does not establish CKD."],
      ["Medicines reconciliation", "Medicines safety", "Four discharge medicines and a delayed ramipril restart are documented.", "Verify the discharge list and restart date against the patient medication record."],
    ],
  },
  "handwritten-ward-review": {
    findings: [
      ["symptom", "Shortness of breath on exertion", "sob walking"],
      ["observation", "Heart rate 96 bpm", "hr 96"],
      ["observation", "Blood pressure 128/74 mmHg", "bp 128/74"],
      ["finding", "Coarse crackles at right base", "coarse crackles r base"],
      ["symptom", "Reduced oral intake", "eating little"],
      ["action", "Continue oral antibiotics", "continue oral antibiotics"],
      ["action", "Repeat U&E and check CRP", "repeat u&e"],
      ["action", "Encourage fluids and maintain fluid chart", "fluid chart"],
      ["action", "Physiotherapy review and mobilisation", "physio review"],
      ["safety-net", "Urgent escalation if oxygen saturation below 92% or work of breathing increases", "below 92%"],
    ],
    qualityPrompts: [
      ["Post-discharge respiratory review", "Clinical follow-up", "Breathlessness, crackles and oxygen monitoring are present without a confirmed chronic respiratory diagnosis.", "Check the final diagnosis and discharge plan before considering any disease-register implication."],
    ],
  },
  "annotated-cardiology-letter": {
    findings: [
      ["symptom", "Intermittent palpitations", "intermittent palpitations"],
      ["investigation", "Sinus rhythm with occasional ventricular ectopics", "sinus rhythm with occasional ventricular ectopics"],
      ["finding", "No sustained arrhythmia recorded", "no sustained arrhythmia", "negated"],
      ["finding", "Normal left ventricular systolic function", "normal left ventricular"],
      ["diagnosis", "Mild mitral regurgitation", "mild mitral regurgitation"],
      ["finding", "No pericardial effusion", "no pericardial effusion", "negated"],
      ["medication", "Start bisoprolol 2.5 mg once daily", "bisoprolol 2.5 mg once daily"],
      ["action", "Check resting pulse and blood pressure before treatment", "checking resting pulse and blood pressure"],
      ["action", "Check pulse and blood pressure two weeks after starting", "two weeks after starting"],
      ["action", "Repeat renal profile and thyroid function if symptoms recur", "renal profile and thyroid"],
      ["action", "Cardiology follow-up in four months", "four months"],
    ],
    qualityPrompts: [
      ["Cardiovascular register review", "Cardiovascular", "Palpitations and ventricular ectopics are documented, but this letter records sinus rhythm, normal LV function and no sustained arrhythmia.", "Do not infer atrial fibrillation or heart failure; check the existing patient record for confirmed diagnoses."],
      ["Beta-blocker monitoring", "Medicines safety", "Bisoprolol initiation and pulse/blood-pressure monitoring are requested.", "Confirm initiation and record the requested monitoring actions."],
    ],
  },
  "emergency-handover-form": {
    findings: [
      ["symptom", "Central chest tightness lasting 45 minutes", "central chest tightness"],
      ["symptom", "Nausea", "nausea"],
      ["observation", "Heart rate 108 bpm", "hr 108"],
      ["observation", "Blood pressure 146/88 mmHg", "146/88"],
      ["observation", "Respiratory rate 22", "rr 22"],
      ["observation", "Oxygen saturation 95% on room air", "95% ra"],
      ["observation", "Temperature 36.8 C", "36.8"],
      ["investigation", "ECG: sinus tachycardia with no ST elevation", "sinus tach"],
      ["medication", "Aspirin 300 mg given", "300 mg at"],
      ["investigation", "First troponin 7 ng/L", "7 ng/l"],
      ["action", "Repeat troponin due at 00:30", "due 00:30"],
      ["action", "Chest radiograph requested", "cxr"],
      ["action", "Senior review completed", "senior review"],
      ["safety-net", "Immediate escalation for recurrent pain, ECG change, hypotension or arrhythmia", "escalate immediately"],
    ],
    qualityPrompts: [
      ["Cardiovascular diagnosis review", "Cardiovascular", "An acute chest-pain pathway is documented without a confirmed chronic cardiovascular diagnosis.", "Reconcile the final hospital outcome before adding any disease-register code."],
    ],
  },
};

const clean = (value) => String(value || "").trim();
const normalise = (value) => clean(value).toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ");

function profileFindings(ocr) {
  const profile = SYNTHETIC_CLINICAL_PROFILES[ocr.document?.id];
  const text = normalise(ocr.content);
  if (!profile || !text) return [];
  return profile.findings.filter(([, , evidence]) => text.includes(normalise(evidence))).map(([kind, value, evidence, assertion = "present"]) => ({
    label: kind.replace(/(^|-)([a-z])/g, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`),
    kind,
    value,
    evidence,
    assertion,
    detected: true,
    status: "extracted_needs_review",
    source: "ocr_profile_rule",
  }));
}

function splitPatientName(value) {
  const parts = clean(value).split(/\s+/).filter(Boolean);
  return { givenNames: parts.slice(0, -1).join(" "), familyName: parts.at(-1) || "" };
}

function documentProfile(documentId = "") {
  if (documentId.includes("discharge")) return { type: "Discharge summary", folder: "Discharge", inpatient: true, outpatient: false };
  if (documentId.includes("emergency")) return { type: "Emergency handover", folder: "Emergency", inpatient: false, outpatient: false };
  if (documentId.includes("ward")) return { type: "Ward review note", folder: "Clinical correspondence", inpatient: true, outpatient: false };
  if (documentId.includes("cardiology")) return { type: "Cardiology clinic letter", folder: "Outpatient correspondence", inpatient: false, outpatient: true };
  if (documentId.includes("respiratory")) return { type: "Respiratory clinic letter", folder: "Outpatient correspondence", inpatient: false, outpatient: true };
  return { type: "Clinical correspondence", folder: "Clinical correspondence", inpatient: false, outpatient: false };
}

function uniqueFindings(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${normalise(item.label)}|${normalise(item.value)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractStructuredObservations(observations) {
  const structured = [];
  const addScalar = (item, type, definition, value) => structured.push({
    type,
    sourceLabel: item.label,
    sourceValue: item.value,
    conceptId: definition.conceptId,
    preferredTerm: definition.preferredTerm,
    codeSystem: "SNOMED CT UK Edition candidate",
    system: SNOMED_SYSTEM,
    terminologyVersionChecked: SNOMED_INTERNATIONAL_VERSION,
    value: Number(value),
    unit: definition.unit,
    status: "structured_candidate_human_review_required",
    acceptedByUid: null,
  });
  observations.forEach((item) => {
    const text = clean(item.value);
    const bp = text.match(/\bblood pressure\s+(\d{2,3})\s*\/\s*(\d{2,3})\s*(?:mm\s*hg|mmhg)?\b/i);
    if (bp) {
      const definition = GOVERNED_OBSERVATION_CONCEPTS.bloodPressure;
      structured.push({
        type: "blood_pressure", sourceLabel: item.label, sourceValue: item.value,
        conceptId: definition.conceptId, preferredTerm: definition.preferredTerm,
        codeSystem: "SNOMED CT UK Edition candidate", system: SNOMED_SYSTEM,
        terminologyVersionChecked: SNOMED_INTERNATIONAL_VERSION, unit: definition.unit,
        systolic: { ...definition.components.systolic, value: Number(bp[1]) },
        diastolic: { ...definition.components.diastolic, value: Number(bp[2]) },
        status: "structured_candidate_human_review_required", acceptedByUid: null,
      });
      return;
    }
    const heartRate = text.match(/\bheart rate\s+(\d{2,3})\s*(?:bpm)?\b/i);
    if (heartRate) return addScalar(item, "heart_rate", GOVERNED_OBSERVATION_CONCEPTS.heartRate, heartRate[1]);
    const respiratoryRate = text.match(/\brespiratory rate\s+(\d{1,2})\b/i);
    if (respiratoryRate) return addScalar(item, "respiratory_rate", GOVERNED_OBSERVATION_CONCEPTS.respiratoryRate, respiratoryRate[1]);
    const oxygenSaturation = text.match(/\boxygen saturation\s+(\d{2,3})\s*%/i);
    if (oxygenSaturation) return addScalar(item, "oxygen_saturation", GOVERNED_OBSERVATION_CONCEPTS.oxygenSaturation, oxygenSaturation[1]);
    const temperature = text.match(/\btemperature\s+(\d{2}(?:\.\d)?)\s*(?:°?c)?\b/i);
    if (temperature) addScalar(item, "body_temperature", GOVERNED_OBSERVATION_CONCEPTS.bodyTemperature, temperature[1]);
  });
  return structured;
}

function uniqueTerminologyCandidates(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.conceptId || "unresolved"}|${normalise(item.sourceValue)}|${item.component || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function analyseClinFlowOcr(ocr = {}) {
  const fields = (ocr.groundTruth || []).map((field) => ({
    label: field.label,
    value: field.expected,
    detected: Boolean(field.matched),
    status: field.matched ? "extracted_needs_review" : "not_detected",
  }));
  const patientField = fields.find((field) => field.label === "Patient");
  const patient = splitPatientName(patientField?.value);
  const profile = documentProfile(ocr.document?.id);
  const enriched = profileFindings(ocr);
  const medicines = uniqueFindings([...fields.filter((field) => MEDICATION_LABELS.has(field.label)), ...enriched.filter((field) => field.kind === "medication")]);
  const actions = uniqueFindings([...fields.filter((field) => ACTION_LABELS.has(field.label)), ...enriched.filter((field) => ["action", "safety-net"].includes(field.kind))]);
  const diagnoses = uniqueFindings([...fields.filter((field) => field.label === "Diagnosis"), ...enriched.filter((field) => ["diagnosis", "condition"].includes(field.kind))]);
  const observations = uniqueFindings([...fields.filter((field) => TERM_LABELS.has(field.label) && field.label !== "Diagnosis"), ...enriched.filter((field) => ["symptom", "observation", "finding", "investigation"].includes(field.kind))]);
  const structuredObservations = extractStructuredObservations(observations);
  const codingEvidence = uniqueFindings([
    ...fields.filter((field) => TERM_LABELS.has(field.label)),
    ...enriched.filter((field) => !["medication", "action", "safety-net"].includes(field.kind) && field.assertion !== "negated"),
  ]);
  const bloodPressureByValue = new Map(structuredObservations.map((item) => [normalise(item.sourceValue), item]));
  const terminologyCandidates = uniqueTerminologyCandidates([...codingEvidence.map((field) => {
    const structured = bloodPressureByValue.get(normalise(field.value));
    return {
    sourceLabel: field.label,
    sourceValue: field.value,
    searchTerm: field.value,
    conceptId: structured?.conceptId || null,
    descriptionId: null,
    preferredTerm: structured?.preferredTerm || null,
    assertion: field.assertion || "present",
    scheme: 2,
    codeSystem: "SNOMED CT UK Edition",
    system: SNOMED_SYSTEM,
    terminologyVersionChecked: structured?.terminologyVersionChecked || null,
    status: structured ? "governed_concept_candidate_human_review_required" : "terminology_lookup_required",
    acceptedByUid: null,
    };
  }), ...structuredObservations.filter((observation) => observation.type === "blood_pressure").flatMap((observation) => [
    {
      sourceLabel: "Systolic blood pressure",
      sourceValue: `${observation.systolic.value} ${observation.unit.display}`,
      searchTerm: observation.systolic.preferredTerm,
      conceptId: observation.systolic.conceptId,
      descriptionId: null,
      preferredTerm: observation.systolic.preferredTerm,
      assertion: "present",
      component: "systolic",
      scheme: 2,
      codeSystem: "SNOMED CT UK Edition",
      system: SNOMED_SYSTEM,
      terminologyVersionChecked: observation.terminologyVersionChecked,
      status: "governed_concept_candidate_human_review_required",
      acceptedByUid: null,
    },
    {
      sourceLabel: "Diastolic blood pressure",
      sourceValue: `${observation.diastolic.value} ${observation.unit.display}`,
      searchTerm: observation.diastolic.preferredTerm,
      conceptId: observation.diastolic.conceptId,
      descriptionId: null,
      preferredTerm: observation.diastolic.preferredTerm,
      assertion: "present",
      component: "diastolic",
      scheme: 2,
      codeSystem: "SNOMED CT UK Edition",
      system: SNOMED_SYSTEM,
      terminologyVersionChecked: observation.terminologyVersionChecked,
      status: "governed_concept_candidate_human_review_required",
      acceptedByUid: null,
    },
  ])]);
  const medicationCandidates = medicines.map((field) => ({
    sourceValue: field.value,
    searchTerm: field.value,
    code: null,
    preferredTerm: null,
    codeSystem: "dm+d",
    status: "terminology_lookup_required",
    acceptedByUid: null,
  }));
  const governedProfile = SYNTHETIC_CLINICAL_PROFILES[ocr.document?.id];
  const profileQualityPrompts = (governedProfile?.qualityPrompts || []).map(([title, domain, rationale, nextStep]) => ({
    title,
    domain,
    rationale,
    nextStep,
    status: "patient_record_check_required",
    framework: "Wales GMS Unified Contract / local governed ruleset required",
  }));
  const lowerText = clean(ocr.content).toLowerCase();
  const urgent = ocr.document?.id?.includes("emergency") || /\burgent\b|immediate review|same day/.test(lowerText);
  const medicationChanged = medicines.length > 0 && /start|started|increase|increased|reduce|reduced|stop|stopped|restart|changed/.test(lowerText);
  const actionRequired = actions.length > 0 || urgent || medicationChanged;
  const triage = createClinFlowTriage({ ocr, actions, medicines, diagnoses, observations, urgent, medicationChanged });
  const quality = createClinFlowQualityPrompts({
    ocr,
    findings: [...diagnoses, ...observations, ...medicines, ...actions],
    existingPrompts: profileQualityPrompts,
  });

  const missing = [
    ["patient.identifier", "NHS number"], ["patient.birthDate", "Date of birth"],
    ["document.eventDate", "Clinical event date"], ["clinicalMeaning", "Clinical meaning and actions"],
  ].map(([field, label]) => ({ field, label, status: "clinician_verification_required" }));
  if (!patient.givenNames) missing.push({ field: "patient.givenNames", label: "Patient given names", status: "required" });
  if (!patient.familyName) missing.push({ field: "patient.familyName", label: "Patient family name", status: "required" });
  if (terminologyCandidates.length) missing.push({ field: "clinicalCodes", label: "SNOMED concept and description IDs", status: "required" });

  return {
    schemaVersion: 1,
    status: "draft_human_review_required",
    documentType: profile.type,
    specialty: profile.type.replace(/ (clinic letter|summary|note|handover)$/i, ""),
    patient: { ...patient, identifier: "", birthDate: "", gender: 0, matchStatus: "unverified" },
    medicines,
    medicationCandidates,
    actions,
    observations,
    structuredObservations,
    diagnoses,
    terminologyCandidates,
    triage,
    clinicalTriggers: triage.clinicalTriggers,
    nfwfAssessment: triage.nfwf,
    workflowDecision: triage.workflowDecision,
    qaifOpportunities: [],
    qualityPrompts: quality.prompts,
    qualityAwareness: quality.awareness,
    docmanDraft: {
      captureSource: 2,
      sender: { odsCode: "", organisation: "", department: "", person: "", group: "" },
      recipientOdsCode: "",
      patient: { identifier: "", ...patient, gender: 0, birthDate: "" },
      document: { description: profile.type, eventDate: "", folder: profile.folder, filingSectionFolder: "", fileExtension: "pdf", externalSystemId: ocr.analysisId || "" },
      actionRequired,
      medicationChanged,
      urgent,
      inpatient: profile.inpatient,
      outpatient: profile.outpatient,
      clinicalCodes: terminologyCandidates,
      notes: "Primovex synthetic analysis draft — human verification required before transfer.",
    },
    missing,
    readyForDocman: false,
    manualDocmanProcess: true,
    warnings: [
      "OCR evidence is not a patient match.",
      "SNOMED suggestions require live UK terminology validation and human acceptance.",
      "The summary and original must be checked by a trained clinician before manual filing in Docman.",
      "Primovex does not transmit, code or file the document automatically.",
    ],
  };
}
