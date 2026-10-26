import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OWNERS, buildNextSteps, classifyAction, whenFrom } from "../src/modules/clinflow/clinflowNextSteps.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const analysis = (extra = {}) => ({
  actions: [], medicationInstructions: [], safetyNettingAdvice: null,
  triage: { decision: "routine", destination: "GP", reasons: [] },
  docmanDraft: { urgent: false, medicationChanged: false, document: { eventDate: "2026-05-14" } },
  ...extra,
});
const item = (value) => ({ value });
const titles = (plan) => plan.steps.map((s) => s.title);

t("a time in the letter becomes a plain deadline, counted from the letter's date", () => {
  const base = new Date(Date.UTC(2026, 4, 14));
  assert.deepEqual(whenFrom("repeat U&Es in 2 weeks", base), { label: "in 2 weeks", due: "28 May 2026" });
  assert.deepEqual(whenFrom("recheck in five to seven days", base), { label: "in 5 to 7 days", due: "21 May 2026" });
  assert.deepEqual(whenFrom("review in 3 months", base), { label: "in 3 months", due: "12 Aug 2026" });
  assert.deepEqual(whenFrom("review within 48 hours", base), { label: "in 48 hours", due: "16 May 2026" });
  assert.deepEqual(whenFrom("please see today"), { label: "today", urgent: true });
  assert.deepEqual(whenFrom("urgent referral"), { label: "urgently", urgent: true });
  assert.equal(whenFrom("continue current treatment"), null);
  assert.deepEqual(whenFrom("recheck in 2 weeks"), { label: "in 2 weeks" }, "no letter date: no due date is made up");
});

t("each action is given to the right person: bookings to admin, bloods to the nurse, decisions to a clinician", () => {
  assert.equal(classifyAction("GP to repeat U&Es in 2 weeks").owner, OWNERS.nurse);
  assert.equal(classifyAction("Repeat spirometry in 6 weeks").owner, OWNERS.admin);
  assert.equal(classifyAction("Review blood pressure at the practice").owner, OWNERS.admin);
  assert.equal(classifyAction("Urgent referral to cardiology").owner, OWNERS.gp);
  assert.equal(classifyAction("Stop ramipril and start losartan 50 mg").owner, OWNERS.pharmacist);
  assert.equal(classifyAction("We will see him in clinic in 3 months").kind, "hospital");
  assert.equal(classifyAction("Consider anticoagulation if AF persists").owner, OWNERS.gp, "anything unclear goes to a clinician, never to admin");
  assert.equal(classifyAction("GP review of the diabetes plan").owner, OWNERS.gp);
});

t("the plan says who, when and why, in order: urgent, the patient check, clinician decisions, bookings, safety advice, codes, filing", () => {
  const plan = buildNextSteps(analysis({
    actions: [item("GP to repeat U&Es in 2 weeks"), item("Urgent referral to cardiology"), item("Repeat spirometry in 6 weeks")],
    medicationInstructions: [item("Stop ramipril")], safetyNettingAdvice: "Call 999 if chest pain",
    docmanDraft: { urgent: false, medicationChanged: true, document: { eventDate: "2026-05-14" } },
  }), { waiting: 3, accepted: 0 });
  assert.deepEqual(titles(plan), [
    "Check it is the right patient",
    "Referral: pass to a GP to decide",
    "Medicine change: pass to a GP or pharmacist",
    "Book a blood test in 2 weeks",
    "Arrange the test in 6 weeks",
    "Keep the safety advice with the letter",
    "Check the clinical codes (3 not checked)",
    "File it",
  ]);
  assert.deepEqual(plan.steps.map((s) => s.number), [1, 2, 3, 4, 5, 6, 7, 8]);
  const bloods = plan.steps.find((s) => s.title.startsWith("Book a blood test"));
  assert.equal(bloods.due, "28 May 2026");
  assert.equal(bloods.because, "GP to repeat U&Es in 2 weeks", "the letter's own words are shown as the reason");
  assert.equal(plan.headline.tone, "warning");
  assert.match(plan.headline.title, /Needs a GP/);
  assert.match(plan.note, /do not make clinical decisions/);
});

t("urgent letters come first, with an instruction an administrator can follow without judgement", () => {
  const plan = buildNextSteps(analysis({ docmanDraft: { urgent: true, document: {} }, triage: { decision: "urgent", destination: "Pharmacist", reasons: [{ detail: "Emergency instruction" }] } }));
  assert.equal(plan.headline.tone, "danger");
  assert.equal(plan.headline.title, "Urgent: take this to a GP today", "always a GP, whatever the usual destination");
  assert.equal(plan.steps[0].title, "Take it to a GP today");
  assert.equal(plan.steps[0].because, "Emergency instruction");
  assert.equal(plan.steps[1].title, "Check it is the right patient");
});

t("a letter that asks for nothing says so, and an admin-only letter says admin can do it", () => {
  const none = buildNextSteps(analysis());
  assert.equal(none.headline.tone, "success");
  assert.match(none.headline.title, /No action needed/);
  assert.deepEqual(titles(none), ["Check it is the right patient", "File it"]);
  assert.ok(!titles(none).some((x) => /codes/.test(x)), "no step about codes when none are waiting");
  const admin = buildNextSteps(analysis({ actions: [item("Repeat spirometry in 6 weeks"), item("Review blood pressure at the practice")] }));
  assert.equal(admin.headline.tone, "info");
  assert.match(admin.headline.title, /Admin can action this/);
  assert.equal(buildNextSteps(null).headline, null);
});

t("nothing clinical is ever given to admin, and the screen is wired in", () => {
  const lines = ["Start apixaban 5 mg", "Increase the dose of bisoprolol", "Refer to the memory clinic", "Consider stopping aspirin", "Discuss the result with the patient", "Check the potassium and renal function", "Book a 24 hour tape"];
  for (const line of lines) {
    const { owner, kind } = classifyAction(line);
    if (["medicine", "referral", "clinical"].includes(kind)) assert.notEqual(owner, OWNERS.admin, `${line}: needs a clinician`);
  }
  const duplicate = buildNextSteps(analysis({ actions: [item("Repeat spirometry in 6 weeks"), item("repeat spirometry in 6 weeks")] }));
  assert.equal(titles(duplicate).filter((x) => x.startsWith("Arrange the test")).length, 1, "the same action twice is one step");
  assert.ok(!/fetch\(|axios|XMLHttpRequest/.test(read("src/modules/clinflow/clinflowNextSteps.js")), "nothing is sent anywhere");
  assert.match(read("src/modules/clinflow/ClinFlowWorkspace.jsx"), /<NextSteps analysis=\{analysis\}/);
  assert.match(read("src/modules/clinflow/NextSteps.jsx"), /What to do with this letter/);
});

console.log(`\n${n} passed`);
