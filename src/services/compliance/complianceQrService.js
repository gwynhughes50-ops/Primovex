import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  limit,
} from "firebase/firestore";
import { addDocResendSafe } from "@/lib/resendSafeWrites";
import { auth, db } from "@/lib/firebase";

export const COMPLIANCE_ASSETS_COLLECTION = "compliance_assets";
export const COMPLIANCE_CHECKS_COLLECTION = "compliance_checks";
export const PULSE_EVENTS_COLLECTION = "pulse_events";

export const COMPLIANCE_ASSET_TYPES = [
  { key: "fire_point", label: "Fire Point", icon: "🔥", checkMode: "pass_fail", defaultFrequency: "weekly", codePrefix: "FP" },
  { key: "fire_door", label: "Fire Door", icon: "🚪", checkMode: "pass_fail", defaultFrequency: "weekly", codePrefix: "FD" },
  { key: "water_hot", label: "Hot Water Outlet", icon: "💧", checkMode: "temperature", defaultFrequency: "monthly", minTempC: 50, maxTempC: 65, codePrefix: "WH", countdownSeconds: 30, flushable: true },
  { key: "water_cold", label: "Cold Water Outlet", icon: "💧", checkMode: "temperature", defaultFrequency: "monthly", minTempC: 0, maxTempC: 20, codePrefix: "WC", countdownSeconds: 30, flushable: true },
  { key: "fridge", label: "Fridge", icon: "🌡️", checkMode: "temperature", defaultFrequency: "daily", minTempC: 2, maxTempC: 8, codePrefix: "FR" },
  { key: "freezer", label: "Freezer", icon: "❄️", checkMode: "temperature", defaultFrequency: "daily", minTempC: -45, maxTempC: -35, codePrefix: "FZ" },
  { key: "aed", label: "AED", icon: "❤️", checkMode: "pass_fail", defaultFrequency: "weekly", codePrefix: "AED" },
  { key: "emergency_equipment", label: "Emergency Equipment", icon: "🧰", checkMode: "pass_fail", defaultFrequency: "monthly", codePrefix: "EE" },
  { key: "general", label: "General Asset", icon: "📍", checkMode: "pass_fail", defaultFrequency: "monthly", codePrefix: "GA" },
];

export function getAssetTypeConfig(type) {
  return COMPLIANCE_ASSET_TYPES.find((row) => row.key === type) || COMPLIANCE_ASSET_TYPES.at(-1);
}

// Water outlets are checked after the water has been running for a set time:
// the phone counts that down and keeps the temperature box locked until it
// ends. 30 seconds by default; an outlet can carry its own time
// (asset.countdownSeconds). 0 means no countdown.
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

const FREQUENCY_MS = {
  daily: 24 * 3600000,
  weekly: 7 * 24 * 3600000,
  monthly: 30 * 24 * 3600000,
  quarterly: 91 * 24 * 3600000,
  annually: 365 * 24 * 3600000,
};

