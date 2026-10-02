import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

// Active staff as { id, label, role }, for the pickers where someone is chosen
// by name (SAR "Assigned To" and "Manager for Escalation"). Comes from a Cloud
// Function because the Firestore rules don't let everyone read the users
// collection directly - reading it from here silently returned nothing for a
// SAR team member who isn't an administrator.
export async function listStaffDirectory() {
  const response = await httpsCallable(functions, "listStaffDirectory")();
  return Array.isArray(response.data?.staff) ? response.data.staff : [];
}
