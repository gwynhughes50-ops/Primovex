import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

// Reports an issue with a room to the practice's Caretaker (falling back to a
// Practice Manager if none is configured) via the reportRoomIssue Cloud
// Function, which writes a real notification into their Notifications inbox.
// This is in-app only — there is no OS-level push notification wired up.
export async function reportRoomIssue({ roomId, roomName, note }) {
  const call = httpsCallable(functions, "reportRoomIssue");
  const response = await call({ roomId, roomName, note });
  return response.data;
}
