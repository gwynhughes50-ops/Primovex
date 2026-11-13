import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

// The server decides who may remind about which SAR (the Practice Manager, or the line manager of the person it is assigned to),
// and builds both the list and the wording. The app only asks (see functions/services/sarReminderService.js).
export async function fetchSarsToChase() {
  const response = await httpsCallable(functions, "listSarsToChase")({});
  return { canChase: response?.data?.canChase === true, rows: Array.isArray(response?.data?.rows) ? response.data.rows : [] };
}

export async function sendSarReminder(sarId) {
  const response = await httpsCallable(functions, "sendSarReminder")({ sarId });
  return response?.data || {};
}
