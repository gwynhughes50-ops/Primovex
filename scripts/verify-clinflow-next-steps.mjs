import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OWNERS, buildNextSteps, classifyAction, whenFrom } from "../src/modules/clinflow/clinflowNextSteps.js";
import { CHOICES, NO_ACTION_REASONS, applyDecision, decisionCounts, describeDecision, makeDecision, stepKey } from "../src/modules/clinflow/clinflowStepDecisions.js";
import { taskPayload } from "../src/modules/clinflow/qualityOpportunityPayload.js";

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
    "Referral",
    "Medicine change",
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
  assert.match(plan.headline.title, /Part of this probably needs a GP/);
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

t("not everything goes to a GP: care the hospital gives and limits to watch are not jobs, and the wording no longer tells anyone what they may not do", () => {
  assert.equal(classifyAction("Continue oral antibiotics").kind, "info");
  assert.equal(classifyAction("Encourage fluids and maintain fluid chart").kind, "info");
  assert.equal(classifyAction("below 92%").kind, "threshold");
  assert.equal(classifyAction("U&E").kind, "bloods", "a bare test name is a repeat of that test");
  assert.equal(classifyAction("Review blood pressure at the practice").kind, "appointment");
  const plan = buildNextSteps(analysis({ actions: [item("Continue oral antibiotics"), item("below 92%"), item("Stop ramipril and start losartan")] }));
  const text = plan.steps.map((x) => x.detail).join(" ");
  assert.ok(!/Do not act on it yourself|must decide|Only a GP can/.test(text), "nothing says a person may not deal with it themselves");
  assert.match(text, /Choose who deals with it/);
  assert.ok(plan.steps.every((x) => x.kind), "every step says what kind it is, for the audit");
  assert.deepEqual(plan.steps.map((x) => x.kind).slice(0, 2), ["identity", "medicine"]);
});

t("the person decides each step: do it, send it, or no action with a reason; every choice is dated and signed, and can be changed with the earlier one kept", () => {
  const step = { kind: "bloods", because: "Repeat U&Es in 2 weeks", title: "Book a blood test in 2 weeks", owner: OWNERS.nurse };
  const key = stepKey(step);
  assert.equal(key, "bloods|repeat u&es in 2 weeks");
  assert.equal(stepKey({ kind: "bloods", because: "REPEAT  U&Es   in 2 weeks" }), key, "the same step, however it is spaced");
  const at = new Date("2026-10-27T10:00:00Z");
  const self = makeDecision("self", { byUid: "u1", byName: "Ann Admin", at });
  assert.deepEqual([self.choice, self.byName, self.at], ["self", "Ann Admin", "2026-10-27T10:00:00.000Z"]);
  assert.equal(describeDecision(self), "You are doing this by Ann Admin");
  assert.equal(makeDecision("none", { byUid: "u1", reason: "" }), null, "no action needs a reason");
  assert.equal(makeDecision("none", { byUid: "u1", reason: "because I said so" }), null, "a reason from the list");
  assert.equal(describeDecision(makeDecision("none", { byName: "Ann", reason: NO_ACTION_REASONS[2], at })), "No action needed: The hospital is arranging it by Ann");
  assert.equal(describeDecision(makeDecision("sent", { byName: "Ann", to: "the Nurse / HCA team (2 people)", at })), "Sent to the Nurse / HCA team (2 people) by Ann");
  assert.equal(makeDecision("explode"), null);
  let decisions = applyDecision({}, key, self);
  decisions = applyDecision(decisions, key, makeDecision("done", { byUid: "u1", byName: "Ann Admin", at }));
  assert.equal(decisions[key].choice, "done");
  assert.equal(decisions[key].history[0].choice, "self", "the earlier choice is kept");
  assert.deepEqual(applyDecision(decisions, key, null), {}, "changing puts it back to undecided");
  assert.deepEqual(Object.keys(CHOICES), ["self", "done", "sent", "none"]);
});

t("the counts for the audit say how many steps were decided and how, never the words", () => {
  const plan = buildNextSteps(analysis({ actions: [item("Repeat spirometry in 6 weeks"), item("Urgent referral to cardiology")] }), { waiting: 2 });
  const [first, second, third] = plan.steps;
  let decisions = applyDecision({}, stepKey(first), makeDecision("self", { byUid: "u" }));
  decisions = applyDecision(decisions, stepKey(second), makeDecision("sent", { byUid: "u", to: "Gwen GP" }));
  decisions = applyDecision(decisions, stepKey(third), makeDecision("none", { byUid: "u", reason: NO_ACTION_REASONS[0] }));
  const counts = decisionCounts(plan.steps, decisions);
  assert.deepEqual([counts.steps, counts.self, counts.sent, counts.none, counts.done], [plan.steps.length, 1, 1, 1, 0]);
  assert.equal(counts.undecided, plan.steps.length - 3);
  assert.ok(!JSON.stringify(counts).includes("spirometry"));
});

t("a step can be sent as a task, and the screen and the audit are wired", () => {
  const step = { kind: "bloods", title: "Book a blood test in 2 weeks", because: "Repeat U&Es in 2 weeks", detail: "Book the patient with the nurse.", when: "in 2 weeks", owner: OWNERS.nurse };
  const payload = taskPayload({ step, analysis: { patient: { givenNames: "David", familyName: "Jones" }, docmanDraft: { patient: { identifier: "9434765919", birthDate: "1954-06-12" } } }, letterRef: "cf-1", role: "Nurse / HCA" });
  assert.equal(payload.kind, "task");
  assert.equal(payload.title, "Book a blood test in 2 weeks");
  assert.equal(payload.rationale, "The letter says: Repeat U&Es in 2 weeks");
  assert.equal(payload.urgent, false);
  assert.equal(payload.role, "Nurse / HCA");
  assert.equal(payload.patient.initials, "DJ");
  assert.equal(taskPayload({ step: { kind: "urgent", title: "Take it to a GP today", when: "today" }, analysis: {}, letterRef: "x", toUid: "u1", includePatient: false }).urgent, true);
  const workspace = read("src/modules/clinflow/ClinFlowWorkspace.jsx");
  assert.match(workspace, /track\("clinflow\.step\.decide"/);
  assert.match(workspace, /\.\.\.stepsOf\(selected\), \.\.\.versionsInUse\(\)/, "the Docman download records how many steps were decided");
  assert.match(workspace, /\.\.\.stepsOf\(updated\), \.\.\.versionsInUse\(\)/, "so does finishing the letter");
  const screen = read("src/modules/clinflow/NextSteps.jsx");
  for (const words of ["I'll do this", "Send to a colleague", "No action needed", "Mark done", "Only a suggestion"]) assert.ok(screen.includes(words), words);
  assert.match(screen, /Suggested: \{step\.owner\}/);
  assert.match(read("functions/services/qualityOpportunityService.js"), /KINDS = \["quality", "triage", "task"\]/);
});

console.log(`
${n} passed`);
