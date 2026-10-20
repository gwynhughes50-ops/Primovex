import { useEffect, useState } from "react";
import { addDoc, arrayUnion, collection, doc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { isSafeSyntheticMode } from "@/config/platformMode";
import { PANEL_FAULT, PAT_FAIL, actionEntry, buildIncident, buildPanelFaultIncident, buildPatFailIncident, closesWithoutRecheck, isOpen, resolutionPatch, sortIncidents } from "./complianceIncidents";

const COLLECTION = "compliance_incidents";

// Every failed-check incident, open ones first. `list` is null until the first answer arrives.
export function useComplianceIncidents(enabled = true) {
  const [state, setState] = useState({ list: null, error: "" });
  useEffect(() => {
    if (!enabled || isSafeSyntheticMode()) { setState({ list: enabled ? [] : null, error: "" }); return undefined; }
    return onSnapshot(
      query(collection(db, COLLECTION), orderBy("openedAtMs", "desc"), limit(300)),
      (snap) => setState({ list: sortIncidents(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), error: "" }),
      (error) => setState({ list: [], error: error?.code === "permission-denied" ? "" : "Could not load failed checks." }),
    );
  }, [enabled]);
  return state;
}

// One incident, kept up to date (undefined while loading, null if there is no such incident)
export function useComplianceIncident(incidentId) {
  const [incident, setIncident] = useState(undefined);
  useEffect(() => {
    if (!incidentId) return undefined;
    return onSnapshot(doc(db, COLLECTION, incidentId), (snap) => setIncident(snap.exists() ? { id: snap.id, ...snap.data() } : null), () => setIncident(null));
  }, [incidentId]);
  return incident;
}

// A check that has just failed: open an incident for it (unless that asset already has one open) and tell the
// caretaker and practice manager. Never throws: recording the check itself must not fail because of this.
export async function openIncidentForFailedCheck({ asset, check, actor }) {
  try {
    if (!asset?.id) return null;
    const existing = await getDocs(query(collection(db, COLLECTION), where("assetId", "==", asset.id)));
    // an open panel fault on the same call point is a different problem and does not count (nor does a PAT failure)
    if (existing.docs.some((d) => isOpen(d.data()) && !closesWithoutRecheck(d.data()))) return null;
    const ref = await addDoc(collection(db, COLLECTION), { ...buildIncident({ asset, check, actor }), openedAt: serverTimestamp() });
    try {
      await httpsCallable(functions, "raiseComplianceAlert")({ incidentId: ref.id });
    } catch (error) {
      console.warn("Could not alert the caretaker and practice manager about the failed check", error);
    }
    return ref.id;
  } catch (error) {
    console.warn("Could not open an incident for the failed check", error);
    return null;
  }
}

// The alarm panel showed a fault during a fire alarm test: open an incident for it (unless one is already open, so a fault
// that lasts a few weeks is not raised again each week) and tell the caretaker and practice manager. Never throws.
export async function openIncidentForPanelFault({ asset, check, actor, note }) {
  try {
    if (!asset?.id) return null;
    const existing = await getDocs(query(collection(db, COLLECTION), where("kind", "==", PANEL_FAULT)));
    if (existing.docs.some((d) => isOpen(d.data()))) return null;
    const ref = await addDoc(collection(db, COLLECTION), { ...buildPanelFaultIncident({ asset, check, actor, note }), openedAt: serverTimestamp() });
    try {
      await httpsCallable(functions, "raiseComplianceAlert")({ incidentId: ref.id });
    } catch (error) {
      console.warn("Could not alert the caretaker and practice manager about the panel fault", error);
    }
    return ref.id;
  } catch (error) {
    console.warn("Could not open an incident for the panel fault", error);
    return null;
  }
}

export const recordIncidentAction = (incidentId, { choice, note, actor }) =>
  updateDoc(doc(db, COLLECTION, incidentId), { actions: arrayUnion(actionEntry({ choice, note, actor })), updatedAt: serverTimestamp() });

export const resolveIncident = ({ incident, checks, asset, actor, note }) =>
  updateDoc(doc(db, COLLECTION, incident.id), { ...resolutionPatch({ incident, checks, asset, actor, note }), resolvedAt: serverTimestamp(), updatedAt: serverTimestamp() });

// the latest checks on one asset, newest first (needs the compliance_checks assetId + createdAt index)
export function useAssetChecks(assetId) {
  const [checks, setChecks] = useState([]);
  useEffect(() => {
    if (!assetId || isSafeSyntheticMode()) return undefined;
    return onSnapshot(query(collection(db, "compliance_checks"), where("assetId", "==", assetId), orderBy("createdAt", "desc"), limit(30)), (snap) => setChecks(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setChecks([]));
  }, [assetId]);
  return checks;
}

// the asset an incident is about (it may have been retired since, which means no recheck is needed)
export function useAssetRecord(assetId) {
  const [asset, setAsset] = useState(null);
  useEffect(() => {
    if (!assetId || isSafeSyntheticMode()) return undefined;
    return onSnapshot(doc(db, "compliance_assets", assetId), (snap) => setAsset(snap.exists() ? { id: snap.id, ...snap.data() } : null), () => setAsset(null));
  }, [assetId]);
  return asset;
}

// An appliance failed its PAT test: open an incident for it (unless that appliance already has one open) and tell the caretaker
// and practice manager. Never throws: recording the test must not fail because of this.
export async function openIncidentForPatFail({ asset, test, actor }) {
  try {
    if (!asset?.id) return null;
    const existing = await getDocs(query(collection(db, COLLECTION), where("assetId", "==", asset.id)));
    if (existing.docs.some((d) => isOpen(d.data()) && d.data().kind === PAT_FAIL)) return null;
    const ref = await addDoc(collection(db, COLLECTION), { ...buildPatFailIncident({ asset, test, actor }), openedAt: serverTimestamp() });
    try {
      await httpsCallable(functions, "raiseComplianceAlert")({ incidentId: ref.id });
    } catch (error) {
      console.warn("Could not alert the caretaker and practice manager about the failed appliance", error);
    }
    return ref.id;
  } catch (error) {
    console.warn("Could not open an incident for the failed appliance", error);
    return null;
  }
}
