import { subscribePatAssets } from "@/modules/pat/patService";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { collection, getDocs, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { isSafeSyntheticMode } from "@/config/platformMode";
import { demoStockItems } from "@/data/demoDataset";
import useNotifications from "@/hooks/useNotifications";
import useExpirySettings from "@/hooks/useExpirySettings";
import { getExpirySettings, summariseStockAlerts } from "@/lib/stockAlerts";
import { normalizeStockItemCategory, subscribeToStock } from "@/services/stockService";
import { subscribeConcerns } from "@/modules/governance/services/concernService";
import { SAR_COLLECTION } from "@/modules/governance/services/sarService";
import { messageQueue } from "@/messaging/messageCard";
import useSenseContext from "@/modules/sense/hooks/useSenseContext";
import { isQuarantined } from "@/modules/temperature/fridgeIncidents";
import { certSummary } from "@/modules/certificates/certificates";
import { useCertificates } from "@/modules/certificates/certificateService";
import { reviewSummary } from "@/modules/coshh/coshh";
import { useCoshhSubstances } from "@/modules/coshh/coshhService";
import { isOpen as incidentOpen } from "@/modules/compliance/complianceIncidents";
import { useComplianceIncidents } from "@/modules/compliance/complianceIncidentService";
import { useMaintenanceIssues } from "@/modules/maintenance/maintenanceService";
import { subscribeComplianceAssets } from "@/services/compliance/complianceQrService";
import { NO_STATUS, buildOrbStatus, scopeFor } from "@/modules/orbStatus/orbStatus";
import { buildAttention } from "@/mobile/homeAttention";
import { dateKeyOf, expectedFridges, normaliseUnit, notCheckedToday } from "@/mobile/fridgeCheck";

// One place that works out "what needs this person's attention", from the records they are allowed to see. It feeds the
// colour of the Orb (green, amber, red: see modules/orbStatus), the message under it, and the phone home's attention strip.
// Reads only what the person's role can read, and nothing for a role with nothing to watch.

const OrbStatusContext = createContext({ ...NO_STATUS, chips: [], scope: { key: "none", areas: [] }, ready: false });

export function useOrbStatus() {
  return useContext(OrbStatusContext);
}

export default function OrbStatusProvider({ children }) {
  const { user, role, capabilities = [], can, loading } = useAuth();
  const uid = loading ? null : user?.uid || null;
  const synthetic = isSafeSyntheticMode();
  const scope = useMemo(() => scopeFor({ role, can }), [role, capabilities]); // eslint-disable-line react-hooks/exhaustive-deps

  const seesSars = can("governance.manageSars") || can("governance.partnerAccess");
  const seesConcerns = can("governance.concernsTeam") || can("governance.partnerAccess");
  const seesStock = can("inventory.read");
  const seesFridges = can("temperature.read");
  const seesCoshh = can("coshh.read");
  const seesCompliance = can("compliance.write") || can("compliance.manageAssets");
  const watchesCompliance = scope.areas.includes("compliance") && can("compliance.read");
  const wantsCompliance = seesCompliance || watchesCompliance;

  const { state: senseState } = useSenseContext();
  const [units, setUnits] = useState(null);
  const [todaysLogs, setTodaysLogs] = useState(null);
  const [openFridgeIncidents, setOpenFridgeIncidents] = useState(null);
  const [sars, setSars] = useState(null);
  const [concerns, setConcerns] = useState(null);
  const [stockItems, setStockItems] = useState(null);
  const [assets, setAssets] = useState([]);
  const [patSessions, setPatSessions] = useState([]);
  const [patAssets, setPatAssets] = useState([]);
  const [tick, setTick] = useState(() => Date.now());
  useExpirySettings();
  const { rows } = useNotifications(uid);
  const { list: incidentList } = useComplianceIncidents(wantsCompliance && !!uid);
  const { list: certList } = useCertificates(wantsCompliance && !!uid);
  const { list: coshhList } = useCoshhSubstances(seesCoshh && !!uid && !synthetic);
  const { list: issueList } = useMaintenanceIssues(watchesCompliance && !!uid);

  // times move on: dates are re-checked every few minutes without anyone doing anything
  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!seesStock || !uid) { setStockItems(null); return undefined; }
    if (synthetic) { setStockItems(demoStockItems.filter((item) => !item.archived)); return undefined; }
    return subscribeToStock((items) => setStockItems(items || []), () => setStockItems(null), { includeArchived: false });
  }, [seesStock, uid, synthetic]);

  useEffect(() => {
    if (!seesSars || !uid || synthetic) return undefined;
    return onSnapshot(query(collection(db, SAR_COLLECTION), orderBy("createdAt", "desc"), limit(300)), (snap) => setSars(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setSars(null));
  }, [seesSars, uid, synthetic]);

  useEffect(() => {
    if (!seesConcerns || !uid || synthetic) return undefined;
    return subscribeConcerns((list) => setConcerns(list || []), () => setConcerns(null));
  }, [seesConcerns, uid, synthetic]);

  useEffect(() => {
    if (!seesFridges || !uid || synthetic) return undefined;
    const stops = [
      onSnapshot(collection(db, "temperature_units"), (snap) => setUnits(snap.docs.map((d) => normaliseUnit(d.id, d.data()))), () => setUnits(null)),
      onSnapshot(query(collection(db, "temperature_logs"), where("dateKey", "==", dateKeyOf(new Date()))), (snap) => setTodaysLogs(snap.docs.map((d) => d.data())), () => setTodaysLogs(null)),
      onSnapshot(query(collection(db, "temperature_incidents"), where("status", "==", "open")), (snap) => setOpenFridgeIncidents(snap.docs.map((d) => d.data())), () => setOpenFridgeIncidents(null)),
    ];
    return () => stops.forEach((stop) => stop());
  }, [seesFridges, uid, synthetic]);

  // the compliance assets (fire points, water outlets...) and when PAT is next due, for the compliance list
  useEffect(() => {
    if (!watchesCompliance || !uid) { setAssets([]); return undefined; }
    return subscribeComplianceAssets(setAssets, () => setAssets([]), { siteId: "" });
  }, [watchesCompliance, uid]);
  useEffect(() => {
    if (!watchesCompliance || !uid || synthetic) { setPatSessions([]); return undefined; }
    let live = true;
    getDocs(query(collection(db, "pat_test_sessions"), orderBy("createdAt", "desc"), limit(20)))
      .then((snap) => { if (live) setPatSessions(snap.docs.map((d) => d.data())); })
      .catch(() => { if (live) setPatSessions([]); });
    return () => { live = false; };
  }, [watchesCompliance, uid, synthetic]);

  useEffect(() => {
    if (!watchesCompliance || !uid || synthetic) { setPatAssets([]); return undefined; }
    return subscribePatAssets(setPatAssets, () => setPatAssets([]));
  }, [watchesCompliance, uid, synthetic]);

  const value = useMemo(() => {
    const now = new Date(tick);
    const stockAlerts = seesStock && stockItems
      ? summariseStockAlerts(stockItems, { categoryOf: (item) => normalizeStockItemCategory(item).category, settings: getExpirySettings(), now, resolved: {} }).alerts
      : null;
    const fridgesUnchecked = seesFridges && units && todaysLogs ? notCheckedToday({ fridges: expectedFridges({ units, assets: senseState?.assets || [] }), logs: todaysLogs, now }).length : null;
    const chips = buildAttention({
      sars: seesSars ? sars : null,
      concerns: seesConcerns ? concerns : null,
      stockAlerts,
      messages: messageQueue(rows, { now, everything: true }).length,
      fridgeIncidents: seesFridges && openFridgeIncidents ? openFridgeIncidents.length : null,
      fridgeQuarantined: seesFridges && openFridgeIncidents ? openFridgeIncidents.filter(isQuarantined).length : null,
      fridgesUnchecked,
      coshh: seesCoshh && coshhList ? reviewSummary(coshhList, now) : null,
      complianceFailures: seesCompliance && incidentList ? incidentList.filter(incidentOpen).length : null,
      certificates: seesCompliance && certList ? certSummary(certList, now) : null,
      now,
    });
    const status = buildOrbStatus({
      scope,
      chips,
      dueInputs: watchesCompliance ? { assets, incidents: incidentList || [], patSessions, patAssets, issues: issueList || [], coshh: seesCoshh ? coshhList : null, certificates: certList } : null,
      now,
    });
    return { ...status, chips, scope, ready: true };
  }, [tick, scope, seesStock, stockItems, seesFridges, units, todaysLogs, senseState?.assets, seesSars, sars, seesConcerns, concerns, rows, openFridgeIncidents, seesCoshh, coshhList, seesCompliance, incidentList, certList, watchesCompliance, assets, patSessions, patAssets, issueList]);

  return <OrbStatusContext.Provider value={value}>{children}</OrbStatusContext.Provider>;
}
