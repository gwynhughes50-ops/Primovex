// "What to do with this letter", in plain words, for the member of staff who opens it. Most letters are first seen by an administrator, who must not be left
// to decide anything clinical: every step says WHO does it, WHEN, and WHY (the words in the letter), and anything about medicines, results, referrals or
// a diagnosis is handed to a clinician. It is built from what the reader found (the letter's follow-up actions, medicine instructions, urgency and safety-net
// advice), so it only ever repeats what the letter says; it adds the standing steps (check the patient, check the codes, file it). Pure (no screens).

const text = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
export const OWNERS = { admin: "Admin", gp: "GP", nurse: "Nurse / HCA", pharmacist: "Pharmacist" };

const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 };
const number = (v) => (WORDS[String(v).toLowerCase()] ?? Number(v));
const UNIT_DAYS = { hour: 1 / 24, day: 1, week: 7, month: 30 };

const dayOf = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? "")); return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null; };
const showDate = (date) => date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

// "repeat U&Es in 2 weeks" -> { label: "in 2 weeks", due: "9 Nov 2026" }; "urgently" -> { label: "today", urgent: true }
export function whenFrom(value, base = null) {
  const s = text(value).toLowerCase();
  if (/\b(?:immediate(?:ly)?|same[\s-]day|today|asap|as soon as possible|emergency)\b/.test(s)) return { label: "today", urgent: true };
  if (/\burgent(?:ly)?\b/.test(s) && !/\d/.test(s)) return { label: "urgently", urgent: true };
  const m = /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\s*(?:(?:-|to)\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\s*)?(hours?|days?|weeks?|months?)\b/.exec(s);
  if (!m) return null;
  const low = number(m[1]); const high = m[2] ? number(m[2]) : low;
  const unit = m[3].replace(/s$/, "");
  const label = `in ${m[2] ? `${low} to ${high}` : low} ${unit}${high === 1 ? "" : "s"}`;
  const days = Math.ceil(high * UNIT_DAYS[unit]);
  return base ? { label, due: showDate(new Date(base.getTime() + days * 86400000)) } : { label };
}

// What an action is, from its words: who does the work and what the administrator does about it
const BLOODS = /\b(?:blood tests?|bloods?|u\s?&\s?es?|fbc|lfts?|tfts?|hba1c|crp|inr|renal function|lipids?|cholesterol|psa|ferritin|vitamin [a-z0-9]+|egfr|electrolytes|sodium|potassium|creatinine)\b/i;
const TESTS = /\b(?:spirometry|ecg|echocardiogram|echo|x-?ray|radiograph|ct|mri|ultrasound|scan|holter|abpm|24[\s-]?h(?:ou)?r (?:tape|bp|blood pressure)|sleep study|dexa|endoscopy|colonoscopy)\b/i;
const MEDS = /\b(?:start|stop|restart|increase|reduce|switch|change|withhold|hold|titrate|prescri\w+|dose|tablets?|inhaler|mg)\b/i;
const REFER = /\b(?:refer(?:ral)?|2ww|two[\s-]week wait|suspected cancer|urgent clinic)\b/i;
const APPT = /\b(?:appointment|review|see (?:him|her|them|the patient)|follow[\s-]?up|clinic|outpatient|opa)\b/i;
const GP_TASK = /\b(?:GP|general practitioner|your practice|primary care)\b/i;
const HOSPITAL_DOES = /\b(?:we will|i will|will be seen|will see|will arrange|we have arranged|has been arranged|will be contacted|will be sent|waiting list)\b/i;

export function classifyAction(value) {
  const s = text(value);
  if (REFER.test(s)) return { kind: "referral", owner: OWNERS.gp, tone: "gp" };
  if (BLOODS.test(s) && /\b(?:repeat|recheck|re-check|check|monitor|measure|test|follow)\b/i.test(s)) return { kind: "bloods", owner: OWNERS.nurse, tone: "nurse" };
  if (TESTS.test(s)) return { kind: "test", owner: OWNERS.admin, tone: "admin" };
  if (MEDS.test(s) && /\b(?:start|stop|restart|increase|reduce|switch|change|withhold|hold|titrate|prescri\w+)\b/i.test(s)) return { kind: "medicine", owner: OWNERS.pharmacist, tone: "pharmacist" };
  if (HOSPITAL_DOES.test(s) && APPT.test(s) && !GP_TASK.test(s)) return { kind: "hospital", owner: OWNERS.admin, tone: "admin" };
  if (APPT.test(s) && !GP_TASK.test(s)) return { kind: "appointment", owner: OWNERS.admin, tone: "admin" };
  return { kind: "clinical", owner: OWNERS.gp, tone: "gp" };
}

// The instruction for each kind, in the words an administrator can act on
const DIRECTIONS = {
  bloods: (what, when) => ({ title: `Book a blood test${when ? ` ${when.label}` : ""}`, detail: `The letter asks for: ${what}. Book the patient with the nurse or healthcare assistant, and set a recall so it is not missed. If the result will need a decision, tell a GP when it comes back.` }),
  test: (what, when) => ({ title: `Arrange the test${when ? ` ${when.label}` : ""}`, detail: `The letter asks for: ${what}. If the practice does this test, book it. If it does not, pass the letter to a GP to request it. Do not book anything the letter does not ask for.` }),
  appointment: (what, when) => ({ title: `Book an appointment${when ? ` ${when.label}` : ""}`, detail: `The letter says: ${what}. Book it with the right clinician for the patient, and tell the patient.` }),
  hospital: (what) => ({ title: "Nothing to book: the hospital will arrange this", detail: `The letter says: ${what}. Put a note on the record. If the patient has not heard from the hospital by the date given, tell a GP.` }),
  medicine: (what) => ({ title: "Medicine change: pass to a GP or pharmacist", detail: `The letter says: ${what}. Do not change anything on the patient's record or prescription yourself. A GP or the practice pharmacist must decide and update it.` }),
  referral: (what) => ({ title: "Referral: pass to a GP to decide", detail: `The letter says: ${what}. Only a GP can decide whether to refer. Put it in the GP's tasks and mark it for their attention.` }),
  clinical: (what) => ({ title: "Pass to a GP to decide", detail: `The letter says: ${what}. This needs a clinical decision, so it goes to a GP. Do not act on it yourself.` }),
};

