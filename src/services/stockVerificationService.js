import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";

const STOCK_ITEMS_COL = "stock_items";
const STOCK_VERIFICATIONS_COL = "stock_verifications";
const STOCK_MOVEMENTS_COL = "stock_movements";

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toDate(value) {
  if (!value) return null;
  if (value?.toDate && typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysBetween(from, to = new Date()) {
  if (!from) return null;
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86400000));
}

function normalizeActor(actor) {
  if (!actor) return null;
  return {
    uid: actor?.uid || actor?.user?.uid || null,
    displayName: actor?.displayName || actor?.name || actor?.user?.displayName || null,
    email: actor?.email || actor?.user?.email || null,
  };
}

function getVerificationIntervalDays(item) {
  const explicit = toNumber(item?.verification_interval_days, 0);
  if (explicit > 0) return explicit;

  const category = String(item?.category || "").toLowerCase();
  const currentStock = toNumber(item?.current_stock, 0);
  const minStock = toNumber(item?.min_stock, 0);
  const discrepancies = toNumber(item?.verification_discrepancy_count, 0);

  if (discrepancies > 0) return 90;
  if (["emergency_drugs", "vaccines", "medicinal"].includes(category)) return 90;
  if (minStock > 0 && currentStock <= minStock) return 120;
  if (["dressings", "clinical", "consumables"].includes(category)) return 180;

  return 365;
}

export function getStockVerificationMeta(item, now = new Date()) {
  const lastVerifiedAt = toDate(item?.last_verified_at || item?.lastVerifiedAt);
  const intervalDays = getVerificationIntervalDays(item);
  const daysSince = daysBetween(lastVerifiedAt, now);
  const overdueDays = daysSince === null ? intervalDays : Math.max(0, daysSince - intervalDays);
  const discrepancyCount = toNumber(item?.verification_discrepancy_count, 0);
  const currentStock = toNumber(item?.current_stock, 0);
  const minStock = toNumber(item?.min_stock, 0);

  let score = 0;
  if (daysSince === null) score += 60;
  else score += Math.min(60, Math.round((daysSince / intervalDays) * 60));

  if (discrepancyCount > 0) score += Math.min(25, discrepancyCount * 8);
  if (minStock > 0 && currentStock <= minStock) score += 10;
  if (String(item?.category || "").toLowerCase().includes("emergency")) score += 10;

  score = Math.max(0, Math.min(100, score));

  const confidence = daysSince === null
    ? 45
    : Math.max(25, Math.min(100, 100 - Math.round((daysSince / intervalDays) * 55) - Math.min(20, discrepancyCount * 5)));

  return {
    lastVerifiedAt,
    intervalDays,
    daysSince,
    overdueDays,
    discrepancyCount,
    verificationPriority: score,
    confidence,
    isOverdue: daysSince === null || daysSince >= intervalDays,
  };
}

export function buildSmartVerificationPlan(items = [], options = {}) {
  const now = options.now || new Date();
  const maxItems = Number(options.maxItems || 5);
  const activeItems = (Array.isArray(items) ? items : []).filter((item) => !item?.archived_at);

  const ranked = activeItems
    .map((item) => {
      const meta = getStockVerificationMeta(item, now);
      const expectedQty = toNumber(item?.current_stock, 0);
      return {
        item,
        itemId: item.id,
        name: item?.name || item?.item_name || "Unnamed item",
        location: item?.location || "Unassigned location",
        site: item?.site || "Main site",
        category: item?.category || "stock",
        expectedQty,
        ...meta,
      };
    })
    .sort((a, b) => b.verificationPriority - a.verificationPriority || a.name.localeCompare(b.name));

  const selected = [];
  const seenLocations = new Set();

  // Spread checks across rooms first so the task feels like a light walk-round rather than a mini stock take.
  for (const row of ranked) {
    const locationKey = String(row.location || "").toLowerCase();
    if (selected.length >= maxItems) break;
    if (seenLocations.has(locationKey) && ranked.length > maxItems) continue;
    selected.push(row);
    seenLocations.add(locationKey);
  }

  for (const row of ranked) {
    if (selected.length >= maxItems) break;
    if (!selected.find((existing) => existing.itemId === row.itemId)) selected.push(row);
  }

  const estimatedMinutes = Math.max(1, Math.ceil(selected.length * 0.75));

  return {
    generatedAt: now,
    totalItems: activeItems.length,
    selected,
    estimatedMinutes,
  };
}

