import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

// The phone kit check's quick actions, which run on the server (a person can't
// write into someone else's inbox, or into a kit, from the browser).

// A message to a colleague about an item. Resolves to { sent, to }.
export async function sendKitMessage({ collection, kitId, toUid, text, itemName }) {
  const response = await httpsCallable(functions, "sendKitNotification")({ kind: "message", collection, kitId, toUid, text, itemName });
  return response.data;
}

// A reminder to yourself, held back until `remindAt` (a Date). Resolves to { sent }.
export async function setKitReminder({ collection, kitId, remindAt, text, itemName }) {
  const response = await httpsCallable(functions, "sendKitNotification")({
    kind: "reminder", collection, kitId, text, itemName, remindAt: remindAt.toISOString(),
  });
  return response.data;
}

// Swap an item in the kit for a new batch: the kit then expects that batch and
// expiry. Resolves to { updated, previous, now }.
export async function replaceKitItemBatch({ collection, kitId, itemId, batch_number, expiry_date }) {
  const response = await httpsCallable(functions, "replaceKitItemBatch")({
    collection, kitId, itemId, stockBatch: { batch_number, expiry_date },
  });
  return response.data;
}

// Friendly wording for what the server can refuse.
export function kitActionError(error, fallback = "That didn't work. Check your connection and try again.") {
  const code = String(error?.code || "");
  if (code.endsWith("permission-denied")) return "Your login can't do that.";
  if (code.endsWith("unauthenticated")) return "Please sign in again.";
  if (code.endsWith("not-found") || code.endsWith("failed-precondition") || code.endsWith("invalid-argument")) {
    return error?.message && !/^(INTERNAL|internal)$/.test(error.message) ? error.message : fallback;
  }
  return fallback;
}
