import assert from "node:assert/strict";
import { guessGroup, likelyLiveSheet, parseTrainingSheets, planImport, suggestAccountLinks } from "../src/modules/training/trainingImport.js";
import { STATUS, statusOf } from "../src/modules/training/training.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };

// Excel day numbers: 46023 = 1 Jan 2026
const D = (iso) => Math.round((Date.UTC(...iso.split("-").map((v, i) => (i === 1 ? Number(v) - 1 : Number(v)))) - Date.UTC(1899, 11, 30)) / 86400000);
const sheet = (name, rows) => ({ name, rows: rows.map(([r, cells]) => ({ r, cells })) });

// a "nursing" sheet: one column per course; EXP in the name means the value is the date it runs out
const nursing = sheet("Nursing Team", [
  [1, { 1: "Traffic light system", 2: "Employee Name", 27: "CLINICAL STAFF GROUP TRAINING" }],
  [3, { 1: "Job Role", 4: "Information Governance EXP 2 yearly", 5: "Fire Safety level 2 EXP 2 yearly", 6: "Care Navigation", 7: "Resuscitation level 2 BLS EXP 1 year", 8: "FLU 2026", 9: "Dementia", 10: "Cert 3", 11: "Cert 4" }],
  [4, { 1: "ANP", 2: "Ann", 3: "Example", 4: D("2028-01-01"), 5: D("2027-06-30"), 6: D("2022-10-01"), 7: D("2026-12-01"), 8: D("2026-09-01"), 9: "Frb 29", 10: 730 }],
  [5, { 1: "HCA", 2: "Bea", 3: "Sample", 4: D("2027-02-01"), 7: D("2027-03-01") }],
  [7, { 1: "KEY= Traffic light system" }],
  [8, { 1: "RED = Out of day or not done", 3: "date/not" }],
]);

// an "admin" sheet: pairs of obtained and due columns, with how often each repeats in the row above
const admin = sheet("Admin", [
  [1, { 1: "Traffic light system", 3: "Employee Name", 4: "ALL STAFF MANDATORY TRAINING", 19: "ADMIN STAFF MANDATORY TRAINING" }],
  [2, { 4: "2 yearly online", 6: "Every 2 years (ONLINE)", 8: "Once only", 10: "3 Yearly (FACE2FACE)" }],
  [3, { 1: "Job Role", 4: "Information Governance DATE OBTAINED", 5: "Information Governance REFRESHER DUE", 6: "Fire Safety level 2 DATE OBTAINED", 7: "Fire Safety level 2 DATE DUE", 8: "Mental Capacity Act", 9: "Mental Capacity Act", 10: "Violence against women DATE DUE", 11: "Violence against women DATE DUE" }],
  [4, { 1: "Practice Manager", 2: "Pat", 3: "Manager", 4: D("2026-02-01"), 5: D("2028-02-01"), 6: D("2025-03-01"), 7: D("2027-03-01"), 8: D("2024-01-01"), 9: D("2027-01-01"), 10: D("2026-01-01"), 11: D("2029-01-01") }],
  [5, { 1: "Caretaker", 2: "Chris", 3: "Keeper", 4: D("2025-01-01"), 5: D("2027-01-01") }],
  [6, { 1: "Admin", 2: "Ann", 3: "Example", 4: D("2026-03-01"), 5: D("2028-03-01") }],
]);

// a "GP" sheet: two role columns, names in columns 3 and 4, a row of interval days instead of dates, a typo'd pair
const gp = sheet("GP", [
  [1, { 1: "Traffic light system", 3: "Employee Name" }],
  [2, { 5: "2 yearly online", 7: "3 Yearly" }],
  [3, { 1: "Job Role", 5: "Information Governance DATE OBTAINED", 6: "Information Governance REFRESHER DUE", 7: "Resusitation Level 2 BLS", 8: "Resusitation level 2 BLS " }],
  [4, { 1: "Clinical", 2: "General Practitioner (GP)", 3: "Gus", 4: "Doctor", 5: D("2025-01-01"), 6: D("2027-01-01"), 7: D("2025-06-01"), 8: D("2028-06-01") }],
  [5, { 2: "General Practitioner (GP)", 3: "Gail", 4: "Medic", 5: 730, 7: 1095 }],
]);

const ids = (list) => list.map((x) => x.id).sort();

