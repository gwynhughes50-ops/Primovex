import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { applyStockMovement, createReorderRequest } from "@/services/stockService";
import { reportEvent } from "@/modules/governance/services/seService";

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
