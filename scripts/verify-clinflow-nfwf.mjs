import assert from "node:assert/strict";
import { analyseClinFlowOcr } from "../src/modules/clinflow/clinflowAnalysisService.js";
import { findPracticeRequests } from "../src/modules/clinflow/clinflowTriageService.js";

// "NFWF" = a letter that needs no further work from the practice. Calling an action-needed letter NFWF is the dangerous mistake (a request is missed), so the
// rule is: no letter that asks something of the practice may ever be suggested as NFWF, whatever the AI says. Finding the genuine no-action letters is the
// helpful part. The same 24 invented letters are in the "nfw" test folder as PDFs so they can be run through the live pipeline as well.
const E = (o = {}) => ({ patientName: "Test Patient", diagnoses: [], currentMedications: [], medicationInstructions: [], actions: [], observations: [], clinicalConclusion: null, documentUrgent: false, medicationChangePresent: false, safetyNettingAdvice: null, ...o });
// expect: nfwf = nothing for the practice to do; work = the practice must act; urgent
const LETTERS = [
  ["N1 discharged, nothing for GP", "nfwf", "Thank you for seeing Mr Hall in clinic today. His asthma is well controlled. I have discharged him from clinic. There are no changes to his medication. No action is required from the GP.", E({ diagnoses: ["asthma"], currentMedications: ["Salbutamol inhaler"] })],
  ["N2 normal echo, no stock phrase", "nfwf", "Mrs Price had her echocardiogram today. The study was normal. I have reassured her and there is no need for any further investigation. A copy of this letter has been sent to her.", E({ observations: ["Echocardiogram normal"] })],
  ["N3 benign, plain wording", "nfwf", "I reviewed Mr Evans' skin lesion. It is a benign seborrhoeic keratosis. I explained this to him. I have not made any changes to his treatment and I will not be arranging a further review.", E({ diagnoses: ["Seborrhoeic keratosis"] })],
  ["N4 hospital arranging follow-up", "nfwf", "Seen today with her knee pain. She will have an MRI scan which we will arrange and I will review her in 3 months in clinic. Continue current medication. For your information.", E({ diagnoses: ["Knee pain"], currentMedications: ["Paracetamol"], actions: ["MRI scan arranged by the hospital", "Review in clinic in 3 months"] })],
  ["N5 records only", "nfwf", "This letter is for your records only. Mr Jones attended the fracture clinic and was discharged with a healed wrist fracture. Nothing further is required from your practice.", E({ diagnoses: ["Healed wrist fracture"] })],
  ["N6 radiology normal", "nfwf", "Chest X-ray: no abnormality detected. Heart size and lung fields are normal. No further action.", E({ observations: ["Chest X-ray normal"] })],
  ["N7 screening negative", "nfwf", "Cervical screening result: HPV negative. Routine recall in 3 years will be sent by the screening service.", E({ observations: ["HPV negative"] })],
  ["N8 A&E treated and discharged", "nfwf", "Attended the Emergency Department with a minor head injury. Observed for four hours, no concerns, discharged home with head injury advice leaflet. No follow-up arranged or required.", E({ diagnoses: ["Minor head injury"], safetyNettingAdvice: "Return if vomiting or drowsy" })],
  ["N9 INR therapeutic", "nfwf", "INR 2.4, therapeutic. No change to warfarin dose. Next INR in 4 weeks has been booked with the anticoagulation clinic. No further action.", E({ observations: ["INR 2.4"], currentMedications: ["Warfarin"] })],
  ["N10 nothing from your end", "nfwf", "Thank you for referring Miss Davies. Her ultrasound was reassuring. Nothing further is needed from your end and she has been discharged.", E({ observations: ["Ultrasound reassuring"] })],

  ["W1 no hospital action but GP repeat sodium", "work", "No further action is needed from the hospital. Please could the GP repeat his sodium in two weeks.", E({ actions: ["Repeat sodium in two weeks"] })],
  ["W2 same, action missed by the AI", "work", "No further action is needed from the hospital. Please could the GP repeat his sodium in two weeks.", E()],
  ["W3 for info + new drug", "work", "For information. I have started ramipril 2.5mg once daily. Please check U&Es in 1 week.", E({ currentMedications: ["Ramipril 2.5mg"] })],
  ["W4 no change, consider referral", "work", "No change in treatment. However I would be grateful if you could consider referring her to rheumatology.", E()],
  ["W5 GP to monitor BP", "work", "Continue current treatment. The GP to monitor her blood pressure and titrate amlodipine as tolerated.", E()],
  ["W6 update the record", "work", "For your records. Please update her record: she is allergic to penicillin (rash).", E()],
  ["W7 new medicines on discharge", "work", "Discharged today. Apixaban started for atrial fibrillation. No further hospital follow-up.", E({ medicationChangePresent: true, diagnoses: ["Atrial fibrillation"] })],
  ["W8 DNA discharged back", "work", "Mr Khan did not attend his appointment and has been discharged back to your care. Patient informed.", E()],
  ["W9 raised PSA repeat", "work", "Results discussed with patient. The PSA is 9.2, which is raised. Please repeat in 6 weeks.", E({ observations: ["PSA 9.2"] })],
  ["W10 died", "work", "I am sorry to inform you that Mr Roberts passed away on 3 October. For information.", E()],
  ["W11 negated info phrase then request", "work", "No change in treatment. No GP action is needed for the cardiology plan. GP to review blood pressure in 4 weeks.", E()],
  ["W12 result still awaited", "work", "Chest X-ray requested. We are awaiting the result and will write again. Patient informed. Continue current treatment.", E({ observations: ["Chest X-ray requested"] })],
  ["W13 dose reduced, info only wording", "work", "For information only. Her prednisolone was reduced to 5mg daily.", E({ medicationChangePresent: true })],
  ["W14 new diagnosis to code", "work", "Diagnosis: type 2 diabetes mellitus, newly diagnosed. HbA1c 62. For information. Diabetes review to be booked by the practice.", E({ diagnoses: ["Type 2 diabetes"], observations: ["HbA1c 62"] })],
  ["U1 suspected cancer", "urgent", "Urgent two week wait referral: suspected cancer. Please see her this week.", E({ documentUrgent: true })],
];

