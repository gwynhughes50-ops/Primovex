import { useEffect, useState } from "react";
import { addDoc, arrayUnion, collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isSafeSyntheticMode } from "@/config/platformMode";
import { reportRoomIssue } from "@/services/roomIssueService";
import { ISSUE_STATUS, buildIssue, sortIssues, updateEntry, validateIssue } from "./maintenance";

const COLLECTION = "maintenance_issues";

// Every maintenance issue, urgent and oldest first. `list` is null until the first answer arrives.
export function useMaintenanceIssues(enabled = true) {
  const [state, setState] = useState({ list: null, error: "" });
  useEffect(() => {
    if (!enabled || isSafeSyntheticMode()) { setState({ list: enabled ? [] : null, error: "" }); return undefined; }
    return onSnapshot(
      query(collection(db, COLLECTION), orderBy("reportedAtMs", "desc"), limit(500)),
      (snap) => setState({ list: sortIssues(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), error: "" }),
      (error) => setState({ list: [], error: error?.code === "permission-denied" ? "" : "Could not load maintenance issues." }),
    );
  }, [enabled]);
  return state;
}

// Anyone can raise one. The caretaker is also sent a notification (as before); that failing never loses the issue.
export async function raiseIssue({ roomId, roomName, site, note, urgent = false, priority = "", source = "phone", actor }) {
  const problems = validateIssue({ roomName, note });
  if (problems.length) throw new Error(problems[0]);
  const issue = buildIssue({ roomId, roomName, site, note, urgent, priority, source, actor });
  const ref = await addDoc(collection(db, COLLECTION), { ...issue, reportedAt: serverTimestamp() });
  try {
    await reportRoomIssue({ roomId: issue.roomId, roomName: issue.roomName, note: `${issue.priority === "high" ? "URGENT: " : ""}${issue.title}` });
  } catch (error) {
    console.warn("Maintenance issue saved, but the caretaker could not be notified", error);
  }
  return ref.id;
}

export const startIssue = (id, actor, text = "") =>
  updateDoc(doc(db, COLLECTION, id), { status: ISSUE_STATUS.inProgress, startedBy: actor.displayName || actor.name || "", startedAt: serverTimestamp(), updates: arrayUnion(updateEntry({ text: text || "Started work", status: ISSUE_STATUS.inProgress, actor })), updatedAt: serverTimestamp() });

export const completeIssue = (id, actor, text = "") =>
  updateDoc(doc(db, COLLECTION, id), { status: ISSUE_STATUS.closed, closedBy: actor.displayName || actor.name || "", closedByUid: actor.uid || "", closedAt: serverTimestamp(), updates: arrayUnion(updateEntry({ text: text || "Completed", status: ISSUE_STATUS.closed, actor })), updatedAt: serverTimestamp() });

export const reopenIssue = (id, actor) =>
  updateDoc(doc(db, COLLECTION, id), { status: ISSUE_STATUS.open, updates: arrayUnion(updateEntry({ text: "Reopened", status: ISSUE_STATUS.open, actor })), updatedAt: serverTimestamp() });

export const setIssuePriority = (id, priority, actor) =>
  updateDoc(doc(db, COLLECTION, id), { priority, updates: arrayUnion(updateEntry({ text: `Priority set to ${priority === "high" ? "urgent" : priority === "low" ? "can wait" : "normal"}`, actor })), updatedAt: serverTimestamp() });

export const addIssueNote = (id, text, actor) =>
  updateDoc(doc(db, COLLECTION, id), { updates: arrayUnion(updateEntry({ text, actor })), updatedAt: serverTimestamp() });
