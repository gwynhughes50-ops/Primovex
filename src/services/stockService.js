// src/services/stockService.js
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../lib/firebase";

const ITEMS_COL = "stock_items";
const MOVES_COL = "stock_movements";
// ✅ Barcode index (one doc per barcode) to enforce uniqueness
const BARCODE_COL = "stock_barcodes";

function toNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function cleanString(v) {
  return String(v ?? "").trim();
}

// Normalize barcode to a stable key for indexing
function normalizeBarcode(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeItemPatch(patch = {}) {
  const out = { ...patch, updated_at: serverTimestamp() };

  if ("current_stock" in out) out.current_stock = toNumber(out.current_stock, 0);
  if ("min_stock" in out) out.min_stock = toNumber(out.min_stock, 0);
  if ("max_stock" in out) out.max_stock = toNumber(out.max_stock, 0);

  if ("name" in out) out.name = cleanString(out.name);
  if ("barcode" in out) out.barcode = cleanString(out.barcode);
  if ("site" in out) out.site = cleanString(out.site);
  if ("location" in out) out.location = cleanString(out.location);
  if ("strength" in out) out.strength = cleanString(out.strength);
  if ("form" in out) out.form = cleanString(out.form);
  if ("brand" in out) out.brand = cleanString(out.brand);
  if ("batch_number" in out) out.batch_number = cleanString(out.batch_number);
  if ("photo_url" in out) out.photo_url = cleanString(out.photo_url);
  if ("unit" in out) out.unit = cleanString(out.unit);
  if ("expiry_date" in out) out.expiry_date = cleanString(out.expiry_date);

  const productParts = [out.name, out.strength, out.form]
    .filter(Boolean)
    .map((part) => cleanString(part).toLowerCase());

  if (productParts.length) {
    out.product_identity_key = productParts.join("|");
  }

  return out;
}

// ✅ Structured error helper (lets UI detect barcode conflicts cleanly)
function makeError(code, message, extra = {}) {
  const err = new Error(message);
  err.code = code;
  Object.assign(err, extra);
  return err;
}

// ✅ Actor normalizer (Firestore cannot store Firebase Auth user objects)
function normalizeActor(actor) {
  if (!actor) return null;

  // Firebase Auth user (_UserImpl) is not serializable; keep only primitives.
  const uid = actor?.uid ?? actor?.user?.uid ?? null;
  const displayName =
    actor?.displayName ?? actor?.user?.displayName ?? actor?.name ?? null;
  const email = actor?.email ?? actor?.user?.email ?? null;

  return {
    uid: uid || null,
    displayName: displayName || null,
    email: email || null,
  };
}

/**
 * Realtime subscription for items
 * includeArchived=false => active only
 */
export function subscribeToStock(onData, onError, { includeArchived = false } = {}) {
  const base = collection(db, ITEMS_COL);

  const q = includeArchived
    ? query(base, orderBy("updated_at", "desc"))
    : query(base, where("archived_at", "==", null), orderBy("updated_at", "desc"));

  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError
  );
}

export async function createStockItem(data) {
  const payload = normalizeItemPatch({
    name: cleanString(data?.name),
    strength: cleanString(data?.strength),
    form: cleanString(data?.form),
    barcode: cleanString(data?.barcode),
    category: data?.category || "non_medical",
    site: cleanString(data?.site),
    location: cleanString(data?.location),
    brand: cleanString(data?.brand),
    batch_number: cleanString(data?.batch_number),
    expiry_date: cleanString(data?.expiry_date),

    current_stock: toNumber(data?.current_stock, 0),
    min_stock: toNumber(data?.min_stock, 0),
    max_stock: toNumber(data?.max_stock, 0),

    unit: cleanString(data?.unit),
    photo_url: cleanString(data?.photo_url),

    archived_at: null,
    archived_by: null,

    created_at: serverTimestamp(),
  });

  const barcodeKey = normalizeBarcode(payload.barcode);

  const itemRef = doc(collection(db, ITEMS_COL));
  const moveRef = doc(collection(db, MOVES_COL));

  await runTransaction(db, async (tx) => {
    if (barcodeKey) {
      const barcodeRef = doc(db, BARCODE_COL, barcodeKey);
      const barcodeSnap = await tx.get(barcodeRef);
      if (barcodeSnap.exists()) {
        throw new Error(
          "Barcode already in use. Please check the item or use a different barcode."
        );
      }
      tx.set(barcodeRef, {
        item_id: itemRef.id,
        barcode: payload.barcode || "",
        created_at: serverTimestamp(),
      });
    }

    tx.set(itemRef, payload);

    tx.set(moveRef, {
      item_id: itemRef.id,
      item_name: payload.name || "",
      type: "create",
      delta: 0,
      qty_before: null,
      qty_after: payload.current_stock ?? 0,
      reason: null,
      notes: null,
      actor: null,
      created_at: serverTimestamp(),
    });
  });

  return itemRef.id;
}

