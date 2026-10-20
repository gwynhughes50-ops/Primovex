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
import { isSafeSyntheticMode } from "@/config/platformMode";
import { demoComplianceAssets, demoComplianceChecks } from "@/data/demoCompliance";
import { openIncidentForFailedCheck } from "@/modules/compliance/complianceIncidentService";
import { deviceStorage, findCachedAsset, flushQueue, isOfflineError, queueCheck } from "@/modules/compliance/offlineChecks";
import {
  FREQUENCY_MS, toDateValue, buildAssetPatch, RETIRE_REASONS, retireReasonLabel,
  COMPLIANCE_ASSET_TYPES, DEFAULT_WATER_COUNTDOWN_SECONDS, buildComplianceQrPayload, evaluateComplianceResult, generateNextAssetCode, getAssetTypeConfig,
  getCountdownSeconds, getNextFirePointToTest, isComplianceCheckDue, isFireAlarmTestDueThisWeek, isFlushableAsset, normaliseAssetCode, parseComplianceQrPayload,
} from "./complianceRules";

export {
  COMPLIANCE_ASSET_TYPES, DEFAULT_WATER_COUNTDOWN_SECONDS, buildComplianceQrPayload, evaluateComplianceResult, generateNextAssetCode, getAssetTypeConfig,
  getCountdownSeconds, getNextFirePointToTest, isComplianceCheckDue, isFireAlarmTestDueThisWeek, isFlushableAsset, normaliseAssetCode, parseComplianceQrPayload,
};

export const COMPLIANCE_ASSETS_COLLECTION = "compliance_assets";
export const COMPLIANCE_CHECKS_COLLECTION = "compliance_checks";
export const PULSE_EVENTS_COLLECTION = "pulse_events";


// siteId: one site's assets, or empty for every site. Demo and training mode show synthetic assets and never read live records.
export function subscribeComplianceAssets(onData, onError, { siteId = "", includeInactive = false } = {}) {
  if (isSafeSyntheticMode()) {
    const timer = setTimeout(() => onData(demoComplianceAssets().filter((row) => !siteId || row.siteId === siteId)), 30);
    return () => clearTimeout(timer);
  }
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

// The latest checks, newest first. sinceDays asks for every check in that many days (so a busy week is never cut
// short by a row limit); without it you get the latest `max`. siteId empty means every site.
export function subscribeRecentComplianceChecks(onData, onError, { siteId = "", max = 30, sinceDays = 0 } = {}) {
  if (isSafeSyntheticMode()) {
    const timer = setTimeout(() => onData(demoComplianceChecks().filter((row) => !siteId || row.siteId === siteId)), 30);
    return () => clearTimeout(timer);
  }
  const since = sinceDays > 0 ? Timestamp.fromDate(new Date(Date.now() - sinceDays * 86400000)) : null;
  const qy = since
    ? query(collection(db, COMPLIANCE_CHECKS_COLLECTION), where("createdAt", ">=", since), orderBy("createdAt", "desc"), limit(max))
    : query(collection(db, COMPLIANCE_CHECKS_COLLECTION), orderBy("createdAt", "desc"), limit(max));
  return onSnapshot(
    qy,
    (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      onData(rows.filter((row) => !siteId || String(row.siteId || "").trim() === siteId));
    },
    onError
  );
}

// A tag names its own asset, so a scan finds it at any site unless a site is asked for.
// Every check between two dates (inclusive), for the printed report: not limited to what is already on screen.
export async function getComplianceChecksBetween({ from, to, siteId = "", max = 5000 } = {}) {
  if (isSafeSyntheticMode()) return demoComplianceChecks().filter((row) => !siteId || row.siteId === siteId);
  const start = from ? Timestamp.fromDate(new Date(`${from}T00:00:00`)) : null;
  const end = to ? Timestamp.fromDate(new Date(`${to}T23:59:59.999`)) : null;
  const constraints = [orderBy("createdAt", "desc")];
  if (start) constraints.unshift(where("createdAt", ">=", start));
  if (end) constraints.unshift(where("createdAt", "<=", end));
  const snap = await getDocs(query(collection(db, COMPLIANCE_CHECKS_COLLECTION), ...constraints, limit(max)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((row) => !siteId || String(row.siteId || "").trim() === siteId);
}

export async function findComplianceAssetByScan(rawScan, { siteId = "" } = {}) {
  const parsed = parseComplianceQrPayload(rawScan);
  if (!parsed?.assetId) throw new Error("This QR/NFC tag is not a Primovex compliance asset.");
  try {
    return await lookupAssetOnline(parsed, rawScan, siteId);
  } catch (error) {
    if (!isOfflineError(error)) throw error;
    // no signal: use the list kept on the phone from the last time Compliance was open with one
    const saved = findCachedAsset(deviceStorage(), parsed.assetId);
    if (saved && (!siteId || String(saved.siteId || "") === siteId)) return { ...saved, scanRaw: rawScan, fromCache: true };
    throw new Error("There is no signal, and this asset is not saved on the phone yet. Open Compliance once with a signal and it will work without one.");
  }
}

async function lookupAssetOnline(parsed, rawScan, siteId) {
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
    // done with no signal and sent afterwards: performedAt is when it was really done, createdAt when it reached the server
    savedOffline: payload.savedOffline === true,
    // the steps of a fire alarm test, each with whether it was done (null for any other check)
    checklist: Array.isArray(payload.checklist) ? payload.checklist.slice(0, 12).map((step) => ({ key: String(step?.key || "").slice(0, 40), label: String(step?.label || "").slice(0, 120), ok: step?.ok === true })) : null,
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

  const ref = await addDocResendSafe(collection(db, COMPLIANCE_CHECKS_COLLECTION), check, payload.checkId || undefined);
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
    // a failure is someone's job to put right: open an incident and tell the caretaker and practice manager
    await openIncidentForFailedCheck({ asset, check: { ...check, id: ref.id }, actor });
  }

  return { id: ref.id, ...check };
}

// ---- checking without a signal (see modules/compliance/offlineChecks.js) ----

const withTimeout = (promise, ms) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("The save timed out.")), ms);
  promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
});

