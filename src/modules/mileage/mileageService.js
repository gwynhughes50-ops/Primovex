import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { isSafeSyntheticMode } from "@/config/platformMode";
import { listActiveSites } from "@/lib/checklistsFirestore";
import { demoMileage } from "@/data/demoMileage";
import { DEFAULT_RATES, STATUS, placeOptions, withRateChange, withoutRateChange } from "./mileage";
import { STAFF } from "@/modules/timesheets/timesheetService";

// Mileage claims in Firestore (rules: firestore.rules, "MILEAGE CLAIMS"):
//   a person reads and writes their own; their line manager reads and decides theirs; timesheets.manage sees everyone's.

export const CLAIMS = "mileage_claims";
export const PLACES = "mileage_places";
export const ROUTES = "mileage_routes";
export const SETTINGS = "mileage_settings";

const withId = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
const newestFirst = (a, b) => String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id));
const stampOf = (actor = {}) => actor.displayName || actor.email || "Unknown";

// This login's own staff record (the one linked to their account): who they are for claims and who approves them
export function useMyStaffRecord() {
  const { user } = useAuth();
  const uid = user?.uid || "";
  const [state, setState] = useState({ record: null, ready: false });
  useEffect(() => {
    if (isSafeSyntheticMode()) { setState({ record: demoMileage().me, ready: true }); return undefined; }
    if (!uid) { setState({ record: null, ready: true }); return undefined; }
    return onSnapshot(query(collection(db, STAFF), where("uid", "==", uid)), (snap) => setState({ record: withId(snap)[0] || null, ready: true }), () => setState({ record: null, ready: true }));
  }, [uid]);
  return state;
}

// the claims this login can see in each of the three ways: their own, those waiting on them as line manager, and (for timesheet managers) everyone's
export function useClaims({ scope = "mine", enabled = true } = {}) {
  const { user } = useAuth();
  const uid = user?.uid || "";
  const [state, setState] = useState({ list: null, error: "" });
  useEffect(() => {
    if (!enabled) { setState({ list: null, error: "" }); return undefined; }
    if (isSafeSyntheticMode()) { const demo = demoMileage(); setState({ list: scope === "mine" ? demo.mine : scope === "approve" ? demo.toApprove : [...demo.mine, ...demo.toApprove], error: "" }); return undefined; }
    if (!uid) { setState({ list: [], error: "" }); return undefined; }
    const source = scope === "mine" ? query(collection(db, CLAIMS), where("uid", "==", uid))
      : scope === "approve" ? query(collection(db, CLAIMS), where("managerUid", "==", uid))
        : collection(db, CLAIMS);
    return onSnapshot(source, (snap) => setState({ list: withId(snap).sort(newestFirst), error: "" }),
      (error) => setState({ list: [], error: error?.code === "permission-denied" ? "You can't open those mileage claims." : "Could not load the mileage claims." }));
  }, [enabled, uid, scope]);
  return state;
}

// the places and known routes to choose from, and the rates
export function usePlaces(enabled = true) {
  const [state, setState] = useState({ sites: [], places: [], routes: [], rates: DEFAULT_RATES, ready: false });
  useEffect(() => {
    if (!enabled) return undefined;
    if (isSafeSyntheticMode()) { const demo = demoMileage(); setState({ sites: demo.sites, places: demo.places, routes: demo.routes, rates: DEFAULT_RATES, ready: true }); return undefined; }
    let live = true;
    listActiveSites().then((sites) => live && setState((s) => ({ ...s, sites }))).catch(() => {});
    const stops = [
      onSnapshot(collection(db, PLACES), (snap) => setState((s) => ({ ...s, places: withId(snap), ready: true })), () => setState((s) => ({ ...s, ready: true }))),
      onSnapshot(collection(db, ROUTES), (snap) => setState((s) => ({ ...s, routes: withId(snap) })), () => {}),
      onSnapshot(doc(db, SETTINGS, "rates"), (snap) => setState((s) => ({ ...s, rates: snap.exists() ? { ...DEFAULT_RATES, ...snap.data() } : DEFAULT_RATES })), () => {}),
    ];
    return () => { live = false; stops.forEach((stop) => stop()); };
  }, [enabled]);
  const options = useMemo(() => placeOptions({ sites: state.sites, places: state.places }), [state.sites, state.places]);
  return { ...state, options };
}

