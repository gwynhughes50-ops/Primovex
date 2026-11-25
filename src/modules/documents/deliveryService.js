import { addDoc, collection, doc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useEffect, useState } from "react";
import { db, storage } from "@/lib/firebase";
import { isSafeSyntheticMode } from "@/config/platformMode";
import { recordAudit } from "@/modules/audit/recordAudit";
import { deliveryEvent } from "@/modules/audit/auditEvents";
import { applyStockMovement } from "@/services/stockService";
import { OPEN_ORDER_STATUSES, deliveryRecord, doneWords, orderAfter, toBook } from "./deliveryNote";

// Booking a delivery note into stock. The review (deliveryNote.js) says what is ticked; this writes it: each ticked row is a "receive" stock movement (with its batch and expiry, the purchase order and
// the delivery note's number on it), the purchase order's lines are ticked off, the original PDF is kept, and one record of the delivery is made that nobody can edit. Demo and training mode book nothing.

export const DELIVERIES = "stock_deliveries";

// the purchase orders that are out with a supplier, and the deliveries already booked in (for the same-note check)
export function useDeliveryContext(enabled = true) {
  const [orders, setOrders] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  useEffect(() => {
    if (!enabled || isSafeSyntheticMode()) return undefined;
    const stopOrders = onSnapshot(query(collection(db, "purchase_orders"), where("status", "in", OPEN_ORDER_STATUSES)), (snap) => setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setOrders([]));
    const stopDeliveries = onSnapshot(query(collection(db, DELIVERIES), orderBy("created_at", "desc"), limit(300)), (snap) => setDeliveries(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setDeliveries([]));
    return () => { stopOrders(); stopDeliveries(); };
  }, [enabled]);
  return { orders, deliveries };
}

const safeName = (name) => String(name || "delivery-note.pdf").replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80) || "delivery-note.pdf";

// Books the ticked rows in. Returns { booked, failed, after, problem, id } and never throws for one row failing: a row that cannot be booked is listed, the rest still go in. A purchase order that
// cannot be updated (the person may not have purchasing access) is reported as a problem; the stock has still been booked.
export async function bookDelivery({ review, pdf = null, actor = {} }) {
  const rows = toBook(review);
  if (!rows.length) throw new Error("Tick at least one row to book in.");
  if (isSafeSyntheticMode()) return { id: "demo", booked: rows.map((r) => ({ ...r, itemName: r.description })), failed: [], after: null, problem: "", demo: true };

  const deliveryRef = doc(collection(db, DELIVERIES));
  const booked = [];
  const failed = [];
  for (const row of rows) {
    try {
      const result = await applyStockMovement(row.itemId, {
        type: "receive", qty: row.quantity, batch_number: row.batch || "", expiry_date: row.expiry || "",
        supplier_id: review.supplierId || "", supplier_name: review.supplierName || "",
        purchase_order_id: review.order?.id || "", po_number: review.order?.po_number || "",
        delivery_note_id: deliveryRef.id, delivery_note_number: review.noteNumber || "",
        reason: `Delivery note ${review.noteNumber || "(no number)"} from ${review.supplierName || "a supplier"}`, actor, source: "delivery_note",
      });
      booked.push({ ...row, itemName: row.description, movementId: result?.movementId || "" });
    } catch (error) {
      failed.push({ index: row.index, description: row.description, noteQuantity: row.noteQuantity, reason: error?.message || "Could not be booked in" });
    }
  }
  if (!booked.length) throw new Error(`Nothing was booked in. ${failed.map((x) => `${x.description}: ${x.reason}`).join("; ")}`);

  let after = null;
  let problem = "";
  if (review.order) {
    after = orderAfter(review.order, booked);
    try {
      await updateDoc(doc(db, "purchase_orders", review.order.id), {
        items: after.items, status: after.status, last_delivery_note: review.noteNumber || "", last_delivery_at: serverTimestamp(),
        ...(after.complete ? { completed_at: serverTimestamp() } : {}), updated_at: serverTimestamp(),
      });
      await addDoc(collection(db, "purchase_order_activity"), {
        purchase_order_id: review.order.id, type: "delivery", title: after.complete ? "Delivery complete" : "Part delivered",
        message: `Delivery note ${review.noteNumber || "(no number)"}: ${booked.length} product${booked.length === 1 ? "" : "s"} booked into stock.`,
        actor: { uid: actor.uid || null, displayName: actor.displayName || actor.email || "Unknown" }, created_at: serverTimestamp(),
      });
    } catch (error) {
      console.warn("The purchase order could not be updated.", error);
      problem = "The stock is booked in, but the purchase order could not be updated: ask someone who can change purchase orders to mark it delivered.";
    }
  }

  let file = null;
  if (pdf) {
    try {
      const path = `${DELIVERIES}/${deliveryRef.id}/${Date.now()}_${safeName(pdf.name)}`;
      const fileRef = ref(storage, path);
      await uploadBytes(fileRef, pdf, { contentType: "application/pdf" });
      await getDownloadURL(fileRef);
      file = { name: pdf.name, path, bytes: pdf.size || 0 };
    } catch (error) {
      console.warn("The delivery note's file could not be kept.", error);
      problem = `${problem} The delivery note's file could not be kept: the stock has been booked in.`.trim();
    }
  }
  await setDoc(deliveryRef, { ...deliveryRecord(review, { booked, failed, actor, order: review.order, file }), created_at: serverTimestamp() });
  recordAudit(deliveryEvent("booked", { deliveryId: deliveryRef.id, supplier: review.supplierName, noteNumber: review.noteNumber, count: booked.length }));
  return { id: deliveryRef.id, booked, failed, after, problem, words: doneWords(booked, failed, after) };
}

// the original delivery note of a booked delivery, as a link
export async function deliveryFileUrl(delivery) {
  if (!delivery?.file?.path) return "";
  return getDownloadURL(ref(storage, delivery.file.path));
}

export async function listDeliveries(max = 50) {
  const snap = await getDocs(query(collection(db, DELIVERIES), orderBy("created_at", "desc"), limit(max)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
