// The compliance rules that need no database: what each kind of asset is, when a check is due, how a scan is read and
// whether a check passed. Kept apart from complianceQrService.js (which talks to Firestore) so they can be tested.

export const COMPLIANCE_ASSET_TYPES = [
  { key: "fire_point", label: "Fire Point", icon: "🔥", checkMode: "pass_fail", defaultFrequency: "weekly", codePrefix: "FP" },
  { key: "fire_door", label: "Fire Door", icon: "🚪", checkMode: "pass_fail", defaultFrequency: "weekly", codePrefix: "FD" },
  { key: "water_hot", label: "Hot Water Outlet", icon: "💧", checkMode: "temperature", defaultFrequency: "monthly", minTempC: 50, maxTempC: 80, codePrefix: "WH", countdownSeconds: 60, flushable: true },
  { key: "water_cold", label: "Cold Water Outlet", icon: "💧", checkMode: "temperature", defaultFrequency: "monthly", minTempC: 0, maxTempC: 20, codePrefix: "WC", countdownSeconds: 120, flushable: true },
  { key: "fridge", label: "Fridge", icon: "🌡️", checkMode: "temperature", defaultFrequency: "daily", minTempC: 2, maxTempC: 8, codePrefix: "FR" },
  { key: "freezer", label: "Freezer", icon: "❄️", checkMode: "temperature", defaultFrequency: "daily", minTempC: -25, maxTempC: -15, codePrefix: "FZ" },
  { key: "aed", label: "AED", icon: "❤️", checkMode: "pass_fail", defaultFrequency: "weekly", codePrefix: "AED" },
  { key: "emergency_equipment", label: "Emergency Equipment", icon: "🧰", checkMode: "pass_fail", defaultFrequency: "monthly", codePrefix: "EE" },
  // fire safety equipment (the key starts with fire_, so every fire screen and report picks them up)
  { key: "fire_emergency_light", label: "Emergency Light", icon: "💡", checkMode: "pass_fail", defaultFrequency: "monthly", codePrefix: "EL" },
  { key: "fire_extinguisher", label: "Fire Extinguisher", icon: "🧯", checkMode: "pass_fail", defaultFrequency: "monthly", codePrefix: "FX" },
  { key: "fire_drill", label: "Fire Drill", icon: "🚨", checkMode: "pass_fail", defaultFrequency: "sixmonthly", codePrefix: "DR" },
  { key: "fire_alarm_panel", label: "Fire Alarm Panel", icon: "🔔", checkMode: "pass_fail", defaultFrequency: "weekly", codePrefix: "AP" },
  // water safety beyond the taps (the key starts with water_, so the water screens and reports pick them up)
  { key: "water_tmv", label: "Thermostatic Mixing Valve (TMV)", icon: "🚿", checkMode: "temperature", defaultFrequency: "quarterly", minTempC: 38, maxTempC: 46, codePrefix: "TMV", countdownSeconds: 30, flushable: true },
  { key: "water_flush", label: "Little-used Outlet or Shower (flush)", icon: "🚰", checkMode: "pass_fail", defaultFrequency: "weekly", codePrefix: "FL" },
  { key: "general", label: "General Asset", icon: "📍", checkMode: "pass_fail", defaultFrequency: "monthly", codePrefix: "GA" },
];

export function getAssetTypeConfig(type) {
  return COMPLIANCE_ASSET_TYPES.find((row) => row.key === type) || COMPLIANCE_ASSET_TYPES.at(-1);
}

// Water outlets are checked after the water has been running for a set time:
// the phone counts that down and keeps the temperature box locked until it
// ends. The type sets it (hot 1 minute, cold 2 minutes, as in the HSE's
// legionella guidance: hot at least 50 °C within a minute, cold under 20 °C
// within two); an outlet can carry its own time (asset.countdownSeconds).
// 0 means no countdown. The hot range has no practical upper limit (80): the
// check is that the water gets hot enough, and a hot reading above the old
// 65 limit is not a fault.
export const DEFAULT_WATER_COUNTDOWN_SECONDS = 30;
export function getCountdownSeconds(asset) {
  const config = getAssetTypeConfig(asset?.assetType);
  if (!config.countdownSeconds) return 0;
  const own = Number(asset?.countdownSeconds);
  if (Number.isFinite(own) && own >= 0) return Math.min(600, Math.round(own));
  return config.countdownSeconds;
}
export function isFlushableAsset(asset) {
  return Boolean(getAssetTypeConfig(asset?.assetType).flushable);
}

