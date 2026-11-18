// Covers "Ask Primovex AI" on a concern's Anonymised summary (src/ai/governance/concernSummary.js): it tidies what was typed, never lets a
// personal detail through, never adds facts, and refuses when there is nothing to work from.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findSummaryIdentifiers, suggestConcernSummary as suggest } from "../src/ai/governance/concernSummary.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };

t("a short note becomes a clear sentence, led by the category", () => {
  const r = suggest({ summary: "concerns re entries of medical information on notes", category: "records", priority: "low" });
  assert.equal(r.ok, true);
  assert.equal(r.text, "Records concern. The person raising this concern is concerned about entries of medical information in the medical records.");
  assert.deepEqual(r.removed, []);
});

t("shorthand is written out and sentences are tidied", () => {
  const r = suggest({ summary: "pt waited 3 wks for appt, recpt rude on tel", category: "access" });
  assert.equal(r.text, "Access concern. Patient waited 3 weeks for appointment, reception rude on telephone.");
});

t("names, NHS and EMIS numbers, dates of birth, phone, email, postcode and address are all taken out", () => {
  const r = suggest({ summary: "Mrs Jones (DOB 12/03/1956, NHS 943 476 5919, EMIS 123456) rang from 07700 900123, a.b@example.com, 12 High Street LL57 2AB, unhappy with dr refusing meds", category: "medication", priority: "high" });
  assert.equal(r.ok, true);
  for (const bit of ["Jones", "1956", "943", "123456", "07700", "example.com", "High Street", "LL57"]) assert.ok(!r.text.includes(bit), `${bit} should be gone: ${r.text}`);
  assert.deepEqual(findSummaryIdentifiers(r.text), []);
  const kinds = new Set(r.removed.map((x) => x.kind));
  for (const kind of ["name", "dateOfBirth", "nhsNumber", "emisNumber", "phone", "email", "postcode", "address"]) assert.ok(kinds.has(kind), `should report ${kind}`);
  assert.match(r.text, /doctor refusing medication/);
});

t("colleagues the person may name are left alone", () => {
  const r = suggest({ summary: "Seen by Dr Hughes, who did not explain the results", category: "communication", allow: ["Gwyn Hughes"] });
  assert.match(r.text, /Dr Hughes/);
});

t("tips point at what is missing, and are never written into the summary", () => {
  const r = suggest({ summary: "concerns re entries of medical information on notes", category: "records", priority: "high" });
  assert.ok(r.tips.some((tip) => /HIGH/.test(tip)));
  assert.ok(r.tips.some((tip) => /inaccurate, missing/.test(tip)));
  assert.ok(r.tips.some((tip) => /Desired outcome/.test(tip)));
  assert.ok(!r.text.includes("HIGH"));
  const full = suggest({ summary: "In March the patient found an incorrect diagnosis entered in the wrong record and asked for it to be amended.", category: "records", priority: "low", desiredOutcome: "Amendment" });
  assert.deepEqual(full.tips, []);
});

t("nothing to work from: asks for a few words instead of inventing a summary", () => {
  for (const summary of ["", "   ", "x"]) assert.equal(suggest({ summary, category: "other" }).ok, false);
});

t("'Other' has no category lead-in, and an already tidy summary is marked unchanged", () => {
  const r = suggest({ summary: "Waited 40 minutes past the appointment time and was not told why.", category: "other" });
  assert.equal(r.text, "Waited 40 minutes past the appointment time and was not told why.");
  assert.equal(r.unchanged, true);
});

t("the button never waits for ever on the staff list: it gives up after a few seconds and carries on with the person's own name", () => {
  const field = readFileSync(new URL("../src/ai/components/AskPrimovexSummaryField.jsx", import.meta.url), "utf8");
  assert.match(field, /STAFF_LIST_WAIT_MS = 3000/);
  assert.match(field, /Promise\.race\(\[loadStaffNames\(profile\?\.displayName\)/);
});

console.log(`\n${n} checks passed`);
