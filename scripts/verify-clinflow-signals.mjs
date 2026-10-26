import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { identityChecks, isCommonForename, isCommonSurname, letterSignals, matchPatient } from "../src/modules/clinflow/clinflowSignals.js";
import { buildNextSteps } from "../src/modules/clinflow/clinflowNextSteps.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const ids = (letter) => letterSignals(letter).map((s) => s.id);

t("a complaint or concern is recognised, and a clinical 'complaint' is not mistaken for one", () => {
  assert.ok(ids("I am writing to complain about the way my mother was treated by your receptionist.").includes("complaint"));
  assert.ok(ids("This is a formal complaint regarding the delay in her referral.").includes("complaint"));
  assert.ok(ids("We are very unhappy with the care Mr Evans received and wish to raise our concerns about the service.").includes("complaint"));
  assert.ok(ids("I have concerns about the treatment my husband received at the surgery.").includes("complaint"));
  assert.equal(ids("Presenting complaint: chest pain for two days. Complains of cough and breathlessness.").includes("complaint"), false);
  assert.equal(ids("No complaints from the patient. He is happy with the plan.").includes("complaint"), false);
  assert.equal(ids("").length, 0);
});

t("legal and ombudsman letters, incidents and safeguarding are recognised and sent to the right person", () => {
  const legal = letterSignals("We act for Mrs Jones in a claim for clinical negligence and request her records.").find((s) => s.id === "legal");
  assert.equal(legal.owner, "Practice manager");
  assert.ok(ids("The Public Services Ombudsman for Wales has asked for a response.").includes("legal"));
  assert.ok(ids("A medication error occurred: the wrong dose was given on the ward.").includes("incident"));
  const safeguarding = letterSignals("There are safeguarding concerns about the children at home.").find((s) => s.id === "safeguarding");
  assert.equal(safeguarding.owner, "Safeguarding lead");
  assert.ok(ids("She disclosed suicidal thoughts at the appointment.").includes("safeguarding"));
  assert.equal(ids("No safeguarding concerns were identified. He denies self-harm.").includes("safeguarding"), false, "a concern ruled out is not a concern");
});

t("an onward referral is flagged when it is needed, noted when it was already made, and the service is named", () => {
  const needed = letterSignals("Please refer Mr Smith to the cardiology team for echocardiography.").find((s) => s.id === "referral-needed");
  assert.ok(needed);
  assert.match(needed.title, /Onward referral needed: cardiology team/);
  assert.equal(needed.owner, "GP");
  assert.ok(ids("I would suggest a referral to the memory clinic.").includes("referral-needed"));
  assert.ok(ids("The GP to refer to physiotherapy if symptoms persist.").includes("referral-needed"));
  assert.ok(ids("He needs an onward referral.").includes("referral-needed"));
  const made = ids("We have referred her to the dermatology department and she will be contacted.");
  assert.ok(made.includes("referral-made") && !made.includes("referral-needed"));
  assert.equal(ids("Seen in clinic today, stable, no changes.").some((id) => id.startsWith("referral")), false);
});

t("misdirected letters, suspected cancer, deaths and moves are recognised", () => {
  assert.equal(ids("Apologies for the error: this letter was sent in error and is not your patient.")[0], "misdirected", "the wrong-practice letter comes first");
  assert.ok(ids("Referred on the two week wait suspected cancer pathway.").includes("cancer"));
  assert.ok(ids("Mr Davies passed away peacefully on 3 October.").includes("death"));
  assert.ok(ids("The patient has moved to Cardiff and is no longer registered.").includes("registration"));
  assert.ok(ids("Her family history includes a death from lung cancer at 50.").indexOf("death") === -1, "a family history is not a death");
  const order = ids("Sent in error. Safeguarding concern. Please refer to ENT. Formal complaint.");
  assert.deepEqual(order, ["misdirected", "safeguarding", "complaint", "referral-needed"], "most urgent first");
});

t("common names are recognised and the person is asked to double-check, with the reason", () => {
  assert.equal(isCommonSurname("Jones"), true);
  assert.equal(isCommonSurname("Hughes"), true);
  assert.equal(isCommonSurname("Pryderi"), false);
  assert.equal(isCommonForename("David"), true);
  assert.equal(isCommonForename("Gwyneth Mair"), true);
  const full = identityChecks({ givenNames: "David", familyName: "Jones", nhsNumber: "943 476 5919", birthDate: "1954-06-12" });
  assert.equal(full.level, "high");
  assert.equal(full.commonName, true);
  assert.match(full.reasons[0], /“David Jones” is a very common name/);
  const surname = identityChecks({ givenNames: "Ffion", familyName: "Williams", nhsNumber: "9434765919", birthDate: "1990-01-01" });
  assert.match(surname.reasons[0], /“Williams” is one of the commonest surnames/);
  const rare = identityChecks({ givenNames: "Ffion", familyName: "Pryderi", nhsNumber: "9434765919", birthDate: "1990-01-01" });
  assert.equal(rare.level, "check");
  assert.equal(rare.commonName, false);
  assert.equal(rare.reasons.length, 1, "only the standing reminder");
});

