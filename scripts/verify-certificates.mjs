import assert from "node:assert/strict";
import {
  ANSWERS, CERT_TYPES, MAX_CHECKS, WARN_DAYS, certLabel, checkText, cleanChecks, hasProblem, judgeCheck, problemChecks, certStatus, certSummary, daysUntilExpiry, emptyCertificate, expiryText, normaliseCertificate, registerRows, renewal, searchCertificates,
  sortCertificates, suggestedExpiry, toRecord, validateCertificate,
} from "../src/modules/certificates/certificates.js";
import { certificatesRegisterHtml } from "../src/modules/certificates/certificatesReport.js";
import {
  COMPLIANCE_ASSET_TYPES, FREQUENCY_MS, FREQUENCY_OPTIONS, getAssetTypeConfig, isComplianceCheckDue, evaluateComplianceResult, getCountdownSeconds, isFlushableAsset,
} from "../src/services/compliance/complianceRules.js";
import { assetGroup, actionChoicesFor } from "../src/modules/compliance/complianceIncidents.js";
import { certificatesSection } from "../src/modules/inspection/inspectionSummary.js";
import { dueList } from "../src/modules/compliance/complianceDue.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const now = new Date(2026, 9, 10, 12, 0);
const ago = (days) => new Date(now.getTime() - days * 86400000);
const day = (offset) => { const d = new Date(now.getTime() + offset * 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

const good = { id: "c1", type: "gas_safety", site: "Main Surgery", provider: "Gas Safe Ltd", reference: "GS-123", completedOn: "2026-03-01", expiryDate: day(200), certUrl: "https://firebasestorage.googleapis.com/x.pdf", certPath: "compliance_certs/c1/a.pdf", certFileName: "gas.pdf" };

t("the new asset types are all there, with their own code prefix, grouped with fire or water so every screen picks them up", () => {
  const prefixes = COMPLIANCE_ASSET_TYPES.map((x) => x.codePrefix);
  assert.equal(new Set(prefixes).size, prefixes.length, "no two types share a code prefix");
  const keys = COMPLIANCE_ASSET_TYPES.map((x) => x.key);
  for (const key of ["fire_emergency_light", "fire_extinguisher", "fire_drill", "fire_alarm_panel", "water_tmv", "water_flush"]) assert.ok(keys.includes(key), key);
  assert.equal(getAssetTypeConfig("nope").key, "general", "general stays the fallback");
  for (const key of ["fire_emergency_light", "fire_extinguisher", "fire_drill", "fire_alarm_panel"]) assert.equal(assetGroup(key), "fire", key);
  for (const key of ["water_tmv", "water_flush"]) assert.equal(assetGroup(key), "water", key);
  assert.ok(actionChoicesFor("fire_extinguisher").some((c) => c.key === "repaired") && actionChoicesFor("water_tmv").some((c) => c.key === "adjusted"));
});

t("each is checked at the right rhythm: alarm panel weekly, emergency lights and extinguishers monthly, TMVs every 3 months, drills every 6", () => {
  assert.equal(FREQUENCY_MS.sixmonthly, 182 * 86400000);
  assert.ok(FREQUENCY_OPTIONS.some((o) => o.key === "sixmonthly" && o.label === "Every 6 months"));
  assert.ok(FREQUENCY_OPTIONS.every((o) => FREQUENCY_MS[o.key]), "every offered frequency means something");
  const defaults = Object.fromEntries(["fire_alarm_panel", "fire_emergency_light", "fire_extinguisher", "water_tmv", "fire_drill", "water_flush"].map((k) => [k, getAssetTypeConfig(k).defaultFrequency]));
  assert.deepEqual(defaults, { fire_alarm_panel: "weekly", fire_emergency_light: "monthly", fire_extinguisher: "monthly", water_tmv: "quarterly", fire_drill: "sixmonthly", water_flush: "weekly" });
  const drill = { assetType: "fire_drill", frequency: "sixmonthly" };
  assert.equal(isComplianceCheckDue({ ...drill, lastCheckAt: ago(150) }, now), false);
  assert.equal(isComplianceCheckDue({ ...drill, lastCheckAt: ago(190) }, now), true);
  assert.equal(isComplianceCheckDue({ assetType: "fire_extinguisher", frequency: "monthly", lastCheckAt: ago(31) }, now), true, "a fire_ type other than the call points is checked on its own schedule");
});

t("a TMV is a temperature check with a safe range and a run time; flushing and the others are pass/fail", () => {
  const tmv = getAssetTypeConfig("water_tmv");
  assert.deepEqual([tmv.checkMode, tmv.minTempC, tmv.maxTempC, getCountdownSeconds({ assetType: "water_tmv" }), isFlushableAsset({ assetType: "water_tmv" })], ["temperature", 38, 46, 30, true]);
  assert.equal(evaluateComplianceResult({ assetType: "water_tmv", checkMode: "temperature" }, { tempC: 42 }).status, "pass");
  assert.equal(evaluateComplianceResult({ assetType: "water_tmv", checkMode: "temperature" }, { tempC: 47 }).status, "fail", "scald risk");
  assert.equal(evaluateComplianceResult({ assetType: "water_tmv", checkMode: "temperature" }, { tempC: 35 }).status, "fail");
  for (const key of ["fire_emergency_light", "fire_extinguisher", "fire_drill", "fire_alarm_panel", "water_flush"]) assert.equal(getAssetTypeConfig(key).checkMode, "pass_fail", key);
});

t("a certificate's status runs from in date, through running out in 60 days, to expired; no date is its own flag", () => {
  assert.equal(WARN_DAYS, 60);
  assert.equal(certStatus({ expiryDate: day(61) }, now), "ok");
  assert.equal(certStatus({ expiryDate: day(60) }, now), "due-soon");
  assert.equal(certStatus({ expiryDate: day(0) }, now), "due-soon");
  assert.equal(certStatus({ expiryDate: day(-1) }, now), "expired");
  assert.equal(certStatus({}, now), "missing");
  assert.equal(certStatus({ expiryDate: day(45) }, now, 30), "ok", "a shorter window is respected");
  assert.equal(daysUntilExpiry({ expiryDate: day(3) }, now), 3);
  assert.equal(expiryText({ expiryDate: day(-3) }, now), "Expired 3 days ago");
  assert.equal(expiryText({ expiryDate: day(-1) }, now), "Expired 1 day ago");
  assert.equal(expiryText({ expiryDate: day(0) }, now), "Runs out today");
  assert.equal(expiryText({ expiryDate: day(12) }, now), "Runs out in 12 days");
  assert.equal(expiryText({}, now), "No expiry date set");
});

t("the usual expiry is suggested from the date it was done, by type", () => {
  assert.equal(suggestedExpiry("gas_safety", "2026-03-01"), "2027-03-01");
  assert.equal(suggestedExpiry("eicr", "2026-03-01"), "2031-03-01");
  assert.equal(suggestedExpiry("lift_loler", "2026-08-31"), "2027-02-28");
  assert.equal(suggestedExpiry("gas_safety", ""), "");
  assert.ok(CERT_TYPES.every((c) => c.key && c.label && c.months > 0));
  assert.equal(new Set(CERT_TYPES.map((c) => c.key)).size, CERT_TYPES.length);
});

t("a certificate needs its type, site, contractor, a real expiry date and the PDF; each gap is named", () => {
  assert.deepEqual(validateCertificate(good), []);
  assert.match(validateCertificate({ ...good, type: "zzz" })[0], /kind of certificate/);
  assert.match(validateCertificate({ ...good, type: "other", name: "" })[0], /what this certificate/);
  assert.deepEqual(validateCertificate({ ...good, type: "other", name: "Pest control" }), []);
  assert.match(validateCertificate({ ...good, site: "" })[0], /site/);
  assert.match(validateCertificate({ ...good, provider: " " })[0], /who did it/);
  assert.match(validateCertificate({ ...good, expiryDate: "" })[0], /runs out/);
  assert.match(validateCertificate({ ...good, expiryDate: "2025-01-01" })[0], /before it was done/);
  assert.match(validateCertificate({ ...good, certUrl: "" })[0], /Attach the certificate/);
});

t("only the known fields are kept; 'other' keeps its own name, the rest don't", () => {
  const record = toRecord({ ...good, evil: "x", id: "ignored", type: "gas_safety", name: "should go" });
  assert.ok(!("evil" in record) && !("id" in record) && record.name === "");
  assert.equal(toRecord({ ...good, type: "other", name: " Pest control " }).name, "Pest control");
  assert.equal(certLabel({ type: "other", name: "Pest control" }), "Pest control");
  assert.equal(certLabel({ type: "eicr" }), "Fixed electrical wiring test (EICR)");
  const clean = normaliseCertificate("x", { type: "made-up", expiryDate: "not a date", active: false });
  assert.deepEqual([clean.type, clean.expiryDate, clean.active], ["other", "", false]);
  assert.deepEqual(emptyCertificate().previous, []);
});

t("the most urgent comes first and the summary counts what needs attention; retired certificates don't count", () => {
  const list = [
    { ...good, id: "ok", expiryDate: day(300) }, { ...good, id: "soon", expiryDate: day(20) }, { ...good, id: "old", expiryDate: day(-5) },
    { ...good, id: "none", expiryDate: "" }, { ...good, id: "retired", expiryDate: day(-99), active: false }, { ...good, id: "nopdf", expiryDate: day(100), certUrl: "" },
  ];
  assert.deepEqual(sortCertificates(list, now).map((c) => c.id), ["retired", "old", "none", "soon", "nopdf", "ok"]);
  assert.deepEqual(certSummary(list, now), { total: 5, expired: 2, dueSoon: 1, problems: 0, noPdf: 1, ok: 2, needsAttention: 3 });
  assert.equal(searchCertificates(list, "gas safe").length, 6);
  assert.equal(searchCertificates(list, "zzz").length, 0);
});

t("a renewal records the new dates and PDF and keeps the old one as history, and can't be a step backwards", () => {
  const cert = normaliseCertificate("c1", good);
  const result = renewal(cert, { completedOn: "2027-02-20", expiryDate: "2028-02-20", provider: "New Gas Co", reference: "GS-999", certUrl: "u2", certPath: "p2", certFileName: "f2.pdf" }, { displayName: "Colin" }, now);
  assert.deepEqual([result.patch.expiryDate, result.patch.provider, result.patch.certUrl, result.patch.lastRenewedByName], ["2028-02-20", "New Gas Co", "u2", "Colin"]);
  assert.deepEqual([result.previousEntry.expiryDate, result.previousEntry.certUrl, result.previousEntry.replacedBy, result.previousEntry.reference], [good.expiryDate, good.certUrl, "Colin", "GS-123"]);
  assert.equal(renewal(cert, { completedOn: "2027-02-20", expiryDate: "2028-02-20", certUrl: "u2" }, {}, now).patch.provider, "Gas Safe Ltd", "keeps the contractor if none is given");
  assert.throws(() => renewal(cert, { completedOn: "2027-02-20", expiryDate: "2028-02-20" }, {}, now), /Attach the new certificate/);
  assert.throws(() => renewal(cert, { completedOn: "2027-02-20", expiryDate: good.expiryDate, certUrl: "u" }, {}, now), /later than the one it replaces/);
  assert.throws(() => renewal(cert, { completedOn: "", expiryDate: "2028-02-20", certUrl: "u" }, {}, now), /date it was done/);
  assert.throws(() => renewal(cert, { completedOn: "2029-01-01", expiryDate: "2028-02-20", certUrl: "u" }, {}, now), /before it was done/);
});

t("the printed register lists each certificate, marks what is expired or running out, and escapes what it is given", () => {
  const rows = registerRows([{ ...good, id: "a", type: "other", name: "Pest <b>control</b>", expiryDate: day(-3) }, { ...good, id: "b", certUrl: "" }, { ...good, id: "c", active: false }], now);
  assert.deepEqual(rows.map((r) => r.status), ["Expired", "In date"]);
  assert.equal(rows[1].hasPdf, false);
  const html = certificatesRegisterHtml(rows, { generatedOn: "Printed 10 October 2026" });
  assert.ok(html.includes("Pest &lt;b&gt;control&lt;/b&gt;") && !html.includes("<b>control"));
  assert.ok(html.includes('class="bad"') && html.includes("Missing") && html.includes("Printed 10 October 2026") && html.includes("Save as PDF"));
  assert.ok(certificatesRegisterHtml([], {}).includes("No certificates are on the register yet"));
});

t("the inspection sheet has a certificates section that names what is expired, missing its PDF or running out", () => {
  const data = (certificates, certs = true) => ({ checks: [], fireWeekly: [], waterRounds: [], patSessions: [], patAssets: [], cleaningLogs: [], tempUnits: [], tempLogs: [], tempIncidents: [], stockAlerts: [], stockCount: 0, coshh: [], certificates, concerns: [], sars: [], events: [], available: { certs }, now });
  assert.equal(certificatesSection(data([], true)).status, "none");
  assert.equal(certificatesSection(data([], false)).status, "unavailable");
  const fine = certificatesSection(data([{ ...good, expiryDate: day(200) }]));
  assert.equal(fine.status, "ok");
  assert.deepEqual(fine.rows.map((r) => r[1]), ["0", "1", "0", "0", "1 of 1"]);
  const bad = certificatesSection(data([{ ...good, id: "a", expiryDate: day(-4) }, { ...good, id: "b", type: "eicr", expiryDate: day(20), certUrl: "" }, { ...good, id: "c", type: "boiler_service", expiryDate: day(300) }]));
  assert.equal(bad.status, "attention");
  assert.match(bad.gaps[0], /1 certificate expired or without a date: Gas safety certificate/);
  assert.match(bad.gaps[1], /1 certificate without the PDF attached/);
  assert.match(bad.gaps[2], /1 certificate running out in the next 60 days: Fixed electrical wiring test/);
  assert.equal(certificatesSection(data([{ ...good, active: false, expiryDate: day(-50) }])).status, "none", "retired ones don't count");
});

t("the 'what needs doing' list puts an expired certificate with the failures and one running out with the warnings", () => {
  const list = dueList({ certificates: [{ ...good, id: "a", expiryDate: day(-4) }, { ...good, id: "b", type: "eicr", expiryDate: day(20) }, { ...good, id: "c", type: "boiler_service", expiryDate: day(10) }, { ...good, id: "d", type: "lift_loler", expiryDate: day(400) }], now });
  assert.deepEqual(list.map((i) => [i.key, i.tone]), [["certs-expired", "critical"], ["certs-soon", "warning"]]);
  assert.match(list[0].label, /1 certificate expired/);
  assert.match(list[1].label, /2 certificates running out soon/);
  assert.equal(list[1].detail, "Boiler service, Fixed electrical wiring test (EICR). The first runs out in 10 days.", "the nearest first");
  assert.equal(list[0].action.tab, "certificates");
  assert.deepEqual(dueList({ certificates: [{ ...good, expiryDate: day(400) }], now }), []);
  assert.deepEqual(dueList({ certificates: null, now }), [], "someone who can't see the register isn't shown it");
});

t("an answer is judged a problem by what was asked: 'Boiler safe to use: No' is, 'Panel fault found: No' is not", () => {
  const bad = [["Boiler safe to use", "No"], ["Boiler: safe to use", "NO"], ["Gas supply tightness test", "Fail"], ["Gas supply tightness test", "Failed"], ["Overall assessment", "Unsatisfactory"], ["Appliance", "Unsafe"],
    ["Defects found", "Yes"], ["Defects requiring action", "Yes"], ["Gas leak found", "Yes"], ["Flue and ventilation satisfactory", "No"], ["Installation", "Immediately dangerous"], ["Carbon monoxide alarm working", "No"]];
  const fine = [["Gas supply tightness test", "Pass"], ["Boiler safe to use", "Yes"], ["Boiler safe to use", "YES"], ["Overall assessment", "SATISFACTORY"], ["Defects found", "No"], ["Defects found", "None"], ["Panel fault found", "No"],
    ["Gas leak found", "No"], ["Appliance safe to use", "Safe"], ["Smoke detectors tested", "Yes"], ["Extinguishers serviced", "14"], ["Appliance", "N/A"]];
  for (const [l, a] of bad) assert.equal(judgeCheck(l, a), true, `${l}: ${a}`);
  for (const [l, a] of fine) assert.equal(judgeCheck(l, a), false, `${l}: ${a}`);
});

t("an answer the rule cannot judge is left to the AI's reading, and the rule's own judgement beats the AI when the answer is plain", () => {
  assert.equal(judgeCheck("Overall result", "Satisfactory with advisories", true), true);
  assert.equal(judgeCheck("Overall result", "Satisfactory with advisories", false), false);
  assert.equal(judgeCheck("Overall result", "Satisfactory with advisories"), false, "nothing says it is a problem");
  assert.equal(judgeCheck("Gas supply tightness test", "Pass", true), false, "the AI cannot call a Pass a problem");
  assert.equal(judgeCheck("Boiler safe to use", "No", false), true, "the AI cannot call a No on 'safe to use' fine");
  assert.ok(ANSWERS.includes("Yes") && ANSWERS.includes("Unsatisfactory"));
});

t("checks are cleaned: named, short, at most twelve; a certificate keeps its engineer and checks", () => {
  const clean = cleanChecks([{ label: "  Boiler   safe to use ", answer: " NO ", problem: true }, { label: "", answer: "Yes" }, { label: "No answer", answer: "" }, null, { label: "Tight", answer: "Pass", problem: "yes" }]);
  assert.deepEqual(clean, [{ label: "Boiler safe to use", answer: "NO", problem: true }, { label: "Tight", answer: "Pass", problem: false }], "only a real true counts as a problem");
  assert.equal(cleanChecks(Array.from({ length: 30 }, (_, i) => ({ label: `c${i}`, answer: "Yes" }))).length, MAX_CHECKS);
  assert.deepEqual(cleanChecks("not a list"), []);
  const c = normaliseCertificate("c1", { type: "gas_safety", engineer: "  A. Sample  ", findings: [{ label: "Boiler safe to use", answer: "No", problem: true }], expiryDate: "2026-12-01" });
  assert.equal(c.engineer, "A. Sample");
  assert.deepEqual(problemChecks(c).map(checkText), ["Boiler safe to use: No"]);
  assert.equal(hasProblem(c), true);
  assert.equal(hasProblem(normaliseCertificate("c2", { type: "eicr" })), false);
  const saved = toRecord({ ...c, id: "c1" });
  assert.equal(saved.engineer, "A. Sample");
  assert.deepEqual(saved.findings, [{ label: "Boiler safe to use", answer: "No", problem: true }]);
  assert.equal(emptyCertificate().engineer, "");
  assert.deepEqual(emptyCertificate().findings, []);
});

t("a certificate that records a problem comes first, and is counted as needing attention even when it is well in date", () => {
  const fine = normaliseCertificate("a", { type: "gas_safety", site: "Main", provider: "X", expiryDate: "2027-09-01", certUrl: "u" });
  const unsafe = normaliseCertificate("b", { type: "gas_safety", site: "Main", provider: "X", expiryDate: "2027-09-01", certUrl: "u", findings: [{ label: "Boiler safe to use", answer: "No", problem: true }] });
  const expired = normaliseCertificate("c", { type: "eicr", site: "Main", provider: "X", expiryDate: "2026-01-01", certUrl: "u" });
  assert.equal(certStatus(unsafe, now), "ok", "its dates are fine");
  assert.deepEqual(sortCertificates([fine, expired, unsafe], now).map((c) => c.id), ["b", "c", "a"], "the problem before the expired one");
  const summary = certSummary([fine, expired, unsafe], now);
  assert.equal(summary.problems, 1);
  assert.equal(summary.needsAttention, 2, "the expired one and the problem one, each counted once");
  const both = normaliseCertificate("d", { type: "eicr", expiryDate: "2026-01-01", findings: [{ label: "Overall", answer: "Unsatisfactory", problem: true }] });
  assert.equal(certSummary([both], now).needsAttention, 1, "expired AND a problem is still one certificate");
});

t("a renewal brings the new certificate's engineer and checks, and the old ones go into the history", () => {
  const old = normaliseCertificate("a", { type: "gas_safety", site: "Main", provider: "Northgate", engineer: "Old Engineer", completedOn: "2025-10-14", expiryDate: "2026-10-13", certUrl: "u", findings: [{ label: "Boiler safe to use", answer: "No", problem: true }] });
  const out = renewal(old, { completedOn: "2026-10-14", expiryDate: "2027-10-13", provider: "Northgate", reference: "GSR-2", engineer: "New Engineer", findings: [{ label: "Boiler safe to use", answer: "Yes", problem: false }], certUrl: "u2", certPath: "p2", certFileName: "f2" }, { displayName: "Gwyn" }, now);
  assert.equal(out.patch.engineer, "New Engineer");
  assert.deepEqual(out.patch.findings, [{ label: "Boiler safe to use", answer: "Yes", problem: false }]);
  assert.equal(out.previousEntry.engineer, "Old Engineer");
  assert.deepEqual(out.previousEntry.findings, [{ label: "Boiler safe to use", answer: "No", problem: true }], "last year's problem stays in its history");
  const bare = renewal(old, { completedOn: "2026-10-14", expiryDate: "2027-10-13", certUrl: "u2" }, { displayName: "Gwyn" }, now);
  assert.equal(bare.patch.engineer, "", "last year's engineer and results do not carry over to a certificate that says nothing about them");
  assert.deepEqual(bare.patch.findings, []);
});

t("the printed register shows the engineer and the result, a problem in red, and search finds an engineer", () => {
  const unsafe = normaliseCertificate("b", { type: "gas_safety", site: "Main", provider: "Northgate", engineer: "A. Sample", expiryDate: "2027-09-01", certUrl: "u", findings: [{ label: "Boiler safe to use", answer: "No", problem: true }, { label: "Tightness test", answer: "Pass", problem: false }] });
  const fine = normaliseCertificate("a", { type: "eicr", site: "Main", provider: "Spark", expiryDate: "2027-09-01", certUrl: "u", findings: [{ label: "Overall", answer: "Satisfactory", problem: false }] });
  const plain = normaliseCertificate("p", { type: "boiler_service", site: "Main", provider: "Heat", expiryDate: "2027-09-01", certUrl: "u" });
  const rows = registerRows([unsafe, fine, plain], now);
  assert.equal(rows[0].what, certLabel(unsafe), "the problem is first");
  assert.equal(rows[0].problem, true);
  assert.equal(rows[0].result, "PROBLEM: Boiler safe to use: No");
  assert.equal(rows.find((r) => r.what === certLabel(fine)).result, "No problems recorded");
  assert.equal(rows.find((r) => r.what === certLabel(plain)).result, "", "nothing recorded, nothing said");
  const html = certificatesRegisterHtml(rows, {});
  assert.match(html, /A\. Sample/);
  assert.match(html, /PROBLEM: Boiler safe to use: No/);
  assert.match(html, /class="bad"/);
  assert.equal(searchCertificates([unsafe, fine], "sample").length, 1, "search by the engineer");
});

t("the compliance list and the inspection summary say plainly that a certificate records a problem", () => {
  const unsafe = normaliseCertificate("b", { type: "gas_safety", site: "Main", provider: "Northgate", expiryDate: "2027-09-01", certUrl: "u", findings: [{ label: "Boiler safe to use", answer: "No", problem: true }] });
  const fine = normaliseCertificate("a", { type: "eicr", site: "Main", provider: "Spark", expiryDate: "2027-09-01", certUrl: "u" });
  const items = dueList({ certificates: [unsafe, fine], now });
  const problem = items.find((i) => i.key === "certs-problem");
  assert.ok(problem, "a problem item");
  assert.equal(problem.tone, "critical");
  assert.match(problem.label, /1 certificate records a failed or unsafe result/);
  assert.match(problem.detail, /Boiler safe to use: No/);
  assert.equal(dueList({ certificates: [fine], now }).some((i) => i.key === "certs-problem"), false);
  const section = certificatesSection({ certificates: [unsafe, fine], now, available: { certs: true } });
  assert.equal(section.status, "attention");
  assert.ok(section.gaps.some((g) => /records a failed or unsafe result.*Boiler safe to use: No/.test(g)), JSON.stringify(section.gaps));
});

console.log(`\n${n} passed`);
