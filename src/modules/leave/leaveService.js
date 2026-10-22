import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { isSafeSyntheticMode } from "@/config/platformMode";
import { demoTimesheetStaff } from "@/data/demoTimesheets";
import { STAFF } from "@/modules/timesheets/timesheetService";
import { cleanYearSettings } from "@/modules/leave/leaveEntitlement";

// Annual leave data (rules: firestore.rules, "TIMESHEETS" and "ANNUAL LEAVE"). It reads the same staff records as timesheets:
//   timesheets.manage   everyone
//   a line manager     their own team (the people whose record names them), and their own
//   anyone else         only their own
// and the practice's choices for each leave year ("2026-27") from leave_years.

export const LEAVE_YEARS = "leave_years";
const byName = (a, b) => String(a.name).localeCompare(String(b.name), "en", { sensitivity: "base" });
const rows = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

// { staff, mine, team, ready, all, error }: `mine` is the person's own record (if linked), `team` the people who name them as manager
export function useLeaveStaff() {
  const { user, can } = useAuth();
  const uid = user?.uid || "";
  const all = can("timesheets.manage");
  const [state, setState] = useState({ staff: null, error: "" });
  useEffect(() => {
    if (isSafeSyntheticMode()) { setState({ staff: demoTimesheetStaff().map((p) => (p.id === "demo-t1" ? { ...p, uid } : { ...p, managerUid: uid })), error: "" }); return undefined; }
    if (!uid) { setState({ staff: [], error: "" }); return undefined; }
    const fail = (error) => setState({ staff: [], error: error?.code === "permission-denied" ? "You can't open the leave records." : "Could not load the leave records." });
    if (all) return onSnapshot(collection(db, STAFF), (snap) => setState({ staff: rows(snap).sort(byName), error: "" }), fail);
    // two queries (the person's own record, and the people who name them as manager) kept together
    const parts = { own: [], team: [] };
    const publish = () => setState({ staff: [...new Map([...parts.own, ...parts.team].map((p) => [p.id, p])).values()].sort(byName), error: "" });
    const stops = [
      onSnapshot(query(collection(db, STAFF), where("uid", "==", uid)), (snap) => { parts.own = rows(snap); publish(); }, fail),
      onSnapshot(query(collection(db, STAFF), where("managerUid", "==", uid)), (snap) => { parts.team = rows(snap); publish(); }, fail),
    ];
    return () => stops.forEach((stop) => stop());
  }, [uid, all]);
  return useMemo(() => {
    const staff = state.staff || [];
    return { ...state, ready: state.staff !== null, all, mine: staff.find((p) => p.uid && p.uid === uid) || null, team: staff.filter((p) => p.managerUid && p.managerUid === uid && p.uid !== uid) };
  }, [state, all, uid]);
}

// the practice's choices for a leave year
export function useLeaveYearSettings(yearKey) {
  const [settings, setSettings] = useState(cleanYearSettings({}));
  useEffect(() => {
    setSettings(cleanYearSettings({}));
    if (isSafeSyntheticMode() || !yearKey) return undefined;
    return onSnapshot(doc(db, LEAVE_YEARS, yearKey), (snap) => setSettings(cleanYearSettings(snap.exists() ? snap.data() : {})), () => setSettings(cleanYearSettings({})));
  }, [yearKey]);
  return settings;
}

// The year's settings, with last year's groups standing in until this year has its own (so a group the practice added carries on into
// the new year without anyone having to retype it). Saving this year's settings makes them its own.
export function useEffectiveLeaveSettings(year) {
  const mine = useLeaveYearSettings(year.key);
  const last = useLeaveYearSettings(`${year.startYear - 1}-${String(year.startYear % 100).padStart(2, "0")}`);
  return useMemo(() => (mine.groups.length || !last.groups.length ? mine : { ...mine, groups: last.groups, groupsFromLastYear: true }), [mine, last]);
}

export async function saveLeaveYearSettings(yearKey, input, actor = {}) {
  if (isSafeSyntheticMode()) throw new Error("Demo mode can't save changes.");
  const data = cleanYearSettings(input);
  await setDoc(doc(db, LEAVE_YEARS, yearKey), { ...data, updatedAt: serverTimestamp(), updatedByName: actor.displayName || actor.email || "" });
}
