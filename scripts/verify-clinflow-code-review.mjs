import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  addCode, addProblem, candidateKey, codesAfterReview, decide, emptyReview, findEvidence, removeAdded, reviewRows, reviewStats, snomedIdProblem, statsLine,
} from "../src/modules/clinflow/clinflowCodeReview.js";
import { buildDocmanPayload } from "../src/modules/clinflow/docmanPayload.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const now = new Date("2026-10-26T10:00:00Z");
const who = { uid: "gp-1", name: "Dr Example", now };

const LETTER = `Glan Clwyd Hospital
Cardiology Department

Dear Dr Other
Re: Mr John Smith

Mr Smith was reviewed today for atrial fibrillation. He remains symptomatic with exertional dyspnoea. Echocardiogram shows mild left ventricular dysfunction.

Plan
Increase Bisoprolol to 5 mg once daily
Continue Apixaban 5 mg twice daily
Repeat U&Es in 2 weeks
Review in 3 months
Blood pressure today was 132/84 mmHg.`;

// a valid SNOMED id built by finding the check digit that passes
const validId = (body, kind) => { for (let d = 0; d < 10; d += 1) if (!snomedIdProblem(`${body}${d}`, kind)) return `${body}${d}`; throw new Error("no check digit"); };
const description = validId("12345001", "description");

const candidates = [
  { sourceLabel: "Diagnosis", sourceValue: "atrial fibrillation", searchTerm: "atrial fibrillation", conceptId: "49436004", preferredTerm: "Atrial fibrillation", descriptionId: null },
  { sourceLabel: "Diagnosis", sourceValue: "left ventricular dysfunction", searchTerm: "left ventricular dysfunction", conceptId: null, preferredTerm: null, descriptionId: null },
  { sourceLabel: "Observation", sourceValue: "asthma", searchTerm: "asthma", conceptId: "195967001", preferredTerm: "Asthma", descriptionId: null },
  { sourceLabel: "Systolic blood pressure", sourceValue: "132 mmHg", searchTerm: "Systolic blood pressure", conceptId: "271649006", preferredTerm: "Systolic blood pressure", descriptionId: null, component: "systolic" },
];

t("each suggestion is shown with the sentence of the letter behind it, copied from the letter", () => {
  const af = findEvidence(LETTER, "atrial fibrillation");
  assert.equal(af.found, true);
  assert.equal(af.quote, "Mr Smith was reviewed today for atrial fibrillation.");
  assert.ok(LETTER.includes(af.quote), "the quote is a stretch of the letter itself");
  const lv = findEvidence(LETTER, "left ventricular dysfunction");
  assert.equal(lv.found, true);
  assert.equal(lv.quote, "Echocardiogram shows mild left ventricular dysfunction.");
  assert.equal(findEvidence(LETTER, "Apixaban").quote, "Continue Apixaban 5 mg twice daily");
  assert.equal(findEvidence(LETTER, "Bisoprolol").quote, "Increase Bisoprolol to 5 mg once daily");
});

t("a suggestion with nothing in the letter behind it says so, and is never given an invented reason", () => {
  const asthma = findEvidence(LETTER, "asthma");
  assert.deepEqual(asthma, { found: false, quote: "" });
  assert.deepEqual(findEvidence(LETTER, ""), { found: false, quote: "" });
  assert.deepEqual(findEvidence("", "atrial fibrillation"), { found: false, quote: "" });
  assert.equal(findEvidence(LETTER, "diabetes mellitus type 2").found, false, "needs most of the words, not one");
  assert.equal(findEvidence(LETTER, "dyspnoea on exertion").found, true, "most of the words together are enough");
  assert.ok(findEvidence("x".repeat(400) + " atrial fibrillation " + "y".repeat(400), "atrial fibrillation").quote.length <= 260, "a very long line is cut");
});