t("the nursing layout: a date with EXP in the name is when it runs out, and the date done is worked back from it", () => {
  const out = parseTrainingSheets([nursing]);
  const byName = Object.fromEntries(out.courses.map((c) => [c.name, c]));
  assert.deepEqual(Object.keys(byName), ["Information Governance", "Fire Safety level 2", "Care Navigation", "Resuscitation level 2 BLS", "FLU 2026", "Dementia", "Cert 3", "Cert 4"]);
  assert.deepEqual([byName["Information Governance"].intervalMonths, byName["Resuscitation level 2 BLS"].intervalMonths, byName["Care Navigation"].intervalMonths, byName["FLU 2026"].intervalMonths], [24, 12, 0, 12]);
  assert.equal(byName["Information Governance"].category, "General", "no group title to its left");
  const rec = (p, c) => out.records.find((r) => r.personId === p && r.courseId === c);
  assert.deepEqual([rec("p-ann-example", "c-information-governance").dueOn, rec("p-ann-example", "c-information-governance").completedOn], ["2028-01-01", "2026-01-01"]);
  assert.deepEqual([rec("p-ann-example", "c-care-navigation").completedOn, rec("p-ann-example", "c-care-navigation").dueOn], ["2022-10-01", ""], "no EXP: the date it was done, once only");
  assert.equal(rec("p-ann-example", "c-flu-2026").completedOn, "2026-09-01");
});

t("people: names from the two columns before the courses, the job role, and a guess at the group; legend rows are not people", () => {
  const out = parseTrainingSheets([nursing]);
  assert.deepEqual(out.people.map((p) => [p.name, p.jobRole, p.group]), [["Ann Example", "ANP", "clinical"], ["Bea Sample", "HCA", "clinical"]]);
  assert.equal(guessGroup("Practice Manager"), "admin");
  assert.equal(guessGroup("Caretaker"), "support");
  assert.equal(guessGroup("General Practitioner (GP)"), "clinical");
  assert.equal(guessGroup("Secretary"), "admin");
  assert.equal(guessGroup("PCA"), "admin");
});

t("the admin layout: obtained and due pairs, how often it repeats from the row above, and a repeated heading means a pair", () => {
  const out = parseTrainingSheets([admin]);
  const byName = Object.fromEntries(out.courses.map((c) => [c.name, c]));
  assert.deepEqual(Object.keys(byName), ["Information Governance", "Fire Safety level 2", "Mental Capacity Act", "Violence against women"]);
  assert.deepEqual([byName["Information Governance"].intervalMonths, byName["Fire Safety level 2"].intervalMonths], [24, 24]);
  assert.equal(byName["Information Governance"].category, "All Staff Mandatory");
  assert.equal(byName["Violence against women"].intervalMonths, 36, "no hint: worked out from the dates");
  const mca = out.records.find((r) => r.personId === "p-pat-manager" && r.courseId === "c-mental-capacity-act");
  assert.deepEqual([mca.completedOn, mca.dueOn], ["2024-01-01", "2027-01-01"]);
  assert.deepEqual(out.people.map((p) => [p.name, p.group]), [["Pat Manager", "admin"], ["Chris Keeper", "support"], ["Ann Example", "admin"]]);
});

t("the GP layout: names in columns 3 and 4, the second role column used, a row of interval days is not dates, a typo'd pair still pairs", () => {
  const out = parseTrainingSheets([gp]);
  assert.deepEqual(out.people.map((p) => [p.name, p.jobRole, p.group]), [["Gus Doctor", "General Practitioner (GP)", "clinical"], ["Gail Medic", "General Practitioner (GP)", "clinical"]]);
  assert.deepEqual(out.courses.map((c) => c.name), ["Information Governance", "Resusitation Level 2 BLS"]);
  assert.equal(out.records.filter((r) => r.personId === "p-gail-medic").length, 0, "730 and 1095 are not dates");
  assert.equal(out.warnings.filter((w) => w.person === "Gail Medic").length, 2);
  assert.match(out.warnings[0].text, /not a usable date/);
});