export const FREQUENCY_MS = {
  daily: 24 * 3600000,
  weekly: 7 * 24 * 3600000,
  monthly: 30 * 24 * 3600000,
  quarterly: 91 * 24 * 3600000,
  sixmonthly: 182 * 24 * 3600000,
  annually: 365 * 24 * 3600000,
};

// how often, in words, for the screens that offer a choice
export const FREQUENCY_OPTIONS = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "quarterly", label: "Every 3 months" },
  { key: "sixmonthly", label: "Every 6 months" },
  { key: "annually", label: "Yearly" },
];

export function toDateValue(value) {
  if (!value) return null;
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// A monthly water-outlet check and a weekly fire-point check must not be
// treated the same just because both have "been checked at some point" —
// this is the actual re-check-is-due calculation, not just "ever checked".
//
// Fire points are the one exception: per BS 5839-1 weekly testing practice,
// the caretaker sets off ONE call point a week, a different one each time,
// so the whole system gets exercised in rotation — it is NOT "every call
// point needs testing every week". Individual fire_point assets are
// deliberately excluded here; see isFireAlarmTestDueThisWeek/
// getNextFirePointToTest below for the group-level equivalent.
export function isComplianceCheckDue(asset, now = new Date()) {
  if (!asset) return false;
  if (asset.assetType === "fire_point") return false;
  if (asset.lastCheckResult === "fail") return true;
  const lastChecked = toDateValue(asset.lastCheckAt);
  if (!lastChecked) return true;
  const intervalMs = FREQUENCY_MS[asset.frequency] ?? FREQUENCY_MS.monthly;
  return now.getTime() - lastChecked.getTime() >= intervalMs;
}

// Suggests the next free code for a type, e.g. FP-001, FP-002... — scoped
// per type so each asset type gets its own sequence rather than sharing one
// global counter. Only ever a suggestion: the field stays editable in case a
// practice already has its own physical labelling scheme to match.
export function generateNextAssetCode(assetType, existingAssets = []) {
  const prefix = getAssetTypeConfig(assetType).codePrefix || "GA";
  const pattern = new RegExp(`^${prefix}-(\\d+)$`, "i");
  const highest = existingAssets.reduce((max, asset) => {
    const match = pattern.exec(String(asset.assetCode || "").trim());
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `${prefix}-${String(highest + 1).padStart(3, "0")}`;
}

const FIRE_ROTATION_WINDOW_MS = FREQUENCY_MS.weekly;

function activeFirePoints(assets = []) {
  return assets.filter((asset) => asset.assetType === "fire_point" && asset.active !== false);
}

// The compliance obligation is satisfied for the week as soon as ANY fire
// point has been tested in the last 7 days — not each one individually.
export function isFireAlarmTestDueThisWeek(assets = [], now = new Date()) {
  const firePoints = activeFirePoints(assets);
  if (!firePoints.length) return false;
  const mostRecent = firePoints.reduce((latest, asset) => {
    const checked = toDateValue(asset.lastCheckAt);
    return checked && (!latest || checked > latest) ? checked : latest;
  }, null);
  if (!mostRecent) return true;
  return now.getTime() - mostRecent.getTime() >= FIRE_ROTATION_WINDOW_MS;
}

// Whichever fire point has gone longest without being tested — the natural
// "test this one next" suggestion that keeps the rotation actually covering
// every call point over time, rather than the same one or two getting picked
// out of habit.
export function getNextFirePointToTest(assets = []) {
  const firePoints = activeFirePoints(assets);
  if (!firePoints.length) return null;
  return [...firePoints].sort((a, b) => (toDateValue(a.lastCheckAt)?.getTime() || 0) - (toDateValue(b.lastCheckAt)?.getTime() || 0))[0];
}

export function normaliseAssetCode(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9_-]/g, "")
    .toUpperCase();
}

export function buildComplianceQrPayload(asset) {
  const assetId = asset?.id || asset?.assetCode || asset?.code;
  return `MEDTRAK:COMPLIANCE:${assetId}`;
}

// The address a tag or QR label can hold instead: it opens Primovex straight to that asset's check when the phone's own
// camera reads it, or an NFC tap wakes the phone (an iPhone can read a tag like this, and cannot read the older text).
// `method` ("qr" or "nfc") only records how it was found; it never changes which asset opens. The older text form stays
// readable, so labels already printed and tags already written keep working.
export const COMPLIANCE_LINK_ORIGIN = "https://app.primovex.co.uk";
export function buildComplianceLink(asset, { method = "", origin = COMPLIANCE_LINK_ORIGIN } = {}) {
  const assetId = asset?.id || asset?.assetCode || asset?.code;
  const base = `${String(origin).replace(/\/+$/, "")}/sense/open/compliance/${encodeURIComponent(assetId)}`;
  return method ? `${base}?m=${encodeURIComponent(method)}` : base;
}

export function parseComplianceQrPayload(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;

  const upper = value.toUpperCase();
  const parts = value.split(":");

  if (upper.startsWith("MEDTRAK:COMPLIANCE:")) {
    return { type: "compliance", assetId: parts.slice(2).join(":"), raw: value };
  }

  if (upper.startsWith("MTQR:")) {
    return { type: "compliance", assetId: value.slice(5), raw: value };
  }

  try {
    const url = new URL(value);
    const link = url.pathname.match(/^\/sense\/open\/compliance\/([^/]+)\/?$/i);
    if (link) return { type: "compliance", assetId: decodeURIComponent(link[1]), raw: value, via: url.searchParams.get("m") || "link" };
    const asset = url.searchParams.get("asset") || url.searchParams.get("assetId") || url.searchParams.get("a");
    if (asset) return { type: "compliance", assetId: asset, raw: value };
  } catch {
    // not a URL
  }

  // Plain asset code fallback: FP-007, W-023, etc.
  if (/^[A-Za-z]{1,5}-?[0-9A-Za-z]{1,12}$/.test(value)) {
    return { type: "compliance", assetId: value, raw: value };
  }

  return null;
}
export function evaluateComplianceResult(asset, payload = {}) {
  const mode = asset?.checkMode || getAssetTypeConfig(asset?.assetType)?.checkMode || "pass_fail";

  if (mode === "temperature") {
    const tempC = Number(payload.tempC);
    const min = asset.minTempC ?? getAssetTypeConfig(asset.assetType)?.minTempC;
    const max = asset.maxTempC ?? getAssetTypeConfig(asset.assetType)?.maxTempC;
    const hasTemp = Number.isFinite(tempC);
    const pass = hasTemp && (min === null || min === undefined || tempC >= Number(min)) && (max === null || max === undefined || tempC <= Number(max));
    return {
      status: pass ? "pass" : "fail",
      label: pass ? "Temperature in range" : "Temperature outside range",
      severity: pass ? "info" : "high",
      value: hasTemp ? tempC : null,
      minTempC: min ?? null,
      maxTempC: max ?? null,
    };
  }

  const pass = payload.status === "pass" || payload.passed === true;
  return {
    status: pass ? "pass" : "fail",
    label: pass ? "Check passed" : "Check failed",
    severity: pass ? "info" : "medium",
  };
}

// ---- changing an asset after it was created ------------------------------------------------------------------

export const RETIRE_REASONS = [
  { key: "removed", label: "Removed or no longer there" },
  { key: "replaced", label: "Replaced by another" },
  { key: "mistake", label: "Added by mistake" },
  { key: "out_of_use", label: "Out of use" },
];
export const retireReasonLabel = (key) => RETIRE_REASONS.find((r) => r.key === key)?.label || key;

const trimText = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const numberOrNull = (value) => (value === "" || value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value));