export async function updateStockItem(id, patch) {
  const itemRef = doc(db, ITEMS_COL, id);
  const moveRef = doc(collection(db, MOVES_COL));

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(itemRef);
    if (!snap.exists()) throw new Error("Item not found.");

    const current = snap.data() || {};
    const beforeName = current?.name || "";
    const beforeBarcode = cleanString(current?.barcode);

    const normalizedPatch = normalizeItemPatch(patch);

    const nextBarcode = "barcode" in patch ? cleanString(patch?.barcode) : beforeBarcode;

    const beforeKey = normalizeBarcode(beforeBarcode);
    const nextKey = normalizeBarcode(nextBarcode);

    if ("barcode" in patch && beforeKey !== nextKey) {
      if (nextKey) {
        const nextRef = doc(db, BARCODE_COL, nextKey);
        const nextSnap = await tx.get(nextRef);
        if (nextSnap.exists()) {
          throw new Error("Barcode already in use. Please choose a different barcode.");
        }
        tx.set(nextRef, {
          item_id: id,
          barcode: nextBarcode || "",
          updated_at: serverTimestamp(),
        });
      }

      if (beforeKey) {
        tx.delete(doc(db, BARCODE_COL, beforeKey));
      }
    }

    tx.update(itemRef, normalizedPatch);

    const afterName =
      ("name" in normalizedPatch ? normalizedPatch.name : beforeName) || "";

    tx.set(moveRef, {
      item_id: id,
      item_name: afterName,
      type: "edit",
      delta: 0,
      qty_before: null,
      qty_after: null,
      reason: null,
      notes: null,
      actor: null,
      created_at: serverTimestamp(),
    });
  });
}

/**
 * ✅ Archive instead of delete
 */
export async function archiveStockItem(id, actor = null) {
  const itemRef = doc(db, ITEMS_COL, id);
  const moveRef = doc(collection(db, MOVES_COL));
  const actorSafe = normalizeActor(actor);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(itemRef);
    if (!snap.exists()) throw new Error("Item not found.");

    const data = snap.data() || {};
    const item_name = data?.name || "";
    const barcodeKey = normalizeBarcode(data?.barcode);

    // Release barcode so it can be reused
    if (barcodeKey) {
      tx.delete(doc(db, BARCODE_COL, barcodeKey));
    }

    tx.update(itemRef, {
      archived_at: serverTimestamp(),
      archived_by: actorSafe,
      updated_at: serverTimestamp(),
    });

    tx.set(moveRef, {
      item_id: id,
      item_name,
      type: "archive",
      delta: 0,
      qty_before: null,
      qty_after: null,
      reason: null,
      notes: null,
      actor: actorSafe,
      created_at: serverTimestamp(),
    });
  });
}

/**
 * ✅ Restore archived item.
 *
 * If the archived item’s barcode is already claimed by another ACTIVE item
 * (i.e. exists in BARCODE_COL), we keep uniqueness intact and throw:
 *   err.code === "BARCODE_IN_USE"
 *
 * Optional escape hatch:
 *   restoreStockItem(id, actor, { removeBarcodeOnConflict: true })
 * Restores the item but clears `barcode` and stores original in `barcode_conflict_original`.
 */