// analysis: ClinFlow's analysis of the letter. coding: { waiting, accepted } counts from the code review (optional).
// Returns { headline: { tone, title, detail }, steps: [{ id, owner, tone, title, detail, when, due, because }], note }
export function buildNextSteps(analysis, coding = {}) {
  if (!analysis) return { headline: null, steps: [], note: "" };
  const base = dayOf(analysis.docmanDraft?.document?.eventDate);
  const urgent = Boolean(analysis.docmanDraft?.urgent) || analysis.triage?.decision === "urgent";
  const destination = text(analysis.triage?.destination || analysis.workflowDecision?.suggestedDestination) || OWNERS.gp;
  const steps = [];
  const add = (step) => steps.push({ when: "", due: "", because: "", ...step });

  if (urgent) {
    add({ owner: OWNERS.gp, tone: "gp", title: "Take it to a GP today", detail: "The letter says this is urgent. Do not leave it in the queue: hand it to the duty doctor now, then carry on with the steps below.", when: "today", because: analysis.triage?.reasons?.[0]?.detail || "" });
  }
  add({ owner: OWNERS.admin, tone: "admin", title: "Check it is the right patient", detail: "Match the name, date of birth and NHS number on the letter with the practice record. If they do not match, stop and ask the practice manager." });

  const medicationItems = [...(analysis.medicationInstructions || [])];
  const actions = [...(analysis.actions || [])];
  const seen = new Set();
  for (const item of [...actions, ...medicationItems]) {
    const what = text(item.value);
    const key = what.toLowerCase();
    if (!what || seen.has(key)) continue;
    seen.add(key);
    const kind = classifyAction(what);
    const when = whenFrom(what, base);
    const direction = DIRECTIONS[kind.kind](what, when);
    add({ owner: kind.owner, tone: kind.tone, title: direction.title, detail: direction.detail, when: when?.label || "", due: when?.due || "", because: what });
  }
  if (analysis.docmanDraft?.medicationChanged && !steps.some((s) => s.owner === OWNERS.pharmacist)) {
    add({ owner: OWNERS.pharmacist, tone: "pharmacist", title: "Medicine change: pass to a GP or pharmacist", detail: "The letter changes a medicine. Do not change the record yourself: a GP or the practice pharmacist must decide and update it." });
  }
  if (analysis.safetyNettingAdvice) {
    add({ owner: OWNERS.admin, tone: "admin", title: "Keep the safety advice with the letter", detail: "The hospital told the patient what to do if they get worse. No booking is needed. If the patient rings with those symptoms, the clinician must see this advice straight away.", because: text(analysis.safetyNettingAdvice) });
  }
  const waiting = Number(coding.waiting) || 0;
  if (waiting > 0) add({ owner: OWNERS.admin, tone: "admin", title: `Check the clinical codes (${waiting} not checked)`, detail: "Open the Codes tab. Accept the codes that match the letter, remove the ones that do not. If you are not sure, leave it for a clinician." });
  // the order a person does them in: urgent first, the patient check, what a clinician must decide (so it is started early), the bookings, then the tidying up
  const RANK = { urgent: 0, identity: 1, clinician: 2, booking: 3, safety: 4, codes: 5, file: 6 };
  steps.forEach((step) => {
    step.rank = step.title.startsWith("Take it to a GP today") ? RANK.urgent
      : step.title.startsWith("Check it is the right patient") ? RANK.identity
        : [OWNERS.gp, OWNERS.pharmacist].includes(step.owner) ? RANK.clinician
          : step.title.startsWith("Keep the safety") ? RANK.safety
            : step.title.startsWith("Check the clinical codes") ? RANK.codes
              : RANK.booking;
  });
  add({ owner: OWNERS.admin, tone: "admin", title: "File it", detail: "Download the Docman PDF from the Docman tab, drag it into Docman, then press Confirm and Finish.", rank: RANK.file });
  steps.sort((a, b) => a.rank - b.rank);
  steps.forEach((step, i) => { step.id = `s${i + 1}`; step.number = i + 1; delete step.rank; });

  const needsClinician = steps.some((s) => [OWNERS.gp, OWNERS.pharmacist].includes(s.owner));
  const clinician = steps.some((s) => s.owner === OWNERS.gp) ? OWNERS.gp : [OWNERS.nurse, OWNERS.pharmacist].includes(destination) ? destination : OWNERS.gp;
  const headline = urgent
    ? { tone: "danger", title: "Urgent: take this to a GP today", detail: "Do this first. The other steps can wait until a clinician has seen the letter." }
    : needsClinician
      ? { tone: "warning", title: `Needs a ${clinician === OWNERS.nurse ? "nurse" : clinician}: pass this letter on`, detail: "A clinician must decide part of this. You can do the admin steps below at the same time." }
      : steps.length > 3
        ? { tone: "info", title: "Admin can action this", detail: "Do the steps in order, then file it." }
        : { tone: "success", title: "No action needed from the letter", detail: "Check the patient, check the codes, then file it." };
  return { headline, steps, note: "ClinFlow suggests these steps from what the letter says. They are suggestions: check them against the letter. Administrative staff do not make clinical decisions: anything about medicines, results, referrals or a diagnosis goes to a clinician." };
}
