import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STATUS_WORDS, opportunityPayload, patientDetailsFor, patientLine, toneOf } from "../src/modules/clinflow/qualityOpportunityPayload.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const analysis = (extra = {}) => ({ patient: { givenNames: "David Rhys", familyName: "Jones" }, docmanDraft: { patient: { identifier: "943 476 5919", birthDate: "1954-06-12" } }, ...extra });
const prompt = { title: "Asthma diagnosis and monitoring prompt", domain: "Respiratory / QAIF", rationale: "Asthma wording was detected.", nextStep: "Check the diagnostic pathway.", framework: "QOF" };

t("the patient details offered are initials, date of birth and NHS number, and never the full name", () => {
  const details = patientDetailsFor(analysis());
  assert.deepEqual(details, { initials: "DRJ", birthDate: "1954-06-12", nhsNumber: "9434765919" });
  assert.ok(!JSON.stringify(details).includes("David") && !JSON.stringify(details).includes("Jones"));
  assert.deepEqual(patientDetailsFor({ patient: { givenNames: "Ffion", familyName: "Pryderi" }, docmanDraft: { patient: {} } }), { initials: "FP", birthDate: "", nhsNumber: "" }, "whatever the letter has");
  assert.equal(patientDetailsFor({}), null);
  assert.equal(patientDetailsFor(null), null);
});

t("it is shown to the sender exactly as the recipient will see it", () => {
  assert.equal(patientLine(patientDetailsFor(analysis())), "Initials DRJ · Date of birth 12/06/1954 · NHS number 943 476 5919");
  assert.equal(patientLine({ initials: "FP", birthDate: "", nhsNumber: "" }), "Initials FP");
  assert.equal(patientLine(null), "No patient details were found on this letter.");
});

t("a prompt becomes what the server takes: to a person or to a role, with or without the patient's details", () => {
  const toRole = opportunityPayload({ prompt, letterRef: "cf-azure-1", analysis: analysis(), role: "Business Manager", note: "  Please check at the review clinic " });
  assert.equal(toRole.role, "Business Manager");
  assert.equal("toUid" in toRole, false);
  assert.equal(toRole.title, "Asthma diagnosis and monitoring prompt");
  assert.equal(toRole.nextStep, "Check the diagnostic pathway.");
  assert.equal(toRole.letterRef, "cf-azure-1");
  assert.equal(toRole.note, "Please check at the review clinic");
  assert.equal(toRole.patient.nhsNumber, "9434765919");
  const toPerson = opportunityPayload({ prompt, letterRef: "x", analysis: analysis(), toUid: "u1", includePatient: false });
  assert.equal(toPerson.toUid, "u1");
  assert.equal("role" in toPerson, false);
  assert.equal(toPerson.patient, null, "unticked: no patient details are sent");
});

t("each prompt's card takes its colour from its domain", () => {
  assert.equal(toneOf("Respiratory / QAIF"), "teal");
  assert.equal(toneOf("Cardiovascular / QOF"), "rose");
  assert.equal(toneOf("Diabetes register"), "purple");
  assert.equal(toneOf("Renal / CKD"), "amber");
  assert.equal(toneOf("Something else"), "blue");
  assert.equal(toneOf(""), "blue");
  assert.deepEqual(Object.keys(STATUS_WORDS), ["new", "seen", "actioned", "declined"]);
});

t("the screens, the route, the rules and the server are all in place, and nothing client-side can create or change a record", () => {
  const review = read("src/modules/clinflow/QualityReview.jsx");
  assert.match(review, /Send to a colleague/);
  assert.match(review, /Include the patient's details so they can find the patient/);
  assert.match(review, /The notification they get names the opportunity only/);
  assert.match(read("src/modules/clinflow/ClinFlowWorkspace.jsx"), /<QualityReview analysis=\{analysis\}/);
  assert.match(read("src/modules/clinflow/ClinFlowWorkspace.jsx"), /clinflow\.opportunity\.sent/);
  assert.match(read("src/config/routeManifest.js"), /path: "\/quality-opportunities"/);
  assert.match(read("src/apps/DesktopApp.jsx"), /path="quality-opportunities"/);
  const client = read("src/modules/clinflow/qualityOpportunities.js");
  assert.ok(!/addDoc|setDoc|updateDoc|deleteDoc|writeBatch/.test(client), "the client only reads, and asks the server to write");
  assert.match(client, /httpsCallable\(functions, "sendQualityOpportunity"\)/);
  const rules = read("firestore.rules");
  assert.match(rules, /match \/quality_opportunities\/\{opportunityId\} \{\s*allow get, list: if signedIn\(\) && \(resource\.data\.recipientUid == request\.auth\.uid \|\| resource\.data\.senderUid == request\.auth\.uid\);\s*allow create, update, delete: if false;/);
  const server = read("functions/index.js");
  for (const fn of ["listOpportunityRecipients", "sendQualityOpportunity", "updateQualityOpportunity"]) assert.match(server, new RegExp(`exports\\.${fn} = onCall`));
  assert.match(server, /action: "clinflow\.opportunity\.send"[\s\S]*withDetails: Boolean\(result\.hadPatient\)/, "the audit says whether details went, never what they were");
});

console.log(`\n${n} passed`);
