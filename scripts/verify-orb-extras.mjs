// Covers Ask Primovex for equipment and compliance extras: laptops, certificates, COSHH, clinical waste and the staff training matrix. Read only.
import assert from "node:assert/strict";
import { certificatesAnswer, coshhAnswer, laptopsAnswer, parseExtras, trainingOverdueAnswer, wasteAnswer } from "../src/ai/compliance/extras.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const NOW = new Date("2026-11-13T09:00:00");
const TODAY = "2026-11-13";

t("each way of asking is understood, and how-to, own-training and unrelated questions are left alone", () => {
  const p = (q) => parseExtras(q);
  assert.equal(p("which laptops are on loan").input.ask, "loans");
  assert.equal(p("which laptops need an update").input.ask, "updates");
  assert.deepEqual(p("who has laptop IT-014").input, { ask: "who", query: "it-014" });
  assert.equal(p("how many laptops do we have").input.ask, "summary");
  assert.equal(p("which certificates are running out").toolId, "compliance.certificates");
  assert.equal(p("when does the gas safety certificate expire").input.type, "gas_safety");
  assert.equal(p("is the EICR in date").input.type, "eicr");
  assert.equal(p("which COSHH reviews are due").toolId, "compliance.coshh");
  assert.equal(p("is there a COSHH sheet for bleach").input.query, "bleach");
  assert.equal(p("when was the last clinical waste collection").toolId, "waste.status");
  assert.equal(p("how much waste did stericycle collect last year").toolId, "waste.status");
  assert.equal(p("who is out of date on fire training").toolId, "training.overdue");
  assert.equal(p("who is out of date on fire training").input.course, "fire");
  assert.equal(p("which staff have overdue training").input.course, "");
  for (const q of ["how do I add a laptop", "where do I find the coshh register", "What training is due for me?", "am I up to date on my training", "which stock is low", "what is a certificate", "how many SARs are outstanding", "laptop", ""]) assert.equal(p(q), null, q);
});

const laptops = [
  { id: "1", assetCode: "IT-001", status: "in_use", currentUserName: "Sam Lee", nextUpdateDue: "2026-11-01" },
  { id: "2", assetCode: "IT-002", status: "in_use", currentUserName: "Ann Evans", nextUpdateDue: "2026-11-16" },
  { id: "3", assetCode: "IT-003", status: "on_loan", loan: { borrowerName: "Bryn Price", dueBackOn: "2026-11-10" }, nextUpdateDue: "2027-02-01" },
  { id: "4", assetCode: "IT-004", status: "spare", nextUpdateDue: "2027-03-01" },
  { id: "5", assetCode: "IT-005", status: "decommissioned" },
];

