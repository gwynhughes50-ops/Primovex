import assert from "node:assert/strict";
import {
  CERT_TYPES, WARN_DAYS, certLabel, certStatus, certSummary, daysUntilExpiry, emptyCertificate, expiryText, normaliseCertificate, registerRows, renewal, searchCertificates,
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
  assert.deepEqual(certSummary(list, now), { total: 5, expired: 2, dueSoon: 1, noPdf: 1, ok: 2, needsAttention: 3 });
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
  assert.deepEqual(fine.rows.map((r) => r[1]), ["1", "0", "0", "1 of 1"]);
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

console.log(`\n${n} passed`);
