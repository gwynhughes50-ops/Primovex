import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  limit,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export const COMPLIANCE_ASSETS_COLLECTION = "compliance_assets";
export const COMPLIANCE_CHECKS_COLLECTION = "compliance_checks";
export const PULSE_EVENTS_COLLECTION = "pulse_events";

export const COMPLIANCE_ASSET_TYPES = [
  { key: "fire_point", label: "Fire Point", icon: "🔥", checkMode: "pass_fail", defaultFrequency: "weekly" },
  { key: "fire_door", label: "Fire Door", icon: "🚪", checkMode: "pass_fail", defaultFrequency: "weekly" },
  { key: "water_hot", label: "Hot Water Outlet", icon: "💧", checkMode: "temperature", defaultFrequency: "monthly", minTempC: 50, maxTempC: 65 },
  { key: "water_cold", label: "Cold Water Outlet", icon: "💧", checkMode: "temperature", defaultFrequency: "monthly", minTempC: 0, maxTempC: 20 },
  { key: "fridge", label: "Fridge", icon: "🌡️", checkMode: "temperature", defaultFrequency: "daily", minTempC: 2, maxTempC: 8 },
  { key: "freezer", label: "Freezer", icon: "❄️", checkMode: "temperature", defaultFrequency: "daily", minTempC: -45, maxTempC: -35 },
  { key: "aed", label: "AED", icon: "❤️", checkMode: "pass_fail", defaultFrequency: "weekly" },
  { key: "emergency_equipment", label: "Emergency Equipment", icon: "🧰", checkMode: "pass_fail", defaultFrequency: "monthly" },
  { key: "general", label: "General Asset", icon: "📍", checkMode: "pass_fail", defaultFrequency: "monthly" },
];

export function getAssetTypeConfig(type) {
  return COMPLIANCE_ASSET_TYPES.find((row) => row.key === type) || COMPLIANCE_ASSET_TYPES.at(-1);
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

  const ref = await addDoc(collection(db, COMPLIANCE_ASSETS_COLLECTION), payload);
  await updateDoc(ref, { qrPayload: `MEDTRAK:COMPLIANCE:${ref.id}`, docId: ref.id });
  return { id: ref.id, ...payload, qrPayload: `MEDTRAK:COMPLIANCE:${ref.id}` };
}

export async function recordComplianceCheck(asset, payload = {}) {
  if (!asset?.id) throw new Error("Compliance asset is required.");
  const actor = payload.actor || getCurrentActor();
  const result = evaluateComplianceResult(asset, payload);

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

  const ref = await addDoc(collection(db, COMPLIANCE_CHECKS_COLLECTION), check);
  await updateDoc(doc(db, COMPLIANCE_ASSETS_COLLECTION, asset.id), {
    lastCheckAt: serverTimestamp(),
    lastCheckResult: result.status,
    lastCheckedByUid: actor.uid || null,
    lastCheckedByName: actor.displayName || null,
    updatedAt: serverTimestamp(),
  });

  if (result.status === "fail") {
    await createCompliancePulseEvent(asset, check, result);
  }

  return { id: ref.id, ...check };
}

export async function createCompliancePulseEvent(asset, check, result) {
  return addDoc(collection(db, PULSE_EVENTS_COLLECTION), {
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

export function getQrImageUrl(payload, size = 220) {
  const data = encodeURIComponent(payload || "");
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=10&data=${data}`;
}