t("laptops: a summary, updates, loans and who has one", () => {
  const s = laptopsAnswer({ laptops, ask: "summary", today: TODAY });
  assert.match(s.text, /4 laptops on the register: 2 in use, 1 spare, 1 on loan\./);
  assert.match(s.text, /1 update overdue\./);
  assert.match(s.text, /1 loan overdue back\./);
  const u = laptopsAnswer({ laptops, ask: "updates", today: TODAY });
  assert.match(u.text, /IT-001 \(Sam Lee\): update was due 12 days ago/);
  assert.match(u.text, /IT-002 \(Ann Evans\): update due in 3 days/);
  const l = laptopsAnswer({ laptops, ask: "loans", today: TODAY });
  assert.match(l.text, /IT-003: On loan to Bryn Price until 10\/11\/2026 \(overdue back\)/);
  assert.equal(laptopsAnswer({ laptops, ask: "who", query: "it-002", today: TODAY }).text, "IT-002: Ann Evans.");
  assert.equal(laptopsAnswer({ laptops, ask: "who", query: "002", today: TODAY }).text, "IT-002: Ann Evans.");
  assert.match(laptopsAnswer({ laptops, ask: "who", query: "zz9", today: TODAY }).text, /couldn't find a laptop/);
  assert.match(laptopsAnswer({ laptops: [], today: TODAY }).text, /no laptops/);
  assert.match(laptopsAnswer({ laptops: [{ ...laptops[3], nextUpdateDue: "2027-03-01" }], ask: "loans", today: TODAY }).text, /No laptops are out on loan/);
});

const certs = [
  { id: "c1", type: "gas_safety", site: "Main Surgery", expiryDate: "2026-11-01", active: true, findings: [] },
  { id: "c2", type: "eicr", site: "Main Surgery", expiryDate: "2030-01-01", active: true, findings: [] },
  { id: "c3", type: "boiler_service", site: "Annexe", expiryDate: "2026-12-20", active: true, findings: [] },
  { id: "c4", type: "lift_loler", expiryDate: "2026-04-01", active: false, findings: [] },
];

t("certificates: what needs attention, and one type", () => {
  const a = certificatesAnswer({ certificates: certs, now: NOW });
  assert.match(a.text, /^2 certificates of 3 need attention \(1 expired or without a date, 1 running out, 0 with a problem\)/);
  assert.match(a.text, /Gas safety certificate \(Main Surgery\): expired 12 days ago \(01\/11\/2026\)/);
  assert.match(a.text, /Boiler service \(Annexe\): runs out in 37 days/);
  assert.doesNotMatch(a.text, /Lift/);
  const g = certificatesAnswer({ certificates: certs, type: "gas_safety", now: NOW });
  assert.match(g.text, /^Gas safety certificate:\n• Gas safety certificate \(Main Surgery\): expired/);
  assert.match(certificatesAnswer({ certificates: certs, type: "asbestos_survey", now: NOW }).text, /isn't on the register/);
  assert.match(certificatesAnswer({ certificates: [certs[1]], now: NOW }).text, /^All 1 certificate on the register is in date/);
  assert.equal(certificatesAnswer({ certificates: [], now: NOW }).found, false);
});

const coshh = [
  { id: "s1", name: "Bleach", location: "Cleaning cupboard", site: "Main Surgery", reviewDate: "2026-10-01", sdsUrl: "x", active: true },
  { id: "s2", name: "Descaler", location: "Kitchen", reviewDate: "2026-11-25", active: true },
  { id: "s3", name: "Hand gel", location: "Reception", reviewDate: "2027-06-01", active: true },
  { id: "s4", name: "Old thing", reviewDate: "", active: false },
];

t("COSHH: reviews due, and searching for a substance", () => {
  const a = coshhAnswer({ substances: coshh, now: NOW });
  assert.match(a.text, /^1 COSHH review is overdue or have no date, 1 due soon \(of 3\)/);
  assert.match(a.text, /Bleach: review was due 43 days ago/);
  assert.match(a.text, /Descaler: review due in 12 days/);
  const b = coshhAnswer({ substances: coshh, query: "bleach", now: NOW });
  assert.match(b.text, /Bleach, kept in Cleaning cupboard \(Main Surgery\): review was due 43 days ago, safety data sheet on file/);
  assert.match(coshhAnswer({ substances: coshh, query: "descaler", now: NOW }).text, /no safety data sheet uploaded/);
  assert.match(coshhAnswer({ substances: coshh, query: "unicorn", now: NOW }).text, /can't find “unicorn”/);
  assert.match(coshhAnswer({ substances: [coshh[2]], now: NOW }).text, /^All 1 COSHH entry are in date/);
});

t("waste: the last collection, the year's total, and a long gap", () => {
  const rows = [
    { id: "w1", collectionDate: "2026-09-01", totalKg: 20, lines: [] },
    { id: "w2", collectionDate: "2026-11-05", totalKg: 31.5, lines: [] },
    { id: "w3", collectionDate: "2026-06-01", totalKg: 10, lines: [], voided: true },
  ];
  const a = wasteAnswer({ consignments: rows, now: NOW });
  assert.match(a.text, /The last collection was on 05\/11\/2026, 8 days ago, 31\.5 kg\./);
  assert.match(a.text, /In the last year there were 2 collections, 51\.5 kg in all\./);
  assert.match(a.text, /longest gap between collections was 65 days/);
  assert.equal(wasteAnswer({ consignments: [], now: NOW }).found, false);
});

t("staff training: who is out of date or running out, for everything or one course", () => {
  const people = [{ id: "p1", name: "Sam Lee", active: true, group: "Admin" }, { id: "p2", name: "Ann Evans", active: true, group: "Clinical" }];
  const courses = [{ id: "c1", name: "Fire safety", intervalMonths: 12, active: true }, { id: "c2", name: "Basic life support", intervalMonths: 12, active: true }];
  const records = [
    { personId: "p1", courseId: "c1", completedOn: "2025-10-01" },
    { personId: "p2", courseId: "c1", completedOn: "2025-12-01" },
    { personId: "p2", courseId: "c2", completedOn: "2025-11-20" },
  ];
  const a = trainingOverdueAnswer({ people, courses, records, now: NOW });
  assert.match(a.text, /Out of date \(1\):\n• Sam Lee: Fire safety, ran out 01\/10\/2026/);
  assert.match(a.text, /Running out soon \(2\):/);
  const f = trainingOverdueAnswer({ people, courses, records, course: "fire", now: NOW });
  assert.doesNotMatch(f.text, /Basic life support/);
  assert.match(f.text, /Ann Evans: Fire safety/);
  assert.match(trainingOverdueAnswer({ people, courses, records, course: "swimming", now: NOW }).text, /can't find a course called “swimming”/);
  assert.match(trainingOverdueAnswer({ people, courses, records: [], now: NOW }).text, /Nobody is out of date/);
  assert.equal(trainingOverdueAnswer({ people: [], courses, records, now: NOW }).found, false);
});

console.log(`\n${n} tests passed`);