function toDateValue(value) {
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

export function subscribeComplianceAssets(onData, onError, { siteId = "main_branch", includeInactive = false } = {}) {
  const qy = query(collection(db, COMPLIANCE_ASSETS_COLLECTION), orderBy("assetCode", "asc"));
  return onSnapshot(
    qy,
    (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const filtered = rows.filter((row) => {
        const sameSite = !siteId || String(row.siteId || "").trim() === siteId;
        const active = includeInactive || row.active !== false;
        return sameSite && active;
      });
      onData(filtered);
    },
    onError
  );
}

export function subscribeRecentComplianceChecks(onData, onError, { siteId = "main_branch", max = 30 } = {}) {
  const qy = query(collection(db, COMPLIANCE_CHECKS_COLLECTION), orderBy("createdAt", "desc"), limit(max));
  return onSnapshot(
    qy,
    (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      onData(rows.filter((row) => !siteId || String(row.siteId || "").trim() === siteId));
    },
    onError
  );
}

export async function findComplianceAssetByScan(rawScan, { siteId = "main_branch" } = {}) {
  const parsed = parseComplianceQrPayload(rawScan);
  if (!parsed?.assetId) throw new Error("This QR/NFC tag is not a MedTrak compliance asset.");

  const assetId = String(parsed.assetId || "").trim();

  // Try direct document id first.
  const direct = await getDoc(doc(db, COMPLIANCE_ASSETS_COLLECTION, assetId));
  if (direct.exists()) {
    const row = { id: direct.id, ...direct.data(), scanRaw: rawScan };
    if (!siteId || String(row.siteId || "") === siteId) return row;
  }

  // Fallback to assetCode lookup.
  const code = normaliseAssetCode(assetId);
  const qy = query(collection(db, COMPLIANCE_ASSETS_COLLECTION), where("assetCode", "==", code), limit(1));

  const snap = await getDocs(qy);
  const docSnap = snap.docs[0];
  if (!docSnap) throw new Error(`No compliance asset found for ${assetId}.`);
  const row = { id: docSnap.id, ...docSnap.data(), scanRaw: rawScan };
  if (siteId && String(row.siteId || "") !== siteId) throw new Error("Asset belongs to another site.");
  return row;
}

function getCurrentActor() {
  const user = auth.currentUser;
  return {
    uid: user?.uid || null,
    email: user?.email || null,
    displayName: user?.displayName || user?.email || "Unknown user",
  };
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

export async function createComplianceAsset(form = {}) {
  const config = getAssetTypeConfig(form.assetType);
  const assetCode = normaliseAssetCode(form.assetCode || form.code);
  if (!assetCode) throw new Error("Asset code is required.");

  const payload = {
    siteId: form.siteId || "main_branch",
    assetCode,
    assetType: form.assetType || "general",
    label: String(form.label || config.label || assetCode).trim(),
    location: String(form.location || "").trim(),
    department: String(form.department || "").trim(),
    checkMode: form.checkMode || config.checkMode || "pass_fail",
    frequency: form.frequency || config.defaultFrequency || "monthly",
    minTempC: form.minTempC === "" || form.minTempC === undefined ? config.minTempC ?? null : Number(form.minTempC),
    maxTempC: form.maxTempC === "" || form.maxTempC === undefined ? config.maxTempC ?? null : Number(form.maxTempC),
    countdownSeconds: config.countdownSeconds
      ? (form.countdownSeconds === "" || form.countdownSeconds === undefined ? config.countdownSeconds : Math.max(0, Math.min(600, Math.round(Number(form.countdownSeconds) || 0))))
      : null,
    legacyId: form.legacyId || null,
    active: true,
    identificationMethods: {
      qr: true,
      nfc: true,
      manualId: true,
      barcode: true,
    },
    qrPayload: `MEDTRAK:COMPLIANCE:${assetCode}`,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const ref = await addDocResendSafe(collection(db, COMPLIANCE_ASSETS_COLLECTION), payload);
  await updateDoc(ref, { qrPayload: `MEDTRAK:COMPLIANCE:${ref.id}`, docId: ref.id });
  return { id: ref.id, ...payload, qrPayload: `MEDTRAK:COMPLIANCE:${ref.id}` };
}

// One-off bridge from the old Fire Checks and Water Temperatures lists to the
// tag-based assets. Each old call point / water outlet that hasn't been brought
// across yet becomes an asset (with its own code, ready for a tag), and is
// remembered by its old id so running this again never makes duplicates.
// The old records themselves are not touched.
export async function importLegacyComplianceAssets(existingAssets = [], { siteId = "main_branch" } = {}) {
  const [pointsSnap, outletsSnap] = await Promise.all([
    getDocs(collection(db, "fire_call_points")),
    getDocs(collection(db, "water_outlets")),
  ]);
  const already = new Set(existingAssets.map((a) => a.legacyId).filter(Boolean));
  const pool = [...existingAssets];
  const wanted = [];

  const isSite = (row) => String(row.siteId ?? row.site ?? "").trim() === siteId && row.active !== false;
  pointsSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter(isSite)
    .sort((a, b) => String(a.pointNumber || "").localeCompare(String(b.pointNumber || ""), undefined, { numeric: true }))
    .forEach((row) => {
      wanted.push({
        legacyId: "fire_call_points/" + row.id,
        assetType: "fire_point",
        label: String(row.displayName || row.label || "Call point").trim(),
        location: String(row.label || "").trim(),
        frequency: "weekly",
      });
    });
  outletsSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter(isSite)
    .sort((a, b) => (Number(a.order) || 9999) - (Number(b.order) || 9999))
    .forEach((row) => {
      const type = String(row.type || "").toLowerCase();
      wanted.push({
        legacyId: "water_outlets/" + row.id,
        assetType: type.includes("cold") ? "water_cold" : "water_hot",
        label: String(row.name || "Outlet").trim(),
        location: String(row.location || "").trim(),
        frequency: FREQUENCY_MS[row.frequency] ? row.frequency : "monthly",
      });
    });

  let created = 0;
  for (const item of wanted) {
    if (already.has(item.legacyId)) continue;
    const assetCode = generateNextAssetCode(item.assetType, pool);
    const made = await createComplianceAsset({ ...item, assetCode, siteId });
    pool.push({ assetCode: made.assetCode, assetType: item.assetType });
    created += 1;
  }
  return { created, alreadyImported: wanted.length - created, total: wanted.length };
}

export async function recordComplianceCheck(asset, payload = {}) {
  if (!asset?.id) throw new Error("Compliance asset is required.");
  const actor = payload.actor || getCurrentActor();
  const result = evaluateComplianceResult(asset, payload);
  // Phone checks are stamped by the server as they are saved. A record typed in
  // afterwards on the desktop (someone forgot to tap, no phone to hand) carries
  // the date and time the check really happened, plus why it was entered by
  // hand. createdAt still shows when it was entered, so the two are never confused.
  const performedDate = payload.performedAt instanceof Date && !Number.isNaN(payload.performedAt.getTime()) ? payload.performedAt : null;
  const isManual = payload.source === "manual_desktop";

  const check = {
    siteId: asset.siteId || "main_branch",
    assetId: asset.id,
    assetCode: asset.assetCode || null,
    assetType: asset.assetType || "general",
    assetLabel: asset.label || asset.assetCode || "Compliance asset",
    location: asset.location || "",
    department: asset.department || "",
    checkMode: asset.checkMode || "pass_fail",
    result: result.status,
    resultLabel: result.label,
    severity: result.severity,
    tempC: result.value ?? null,
    minTempC: result.minTempC ?? asset.minTempC ?? null,
    maxTempC: result.maxTempC ?? asset.maxTempC ?? null,
    notes: String(payload.notes || "").trim(),
    flushed: typeof payload.flushed === "boolean" ? payload.flushed : null,
    countdown: payload.countdown
      ? {
          seconds: Number(payload.countdown.seconds) || 0,
          startedAt: payload.countdown.startedAt || null,
          completedAt: payload.countdown.completedAt || null,
        }
      : null,
    performedAt: performedDate ? Timestamp.fromDate(performedDate) : serverTimestamp(),
    manualEntry: isManual,
    manualReason: isManual ? String(payload.manualReason || "").trim() : null,
    source: payload.source || "mobile_qr",
    identificationMethod: payload.identificationMethod || "qr",
    scanRaw: payload.scanRaw || asset.scanRaw || null,
    nfcTagId: payload.nfcTagId || null,
    deviceInfo: payload.deviceInfo || {
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    },
    actor,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const ref = await addDocResendSafe(collection(db, COMPLIANCE_CHECKS_COLLECTION), check);
  // A back-dated manual record must not push the asset's "last checked" earlier
  // than a check that has already been recorded since.
  const lastKnown = toDateValue(asset.lastCheckAt);
  const supersedes = !performedDate || !lastKnown || performedDate.getTime() >= lastKnown.getTime();
  if (supersedes) {
    await updateDoc(doc(db, COMPLIANCE_ASSETS_COLLECTION, asset.id), {
      lastCheckAt: performedDate ? Timestamp.fromDate(performedDate) : serverTimestamp(),
      lastCheckResult: result.status,
      lastCheckedByUid: actor.uid || null,
      lastCheckedByName: actor.displayName || null,
      updatedAt: serverTimestamp(),
    });
  }

  if (result.status === "fail") {
    await createCompliancePulseEvent(asset, check, result);
  }

  return { id: ref.id, ...check };
}

export async function createCompliancePulseEvent(asset, check, result) {
  return addDocResendSafe(collection(db, PULSE_EVENTS_COLLECTION), {
    siteId: asset.siteId || check.siteId || "main_branch",
    module: "compliance",
    source: "compliance_qr",
    title: `${asset.label || asset.assetCode || "Compliance asset"} failed check`,
    summary:
      asset.checkMode === "temperature"
        ? `${asset.label || asset.assetCode} recorded ${check.tempC}°C outside configured range.`
        : `${asset.label || asset.assetCode} was marked as not working / failed.`,
    severity: result.severity || "medium",
    status: "open",
    assignedRole: "Caretaker",
    assetId: asset.id,
    assetCode: asset.assetCode || null,
    checkId: check.id || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export { getQrImageUrl } from "@/lib/qrCode";
