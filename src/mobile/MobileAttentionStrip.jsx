import { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { isSafeSyntheticMode } from "@/config/platformMode";
import useStock from "@/hooks/useStock";
import useNotifications from "@/hooks/useNotifications";
import useExpirySettings from "@/hooks/useExpirySettings";
import { getExpirySettings, summariseStockAlerts } from "@/lib/stockAlerts";
import { normalizeStockItemCategory } from "@/services/stockService";
import { subscribeConcerns } from "@/modules/governance/services/concernService";
import { SAR_COLLECTION } from "@/modules/governance/services/sarService";
import { messageQueue } from "@/messaging/messageCard";
import useSenseContext from "@/modules/sense/hooks/useSenseContext";
import { isQuarantined } from "@/modules/temperature/fridgeIncidents";
import { reviewSummary } from "@/modules/coshh/coshh";
import { useCoshhSubstances } from "@/modules/coshh/coshhService";
import { buildAttention } from "./homeAttention";
import { dateKeyOf, expectedFridges, normaliseUnit, notCheckedToday } from "./fridgeCheck";

const TONES = {
  critical: "border-rose-400/40 bg-rose-500/10 text-rose-700",
  warning: "border-amber-400/40 bg-amber-500/10 text-amber-700",
  info: "border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] text-[var(--medtrak-text)]",
  ok: "border-emerald-400/40 bg-emerald-500/10 text-emerald-700",
};

// "What needs attention" at the top of a manager's or partner's phone: only what this person is allowed to see.
export default function MobileAttentionStrip({ onAction }) {
  const { user, can } = useAuth();
  const uid = user?.uid || null;
  const seesSars = can("governance.manageSars") || can("governance.partnerAccess");
  const seesConcerns = can("governance.concernsTeam") || can("governance.partnerAccess");
  const seesStock = can("inventory.read");
  const seesFridges = can("temperature.read");
  const seesCoshh = can("coshh.read");
  const { state: senseState } = useSenseContext();
  const [units, setUnits] = useState(null);
  const [todaysLogs, setTodaysLogs] = useState(null);
  const [openIncidents, setOpenIncidents] = useState(null);
  const [sars, setSars] = useState(null);
  const [concerns, setConcerns] = useState(null);
  const { allItems = [] } = useStock({ includeArchived: false });
  useExpirySettings();
  const { rows } = useNotifications(uid);
  const { list: coshhList } = useCoshhSubstances(seesCoshh && !!uid && !isSafeSyntheticMode());

  useEffect(() => {
    if (!seesSars || !uid || isSafeSyntheticMode()) return undefined;
    return onSnapshot(query(collection(db, SAR_COLLECTION), orderBy("createdAt", "desc"), limit(300)), (snap) => setSars(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setSars(null));
  }, [seesSars, uid]);

  useEffect(() => {
    if (!seesConcerns || !uid || isSafeSyntheticMode()) return undefined;
    return subscribeConcerns((list) => setConcerns(list || []), () => setConcerns(null));
  }, [seesConcerns, uid]);

  // fridges and today's checks, so a missed check or an open incident is noticed
  useEffect(() => {
    if (!seesFridges || !uid || isSafeSyntheticMode()) return undefined;
    const stops = [
      onSnapshot(collection(db, "temperature_units"), (snap) => setUnits(snap.docs.map((d) => normaliseUnit(d.id, d.data()))), () => setUnits(null)),
      onSnapshot(query(collection(db, "temperature_logs"), where("dateKey", "==", dateKeyOf(new Date()))), (snap) => setTodaysLogs(snap.docs.map((d) => d.data())), () => setTodaysLogs(null)),
      onSnapshot(query(collection(db, "temperature_incidents"), where("status", "==", "open")), (snap) => setOpenIncidents(snap.docs.map((d) => d.data())), () => setOpenIncidents(null)),
    ];
    return () => stops.forEach((stop) => stop());
  }, [seesFridges, uid]);

  const chips = useMemo(() => {
    const now = new Date();
    const stockAlerts = seesStock
      ? summariseStockAlerts(allItems, { categoryOf: (item) => normalizeStockItemCategory(item).category, settings: getExpirySettings(), now, resolved: {} }).alerts
      : null;
    const fridgesUnchecked = seesFridges && units && todaysLogs ? notCheckedToday({ fridges: expectedFridges({ units, assets: senseState?.assets || [] }), logs: todaysLogs, now }).length : null;
    return buildAttention({ sars: seesSars ? sars : null, concerns: seesConcerns ? concerns : null, stockAlerts, messages: messageQueue(rows, { now, everything: true }).length, fridgeIncidents: seesFridges && openIncidents ? openIncidents.length : null, fridgeQuarantined: seesFridges && openIncidents ? openIncidents.filter(isQuarantined).length : null, fridgesUnchecked, coshh: seesCoshh && coshhList ? reviewSummary(coshhList, now) : null, now });
  }, [allItems, coshhList, concerns, openIncidents, rows, sars, seesCoshh, seesConcerns, seesFridges, seesSars, seesStock, senseState?.assets, todaysLogs, units]);

  return (
    <section aria-label="What needs attention" className="flex flex-wrap gap-2">
      {chips.map((chip) => {
        const Icon = chip.tone === "ok" ? CircleCheck : TriangleAlert;
        const content = <><Icon className="h-4 w-4 shrink-0" aria-hidden="true" /><span>{chip.label}</span></>;
        const className = `inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm font-bold ${TONES[chip.tone]}`;
        return chip.action
          ? <button key={chip.key} type="button" className={className} onClick={() => onAction?.(chip.action)}>{content}</button>
          : <p key={chip.key} className={className}>{content}</p>;
      })}
    </section>
  );
}
