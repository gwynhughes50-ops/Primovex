import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { applyStockMovement, createReorderRequest } from "@/services/stockService";
import { reportEvent } from "@/modules/governance/services/seService";
import { addQuickNote } from "@/services/quickNotesService";

// What actually happens when a person presses Confirm on an Orb proposal. Each executor takes the
// proposal's own params (fixed when the proposal was prepared, never anything typed afterwards),
// does exactly one thing, and returns a short sentence for the person. Permission is checked before
// this runs (proposalProblem) and again by Firestore rules / the Cloud Function.

const audit = (action, summary, targetType, targetId, metadata, module = "inventory") => {
  try {
    globalThis.dispatchEvent?.(new CustomEvent("primovex:governed-audit", { detail: {
      action, module, targetType, targetId, summary, classification: "operational", metadata,
    } }));
  } catch { /* an audit hiccup must not undo the action */ }
};

const EXECUTORS = {
  "team-message": async (params) => {
    const result = await httpsCallable(functions, "orbTeamMessage")({ role: params.role, text: params.text, actionUrl: params.actionUrl });
    const sent = Number(result?.data?.sent || 0);
    return sent > 0
      ? `Sent to ${sent} ${sent === 1 ? "person" : "people"} in the ${params.role} team. They'll see it in their Primovex notifications on the desktop app.`
      : `Nobody currently has the ${params.role} role, so no one received it.`;
  },

  // One named colleague. The server checks the sender may message, that the person exists and is active, and refuses patient details.
  "person-message": async (params) => {
    const result = await httpsCallable(functions, "orbTeamMessage")({ toUid: params.toUid, text: params.text, actionUrl: params.actionUrl });
    return result?.data?.sent > 0 ? `Sent to ${params.toName}. They'll see it in their Primovex notifications on the desktop app.` : `${params.toName} could not be messaged.`;
  },

  // A reminder is a Quick note: the person's own, or a shared practice note.
  reminder: async (params) => {
    await addQuickNote({ text: params.text, dueAt: params.dueAt || null, priority: "routine", scope: params.scope === "practice" ? "practice" : "private" });
    return params.scope === "practice" ? "Saved as a shared practice note. Everyone will see it in Quick notes." : "Saved to your Quick notes.";
  },

  // Anyone can report one; the rules let a person report only as themselves.
  "significant-event": async (params, { actor }) => {
    const id = await reportEvent(params.form, actor);
    audit("orb.se.report", "A significant event was reported through the Orb", "significant_event", id, { harm: params.form.harm, category: params.form.category }, "governance");
    return "Reported. The significant events team has been told. You can follow it, and add more detail, under Significant events.";
  },

  // Stock used: the place and the batch are the ones the person chose on the card. applyStockMovement
  // re-checks the quantity inside its transaction and writes the movement and the audit entry.
  "stock-use": async (params, { actor }) => {
    const result = await applyStockMovement(params.itemId, {
      type: "use",
      qty: params.quantity,
      locationId: params.locationId || null,
      locationName: params.locationName,
      locationType: params.locationType,
      batch_number: params.batchNumber || "",
      reason: "Used (recorded through the Orb)",
      actor,
      source: "orb",
    });
    return `Done. Removed ${params.quantity} ${params.itemLabel}${params.batchNumber ? ` (batch ${params.batchNumber})` : ""} from ${params.locationName}. ${result.after} left in total.`;
  },

  // Several items in one go: each is taken off by itself (so one that fails doesn't stop the rest), and
  // what was done and what wasn't is said plainly.
  "stock-use-multi": async (params, { actor }) => {
    const done = [];
    const failed = [];
    for (const line of params.lines || []) {
      try {
        const result = await applyStockMovement(line.itemId, {
          type: "use", qty: line.quantity, locationId: line.locationId || null, locationName: line.locationName, locationType: line.locationType,
          batch_number: line.batchNumber || "", reason: "Used (recorded through the Orb)", actor, source: "orb",
        });
        done.push(`${line.quantity} ${line.itemLabel} (${result.after} left)`);
      } catch (error) {
        failed.push(`${line.itemLabel}: ${error?.message || "could not be taken off"}`);
      }
    }
    if (!done.length) throw new Error(`Nothing was taken off stock. ${failed.join("; ")}`);
    return `Done. Taken off stock: ${done.join("; ")}.${failed.length ? ` Not done: ${failed.join("; ")}.` : ""}`;
  },

  // A delivery booked in: each product joins its own batch (receiveIntoBatches) in the place named, and
  // the movement and audit entry are written by applyStockMovement. One failing doesn't stop the rest.
  "stock-in": async (params, { actor }) => {
    const done = [];
    const failed = [];
    for (const line of params.lines || []) {
      try {
        const result = await applyStockMovement(line.itemId, {
          type: "receive", qty: line.quantity, locationId: line.locationId || null, locationName: line.locationName, locationType: line.locationType,
          batch_number: line.batchNumber || "", expiry_date: line.expiryDate || "", reason: "Delivery (recorded through the Orb)", actor, source: "orb",
        });
        done.push(`${line.quantity} ${line.itemLabel} (${result.after} in stock)`);
      } catch (error) {
        failed.push(`${line.itemLabel}: ${error?.message || "could not be added"}`);
      }
    }
    if (!done.length) throw new Error(`Nothing was added to stock. ${failed.join("; ")}`);
    return `Done. Added to stock: ${done.join("; ")}.${failed.length ? ` Not done: ${failed.join("; ")}.` : ""}`;
  },

  // A count of one place: each figure is set to what was counted there (the item total moves by the
  // difference). Products that already match are left alone.
  "stock-count": async (params, { actor }) => {
    const changed = [];
    const matched = [];
    const failed = [];
    for (const line of params.lines || []) {
      try {
        const result = await applyStockMovement(line.itemId, {
          type: "adjust", place_count: true, set_to: line.counted, locationId: line.locationId || null, locationName: line.locationName, locationType: line.locationType,
          reason: "Stock count (recorded through the Orb)", actor, source: "orb",
        });
        if (result.delta === 0) matched.push(line.itemLabel);
        else changed.push(`${line.itemLabel} ${result.delta > 0 ? "+" : "-"}${Math.abs(result.delta)} (now ${line.counted} here)`);
      } catch (error) {
        failed.push(`${line.itemLabel}: ${error?.message || "could not be updated"}`);
      }
    }
    if (!changed.length && !matched.length) throw new Error(`The count was not recorded. ${failed.join("; ")}`);
    return `Done. ${params.placeName} counted: ${changed.length ? changed.join("; ") : "no figures changed"}${matched.length ? `; ${matched.length} already matched` : ""}.${failed.length ? ` Not done: ${failed.join("; ")}.` : ""}`;
  },

  // Expired batches taken off stock: each is taken from its own batch (preferred) and recorded as expired.
  "stock-expired": async (params, { actor }) => {
    const done = [];
    const failed = [];
    for (const line of params.lines || []) {
      try {
        await applyStockMovement(line.itemId, {
          type: "use", qty: line.quantity, locationId: line.locationId || null, locationName: line.locationName, locationType: line.locationType,
          batch_number: line.batchNumber || "", reason: "Expired - removed from stock (recorded through the Orb)", notes: "Expiry round", actor, source: "orb",
        });
        done.push(`${line.quantity} ${line.itemLabel}${line.batchNumber ? ` (batch ${line.batchNumber})` : ""}`);
      } catch (error) {
        failed.push(`${line.itemLabel}: ${error?.message || "could not be removed"}`);
      }
    }
    if (!done.length) throw new Error(`Nothing was removed. ${failed.join("; ")}`);
    return `Done. Removed as expired: ${done.join("; ")}.${failed.length ? ` Not done: ${failed.join("; ")}.` : ""}`;
  },

  reorder: async (params, { actor }) => {
    const snap = await getDoc(doc(db, "stock_items", params.itemId));
    if (!snap.exists()) throw new Error("That product no longer exists.");
    const item = { id: snap.id, ...snap.data() };
    await createReorderRequest({ ...item, requested_qty: params.quantity, order_quantity: params.quantity, note: "Raised from the Orb" }, actor);
    audit("orb.reorder.request", "A reorder request was raised through the Orb", "stock_item", params.itemId, { quantity: params.quantity });
    return `Reorder request raised for ${params.itemLabel} (${params.quantity}). It's now in the Reorder Centre waiting for approval.`;
  },
};

export function canExecute(kind) {
  return Boolean(EXECUTORS[kind]);
}

export async function executeProposal(proposal, context = {}) {
  const run = EXECUTORS[proposal?.kind];
  if (!run) throw new Error("The Orb doesn't know how to do that.");
  return run(proposal.params || {}, context);
}
