import { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import useStockSummary from "@/hooks/useStockSummary";
import useExpirySettings from "@/hooks/useExpirySettings";
import { stockLevelStatus } from "@/lib/stockAlerts";
import { getExpiryStatus, daysUntilExpiry, normalizeStockItemCategory } from "@/services/stockService";

const COLLECTIONS = {
  stockItems: "stock_items",
  stockMovements: "stock_movements",
  temperatureLogs: "temperature_logs",
};

export function formatStockMovement(movement) {
  const type = String(movement?.type || "").toLowerCase();
  const name = movement?.item_name || "Item";
  const delta = Number(movement?.delta ?? 0);
  if (type === "receive") return `+${delta} received: ${name}`;
  if (type === "use") return `-${Math.abs(delta)} used: ${name}`;
  if (type === "create") return `Created item: ${name}`;
  return type ? `${type}: ${name}` : name;
}

export default function useSmartHomeData() {
  const expirySettings = useExpirySettings();
  const stock = useStockSummary();
  const [recentMoves, setRecentMoves] = useState([]);
  const [items, setItems] = useState([]);
  const [latestTemp, setLatestTemp] = useState(null);
  const [state, setState] = useState({ movesLoading: true, itemsLoading: true, tempLoading: true });
  const [errors, setErrors] = useState({});

  useEffect(() => onSnapshot(
    query(collection(db, COLLECTIONS.stockMovements), orderBy("created_at", "desc"), limit(5)),
    (snap) => { setRecentMoves(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); setState((s) => ({ ...s, movesLoading: false })); },
    (error) => { setErrors((e) => ({ ...e, movements: error })); setState((s) => ({ ...s, movesLoading: false })); }
  ), []);

  useEffect(() => onSnapshot(
    query(collection(db, COLLECTIONS.stockItems)),
    (snap) => { setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); setState((s) => ({ ...s, itemsLoading: false })); },
    (error) => { setErrors((e) => ({ ...e, items: error })); setState((s) => ({ ...s, itemsLoading: false })); }
  ), []);

  useEffect(() => onSnapshot(
    query(collection(db, COLLECTIONS.temperatureLogs), orderBy("measured_at", "desc"), limit(1)),
    (snap) => { setLatestTemp(snap.docs[0] ? { id: snap.docs[0].id, ...snap.docs[0].data() } : null); setState((s) => ({ ...s, tempLoading: false })); },
    (error) => { setErrors((e) => ({ ...e, temperature: error })); setState((s) => ({ ...s, tempLoading: false })); }
  ), []);

  // Archived items never alert. The rules are shared with every other screen
  // (src/lib/stockAlerts.js); the lists below are complete, and only the few
  // shown in "Warnings" are trimmed further down.
  const liveItems = useMemo(() => items.filter((item) => !item.archived_at), [items]);

  const lowStockDetails = useMemo(() => liveItems
    .filter((item) => stockLevelStatus(item))
    .map((item) => ({ ...item, deficit: Number(item.min_stock ?? 0) - Number(item.current_stock ?? 0) }))
    .sort((a, b) => b.deficit - a.deficit), [liveItems]);

  // Expired and expiring-soon items, soonest first, using the practice's
  // "expiring soon" windows.
  const expiringSoon = useMemo(() => liveItems
    .map((item) => ({ ...item, _status: getExpiryStatus(item, new Date(), expirySettings), _days: daysUntilExpiry(item) }))
    .filter((item) => item._status)
    .sort((a, b) => a._days - b._days), [liveItems, expirySettings]);

  const temperature = useMemo(() => {
    if (state.tempLoading) return { headline: "—", detail: "Loading temperature…", within: true, loading: true, hasReading: false };
    if (!latestTemp) return { headline: "—", detail: "No temperature logs yet.", within: true, loading: false, hasReading: false };
    const reading = Number(latestTemp.temp);
    const min = Number(latestTemp?.unitRange?.min);
    const max = Number(latestTemp?.unitRange?.max);
    const within = Number.isFinite(reading) && Number.isFinite(min) && Number.isFinite(max) ? reading >= min && reading <= max : true;
    const location = `${latestTemp.unitName || "Unit"}${latestTemp.site ? ` (${latestTemp.site})` : ""}`;
    return { headline: Number.isFinite(reading) ? `${reading.toFixed(1)}°C` : "—", detail: within ? `${location} within range.` : `${location} OUT OF RANGE!`, within, loading: false, hasReading: true, readingAt: latestTemp.measured_at };
  }, [latestTemp, state.tempLoading]);

  const issues = useMemo(() => {
    const rows = [];
    if (latestTemp && !temperature.within) rows.push({ key: "temperature", tone: "danger", text: temperature.detail });
    expiringSoon.slice(0, 3).forEach((item) => rows.push({
      key: `expiry-${item.id}`,
      tone: item._status === "expired" ? "danger" : "warning",
      text: `${item.name || "Item"} ${item._status === "expired" ? "expired on" : "expiring on"} ${item.expiry_date}${item.site ? ` (${item.site})` : ""}.`,
    }));
    lowStockDetails.slice(0, 3).forEach((item) => rows.push({ key: `stock-${item.id}`, tone: "neutral", text: `${item.name || "Item"} low: ${item.current_stock ?? 0}/${item.min_stock ?? 0}${item.site ? ` (${item.site})` : ""}.` }));
    return rows.slice(0, 3);
  }, [expiringSoon, latestTemp, lowStockDetails, temperature]);

  return {
    ...stock,
    recentMoves,
    items,
    lowStockDetails,
    expiringSoon,
    latestTemp,
    temperature,
    issues,
    loading: { ...state, stock: stock.loading },
    errors: { ...errors, stock: stock.error },
  };
}