export async function restoreStockItem(id, actor = null, options = {}) {
  // Backwards compatible: if someone calls restoreStockItem(id, { removeBarcodeOnConflict:true })
  if (actor && typeof actor === "object" && !Array.isArray(actor) && !actor?.uid) {
    options = actor;
    actor = null;
  }

  const { removeBarcodeOnConflict = false } = options || {};

  const itemRef = doc(db, ITEMS_COL, id);
  const moveRef = doc(collection(db, MOVES_COL));
  const actorSafe = normalizeActor(actor);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(itemRef);
    if (!snap.exists()) throw new Error("Item not found.");

    const data = snap.data() || {};
    const item_name = data?.name || "";
    const barcode = cleanString(data?.barcode);
    const barcodeKey = normalizeBarcode(barcode);

    let barcodeConflict = null;

    if (barcodeKey) {
      const bRef = doc(db, BARCODE_COL, barcodeKey);
      const bSnap = await tx.get(bRef);

      if (bSnap.exists()) {
        const bData = bSnap.data() || {};
        if (bData?.item_id && bData.item_id !== id) {
          barcodeConflict = { barcode, conflictItemId: bData.item_id || null };
          if (!removeBarcodeOnConflict) {
            throw makeError(
              "BARCODE_IN_USE",
              "Cannot restore: this barcode is already in use by another item.",
              { barcode, conflictItemId: bData.item_id || null }
            );
          }
        }
      }

      // If no conflict and barcode index is free, claim it back
      if (!bSnap.exists()) {
        tx.set(bRef, { item_id: id, barcode, updated_at: serverTimestamp() });
      }
    }

    const restorePatch = {
      archived_at: null,
      archived_by: null,
      updated_at: serverTimestamp(),
    };

    if (barcodeConflict && removeBarcodeOnConflict) {
      restorePatch.barcode = "";
      restorePatch.barcode_conflict_original = barcode;
    }

    tx.update(itemRef, restorePatch);

    tx.set(moveRef, {
      item_id: id,
      item_name,
      type: "unarchive",
      delta: 0,
      qty_before: null,
      qty_after: null,
      reason: null,
      notes: null,
      actor: actorSafe,
      created_at: serverTimestamp(),
    });
  });
}

/**
 * ✅ Stock movement transaction (receive/use/adjust)
 */
export async function applyStockMovement(itemId, movement) {
  const type = movement?.type;
  if (!["use", "receive", "adjust"].includes(type)) {
    throw new Error("Invalid movement type");
  }

  const itemRef = doc(db, ITEMS_COL, itemId);

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(itemRef);
    if (!snap.exists()) throw new Error("Item not found");

    const item = snap.data();
    const item_name = item?.name || ""; // ✅ snapshot name for audit
    const item_strength = item?.strength || "";
    const item_form = item?.form || "";
    const product_identity_key = item?.product_identity_key || [item_name, item_strength, item_form]
      .filter(Boolean)
      .map((part) => String(part).trim().toLowerCase())
      .join("|");
    const before = toNumber(item.current_stock, 0);

    let after = before;
    let delta = 0;

    if (type === "receive") {
      const qty = Math.abs(toNumber(movement.qty, 0));
      if (qty <= 0) throw new Error("Quantity must be > 0");
      delta = qty;
      after = before + qty;
    }

    if (type === "use") {
      const qty = Math.abs(toNumber(movement.qty, 0));
      if (qty <= 0) throw new Error("Quantity must be > 0");
      if (qty > before) throw new Error("Not enough stock");
      delta = -qty;
      after = before - qty;
    }

    if (type === "adjust") {
      const setTo = toNumber(movement.set_to, NaN);
      if (!Number.isFinite(setTo) || setTo < 0) throw new Error("set_to must be >= 0");
      after = setTo;
      delta = after - before;
    }

    const reason = movement?.reason || null;
    const notes = movement?.notes || null;
    const actor = normalizeActor(movement?.actor);
    const receiptDetails = type === "receive"
      ? {
          brand: cleanString(movement?.brand),
          barcode: cleanString(movement?.barcode),
          batch_number: cleanString(movement?.batch_number),
          expiry_date: cleanString(movement?.expiry_date),
          supplier_id: cleanString(movement?.supplier_id),
          supplier_name: cleanString(movement?.supplier_name),
          purchase_order_id: cleanString(movement?.purchase_order_id),
          po_number: cleanString(movement?.po_number),
        }
      : null;

    tx.update(itemRef, {
      current_stock: after,
      updated_at: serverTimestamp(),
      last_movement: {
        type,
        delta,
        qty_before: before,
        qty_after: after,
        reason,
        notes,
        actor,
      },
    });

    const moveRef = doc(collection(db, MOVES_COL));
    tx.set(moveRef, {
      item_id: itemId,
      item_name,
      item_strength,
      item_form,
      product_identity_key,
      type,
      delta,
      qty_before: before,
      qty_after: after,
      reason,
      notes,
      actor,
      receipt_details: receiptDetails,
      created_at: serverTimestamp(),
    });

    return { before, after, delta };
  });
}

/**
 * ✅ History (audit trail)
 */
