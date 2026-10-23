import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { isSafeSyntheticMode } from "@/config/platformMode";
import { demoTimesheetFlow } from "@/data/demoTimesheetFlow";
import { STATE, declarationText, expectedFor, timesheetId, totalsOf } from "./timesheet";

// Pay periods and each person's timesheet for each, in Firestore (rules: firestore.rules, "TIMESHEETS PER PAY PERIOD").
// What a login can read is decided by the rules, so each reader asks for exactly its own slice:
//   mine      the person's own            managed   the ones naming this login as line manager
//   payroll   signed-off ones only        all       whoever manages timesheets
// Every write names the signed-in person as lastActorUid (the rules insist), and a server function copies each change into
// timesheet_audit, which nobody's browser can write to.

export const PERIODS = "timesheet_periods";
export const SHEETS = "timesheets";
export const AUDIT = "timesheet_audit";

const withId = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
const who = (actor = {}) => actor.displayName || actor.name || actor.email || "Unknown";
const text = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export function usePeriods() {
  const [state, setState] = useState({ list: null, error: "" });
  useEffect(() => {
    if (isSafeSyntheticMode()) { setState({ list: demoTimesheetFlow().periods, error: "" }); return undefined; }
    return onSnapshot(collection(db, PERIODS), (snap) => setState({ list: withId(snap).sort((a, b) => b.from.localeCompare(a.from)), error: "" }),
      () => setState({ list: [], error: "Could not load the pay periods." }));
  }, []);
  return state;
}

// scope: "mine" | "managed" | "payroll" | "all"
export function useSheets(scope, enabled = true) {
  const { user } = useAuth();
  const uid = user?.uid || "";
  const [state, setState] = useState({ list: null, error: "" });
  useEffect(() => {
    if (!enabled) { setState({ list: null, error: "" }); return undefined; }
    if (isSafeSyntheticMode()) { const demo = demoTimesheetFlow(); setState({ list: scope === "mine" ? demo.mine : scope === "managed" ? demo.managed : scope === "payroll" ? demo.payroll : [...demo.mine, ...demo.managed, ...demo.payroll], error: "" }); return undefined; }
    if (!uid) { setState({ list: [], error: "" }); return undefined; }
    const source = scope === "mine" ? query(collection(db, SHEETS), where("uid", "==", uid))
      : scope === "managed" ? query(collection(db, SHEETS), where("managerUid", "==", uid))
        : scope === "payroll" ? query(collection(db, SHEETS), where("state", "in", [STATE.approved, STATE.sent, STATE.returned]))
          : collection(db, SHEETS);
    return onSnapshot(source, (snap) => setState({ list: withId(snap), error: "" }),
      (error) => setState({ list: [], error: error?.code === "permission-denied" ? "You can't open those timesheets." : "Could not load the timesheets." }));
  }, [enabled, uid, scope]);
  return state;
}

