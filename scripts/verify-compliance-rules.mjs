import assert from "node:assert/strict";
import {
  FIRE_TEST_STEPS, checklistGaps, fireTestChecklist, fireTestPassable, recentCheck, upToDateCount,
  COMPLIANCE_ASSET_TYPES, buildComplianceLink, buildComplianceQrPayload, evaluateComplianceResult, generateNextAssetCode, getAssetTypeConfig, getCountdownSeconds, getNextFirePointToTest,
  isComplianceCheckDue, isFireAlarmTestDueThisWeek, isFlushableAsset, normaliseAssetCode, parseComplianceQrPayload, buildAssetPatch, RETIRE_REASONS, retireReasonLabel,
} from "../src/services/compliance/complianceRules.js";
import { siteForNew, siteNameOf, siteOptions } from "../src/modules/compliance/siteOptions.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const now = new Date(2026, 9, 10, 12, 0);
const ago = (days) => new Date(now.getTime() - days * 86400000);

t("every kind of asset has a unique code prefix and a check mode, and an unknown type falls back to a general asset", () => {
  const prefixes = COMPLIANCE_ASSET_TYPES.map((x) => x.codePrefix);
  assert.equal(new Set(prefixes).size, prefixes.length);
  for (const type of COMPLIANCE_ASSET_TYPES) assert.ok(["pass_fail", "temperature"].includes(type.checkMode), type.key);
  assert.equal(getAssetTypeConfig("nope").key, "general");
  assert.equal(getAssetTypeConfig("water_hot").checkMode, "temperature");
});

t("a check is due by its own frequency, a failed one is always due, a never-checked one is due, fire points are handled as a group", () => {
  assert.equal(isComplianceCheckDue({ assetType: "water_hot", frequency: "monthly", lastCheckAt: ago(10), lastCheckResult: "pass" }, now), false);
  assert.equal(isComplianceCheckDue({ assetType: "water_hot", frequency: "monthly", lastCheckAt: ago(31), lastCheckResult: "pass" }, now), true);
  assert.equal(isComplianceCheckDue({ assetType: "water_hot", frequency: "weekly", lastCheckAt: ago(8) }, now), true);
  assert.equal(isComplianceCheckDue({ assetType: "water_hot", frequency: "weekly", lastCheckAt: ago(6) }, now), false);
  assert.equal(isComplianceCheckDue({ assetType: "water_hot", frequency: "monthly", lastCheckAt: ago(1), lastCheckResult: "fail" }, now), true, "a failure stays due until it passes");
  assert.equal(isComplianceCheckDue({ assetType: "water_hot", frequency: "monthly" }, now), true, "never checked");
  assert.equal(isComplianceCheckDue({ assetType: "water_hot" , lastCheckAt: ago(31) }, now), true, "no frequency means monthly");
  assert.equal(isComplianceCheckDue({ assetType: "fire_point", lastCheckAt: ago(400) }, now), false, "fire points are not each due every week");
  assert.equal(isComplianceCheckDue(null, now), false);
  assert.equal(isComplianceCheckDue({ assetType: "aed", frequency: "weekly", lastCheckAt: { toDate: () => ago(9) } }, now), true, "a Firestore timestamp works");
});

t("the weekly fire alarm test is done when any one call point was tested in the last 7 days", () => {
  const points = [
    { assetType: "fire_point", lastCheckAt: ago(20) },
    { assetType: "fire_point", lastCheckAt: ago(3) },
    { assetType: "fire_point", active: false, lastCheckAt: ago(1) },
    { assetType: "fire_door", lastCheckAt: ago(1) },
  ];
  assert.equal(isFireAlarmTestDueThisWeek(points, now), false);
  assert.equal(isFireAlarmTestDueThisWeek([{ assetType: "fire_point", lastCheckAt: ago(8) }], now), true);
  assert.equal(isFireAlarmTestDueThisWeek([{ assetType: "fire_point" }], now), true, "never tested");
  assert.equal(isFireAlarmTestDueThisWeek([], now), false, "no call points: nothing is due");
  assert.equal(isFireAlarmTestDueThisWeek([{ assetType: "fire_point", active: false, lastCheckAt: ago(30) }], now), false, "retired points don't count");
});

