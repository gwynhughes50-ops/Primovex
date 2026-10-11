// Synthetic compliance data for Demo and Training mode: a few fire points, water outlets and an AED with recent checks,
// one of which failed, so every screen on the Compliance page has something to show without touching live records.
// Dates are worked out from "now" so the demo never goes stale.

const HOUR = 3600000;
const DAY = 24 * HOUR;
const at = (msAgo) => new Date(Date.now() - msAgo);

const asset = (id, assetCode, assetType, label, location, extra = {}) => ({
  id, assetCode, assetType, label, location, siteId: "main_branch", active: true, checkMode: ["water_hot", "water_cold", "fridge", "freezer"].includes(assetType) ? "temperature" : "pass_fail",
  frequency: assetType.startsWith("water") ? "monthly" : "weekly", demo: true, ...extra,
});

export function demoComplianceAssets() {
  return [
    asset("demo-fp-1", "FP-001", "fire_point", "Reception Fire Point", "Reception", { lastCheckAt: at(2 * DAY), lastCheckResult: "pass", lastCheckedByName: "Demo Caretaker" }),
    asset("demo-fp-2", "FP-002", "fire_point", "Corridor Fire Point", "Main corridor", { lastCheckAt: at(9 * DAY), lastCheckResult: "pass", lastCheckedByName: "Demo Caretaker" }),
    asset("demo-fp-3", "FP-003", "fire_point", "Back Door Fire Point", "Back door", { lastCheckAt: at(16 * DAY), lastCheckResult: "pass", lastCheckedByName: "Demo Caretaker" }),
    asset("demo-wh-1", "WH-001", "water_hot", "Treatment Room 1 Hot Tap", "Treatment Room 1", { minTempC: 50, maxTempC: 65, lastCheckAt: at(6 * DAY), lastCheckResult: "pass", lastCheckedByName: "Demo Caretaker" }),
    asset("demo-wh-2", "WH-002", "water_hot", "Staff Kitchen Hot Tap", "Staff kitchen", { minTempC: 50, maxTempC: 65, lastCheckAt: at(5 * DAY), lastCheckResult: "fail", lastCheckedByName: "Demo Caretaker" }),
    asset("demo-wc-1", "WC-001", "water_cold", "Treatment Room 1 Cold Tap", "Treatment Room 1", { minTempC: 0, maxTempC: 20, lastCheckAt: at(40 * DAY), lastCheckResult: "pass", lastCheckedByName: "Demo Caretaker" }),
    asset("demo-aed-1", "AED-001", "aed", "Reception AED", "Reception", { frequency: "weekly", lastCheckAt: at(3 * DAY), lastCheckResult: "pass", lastCheckedByName: "Demo Nurse" }),
  ];
}

export function demoComplianceChecks() {
  const check = (id, assetRow, daysAgo, result, extra = {}) => ({
    id, siteId: "main_branch", assetId: assetRow.id, assetCode: assetRow.assetCode, assetType: assetRow.assetType, assetLabel: assetRow.label, location: assetRow.location,
    checkMode: assetRow.checkMode, result, performedAt: at(daysAgo * DAY), createdAt: at(daysAgo * DAY), actor: { displayName: "Demo Caretaker" }, source: "mobile_qr", demo: true, ...extra,
  });
  const rows = demoComplianceAssets();
  const by = (code) => rows.find((r) => r.assetCode === code);
  return [
    check("demo-c1", by("FP-001"), 2, "pass"),
    check("demo-c2", by("FP-002"), 9, "pass"),
    check("demo-c3", by("FP-003"), 16, "pass"),
    check("demo-c4", by("WH-001"), 6, "pass", { tempC: 56, flushed: true }),
    check("demo-c5", by("WH-002"), 5, "fail", { tempC: 44, flushed: true, notes: "Water not getting hot" }),
    check("demo-c6", by("WC-001"), 40, "pass", { tempC: 17 }),
    check("demo-c7", by("AED-001"), 3, "pass", { actor: { displayName: "Demo Nurse" } }),
  ];
}