const text = (value, max = 120) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const fields = (form, options) => {
  const name = (id) => options.find((o) => o.id === id)?.name || "";
  return {
    date: form.date, fromId: form.fromId, fromName: name(form.fromId), toId: form.toId, toName: name(form.toId), miles: Math.round(Number(form.miles) * 100) / 100,
    returnTrip: Boolean(form.returnTrip), vehicle: form.vehicle, purpose: form.purpose, note: text(form.note),
  };
};

// Adds a claim for the signed-in person. `me` is their own staff record (it names their line manager).
export async function submitClaim(form, { me, uid, options, actor }) {
  if (isSafeSyntheticMode()) throw new Error("Demo mode can't save changes.");
  if (!me?.id || me.uid !== uid) throw new Error("Your account isn't linked to a staff record yet. Ask the Practice Manager to link it (Timesheets, then People).");
  return (await addDoc(collection(db, CLAIMS), {
    ...fields(form, options), uid, staffId: me.id, staffName: me.name, managerUid: me.managerUid || null, status: STATUS.submitted,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdByName: stampOf(actor),
  })).id;
}
export async function updateClaim(claim, form, { options }) {
  if (isSafeSyntheticMode()) throw new Error("Demo mode can't save changes.");
  await updateDoc(doc(db, CLAIMS, claim.id), { ...fields(form, options), updatedAt: serverTimestamp() });
}
export async function withdrawClaim(claim) {
  if (isSafeSyntheticMode()) throw new Error("Demo mode can't save changes.");
  await deleteDoc(doc(db, CLAIMS, claim.id));
}
export async function decideClaim(claim, status, note, actor) {
  if (isSafeSyntheticMode()) throw new Error("Demo mode can't save changes.");
  await updateDoc(doc(db, CLAIMS, claim.id), { status, decidedByName: stampOf(actor), decidedAt: serverTimestamp(), decisionNote: text(note), updatedAt: serverTimestamp() });
}

// the rates: add a change that starts on a date (or replace one for the same date), or take out one that has not started yet
export async function saveRateChange(change, current) {
  if (isSafeSyntheticMode()) throw new Error("Demo mode can't save changes.");
  await setDoc(doc(db, SETTINGS, "rates"), withRateChange(current, change), { merge: true });
}
export async function removeRateChange(from, current) {
  if (isSafeSyntheticMode()) throw new Error("Demo mode can't save changes.");
  await setDoc(doc(db, SETTINGS, "rates"), withoutRateChange(current, from), { merge: true });
}

// setting up places, routes and rates (whoever manages timesheets)
export async function savePlace(place) {
  if (isSafeSyntheticMode()) throw new Error("Demo mode can't save changes.");
  const id = place.id || `p-${text(place.name, 40).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || Date.now()}`;
  await setDoc(doc(db, PLACES, id), { name: text(place.name, 80), active: place.active !== false }, { merge: true });
}
export async function saveRoute({ fromId, toId, miles }) {
  if (isSafeSyntheticMode()) throw new Error("Demo mode can't save changes.");
  const [a, b] = [fromId, toId].sort();
  await setDoc(doc(db, ROUTES, `${a}__${b}`.replace(/[/]/g, "_")), { fromId: a, toId: b, miles: Math.round(Number(miles) * 100) / 100 });
}
export async function removeRoute(route) {
  if (isSafeSyntheticMode()) throw new Error("Demo mode can't save changes.");
  await deleteDoc(doc(db, ROUTES, route.id));
}