// What editing an asset may change (never its code, type or tag), checked. { patch, problems }
export function buildAssetPatch(form = {}, type = "general") {
  const config = getAssetTypeConfig(type);
  const problems = [];
  const label = trimText(form.label, 120);
  const location = trimText(form.location, 120);
  if (!location) problems.push("Choose where it is.");
  const patch = { label: label || config.label, location };
  if (form.siteId) patch.siteId = trimText(form.siteId, 80);
  if (config.key !== "fire_point") {
    const frequency = form.frequency || config.defaultFrequency;
    if (!FREQUENCY_MS[frequency]) problems.push("Choose how often it is checked.");
    else patch.frequency = frequency;
  }
  if (config.checkMode === "temperature") {
    const min = numberOrNull(form.minTempC);
    const max = numberOrNull(form.maxTempC);
    if (min === null || max === null) problems.push("Enter the lowest and highest safe temperature.");
    else if (min >= max) problems.push("The lowest temperature must be below the highest.");
    else { patch.minTempC = min; patch.maxTempC = max; }
  }
  if (config.countdownSeconds) {
    const seconds = numberOrNull(form.countdownSeconds);
    patch.countdownSeconds = seconds === null ? config.countdownSeconds : Math.min(600, Math.max(0, Math.round(seconds)));
  }
  return { patch, problems };
}