t("the next call point to test is the one that has gone longest, so the rotation covers them all", () => {
  const a = { id: "a", assetType: "fire_point", lastCheckAt: ago(2) };
  const b = { id: "b", assetType: "fire_point", lastCheckAt: ago(30) };
  const c = { id: "c", assetType: "fire_point" };
  assert.equal(getNextFirePointToTest([a, b]).id, "b");
  assert.equal(getNextFirePointToTest([a, b, c]).id, "c", "one never tested comes first");
  assert.equal(getNextFirePointToTest([{ id: "x", assetType: "fire_point", active: false }]), null);
  assert.equal(getNextFirePointToTest([]), null);
});

t("a temperature check passes inside the range and fails outside it, or with no reading", () => {
  const hot = { assetType: "water_hot", checkMode: "temperature", minTempC: 50, maxTempC: 65 };
  assert.equal(evaluateComplianceResult(hot, { tempC: 55 }).status, "pass");
  assert.equal(evaluateComplianceResult(hot, { tempC: 50 }).status, "pass", "the limits are inside the range");
  assert.equal(evaluateComplianceResult(hot, { tempC: 65 }).status, "pass");
  assert.equal(evaluateComplianceResult(hot, { tempC: 49.9 }).status, "fail");
  assert.equal(evaluateComplianceResult(hot, { tempC: 66 }).status, "fail");
  assert.equal(evaluateComplianceResult(hot, { tempC: "" }).status, "fail", "no reading is not a pass");
  assert.equal(evaluateComplianceResult(hot, {}).status, "fail");
  assert.equal(evaluateComplianceResult(hot, { tempC: 40 }).severity, "high");
  const cold = { assetType: "water_cold", checkMode: "temperature", minTempC: 0, maxTempC: 20 };
  assert.equal(evaluateComplianceResult(cold, { tempC: 18 }).status, "pass");
  assert.equal(evaluateComplianceResult(cold, { tempC: 21 }).status, "fail");
  assert.equal(evaluateComplianceResult({ assetType: "water_hot", checkMode: "temperature" }, { tempC: 55 }).status, "pass", "falls back to the type's own range");
  assert.equal(evaluateComplianceResult({ assetType: "water_hot", checkMode: "temperature" }, { tempC: 40 }).status, "fail");
});

t("a pass/fail check passes only when it says so", () => {
  const door = { assetType: "fire_door", checkMode: "pass_fail" };
  assert.equal(evaluateComplianceResult(door, { status: "pass" }).status, "pass");
  assert.equal(evaluateComplianceResult(door, { passed: true }).status, "pass");
  assert.equal(evaluateComplianceResult(door, { status: "fail" }).status, "fail");
  assert.equal(evaluateComplianceResult(door, {}).status, "fail", "nothing said is not a pass");
  assert.equal(evaluateComplianceResult(door, { status: "pass" }).severity, "info");
  assert.equal(evaluateComplianceResult(door, { status: "fail" }).severity, "medium");
});

t("asset codes are suggested in sequence per type, and tidied", () => {
  assert.equal(generateNextAssetCode("fire_point", []), "FP-001");
  assert.equal(generateNextAssetCode("fire_point", [{ assetCode: "FP-001" }, { assetCode: "FP-007" }, { assetCode: "WH-020" }]), "FP-008");
  assert.equal(generateNextAssetCode("water_hot", [{ assetCode: "fp-009" }]), "WH-001");
  assert.equal(generateNextAssetCode("fire_point", [{ assetCode: "fp-009" }]), "FP-010", "case does not matter");
  assert.equal(normaliseAssetCode(" fp 7!/ "), "FP-7");
});

t("a tag holds the asset id, and every way a scan can arrive is understood", () => {
  assert.equal(buildComplianceQrPayload({ id: "abc" }), "MEDTRAK:COMPLIANCE:abc");
  assert.deepEqual(parseComplianceQrPayload("MEDTRAK:COMPLIANCE:abc"), { type: "compliance", assetId: "abc", raw: "MEDTRAK:COMPLIANCE:abc" });
  assert.equal(parseComplianceQrPayload("medtrak:compliance:a:b").assetId, "a:b");
  assert.equal(parseComplianceQrPayload("MTQR:xyz").assetId, "xyz");
  assert.equal(parseComplianceQrPayload("https://x.example/scan?asset=q1").assetId, "q1");
  assert.equal(parseComplianceQrPayload("FP-007").assetId, "FP-007");
  assert.equal(parseComplianceQrPayload(""), null);
  assert.equal(parseComplianceQrPayload("not a tag at all!"), null);
});

