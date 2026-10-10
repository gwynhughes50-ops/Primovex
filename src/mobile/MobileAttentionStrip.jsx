import { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
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
import { buildAttention } from "./homeAttention";

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
  const [sars, setSars] = useState(null);
  const [concerns, setConcerns] = useState(null);
  const { allItems = [] } = useStock({ includeArchived: false });
  useExpirySettings();
  const { rows } = useNotifications(uid);

  useEffect(() => {
    if (!seesSars || !uid || isSafeSyntheticMode()) return undefined;
    return onSnapshot(query(collection(db, SAR_COLLECTION), orderBy("createdAt", "desc"), limit(300)), (snap) => setSars(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setSars(null));
  }, [seesSars, uid]);

  useEffect(() => {
    if (!seesConcerns || !uid || isSafeSyntheticMode()) return undefined;
    return subscribeConcerns((list) => setConcerns(list || []), () => setConcerns(null));
  }, [seesConcerns, uid]);

  const chips = useMemo(() => {
    const now = new Date();
    const stockAlerts = seesStock
      ? summariseStockAlerts(allItems, { categoryOf: (item) => normalizeStockItemCategory(item).category, settings: getExpirySettings(), now, resolved: {} }).alerts
      : null;
    return buildAttention({ sars: seesSars ? sars : null, concerns: seesConcerns ? concerns : null, stockAlerts, messages: messageQueue(rows, { now, everything: true }).length, now });
  }, [allItems, concerns, rows, sars, seesConcerns, seesSars, seesStock]);

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