// ---- the weekly fire alarm test, as a short log ----
// What the person confirms as they test one call point, in the order it is done. All must be done for the test to pass.
// This practice's alarm is monitored, so the alarm receiving centre is told first. Kept in one list so it can be changed to
// match the practice's own fire log (the fire risk assessor says what the log should hold).
export const FIRE_TEST_STEPS = [
  { key: "arc", label: "The alarm receiving centre was told a test was about to happen", short: "alarm receiving centre told", required: true },
  { key: "warned", label: "Everyone in the building was told a test was happening", short: "occupants warned", required: true },
  { key: "operated", label: "The call point was operated with the test key", short: "call point operated", required: true },
  { key: "sounders", label: "The alarm sounders were heard", short: "sounders heard", required: true },
  { key: "panel", label: "The panel showed the right zone or call point", short: "panel zone", required: true },
  { key: "reset", label: "The call point and panel were reset and the alarm silenced", short: "reset", required: true },
];
// Tests saved before the alarm receiving centre step became required did not need it: a saved test remembers what was
// required when it was done, and an older one that does not say is read by this list.
const LEGACY_REQUIRED = ["warned", "operated", "sounders", "panel", "reset"];

// a test can only pass when every required step has been ticked; `ticked` is a list of step keys
export function fireTestPassable(ticked = []) {
  const done = new Set(ticked);
  return FIRE_TEST_STEPS.filter((s) => s.required).every((s) => done.has(s.key));
}

// Can the test be marked PASS? Every required step ticked, the panel question answered ("yes" a fault was shown, or "no"),
// and a note saying what it showed if there was one. A fault does not fail the test by itself: it is recorded, and the note
// says what it was (an earth fault, say) so it can be followed up.
export function fireTestCanPass({ ticked = [], fault = "", notes = "" } = {}) {
  if (!fireTestPassable(ticked)) return false;
  if (fault !== "yes" && fault !== "no") return false;
  return fault === "no" || String(notes).trim().length > 0;
}

// the steps as saved on a check: each with whether it was done
export const fireTestChecklist = (ticked = []) => FIRE_TEST_STEPS.map(({ key, label, required }) => ({ key, label, required, ok: ticked.includes(key) }));

// A short note of what a saved checklist missed, for the history ("" when every required step was done)
export function checklistGaps(checklist) {
  if (!Array.isArray(checklist)) return "";
  const short = new Map(FIRE_TEST_STEPS.map((s) => [s.key, s.short]));
  const missed = checklist
    .filter((step) => step.ok !== true && (step.required ?? LEGACY_REQUIRED.includes(step.key)))
    .map((step) => short.get(step.key) || step.label || step.key);
  return missed.length ? `Not done: ${missed.join(", ")}` : "";
}

// The panel's answer to "was a fault shown?" as saved on a check: true, false, or null when it was not asked
export const panelFault = (check) => (check && typeof check.faultDetected === "boolean" ? check.faultDetected : null);

// Was this asset checked a moment ago (so a second scan is probably a mistake)? { minutes, by } or null.
export function recentCheck(asset, now = new Date(), withinMinutes = 10) {
  const last = toDateValue(asset?.lastCheckAt);
  if (!last) return null;
  const minutes = Math.floor((now.getTime() - last.getTime()) / 60000);
  if (minutes < 0 || minutes >= withinMinutes) return null;
  return { minutes, by: asset.lastCheckedByName || "" };
}

// how many of the checked assets (not the single call points) are up to date: for "11 of 15 up to date"
export function upToDateCount(assets = [], now = new Date()) {
  const counted = assets.filter((a) => a && a.active !== false && a.assetType !== "fire_point");
  return { done: counted.filter((a) => !isComplianceCheckDue(a, now)).length, total: counted.length };
}
