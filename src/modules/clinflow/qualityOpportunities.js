// Passing a quality or register opportunity found in a letter to a colleague, or to everyone with a role such as the business team. This is the part that
// runs on the screen: what is offered to send (with the patient's initials, date of birth and NHS number when the letter has them), what the person sees about
// what was sent, and the calls to the server, which writes the record and the notification. Nothing is sent from a ClinFlow screen except by that call.
import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db, functions } from "@/lib/firebase";

import { STATUS_WORDS, patientDetailsFor, patientLine, opportunityPayload } from "./qualityOpportunityPayload";

export { STATUS_WORDS, patientDetailsFor, patientLine, opportunityPayload };

export async function listOpportunityRecipients() {
  const response = await httpsCallable(functions, "listOpportunityRecipients")();
  return { staff: Array.isArray(response.data?.staff) ? response.data.staff : [], roles: Array.isArray(response.data?.roles) ? response.data.roles : [] };
}
export async function sendQualityOpportunity(payload) {
  const response = await httpsCallable(functions, "sendQualityOpportunity")(payload);
  return response.data;
}
export async function updateQualityOpportunity({ id, status, note = "" }) {
  const response = await httpsCallable(functions, "updateQualityOpportunity")({ id, status, note });
  return response.data;
}

// The opportunities sent to this person, and the ones this person sent, newest first
export function useOpportunities(uid) {
  const [state, setState] = useState({ received: [], sent: [], loading: true, error: "" });
  useEffect(() => {
    if (!uid) { setState({ received: [], sent: [], loading: false, error: "" }); return undefined; }
    const rows = { received: [], sent: [] };
    const publish = () => setState((s) => ({ ...s, ...rows, loading: false }));
    const fail = (error) => setState((s) => ({ ...s, loading: false, error: error?.message || "Quality opportunities could not be read." }));
    const read = (field, key) => onSnapshot(query(collection(db, "quality_opportunities"), where(field, "==", uid)), (snap) => {
      rows[key] = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      publish();
    }, fail);
    const stops = [read("recipientUid", "received"), read("senderUid", "sent")];
    return () => stops.forEach((stop) => stop());
  }, [uid]);
  return state;
}