export function subscribeToMovements(itemId, onData, onError, max = 200) {
  const q = query(
    collection(db, MOVES_COL),
    where("item_id", "==", itemId),
    orderBy("created_at", "desc"),
    limit(max)
  );

  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError
  );
}

export async function fetchMovements(itemId, max = 50) {
  const q = query(
    collection(db, MOVES_COL),
    where("item_id", "==", itemId),
    orderBy("created_at", "desc"),
    limit(max)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * ✅ Ultra-fast barcode-driven "USE STOCK" helper
 * Used by Dashboard quick action
 */
export async function useStockQuick({ barcode, qty, actor = null }) {
  const code = String(barcode || "").trim();
  const n = Number(qty);

  if (!code) throw new Error("Barcode missing.");
  if (!Number.isFinite(n) || n <= 0) throw new Error("Invalid quantity.");

  // 1️⃣ Find item by barcode
  const q = query(collection(db, ITEMS_COL), where("barcode", "==", code), limit(1));
  const snap = await getDocs(q);

  if (snap.empty) {
    throw new Error("Item not found for this barcode.");
  }

  const docSnap = snap.docs[0];

  // 2️⃣ Delegate to the existing transaction engine
  await applyStockMovement(docSnap.id, {
    type: "use",
    qty: n,
    actor,
  });

  return true;
}

export async function findStockItemByBarcode(barcode) {
  const raw = String(barcode || "").trim();

  if (!raw) throw new Error("Barcode missing.");

  const key = normalizeBarcode(raw);

  try {
    const barcodeRef = doc(db, BARCODE_COL, key);
    const barcodeSnap = await getDoc(barcodeRef);

    if (barcodeSnap.exists()) {
      const itemId = barcodeSnap.data()?.item_id;

      if (itemId) {
        const itemRef = doc(db, ITEMS_COL, itemId);
        const itemSnap = await getDoc(itemRef);

        if (itemSnap.exists()) {
          return {
            id: itemSnap.id,
            ...itemSnap.data(),
          };
        }
      }
    }
  } catch {
    // fallback below
  }

  const q = query(
    collection(db, ITEMS_COL),
    where("barcode", "==", raw),
    limit(1)
  );

  const snap = await getDocs(q);

  if (snap.empty) {
    throw new Error("Item not found for this barcode.");
  }

  const itemSnap = snap.docs[0];

  return {
    id: itemSnap.id,
    ...itemSnap.data(),
  };
}

/**
 * ✅ Barcode-index driven "USE STOCK" helper (fast)
 */
export async function useStockByBarcode({ barcode, qty, actor = null }) {
  const raw = String(barcode || "").trim();
  const n = Number(qty);

  if (!raw) throw new Error("Barcode missing.");
  if (!Number.isFinite(n) || n <= 0) throw new Error("Quantity must be at least 1.");

  const key = normalizeBarcode(raw);
  if (!key) throw new Error("Barcode missing.");

  const barcodeRef = doc(db, BARCODE_COL, key);
  const barcodeSnap = await getDoc(barcodeRef);
  if (!barcodeSnap.exists()) throw new Error("Item not found for this barcode.");

  const itemId = barcodeSnap.data()?.item_id;
  if (!itemId) throw new Error("Barcode index is missing item reference.");

  await applyStockMovement(itemId, {
    type: "use",
    qty: n,
    actor,
  });

  return true;
}

export async function createReorderRequest(item, actor = null) {
  if (!item?.id) throw new Error("Item missing.");

  return addDoc(collection(db, "reorder_requests"), {
    item_id: item.id,
    item_name: item.name || "Unnamed item",
    item_strength: item.strength || "",
    item_form: item.form || "",
    product_identity_key: item.product_identity_key || [item.name, item.strength, item.form]
      .filter(Boolean)
      .map((part) => String(part).trim().toLowerCase())
      .join("|"),
    current_stock: Number(item.current_stock || 0),
    min_stock: Number(item.min_stock || 0),
    requested_qty: Number(item.requested_qty || item.order_quantity || 1),
    note: item.note || "",
    site: item.site || null,
    location: item.location || null,

    // Supplier fields support the Purchasing Basket and Purchase Order workflow.
    supplier_id: item.preferred_supplier_id || item.supplier_id || "",
    supplier_name: item.preferred_supplier_name || item.supplier_name || "",
    supplier_sku: item.supplier_sku || "",
    order_quantity: Number(item.order_quantity || item.requested_qty || 1),
    lead_time_days: Number(item.lead_time_days || 0),

    status: "pending",
    actor,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });
}