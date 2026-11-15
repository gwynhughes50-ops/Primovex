import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { applyStockMovement, createReorderRequest } from "@/services/stockService";
import { reportEvent } from "@/modules/governance/services/seService";
import { addQuickNote } from "@/services/quickNotesService";
import { askRota } from "@/modules/rota/rotaTeamService";
import { decideTimesheet, sendTimesheet } from "@/modules/timesheets/timesheetFlowService";
import { STATE, needsStaff, timesheetId } from "@/modules/timesheets/timesheet";
import { decideClaim, submitClaim } from "@/modules/mileage/mileageService";
import { STATUS as CLAIM } from "@/modules/mileage/mileage";
import { decisionSummary, runDecisions } from "@/ai/me/signoffs";
import { withOvertimeLine } from "@/ai/me/overtime";

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

  // Ask a colleague to swap a shift. The server checks again that it is still your shift, that the swap keeps everyone's rules and time off, and tells the colleague.
  "rota-swap": async (params) => {
    const result = await askRota({ action: "create_swap", from: params.from, to: params.to, fromLabel: params.fromLabel, toLabel: params.toLabel });
    if (result?.enabled === false) throw new Error("Swap requests are not switched on for the team yet.");
    if (result?.ok === false) throw new Error(result.problems?.[0] || "That swap could not be sent.");
    return `Asked ${params.withName}. They'll get a message and you'll hear back in My rota.${result?.changesHours ? " It changes someone's hours, so the coordinator also has to agree." : ""}`;
  },

  // The person's own timesheet, "no changes". The card showed them the declaration and the button said they confirm it; the write is under their own account.
  "timesheet-send": async (params, { actor }) => {
    await sendTimesheet({ period: params.period, me: params.me, uid: params.me.uid, actor, existing: params.existing, kind: "no-change", lines: [], send: true });
    return "Sent to your line manager to sign off. You can follow it on the Timesheet page.";
  },

  // A journey claim for the person themselves, sent to their line manager. Under their own account, like the Mileage page.
  "mileage-claim": async (params, { actor }) => {
    await submitClaim(params.form, { me: params.me, uid: params.me.uid, options: params.options, actor });
    return "Claim sent to your line manager for approval. You can follow it on the Mileage page.";
  },

  // One overtime line added to the person's own timesheet as a DRAFT. The timesheet is read again first, so a line is never added to one that has been sent since, and
  // the same line is never added twice. Nothing goes to the line manager: they open Timesheet and press Send.
  "timesheet-overtime": async (params, { actor }) => {
    if (!params.me?.uid || params.me.uid !== actor?.uid) throw new Error("That card was prepared for someone else.");
    const snap = await getDoc(doc(db, "timesheets", timesheetId(params.period.id, params.me.id)));
    const existing = snap.exists() ? { id: snap.id, ...snap.data() } : null;
    if (existing && !needsStaff(existing.state)) throw new Error("Your timesheet for this pay period has already been sent, so nothing was added.");
    const merged = withOvertimeLine(existing?.lines || [], params.line);
    if (!merged.added) return "That overtime is already on your timesheet, so I did not add it again.";
    await sendTimesheet({ period: params.period, me: params.me, uid: params.me.uid, actor, existing, kind: "changes", lines: merged.lines, send: false });
    return "Added to your timesheet as a draft. Open Timesheet to check it, and press Send when you are ready.";
  },

  // A line manager signs off timesheets from the card. Each one is read again first, so one that was taken back since is left alone; the write is under their own account.
  "timesheet-signoff": async (params, { actor }) => {
    const result = await runDecisions(params.items || [], {
      read: async (item) => { const snap = await getDoc(doc(db, "timesheets", item.id)); return snap.exists() ? { id: snap.id, ...snap.data() } : null; },
      waiting: (sheet) => sheet.state === STATE.submitted,
      decide: (item, sheet) => decideTimesheet(sheet, STATE.approved, { actor, uid: actor.uid }),
    });
    return decisionSummary(result, { one: "timesheet", many: "timesheets", did: "Signed off" });
  },

  // A line manager approves mileage claims from the card, the same way.
  "mileage-approve": async (params, { actor }) => {
    const result = await runDecisions(params.items || [], {
      read: async (item) => { const snap = await getDoc(doc(db, "mileage_claims", item.id)); return snap.exists() ? { id: snap.id, ...snap.data() } : null; },
      waiting: (claim) => claim.status === CLAIM.submitted,
      decide: (item, claim) => decideClaim(claim, CLAIM.approved, "", actor),
    });
    return decisionSummary(result, { one: "claim", many: "claims", did: "Approved" });
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