t("water outlets run for a countdown before the reading; others don't", () => {
  assert.equal(getCountdownSeconds({ assetType: "water_hot" }), 30);
  assert.equal(getCountdownSeconds({ assetType: "water_hot", countdownSeconds: 90 }), 90);
  assert.equal(getCountdownSeconds({ assetType: "water_hot", countdownSeconds: 99999 }), 600, "capped");
  assert.equal(getCountdownSeconds({ assetType: "fire_point" }), 0);
  assert.equal(isFlushableAsset({ assetType: "water_cold" }), true);
  assert.equal(isFlushableAsset({ assetType: "aed" }), false);
});

t("editing an asset changes where it is, its name, how often and its safe range, and is checked first", () => {
  const ok = buildAssetPatch({ label: "  Kitchen  hot tap ", location: " Staff kitchen ", frequency: "weekly", minTempC: "50", maxTempC: "65", countdownSeconds: "45", siteId: "s2" }, "water_hot");
  assert.deepEqual(ok.problems, []);
  assert.deepEqual(ok.patch, { label: "Kitchen hot tap", location: "Staff kitchen", siteId: "s2", frequency: "weekly", minTempC: 50, maxTempC: 65, countdownSeconds: 45 });
  assert.equal(buildAssetPatch({ label: "", location: "Reception" }, "fire_point").patch.label, "Fire Point", "an empty name falls back to the type");
  assert.ok(!("frequency" in buildAssetPatch({ location: "Hall", frequency: "daily" }, "fire_point").patch), "fire points are not each given a frequency");
  assert.match(buildAssetPatch({ label: "x", location: "" }, "aed").problems[0], /where it is/);
  assert.match(buildAssetPatch({ location: "Hall", frequency: "hourly" }, "aed").problems[0], /how often/);
  assert.match(buildAssetPatch({ location: "Hall", minTempC: "", maxTempC: "65" }, "water_hot").problems[0], /lowest and highest/);
  assert.match(buildAssetPatch({ location: "Hall", minTempC: "70", maxTempC: "65" }, "water_hot").problems[0], /below the highest/);
  assert.equal(buildAssetPatch({ location: "Hall", minTempC: "50", maxTempC: "65", countdownSeconds: "9999" }, "water_hot").patch.countdownSeconds, 600);
  assert.equal(buildAssetPatch({ location: "Hall", minTempC: "50", maxTempC: "65" }, "water_hot").patch.countdownSeconds, 30);
  assert.ok(RETIRE_REASONS.length >= 3 && retireReasonLabel("mistake") === "Added by mistake" && retireReasonLabel("zzz") === "zzz");
});

t("the site list is the practice's sites plus any site that existing records already carry", () => {
  const options = siteOptions({ practiceSites: [{ id: "s1", name: "Main Surgery" }, { id: "s2", name: "Branch Surgery" }, { id: "s3", name: "Closed", active: false }], used: ["main_branch", "s1", "", null] });
  assert.deepEqual(options.map((o) => o.name), ["Branch Surgery", "Main Branch", "Main Surgery"]);
  assert.deepEqual(siteOptions({ used: ["main_branch"] }), [{ id: "main_branch", name: "Main Branch" }]);
  assert.deepEqual(siteOptions(), []);
  assert.equal(siteForNew({ selected: "s2", options }), "s2");
  assert.equal(siteForNew({ options }), "s2", "first site by name");
  assert.equal(siteForNew(), "main_branch", "nothing known: the original site");
  assert.equal(siteNameOf(options, "s1"), "Main Surgery");
  assert.equal(siteNameOf(options, "main_branch"), "Main Branch");
  assert.equal(siteNameOf(options, "zzz"), "zzz");
});

