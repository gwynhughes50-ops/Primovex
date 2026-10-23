import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, doc, onSnapshot, query as fsQuery, serverTimestamp, where, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { isSafeSyntheticMode } from "@/config/platformMode";
import { QUERY_KINDS, QUERY_STATUS, QUERY_TO, buildQuery, queryText, queryTextProblem, raiseProblem, canReopen, canReply, canResolve, threadOf } from "./timesheetPayroll";

// Payroll queries on a timesheet: the data and the writes (rules: firestore.rules, "PAYROLL QUERIES"). The screens are in QueryThread.jsx.
//   a query         one per question, on one timesheet, with who it was raised with and whether it is open or resolved
//   its messages    what was said, one record each, never changed afterwards; the server also writes each to timesheet_audit

export const QUERIES = "timesheet_queries";
export const MESSAGES = "timesheet_query_messages";

const withId = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
const who = (actor = {}) => actor.displayName || actor.name || actor.email || "Unknown";
const newestFirst = (a, b) => (b.createdAt?.seconds || Infinity) - (a.createdAt?.seconds || Infinity);

// scope: "payroll" (every query: the payroll team), "person" (about my own timesheet) or "manager" (raised with me as a line manager)
export function useQueries(scope, enabled = true) {
  const { user } = useAuth();
  const uid = user?.uid || "";
  const [state, setState] = useState({ list: null, error: "" });
  useEffect(() => {
    if (!enabled) { setState({ list: null, error: "" }); return undefined; }
    if (isSafeSyntheticMode()) { setState({ list: [], error: "" }); return undefined; }
    if (!uid) { setState({ list: [], error: "" }); return undefined; }
    const source = scope === "payroll" ? collection(db, QUERIES)
      : scope === "manager" ? fsQuery(collection(db, QUERIES), where("toUid", "==", uid), where("to", "==", QUERY_TO.manager))
        : fsQuery(collection(db, QUERIES), where("staffUid", "==", uid), where("to", "==", QUERY_TO.person));
    return onSnapshot(source, (snap) => setState({ list: withId(snap).sort(newestFirst), error: "" }),
      (error) => setState({ list: [], error: error?.code === "permission-denied" ? "You can't open those queries." : "Could not load the queries." }));
  }, [enabled, uid, scope]);
  return state;
}

// what was said in one query, oldest first
export function useMessages(queryId, enabled = true) {
  const [state, setState] = useState({ list: null, error: "" });
  useEffect(() => {
    if (!enabled || !queryId) { setState({ list: null, error: "" }); return undefined; }
    if (isSafeSyntheticMode()) { setState({ list: [], error: "" }); return undefined; }
    return onSnapshot(fsQuery(collection(db, MESSAGES), where("queryId", "==", queryId)), (snap) => setState({ list: withId(snap), error: "" }),
      () => setState({ list: [], error: "Could not load the conversation." }));
  }, [enabled, queryId]);
  return useMemo(() => ({ ...state, thread: threadOf(state.list || []) }), [state]);
}

const message = (queryId, timesheetId, kind, text, uid, actor) => ({
  queryId, timesheetId, kind, text: queryText(text), authorUid: uid, authorName: who(actor), createdAt: serverTimestamp(), createdAtMs: Date.now(),
});

function demo() { if (isSafeSyntheticMode()) throw new Error("Demo mode can't save changes."); }

// Payroll raises a query on a signed-off timesheet with the person (to "person") or their line manager (to "manager")
export async function raiseQuery({ sheet, to, text, uid, actor }) {
  demo();
  const problem = raiseProblem({ sheet, to, text });
  if (problem) throw new Error(problem);
  const ref = doc(collection(db, QUERIES));
  const batch = writeBatch(db);
  batch.set(ref, { ...buildQuery({ sheet, to, text, uid, name: who(actor) }), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  batch.set(doc(collection(db, MESSAGES)), message(ref.id, sheet.id, QUERY_KINDS.raised, text, uid, actor));
  await batch.commit();
  return ref.id;
}

export async function replyToQuery({ query, text, uid, actor }) {
  demo();
  if (!canReply(query, uid)) throw new Error("This query is closed, or it is not yours to answer.");
  const problem = queryTextProblem(text, { kind: "reply" });
  if (problem) throw new Error(problem);
  await addDoc(collection(db, MESSAGES), message(query.id, query.timesheetId, QUERY_KINDS.reply, text, uid, actor));
}

// Whoever raised the query marks it resolved, with a note if they like
export async function resolveQuery({ query, note = "", uid, actor }) {
  demo();
  if (!canResolve(query, uid)) throw new Error("Only whoever raised the query can mark it as resolved.");
  const problem = queryTextProblem(note, { kind: "resolved" });
  if (problem) throw new Error(problem);
  const batch = writeBatch(db);
  const said = doc(collection(db, MESSAGES));
  batch.update(doc(db, QUERIES, query.id), { status: QUERY_STATUS.resolved, resolvedAt: serverTimestamp(), resolvedByUid: uid, resolvedByName: who(actor), resolution: queryText(note), lastMessageId: said.id, updatedAt: serverTimestamp() });
  batch.set(said, message(query.id, query.timesheetId, QUERY_KINDS.resolved, note, uid, actor));
  await batch.commit();
}

export async function reopenQuery({ query, text, uid, actor }) {
  demo();
  if (!canReopen(query, uid)) throw new Error("Only whoever raised the query can open it again.");
  const problem = queryTextProblem(text, { kind: "reply" });
  if (problem) throw new Error(problem === "Write your reply." ? "Say why you are opening it again." : problem);
  const batch = writeBatch(db);
  const said = doc(collection(db, MESSAGES));
  batch.update(doc(db, QUERIES, query.id), { status: QUERY_STATUS.open, resolvedAt: null, resolvedByUid: null, resolvedByName: null, resolution: "", lastMessageId: said.id, updatedAt: serverTimestamp() });
  batch.set(said, message(query.id, query.timesheetId, QUERY_KINDS.reopened, text, uid, actor));
  await batch.commit();
}
