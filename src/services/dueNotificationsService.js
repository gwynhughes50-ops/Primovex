import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

// Runs the due-soon / overdue notification job now (administrators only) and
// returns { considered, created, alreadySent, skippedInactive }. The same job
// runs by itself every morning at 07:30.
export async function sendDueNotificationsNow() {
  const response = await httpsCallable(functions, "sendDueNotificationsNow")();
  return response.data;
}