t("a link-style tag opens the asset's check, and the older text tags and labels still read", () => {
  const link = buildComplianceLink({ id: "abc123" }, { method: "nfc" });
  assert.equal(link, "https://app.primovex.co.uk/sense/open/compliance/abc123?m=nfc");
  assert.equal(buildComplianceLink({ id: "abc123" }), "https://app.primovex.co.uk/sense/open/compliance/abc123");
  assert.equal(buildComplianceLink({ id: "a b/c" }, { origin: "https://x.test/" }), "https://x.test/sense/open/compliance/a%20b%2Fc");
  const read = parseComplianceQrPayload(link);
  assert.equal(read.assetId, "abc123");
  assert.equal(read.via, "nfc");
  assert.equal(parseComplianceQrPayload(buildComplianceLink({ id: "a b/c" })).assetId, "a b/c", "an id with odd characters survives the round trip");
  assert.equal(parseComplianceQrPayload(buildComplianceLink({ id: "q" }, { method: "qr" })).via, "qr");
  assert.equal(parseComplianceQrPayload("https://app.primovex.co.uk/sense/open/compliance/q").via, "link");
  // the older forms are untouched
  assert.equal(parseComplianceQrPayload("MEDTRAK:COMPLIANCE:abc").assetId, "abc");
  assert.equal(parseComplianceQrPayload("FP-007").assetId, "FP-007");
  // a room or fridge link is not a compliance tag
  assert.equal(parseComplianceQrPayload("https://app.primovex.co.uk/sense/open/space/room-1"), null);
  assert.equal(parseComplianceQrPayload("https://app.primovex.co.uk/sense/open/fridge/f1"), null);
});

t("a fire alarm test can only pass when every required step is ticked; the alarm receiving centre is optional", () => {
  const required = FIRE_TEST_STEPS.filter((s) => s.required).map((s) => s.key);
  assert.equal(required.length, 5);
  assert.equal(fireTestPassable([]), false);
  assert.equal(fireTestPassable(required.slice(0, 4)), false);
  assert.equal(fireTestPassable(required), true);
  assert.equal(fireTestPassable([...required, "arc"]), true);
  assert.equal(fireTestPassable(["arc"]), false, "the optional step alone is not enough");
  const saved = fireTestChecklist(required.slice(0, 3));
  assert.equal(saved.length, FIRE_TEST_STEPS.length);
  assert.deepEqual(saved.filter((s) => s.ok).map((s) => s.key), required.slice(0, 3));
  assert.equal(checklistGaps(fireTestChecklist(required)), "");
  assert.equal(checklistGaps(saved), "Not done: panel zone, reset");
  assert.equal(checklistGaps(null), "");
  assert.equal(checklistGaps(fireTestChecklist([...required, "arc"].slice(0, 5))), "", "an unticked optional step is not a gap");
});

t("a second scan of an asset checked a moment ago is noticed, with who did it", () => {
  const at = (minutes) => new Date(now.getTime() - minutes * 60000);
  assert.deepEqual(recentCheck({ lastCheckAt: at(4), lastCheckedByName: "Gwyn" }, now), { minutes: 4, by: "Gwyn" });
  assert.equal(recentCheck({ lastCheckAt: at(10) }, now), null, "ten minutes is not 'just now'");
  assert.equal(recentCheck({ lastCheckAt: at(120) }, now), null);
  assert.equal(recentCheck({}, now), null);
  assert.equal(recentCheck({ lastCheckAt: new Date(now.getTime() + 60000) }, now), null, "a clock slightly ahead is not a recent check");
});

t("'up to date' counts the checked assets, not the single fire call points or retired ones", () => {
  const list = [
    { assetType: "water_hot", frequency: "monthly", lastCheckAt: ago(3) },
    { assetType: "water_hot", frequency: "monthly", lastCheckAt: ago(40) },
    { assetType: "fire_door", frequency: "weekly", lastCheckAt: ago(1) },
    { assetType: "fire_point", frequency: "weekly", lastCheckAt: ago(30) },
    { assetType: "water_cold", frequency: "monthly", lastCheckAt: ago(3), active: false },
    { assetType: "aed", frequency: "weekly", lastCheckAt: ago(2), lastCheckResult: "fail" },
  ];
  assert.deepEqual(upToDateCount(list, now), { done: 2, total: 4 });
  assert.deepEqual(upToDateCount([], now), { done: 0, total: 0 });
});

console.log(`\n${n} passed`);