t("the rows give each suggestion its evidence and where the coder has got to", () => {
  const rows = reviewRows(candidates, LETTER, null);
  assert.deepEqual(rows.map((r) => r.state), ["suggested", "suggested", "suggested", "suggested"]);
  assert.equal(rows[0].evidence.found, true);
  assert.equal(rows[2].evidence.found, false);
  assert.equal(rows[1].conceptId, "", "no code found yet");
  const after = decide(null, candidates[0], "accepted", who);
  assert.equal(reviewRows(candidates, LETTER, after)[0].state, "accepted");
  assert.equal(reviewRows(candidates, LETTER, after)[0].by, "Dr Example");
});

t("a coder can accept, remove and change their mind, and every change is kept with who and when", () => {
  let review = decide(null, candidates[0], "accepted", who);
  review = decide(review, candidates[2], "removed", { ...who, now: new Date("2026-10-26T10:05:00Z") });
  review = decide(review, candidates[2], "suggested", { ...who, now: new Date("2026-10-26T10:06:00Z") });
  assert.deepEqual(Object.keys(review.decisions), [candidateKey(candidates[0])], "put back as a suggestion: no decision left");
  assert.deepEqual(review.log.map((l) => [l.action, l.term, l.byName]), [["accepted", "Atrial fibrillation", "Dr Example"], ["removed", "Asthma", "Dr Example"], ["suggested", "Asthma", "Dr Example"]]);
  assert.equal(review.log[1].at, "2026-10-26T10:05:00.000Z");
  assert.throws(() => decide(review, candidates[0], "deleted", who), /accepted, removed/);
  assert.deepEqual(emptyReview().decisions, {});
});

t("SNOMED identifiers are checked: the check digit catches a typing slip", () => {
  assert.equal(snomedIdProblem("", "concept"), "", "none given is fine");
  for (const id of ["49436004", "195967001", "271649006", "75367002", "364075005", "431314004"]) assert.equal(snomedIdProblem(id, "concept"), "", `real concept ${id}`);
  assert.match(snomedIdProblem("49436005", "concept"), /check digit/, "one digit different");
  assert.match(snomedIdProblem("49436O04", "concept"), /six to eighteen digits/);
  assert.match(snomedIdProblem("123", "concept"), /six to eighteen digits/);
  assert.match(snomedIdProblem("0123456", "description"), /does not start with 0/);
  assert.equal(snomedIdProblem(description, "description"), "");
  assert.match(snomedIdProblem(description, "concept"), /description or relationship/);
  assert.match(snomedIdProblem("49436004", "description"), /looks like a concept ID/);
});

t("a code the reader missed can be added, with its term, and a concept ID that is checked when given", () => {
  assert.match(addProblem({ term: "hi" }), /few words/);
  assert.match(addProblem({ term: "Heart failure", conceptId: "49436005" }), /check digit/);
  assert.match(addProblem({ term: "Heart failure", descriptionId: description }), /needs the concept ID/);
  assert.equal(addProblem({ term: "Heart failure" }), "", "a term alone is kept as a note");
  assert.equal(addProblem({ term: "Atrial fibrillation", conceptId: "49436004" }), "");
  let review = addCode(null, { term: "  Heart   failure ", conceptId: "" }, who);
  assert.equal(review.added[0].term, "Heart failure");
  assert.equal(review.added[0].byName, "Dr Example");
  review = addCode(review, { term: "Atrial fibrillation", conceptId: "49436004", descriptionId: "" }, who);
  assert.equal(review.added.length, 2);
  assert.throws(() => addCode(review, { term: "x" }, who), /few words/);
  review = removeAdded(review, review.added[0].id, who);
  assert.deepEqual(review.added.map((a) => a.term), ["Atrial fibrillation"]);
  assert.equal(review.log.at(-1).action, "took out an added code");
  assert.equal(removeAdded(review, "nope", who), review, "nothing to take out: unchanged");
});

