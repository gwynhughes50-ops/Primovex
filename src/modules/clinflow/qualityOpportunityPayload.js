// What a prompt from the quality tab becomes when it is sent, and how the patient's details are shown. Pure (no screens, no server calls), so it can be tested.

const text = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const initialsOf = (given, family) => `${text(given).split(" ").map((p) => p[0] || "").join("")}${text(family).split(" ").map((p) => p[0] || "").join("")}`.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 6);

export const STATUS_WORDS = { new: "New", seen: "Seen", actioned: "Done", declined: "Declined" };

// The patient details a letter offers, as far as it has them: { initials, birthDate, nhsNumber }, or null when it has none
export function patientDetailsFor(analysis) {
  const given = analysis?.patient?.givenNames; const family = analysis?.patient?.familyName;
  const draft = analysis?.docmanDraft?.patient || {};
  const details = {
    initials: initialsOf(given, family),
    birthDate: /^\d{4}-\d{2}-\d{2}/.test(text(draft.birthDate)) ? text(draft.birthDate).slice(0, 10) : "",
    nhsNumber: text(draft.identifier).replace(/\s+/g, ""),
  };
  return details.initials || details.birthDate || details.nhsNumber ? details : null;
}

// How the details are shown to the person who is about to send them, and to the person who receives them
export function patientLine(details) {
  if (!details) return "No patient details were found on this letter.";
  const dob = details.birthDate ? details.birthDate.split("-").reverse().join("/") : "";
  const nhs = /^\d{10}$/.test(details.nhsNumber || "") ? `${details.nhsNumber.slice(0, 3)} ${details.nhsNumber.slice(3, 6)} ${details.nhsNumber.slice(6)}` : details.nhsNumber || "";
  return [details.initials && `Initials ${details.initials}`, dob && `Date of birth ${dob}`, nhs && `NHS number ${nhs}`].filter(Boolean).join(" · ") || "No patient details were found on this letter.";
}

// One prompt from the quality tab, as the server takes it
export function opportunityPayload({ prompt, letterRef, analysis, includePatient = true, note = "", toUid = "", role = "" }) {
  return {
    title: text(prompt?.title), domain: text(prompt?.domain), rationale: text(prompt?.rationale), nextStep: text(prompt?.nextStep),
    source: "ClinFlow letter", letterRef: text(letterRef), note: text(note),
    patient: includePatient ? patientDetailsFor(analysis) : null,
    ...(toUid ? { toUid } : { role }),
  };
}

const TONES = [
  [/respirat|asthma|copd|lung/i, "teal"], [/cardio|heart|hypertens|blood pressure|af\b|atrial|stroke/i, "rose"], [/diabet|endocrin|thyroid/i, "purple"],
  [/renal|kidney|ckd/i, "amber"], [/mental|depress|dementia|learning/i, "pink"], [/cancer|oncol|haemat/i, "indigo"],
];
// the colour a prompt's card is given, from its domain
export const toneOf = (domain) => (TONES.find(([re]) => re.test(String(domain || ""))) || [null, "blue"])[1];