const sentences = (text) => text.split(/(?<=[.!?])\s+/);
const quoteOf = (text) => sentences(text).find((s) => /\bno |nothing|normal|discharg|for (?:your )?(?:info|record)|benign|negative|not made/i.test(s)) || sentences(text).at(-1);
// How the AI reads each letter in the three scenarios
const scenarios = {
  // the AI reads it correctly: says no action only for the genuine ones
  "AI reads correctly": (kind, text, llm) => ({ ...llm, noActionRequired: kind === "nfwf", noActionQuote: kind === "nfwf" ? quoteOf(text) : null, requestsOfPractice: [] }),
  // the AI is wrong on every letter: says nothing is needed, with a real quote, and lists no requests, actions, medication change or urgency
  "AI wrong on everything": (kind, text, llm) => ({ ...llm, actions: [], medicationChangePresent: false, documentUrgent: false, noActionRequired: true, noActionQuote: quoteOf(text), requestsOfPractice: [] }),
  // no AI reading of the new kind at all (older letters)
  "No AI reading": (kind, text, llm) => llm,
};

const run = (text, llm) => analyseClinFlowOcr({ content: text, document: { id: "x" }, llmExtraction: llm }).triage;
const results = {};
for (const [scenario, shape] of Object.entries(scenarios)) {
  const rows = LETTERS.map(([name, kind, text, llm]) => ({ name, kind, triage: run(text, shape(kind, text, llm)) }));
  results[scenario] = rows;
  const unsafe = rows.filter((r) => r.kind !== "nfwf" && r.triage.decision === "no_workflow");
  const found = rows.filter((r) => r.kind === "nfwf" && r.triage.decision === "no_workflow");
  const total = rows.filter((r) => r.kind === "nfwf").length;
  console.log(`${scenario}: no-action letters found ${found.length}/${total}; action-needed letters wrongly called NFWF: ${unsafe.length}`);
  unsafe.forEach((r) => console.log(`   UNSAFE: ${r.name}`));
  assert.equal(unsafe.length, 0, `${scenario}: a letter that needs action was suggested as NFWF`);
}