export function calculateInventoryConfidence(items = [], now = new Date()) {
  const activeItems = (Array.isArray(items) ? items : []).filter((item) => !item?.archived_at);
  if (activeItems.length === 0) {
    return { score: 100, total: 0, verified: 0, overdue: 0, neverVerified: 0, unresolvedDiscrepancies: 0 };
  }

  let confidenceTotal = 0;
  let verified = 0;
  let overdue = 0;
  let neverVerified = 0;
  let unresolvedDiscrepancies = 0;

  activeItems.forEach((item) => {
    const meta = getStockVerificationMeta(item, now);
    confidenceTotal += meta.confidence;
    if (meta.lastVerifiedAt) verified += 1;
    if (meta.isOverdue) overdue += 1;
    if (!meta.lastVerifiedAt) neverVerified += 1;
    if (toNumber(item?.verification_unresolved_discrepancy, 0) !== 0) unresolvedDiscrepancies += 1;
  });

  return {
    score: Math.round(confidenceTotal / activeItems.length),
    total: activeItems.length,
    verified,
    overdue,
    neverVerified,
    unresolvedDiscrepancies,
  };
}

export async function recordStockVerification({ item, actualQty, actor = null, reason = "physical_check", notes = "" }) {
  if (!item?.id) throw new Error("Stock item missing.");
  const actual = toNumber(actualQty, NaN);
  if (!Number.isFinite(actual) || actual < 0) throw new Error("Actual quantity must be 0 or more.");

  const itemRef = doc(db, STOCK_ITEMS_COL, item.id);
  const verificationRef = doc(collection(db, STOCK_VERIFICATIONS_COL));
  const movementRef = doc(collection(db, STOCK_MOVEMENTS_COL));
  const actorSafe = normalizeActor(actor);

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(itemRef);
    if (!snap.exists()) throw new Error("Stock item not found.");

    const current = snap.data() || {};
    const expected = toNumber(current.current_stock, 0);
    const discrepancy = actual - expected;
    const discrepancyCount = toNumber(current.verification_discrepancy_count, 0) + (discrepancy === 0 ? 0 : 1);

    tx.update(itemRef, {
      current_stock: actual,
      last_verified_at: serverTimestamp(),
      last_verified_by: actorSafe,
      verification_confidence: 100,
      verification_last_expected_qty: expected,
      verification_last_actual_qty: actual,
      verification_last_discrepancy: discrepancy,
      verification_discrepancy_count: discrepancyCount,
      verification_unresolved_discrepancy: discrepancy,
      updated_at: serverTimestamp(),
    });

    tx.set(verificationRef, {
      item_id: item.id,
      item_name: current.name || item.name || "Unnamed item",
      item_strength: current.strength || "",
      item_form: current.form || "",
      product_identity_key: current.product_identity_key || "",
      site: current.site || item.site || "",
      location: current.location || item.location || "",
      expected_qty: expected,
      actual_qty: actual,
      discrepancy,
      reason,
      notes,
      actor: actorSafe,
      created_at: serverTimestamp(),
      generated_by: "smart_stock_verification",
    });

    if (discrepancy !== 0) {
      tx.set(movementRef, {
        item_id: item.id,
        item_name: current.name || item.name || "Unnamed item",
        item_strength: current.strength || "",
        item_form: current.form || "",
        product_identity_key: current.product_identity_key || "",
        type: "adjust",
        delta: discrepancy,
        qty_before: expected,
        qty_after: actual,
        reason: `stock_verification:${reason}`,
        notes,
        actor: actorSafe,
        created_at: serverTimestamp(),
      });
    }

    return { expected, actual, discrepancy };
  });
}