t("odd cells are listed for checking, not imported", () => {
  const out = parseTrainingSheets([nursing]);
  const odd = out.warnings.filter((w) => w.person === "Ann Example").map((w) => [w.course, w.text.match(/"([^"]+)"/)[1]]);
  assert.deepEqual(odd, [["Dementia", "Frb 29"], ["Cert 3", "730"]]);
});

t("the same person on two sheets is one person, and the later date wins", () => {
  const second = sheet("Old", [
    [3, { 1: "Job Role", 4: "Information Governance EXP 2 yearly" }],
    [4, { 1: "ANP", 2: "Ann", 3: "Example", 4: D("2026-11-01") }],
  ]);
  const out = parseTrainingSheets([nursing, second]);
  assert.equal(out.people.filter((p) => p.name === "Ann Example").length, 1);
  assert.equal(out.records.find((r) => r.personId === "p-ann-example" && r.courseId === "c-information-governance").dueOn, "2028-01-01");
});

t("a sheet with no training header is skipped with a reason, and the live-looking sheets are picked by name", () => {
  const out = parseTrainingSheets([sheet("Notes", [[1, { 1: "hello" }]])]);
  assert.equal(out.people.length, 0);
  assert.match(out.warnings[0].text, /skipped/);
  assert.deepEqual(["Nursing Team", "GP", "Admin", "Introduction", "past staff", "Old NT", "training matrix in department", "Training Matrix"].map(likelyLiveSheet), [true, true, true, false, false, false, false, false]);
});

t("imported records give the lights the practice expects", () => {
  const now = new Date(2026, 9, 15);
  const out = parseTrainingSheets([nursing]);
  const course = (id) => out.courses.find((c) => c.id === id);
  const status = (p, c) => statusOf(out.records.find((r) => r.personId === p && r.courseId === c), course(c), now);
  assert.equal(status("p-ann-example", "c-information-governance"), STATUS.inDate);
  assert.equal(status("p-ann-example", "c-resuscitation-level-2-bls"), STATUS.dueSoon, "runs out 1 Dec 2026");
  assert.equal(status("p-ann-example", "c-care-navigation"), STATUS.inDate, "once only");
  assert.equal(status("p-bea-sample", "c-information-governance"), STATUS.inDate);
});

t("an import adds what is new, keeps what is on file, and never replaces a date with an older one or a 'not required' mark", () => {
  const parsed = parseTrainingSheets([nursing]);
  const existing = {
    courses: [{ id: "c-information-governance", name: "IG (renamed)", intervalMonths: 24 }],
    people: [{ id: "p-ann-example", name: "Ann Example", group: "clinical", uid: "u-ann", jobRole: "ANP" }],
    records: [
      { personId: "p-ann-example", courseId: "c-information-governance", completedOn: "2027-06-01", dueOn: "2029-06-01" },
      { personId: "p-ann-example", courseId: "c-fire-safety-level-2", status: "not-required" },
      { personId: "p-ann-example", courseId: "c-care-navigation", completedOn: "2020-01-01" },
    ],
  };
  const plan = planImport(parsed, existing);
  assert.deepEqual(plan.newPeople.map((p) => p.id), ["p-bea-sample"]);
  assert.ok(!plan.newCourses.some((c) => c.id === "c-information-governance"), "a course on file keeps its own settings");
  assert.equal(plan.newCourses.length, parsed.courses.length - 1);
  const wrote = (p, c) => plan.records.find((r) => r.personId === p && r.courseId === c);
  assert.equal(wrote("p-ann-example", "c-information-governance"), undefined, "the file has an older date than the one on file");
  assert.equal(wrote("p-ann-example", "c-fire-safety-level-2"), undefined, "a 'not required' mark stays");
  assert.equal(plan.kept, 1);
  assert.equal(wrote("p-ann-example", "c-care-navigation").completedOn, "2022-10-01", "a newer date than the one on file is written");
  assert.deepEqual([wrote("p-ann-example", "c-care-navigation").group, wrote("p-ann-example", "c-care-navigation").ownerUid], ["clinical", "u-ann"], "the owner and group come from the person on file");
  assert.equal(wrote("p-bea-sample", "c-information-governance").ownerUid, "");
  assert.ok(plan.unchanged >= 1);
  assert.deepEqual(planImport(parsed, {}).records.length, parsed.records.length, "into an empty database everything is written");
});

t("people are matched to accounts by exact name only, once each, and never silently", () => {
  const people = [{ id: "p1", name: "Ann Example" }, { id: "p2", name: "Bea  Sample" }, { id: "p3", name: "Cal Twin" }, { id: "p4", name: "Dan Linked", uid: "u9" }, { id: "p5", name: "Eve Left", active: false }];
  const staff = [{ id: "u1", label: "ann example" }, { id: "u2", label: "Bea Sample" }, { id: "u3", label: "Cal Twin" }, { id: "u4", label: "Cal Twin" }, { id: "u9", label: "Dan Linked" }, { id: "u5", label: "Eve Left" }];
  assert.deepEqual(suggestAccountLinks(people, staff), [{ personId: "p1", uid: "u1", label: "ann example" }, { personId: "p2", uid: "u2", label: "Bea Sample" }], "two accounts with one name are not guessed between; linked and left people are skipped");
});

console.log(`\n${n} passed`);