// the helpful half: with the AI reading correctly, every genuine no-action letter is found
const correct = results["AI reads correctly"];
const missed = correct.filter((r) => r.kind === "nfwf" && r.triage.decision !== "no_workflow");
missed.forEach((r) => console.log(`   MISSED with a correct AI: ${r.name} -> ${r.triage.decision} (${r.triage.nfwf.blockers.join("; ") || "no evidence"})`));
assert.equal(missed.length, 0, "with a correct AI reading every genuine no-action letter should be suggested as NFWF");
// even without the AI's new reading, most plain no-action letters are found by the rules alone
const rulesOnly = results["No AI reading"].filter((r) => r.kind === "nfwf" && r.triage.decision === "no_workflow").length;
assert.ok(rulesOnly >= 8, `the rules alone should find most no-action letters (found ${rulesOnly} of 10)`);

// an urgent letter stays urgent, and a past attendance at the Emergency Department is not an urgent instruction
assert.equal(correct.find((r) => r.name.startsWith("U1")).triage.decision, "urgent");
assert.notEqual(correct.find((r) => r.name.startsWith("N8")).triage.decision, "urgent");
assert.equal(run("Please attend the Emergency Department today.", E()).decision, "urgent", "a direct instruction to attend is still urgent");
assert.notEqual(run("Return to the Emergency Department if he develops vomiting.", E()).decision, "urgent", "advice for later is not urgent");

// the AI cannot make up its evidence: a quote that is not in the letter is ignored
const invented = run("Seen in clinic today. Plan to be confirmed.", E({ noActionRequired: true, noActionQuote: "Nothing further is required from the practice." }));
assert.notEqual(invented.decision, "no_workflow", "an invented quote is not evidence");
const real = run("Seen in clinic today. Nothing further is required from the practice.", E({ noActionRequired: true, noActionQuote: "Nothing further is required from the practice." }));
assert.equal(real.decision, "no_workflow");
assert.match(real.nfwf.reasons.join(" "), /the AI read/, "the quote the AI relied on is shown");

// a letter longer than the part the AI reads cannot be suggested as NFWF on the AI's word
const longLetter = `Seen in clinic. Nothing further is required from the practice. ${"The examination was unremarkable. ".repeat(450)}`;
assert.notEqual(run(longLetter, E({ noActionRequired: true, noActionQuote: "Nothing further is required from the practice." })).decision, "no_workflow");

// the AI saying a request exists is enough to stop NFWF even if the words are unusual
const flagged = run("Seen in clinic. Nothing further is required from the hospital.", E({ noActionRequired: false, requestsOfPractice: ["Practice to recheck the potassium"] }));
assert.notEqual(flagged.decision, "no_workflow");
assert.ok(flagged.nfwf.blockers.some((b) => /AI/.test(b)));

// the request finder: soft and hard requests are found, the negated frame is not, and a negated frame does not hide a request in the same sentence
assert.equal(findPracticeRequests("Nothing further is required from your practice.").length, 0);
assert.equal(findPracticeRequests("No action is needed from the hospital, but please could the GP repeat it.").length, 1);
assert.equal(findPracticeRequests("Please find enclosed the discharge summary. Please do not hesitate to contact me.").length, 0);
assert.ok(findPracticeRequests("I would be grateful if you could consider starting a statin.").length >= 1);
assert.equal(findPracticeRequests("").length, 0);

// the suggestion is only ever a suggestion
assert.equal(real.requiresHumanConfirmation, true);
console.log("\nok  nfwf checks passed");