// Save a check. With a signal this is exactly recordComplianceCheck. With none (or a save that does not answer in time)
// the check is kept on the phone, with the real time, and sent by flushQueuedComplianceChecks when there is a signal.
// Returns the saved check, or { queued: true, ... } with what the result card needs.
export async function saveComplianceCheck(asset, payload = {}, { timeoutMs = 9000 } = {}) {
  const storage = deviceStorage();
  const actor = payload.actor || getCurrentActor();
  const checkId = doc(collection(db, COMPLIANCE_CHECKS_COLLECTION)).id;
  const { performedAt, ...keep } = payload; // a queued check carries its own time
  const queueIt = () => {
    queueCheck(storage, { id: checkId, asset, payload: { ...keep, actor: undefined }, actor, performedAtMs: Date.now(), identificationMethod: payload.identificationMethod || "qr", scanRaw: payload.scanRaw || asset.scanRaw || null });
    const result = evaluateComplianceResult(asset, payload);
    return { queued: true, id: checkId, result: result.status, checkMode: asset.checkMode || "pass_fail", tempC: result.value ?? null };
  };
  if (typeof navigator !== "undefined" && navigator.onLine === false) return queueIt();
  try {
    return await withTimeout(recordComplianceCheck(asset, { ...payload, actor, checkId }), timeoutMs);
  } catch (error) {
    if (isOfflineError(error)) return queueIt();
    throw error;
  }
}

let flushing = null;

// Send the checks kept on this phone, for the person signed in. Safe to call often: one run at a time, and a repeat
// lands on the same record. Resolves to { sent, waiting, otherPeople, failed, offline }.
export function flushQueuedComplianceChecks() {
  if (flushing) return flushing;
  flushing = flushQueue({
    storage: deviceStorage(),
    currentUid: auth.currentUser?.uid || null,
    online: typeof navigator === "undefined" ? true : navigator.onLine !== false,
    record: async (entry) => {
      // the asset as it is now (not as it was when the phone last saw it), so an older check never hides a newer one
      const snap = await getDoc(doc(db, COMPLIANCE_ASSETS_COLLECTION, entry.asset.id));
      if (!snap.exists()) throw new Error("That asset no longer exists.");
      const asset = { ...entry.asset, ...snap.data(), id: snap.id };
      await recordComplianceCheck(asset, {
        ...entry.payload,
        actor: entry.actor,
        source: "mobile_offline",
        savedOffline: true,
        performedAt: new Date(entry.performedAtMs),
        checkId: entry.id,
        identificationMethod: entry.identificationMethod,
        scanRaw: entry.scanRaw,
      });
    },
  }).finally(() => { flushing = null; });
  return flushing;
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

// ---- changing an asset after it was created ----

const who = (actor = {}) => actor.displayName || actor.name || actor.email || "Unknown";

// Edit where an asset is, its name, how often it is checked and its safe range. Never its code, type or tag.
export async function updateComplianceAsset(asset, form, actor) {
  const { patch, problems } = buildAssetPatch(form, asset?.assetType);
  if (problems.length) throw new Error(problems[0]);
  await updateDoc(doc(db, COMPLIANCE_ASSETS_COLLECTION, asset.id), { ...patch, updatedAt: serverTimestamp(), updatedByName: who(actor) });
  return patch;
}

// Stop counting an asset (removed, replaced, added by mistake). It stays on record with its checks, and can come back.
export async function retireComplianceAsset(asset, { reason, actor }) {
  if (!RETIRE_REASONS.some((r) => r.key === reason)) throw new Error("Say why it is being retired.");
  await updateDoc(doc(db, COMPLIANCE_ASSETS_COLLECTION, asset.id), { active: false, retiredReason: reason, retiredReasonLabel: retireReasonLabel(reason), retiredAt: serverTimestamp(), retiredByName: who(actor), updatedAt: serverTimestamp() });
}

export async function restoreComplianceAsset(asset, actor) {
  await updateDoc(doc(db, COMPLIANCE_ASSETS_COLLECTION, asset.id), { active: true, retiredReason: "", retiredReasonLabel: "", restoredAt: serverTimestamp(), restoredByName: who(actor), updatedAt: serverTimestamp() });
}