t("only what the coder accepted or added goes towards Docman, and removed codes are gone", () => {
  let review = decide(null, candidates[0], "accepted", who);
  review = decide(review, candidates[2], "removed", who);
  review = addCode(review, { term: "Heart failure", conceptId: "" }, who);
  const codes = codesAfterReview(candidates, review);
  assert.equal(codes.length, 4, "4 suggested, 1 removed, 1 added");
  assert.ok(!codes.some((c) => c.preferredTerm === "Asthma"), "the removed code is gone");
  const af = codes.find((c) => c.preferredTerm === "Atrial fibrillation");
  assert.equal(af.acceptedByUid, "gp-1");
  assert.equal(af.acceptedByName, "Dr Example");
  assert.equal(codes.find((c) => c.component === "systolic").acceptedByUid ?? null, null, "nobody has looked at it yet: still unaccepted");
  assert.equal(codes.at(-1).addedByCoder, true);
  assert.equal(codes.at(-1).acceptedByUid, "gp-1");
});

t("an accepted code still waits for its description ID before Docman would take it", () => {
  const fixed = [{ ...candidates[0], descriptionId: description }];
  const draftWith = (list) => ({ captureSource: 2, sender: { odsCode: "W98001", organisation: "H", department: "D", person: "P" }, recipientOdsCode: "W91001", patient: { identifier: "9434765919", familyName: "S", givenNames: "J", gender: 10, birthDate: "1954-06-12" }, document: { description: "Letter", eventDate: "2026-05-14", fileExtension: "pdf" }, clinicalCodes: list });
  const accepted = decide(null, fixed[0], "accepted", who);
  const result = buildDocmanPayload(draftWith(codesAfterReview(fixed, accepted)), { fileReady: true, now });
  assert.deepEqual(result.payload.ClinicalCodes.map((c) => c.Code), ["49436004"]);
  const noDescription = buildDocmanPayload(draftWith(codesAfterReview(candidates.slice(0, 1), decide(null, candidates[0], "accepted", who))), { fileReady: true, now });
  assert.ok(!("ClinicalCodes" in noDescription.payload), "accepted but no description ID: left out, with the reason listed");
  assert.match(noDescription.problems.find((p) => p.field === "ClinicalCodes").message, /description ID/);
});

t("the figures say how good the reader is: right and missed, from what coders do", () => {
  const zero = reviewStats(candidates, null);
  assert.deepEqual([zero.suggested, zero.accepted, zero.removed, zero.waiting, zero.right], [4, 0, 0, 4, null]);
  let review = decide(null, candidates[0], "accepted", who);
  review = decide(review, candidates[1], "accepted", who);
  review = decide(review, candidates[2], "removed", who);
  review = addCode(review, { term: "Heart failure" }, who);
  review = addCode(review, { term: "Hypertension" }, who);
  const stats = reviewStats(candidates, review);
  assert.deepEqual([stats.accepted, stats.removed, stats.waiting, stats.added, stats.right, stats.missed], [2, 1, 1, 2, 67, 2]);
  assert.equal(statsLine(stats), "4 suggested: 2 accepted, 1 removed, 1 waiting; 2 added by the coder.");
});

t("the screen: the SNOMED tab shows the evidence and the buttons, changes are saved on the letter and recorded in the audit, and only people who can process ClinFlow may change them", () => {
  const panel = read("src/modules/clinflow/CodeReview.jsx");
  for (const text of ["Accept", "Remove", "Put back", "Add a code", "No matching words found in the letter"]) assert.ok(panel.includes(text), text);
  const workspace = read("src/modules/clinflow/ClinFlowWorkspace.jsx");
  assert.match(workspace, /<CodeReview /);
  assert.match(workspace, /can\("clinflow\.workflow"\)/);
  assert.match(workspace, /clinflow\.code_review/);
  assert.match(workspace, /codesAfterReview\(/);
});

console.log(`\n${n} passed`);