// the history of one timesheet, asking in the way the rules allow for this login
export function useHistory(sheet, role, enabled) {
  const { user } = useAuth();
  const uid = user?.uid || "";
  const [state, setState] = useState({ list: null, error: "" });
  useEffect(() => {
    if (!enabled || !sheet) { setState({ list: null, error: "" }); return undefined; }
    if (isSafeSyntheticMode()) { setState({ list: demoTimesheetFlow().history, error: "" }); return undefined; }
    const base = [where("timesheetId", "==", sheet.id)];
    const source = role === "staff" ? query(collection(db, AUDIT), ...base, where("staffUid", "==", uid))
      : role === "manager" ? query(collection(db, AUDIT), ...base, where("managerUid", "==", uid))
        : query(collection(db, AUDIT), ...base);
    return onSnapshot(source, (snap) => setState({ list: withId(snap).sort((a, b) => (a.at?.seconds || 0) - (b.at?.seconds || 0)), error: "" }), () => setState({ list: [], error: "The history could not be loaded." }));
  }, [enabled, sheet?.id, role, uid]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

// ---- the person ------------------------------------------------------------------------------------------------------------

const cleanLines = (lines) => (lines || []).map((l) => ({ date: l.date, code: l.code, hours: Math.round(Number(l.hours) * 100) / 100, comment: text(l.comment, 200) }));

// Sends (or saves as a draft) the person's timesheet for a period. `me` is their staff record; `existing` their timesheet if there is one.
export async function sendTimesheet({ period, me, uid, actor, existing = null, kind, lines = [], send = true }) {
  if (isSafeSyntheticMode()) throw new Error("Demo mode can't save changes.");
  if (!me?.id || me.uid !== uid) throw new Error("Your sign-in isn't linked to a staff record yet. Ask the Practice Manager to link it (Timesheets, then People).");
  const clean = kind === "no-change" ? [] : cleanLines(lines);
  const expected = expectedFor(me.patterns || [], period);
  const body = {
    kind, expected: { hours: expected.hours, days: expected.days.map((d) => ({ date: d.date, hours: d.hours, bankHoliday: d.bankHoliday })) },
    lines: clean, totals: totalsOf(clean),
    declaration: send ? { text: declarationText(kind, period), confirmedAt: new Date().toISOString(), confirmedByName: who(actor) } : null,
    state: send ? STATE.submitted : STATE.draft, submissions: (existing?.submissions || 0) + (send ? 1 : 0),
    lastActorUid: uid, lastActorName: who(actor), updatedAt: serverTimestamp(),
    ...(send ? { submittedAt: serverTimestamp() } : {}),
  };
  const id = timesheetId(period.id, me.id);
  if (existing) { await updateDoc(doc(db, SHEETS, id), body); return id; }
  await setDoc(doc(db, SHEETS, id), { ...body, periodId: period.id, staffId: me.id, uid, staffName: me.name, payrollNo: me.payrollNo || "", managerUid: me.managerUid || null, from: period.from, to: period.to, createdAt: serverTimestamp() });
  return id;
}

// Takes a sent timesheet back to a draft so it can be changed and sent again. Only while it is still waiting for the line manager.
export async function takeBackTimesheet(sheet, { actor, uid }) {
  if (isSafeSyntheticMode()) throw new Error("Demo mode can't save changes.");
  if (sheet?.state !== STATE.submitted) throw new Error("It can only be taken back while it is waiting for your line manager.");
  await updateDoc(doc(db, SHEETS, sheet.id), { state: STATE.draft, lastActorUid: uid, lastActorName: who(actor), updatedAt: serverTimestamp() });
}

// ---- the line manager ------------------------------------------------------------------------------------------------------

export async function decideTimesheet(sheet, outcome, { reason = "", actor, uid }) {
  if (isSafeSyntheticMode()) throw new Error("Demo mode can't save changes.");
  await updateDoc(doc(db, SHEETS, sheet.id), {
    state: outcome, decision: { outcome, byUid: uid, by: who(actor), at: new Date().toISOString(), reason: text(reason, 300) },
    lastActorUid: uid, lastActorName: who(actor), updatedAt: serverTimestamp(),
  });
}

// ---- the payroll team ------------------------------------------------------------------------------------------------------

export async function dispatchTimesheet(sheet, outcome, { reference = "", reason = "", actor, uid }) {
  if (isSafeSyntheticMode()) throw new Error("Demo mode can't save changes.");
  await updateDoc(doc(db, SHEETS, sheet.id), {
    state: outcome, payroll: { outcome, byUid: uid, by: who(actor), at: new Date().toISOString(), reference: text(reference, 100), reason: text(reason, 300) },
    lastActorUid: uid, lastActorName: who(actor), updatedAt: serverTimestamp(),
  });
}

// ---- pay periods (whoever manages timesheets) ------------------------------------------------------------------------------

export async function savePeriod(period) {
  if (isSafeSyntheticMode()) throw new Error("Demo mode can't save changes.");
  const id = period.id || `pp-${period.from}`;
  await setDoc(doc(db, PERIODS, id), { name: text(period.name, 80), from: period.from, to: period.to, due: period.due }, { merge: true });
  return id;
}

// The newest period that has started (the one to be working on), else the next one
export function useCurrentPeriod(periods, today) {
  return useMemo(() => {
    const list = periods || [];
    return list.find((p) => p.from <= today) || list[list.length - 1] || null;
  }, [periods, today]);
}
