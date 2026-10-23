import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { isSafeSyntheticMode } from "@/config/platformMode";
import { buildReport, cleanFixedIn, cleanReply } from "@/modules/feedback/issueReport";

// Reports from staff (rules: firestore.rules, "PROBLEMS AND IDEAS"). A person reads their own; the System Admin reads and answers all.
export const REPORTS = "issue_reports";

const APP_VERSION = typeof __PRIMOVEX_VERSION__ !== "undefined" ? __PRIMOVEX_VERSION__ : "dev";
const millis = (v) => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : 0);
const newestFirst = (rows) => [...rows].sort((a, b) => millis(b.createdAt) - millis(a.createdAt));

// Send one. `form` is { kind, message, doing }; who, where, which version and which device are added here, never typed.
export async function sendIssueReport(form, { user, displayName, role } = {}) {
  if (isSafeSyntheticMode()) throw new Error("Demo mode can't send reports.");
  const record = buildReport({
    ...form,
    route: globalThis.location?.pathname || "",
    appVersion: APP_VERSION,
    client: globalThis.__TAURI_INTERNALS__ ? "tauri" : "web",
    userAgent: globalThis.navigator?.userAgent || "",
    role,
    reporter: { uid: user?.uid, name: displayName || user?.email || "" },
  });
  await addDoc(collection(db, REPORTS), { ...record, createdAt: serverTimestamp() });
  return record;
}

// the signed-in person's own reports, newest first
export function useMyReports() {
  const { user } = useAuth();
  const uid = user?.uid || "";
  const [state, setState] = useState({ rows: null, error: "" });
  useEffect(() => {
    if (!uid || isSafeSyntheticMode()) { setState({ rows: [], error: "" }); return undefined; }
    return onSnapshot(query(collection(db, REPORTS), where("reporterUid", "==", uid)), (snap) => setState({ rows: newestFirst(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), error: "" }),
      () => setState({ rows: [], error: "Could not load your reports." }));
  }, [uid]);
  return useMemo(() => ({ ...state, ready: state.rows !== null }), [state]);
}

// every report, for the System Admin
export function useAllReports(enabled = true) {
  const [state, setState] = useState({ rows: null, error: "" });
  useEffect(() => {
    if (!enabled || isSafeSyntheticMode()) { setState({ rows: [], error: "" }); return undefined; }
    return onSnapshot(collection(db, REPORTS), (snap) => setState({ rows: newestFirst(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), error: "" }),
      (error) => setState({ rows: [], error: error?.code === "permission-denied" ? "Only the System Admin can read all reports." : "Could not load the reports." }));
  }, [enabled]);
  return useMemo(() => ({ ...state, ready: state.rows !== null }), [state]);
}

// the developer moves one on: a status, a short reply for the person, and the version it was done in
export async function answerIssueReport(id, { status, reply = "", fixedIn = "" }, actor = {}) {
  if (isSafeSyntheticMode()) throw new Error("Demo mode can't save changes.");
  await updateDoc(doc(db, REPORTS, id), { status, reply: cleanReply(reply), fixedIn: cleanFixedIn(fixedIn), updatedAt: serverTimestamp(), updatedByName: actor.displayName || actor.email || "" });
}