t("missing or doubtful identifiers are said, and the lack of a record match is always said", () => {
  const poor = identityChecks({ givenNames: "J", familyName: "Smith", nhsNumber: "943 476 5918", birthDate: "" });
  const text = poor.reasons.join("\n");
  assert.match(text, /Only initials/);
  assert.match(text, /does not pass its check digit/);
  assert.match(text, /no date of birth/);
  assert.equal(poor.level, "high");
  assert.match(identityChecks({ givenNames: "Ffion", familyName: "Pryderi", nhsNumber: "", birthDate: "1990-01-01" }).reasons.join(" "), /no NHS number/);
  assert.match(identityChecks({ givenNames: "", familyName: "Pryderi", nhsNumber: "9434765919", birthDate: "1990-01-01" }).reasons.join(" "), /do not file it on a name alone/);
  assert.equal(matchPatient, null, "no link to the clinical system yet");
  assert.match(identityChecks({}).reasons.at(-1), /cannot match the patient to the practice record yet/);
  const age = identityChecks({ givenNames: "Ffion", familyName: "Pryderi", nhsNumber: "9434765919", birthDate: "1954-06-12", letterDate: "2026-10-01" }, "Mrs Pryderi is a 58 year old lady.");
  assert.match(age.reasons.join(" "), /says the patient is 58, but the date of birth makes them 72/);
  const two = identityChecks({ givenNames: "Ffion", familyName: "Pryderi", nhsNumber: "9434765919", birthDate: "1990-01-01" }, "Dear Dr Hall, re Mrs Pryderi. Her husband Mr Roberts attended with her.");
  assert.match(two.reasons.join(" "), /names more than one person \(Pryderi, Roberts\)/);
});

t("the steps put the right person first: a complaint goes to the practice manager, a referral to a GP, a common name is double-checked", () => {
  const analysis = (extra = {}) => ({ actions: [], medicationInstructions: [], safetyNettingAdvice: null, patient: { givenNames: "David", familyName: "Jones" }, triage: { decision: "routine", destination: "GP", reasons: [] }, docmanDraft: { urgent: false, patient: { identifier: "9434765919", birthDate: "1954-06-12" }, document: { eventDate: "2026-05-14" } }, ...extra });
  const complaint = buildNextSteps(analysis(), {}, "I wish to make a formal complaint about the care my father received.");
  assert.equal(complaint.headline.tone, "warning");
  assert.match(complaint.headline.title, /complaint or concern: pass it to the practice manager today/);
  const owners = complaint.steps.map((s) => `${s.owner}: ${s.title}`);
  assert.equal(owners[0], "Admin: Check it is the right patient");
  assert.match(owners[1], /Practice manager: This letter may contain a concern or complaint/);
  assert.equal(complaint.steps[0].when, "check carefully", "David Jones is a common name");
  assert.ok(complaint.steps[0].points.some((p) => /very common name/.test(p)));
  const referral = buildNextSteps(analysis(), {}, "Please refer him to the pain clinic.");
  assert.ok(referral.steps.some((s) => s.owner === "GP" && /Onward referral needed: pain clinic/.test(s.title)));
  assert.equal(referral.headline.tone, "warning");
  const wrong = buildNextSteps(analysis(), {}, "Sent in error: not your patient.");
  assert.equal(wrong.headline.tone, "danger");
  assert.equal(wrong.steps[0].title.startsWith("This letter may not be for this practice"), true, "stop comes before everything, even the patient check");
  const urgentComplaint = buildNextSteps(analysis({ docmanDraft: { urgent: true, patient: {}, document: {} } }), {}, "A formal complaint.");
  assert.match(urgentComplaint.headline.title, /Urgent/);
  assert.match(urgentComplaint.headline.detail, /may also be a complaint/);
  const duplicate = buildNextSteps(analysis({ actions: [{ value: "Urgent referral to cardiology" }] }), {}, "Please refer him to cardiology.");
  assert.equal(duplicate.steps.filter((s) => /referral/i.test(s.title)).length, 1, "the letter's own action and the wording are one step, not two");
  assert.ok(!/fetch\(|axios|XMLHttpRequest/.test(read("src/modules/clinflow/clinflowSignals.js")), "nothing is sent anywhere");
  assert.match(read("src/modules/clinflow/ClinFlowWorkspace.jsx"), /<NextSteps analysis=\{analysis\} letter=\{ocr\?\.content/);
});

console.log(`\n${n} passed`);
