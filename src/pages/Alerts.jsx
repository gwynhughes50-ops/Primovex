import React, { useEffect, useMemo, useState } from "react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  AlertTriangle,
  Calendar,
  Package,
  CheckCircle,
  Thermometer,
  Settings,
  Mail,
  X,
  Activity,
  Brain,
  ClipboardList,
  Clock,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
  deleteDoc,
} from "firebase/firestore";

import { onAuthStateChanged } from "firebase/auth";
import { db, auth } from "../lib/firebase";

import { buildOperationsIntelligence } from "../services/medAiOperationsService";
import StockVerificationWidget from "../components/stock/StockVerificationWidget";
import useConnectedDevices from "@/hooks/useConnectedDevices";

/**
 * Collections used:
 * - stock_items
 * - temperature_logs
 * - alert_resolutions   (practice-wide resolved state)
 * - users               (profiles; role lives here)
 * - settings/alerts     (practice-wide alerts config)
 */
const STOCK_COL = "stock_items";
const TEMP_COL = "temperature_logs";
const RESOLUTIONS_COL = "alert_resolutions";
const USERS_COL = "users";
const SETTINGS_DOC_PATH = "settings/alerts";

/**
 * Defaults for "expiring soon" thresholds.
 * Stored practice-wide in Firestore (settings/alerts) with these defaults as fallback.
 */
const DEFAULT_EXPIRY_SOON_DAYS = 30;

const DEFAULT_CATEGORY_THRESHOLDS = {
  medicinal: 30,
  vaccines: 30,
  emergency_drugs: 60,
  dressings: 30,
  equipment: 0,
  non_medical: 0,
};

/**
 * Temperature ranges fallback.
 * If your temperature_logs store unitRange, we use it.
 */
const DEFAULT_TEMP_RANGES = {
  fridge: { min: 2, max: 8 },
  freezer20: { min: -25, max: -15 },
  freezer40: { min: -45, max: -35 },
  freezer: { min: -25, max: -15 },
};

/* -------------------- helpers -------------------- */

function firstDefined(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function parseMaybeDate(value) {
  if (!value) return null;

  if (value?.toDate && typeof value.toDate === "function") {
    const d = value.toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function formatDate(d) {
  try {
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

function formatDateTime(d) {
  try {
    return d.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function daysBetween(a, b) {
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / 86400000);
}

function severityRank(sev) {
  return sev === "critical" ? 0 : 1;
}

function getTempStatus(unitRange, tempC) {
  const t = Number(tempC);
  if (Number.isNaN(t) || !unitRange) return { label: "Unknown", severity: "warning" };

  const { min, max } = unitRange;
  if (t < min || t > max) return { label: "Out of range", severity: "critical" };

  const span = max - min;
  const margin = span * 0.1;
  if (t < min + margin || t > max - margin) return { label: "Borderline", severity: "warning" };

  return { label: "In range", severity: "ok" };
}

/* -------------------- component -------------------- */


function priorityCardClass(label, value) {
  const active = Number(value || 0) > 0;
  if (!active) return "border-[var(--medtrak-border)] bg-[var(--medtrak-panel-soft)] text-[var(--medtrak-text)]";
  const key = String(label || "").toLowerCase();
  if (key.includes("critical")) return "border-rose-400/35 bg-rose-500/10 text-rose-900 dark:text-rose-100";
  if (key.includes("due")) return "border-amber-400/35 bg-amber-500/10 text-amber-900 dark:text-amber-100";
  if (key.includes("active")) return "border-sky-400/35 bg-sky-500/10 text-sky-900 dark:text-sky-100";
  if (key.includes("resolved")) return "border-emerald-400/35 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100";
  return "border-[var(--medtrak-border)] bg-[var(--medtrak-panel-soft)] text-[var(--medtrak-text)]";
}

export default function Alerts() {
  // Auth + profile
  const [authUser, setAuthUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const isAdmin = useMemo(() => {
    return String(profile?.role || "").toLowerCase() === "system admin";
  }, [profile]);

  const resolvedByLabel = useMemo(() => {
    const email = authUser?.email;
    const name = authUser?.displayName;
    if (name && email) return `${name} (${email})`;
    return email || name || "user";
  }, [authUser]);

  const { intelligence: connectIntelligence } = useConnectedDevices();

  // Data
  const [stockItems, setStockItems] = useState([]);
  const [tempLogs, setTempLogs] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [tempError, setTempError] = useState("");

  // Resolved alerts map: { [alertId]: { resolved_at, resolved_by } }
  const [resolvedMap, setResolvedMap] = useState({});

  // Toggle: active vs resolved
  const [view, setView] = useState("active"); // "active" | "resolved"

  // Settings UI
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Practice-wide settings (live + editable draft)
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState("");

  // Live values (used by alerts generation)
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [globalExpirySoonDays, setGlobalExpirySoonDays] = useState(DEFAULT_EXPIRY_SOON_DAYS);
  const [categoryThresholds, setCategoryThresholds] = useState(DEFAULT_CATEGORY_THRESHOLDS);

  // Draft values (edited in modal; only saved when clicking Save)
  const [draftEmailEnabled, setDraftEmailEnabled] = useState(false);
  const [draftGlobalExpirySoonDays, setDraftGlobalExpirySoonDays] = useState(DEFAULT_EXPIRY_SOON_DAYS);
  const [draftCategoryThresholds, setDraftCategoryThresholds] = useState(DEFAULT_CATEGORY_THRESHOLDS);
  const [savingSettings, setSavingSettings] = useState(false);

  // -------------------------
  // Auth subscription
  // -------------------------
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setAuthUser(u || null);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // Profile subscription: users/{uid}
  useEffect(() => {
    if (!authUser?.uid) {
      setProfile(null);
      return;
    }

    const ref = doc(db, USERS_COL, authUser.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setProfile(snap.exists() ? snap.data() : null);
      },
      (err) => {
        console.error("Alerts profile subscribe error:", err);
        setProfile(null);
      }
    );

    return () => unsub();
  }, [authUser?.uid]);

  // -------------------------
  // Subscribe: practice-wide settings doc
  // -------------------------
  useEffect(() => {
    const ref = doc(db, SETTINGS_DOC_PATH);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setSettingsError("");
        setSettingsLoading(false);

        const data = snap.exists() ? snap.data() : {};

        // Merge with defaults so the UI always has keys
        const mergedEmail = data?.email_enabled ?? false;
        const mergedGlobal = safeNumber(data?.global_expiry_days);
        const mergedCats = data?.category_expiry_days || {};

        const liveEmail = Boolean(mergedEmail);
        const liveGlobal = mergedGlobal === null ? DEFAULT_EXPIRY_SOON_DAYS : Math.max(0, mergedGlobal);

        const liveCats = {
          ...DEFAULT_CATEGORY_THRESHOLDS,
          ...(typeof mergedCats === "object" && mergedCats ? mergedCats : {}),
        };

        setEmailEnabled(liveEmail);
        setGlobalExpirySoonDays(liveGlobal);
        setCategoryThresholds(liveCats);

        // If modal isn't open, keep draft in sync with live
        // (so user always starts editing current values)
        if (!settingsOpen) {
          setDraftEmailEnabled(liveEmail);
          setDraftGlobalExpirySoonDays(liveGlobal);
          setDraftCategoryThresholds(liveCats);
        }
      },
      (err) => {
        console.error("Alerts settings subscribe error:", err);
        setSettingsLoading(false);
        setSettingsError(String(err?.message || err));
      }
    );

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsOpen]);

  // When opening the modal, copy live -> draft
  useEffect(() => {
    if (settingsOpen) {
      setDraftEmailEnabled(emailEnabled);
      setDraftGlobalExpirySoonDays(globalExpirySoonDays);
      setDraftCategoryThresholds(categoryThresholds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsOpen]);

  async function savePracticeSettings() {
    if (!authUser) {
      alert("You must be signed in.");
      return;
    }
    if (!isAdmin) {
      alert("Only System Admin can change practice-wide settings.");
      return;
    }

    setSavingSettings(true);
    try {
      await setDoc(
        doc(db, SETTINGS_DOC_PATH),
        {
          email_enabled: Boolean(draftEmailEnabled),
          global_expiry_days: Math.max(0, Number(draftGlobalExpirySoonDays || 0)),
          category_expiry_days: draftCategoryThresholds || DEFAULT_CATEGORY_THRESHOLDS,
          updated_at: serverTimestamp(),
          updated_by: resolvedByLabel,
        },
        { merge: true }
      );
      setSettingsOpen(false);
    } catch (err) {
      console.error("Save settings failed:", err);
      alert(`Could not save settings (check Firestore rules): ${String(err?.message || err)}`);
    } finally {
      setSavingSettings(false);
    }
  }

  // -------------------------
  // Subscribe: stock_items
  // -------------------------
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, STOCK_COL),
      (snap) => {
        setLoadError("");
        setStockItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => {
        console.error("Alerts stock_items subscribe error:", err);
        setLoadError(String(err?.message || err));
      }
    );

    return () => unsub();
  }, []);

  // -------------------------
  // Subscribe: temperature_logs
  // -------------------------
  useEffect(() => {
    const qy = query(collection(db, TEMP_COL), orderBy("created_at", "desc"), limit(200));

    const unsub = onSnapshot(
      qy,
      (snap) => {
        setTempError("");
        setTempLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => {
        console.error("Alerts temperature_logs subscribe error:", err);
        setTempError(String(err?.message || err));
      }
    );

    return () => unsub();
  }, []);

  // -------------------------
  // Subscribe: alert_resolutions
  // -------------------------
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, RESOLUTIONS_COL),
      (snap) => {
        const next = {};
        snap.docs.forEach((d) => (next[d.id] = d.data()));
        setResolvedMap(next);
      },
      (err) => {
        console.error("Alerts alert_resolutions subscribe error:", err);
      }
    );
    return () => unsub();
  }, []);

  // Build GENERATED alerts (then we subtract resolved for "Active" view)
  const generatedAlerts = useMemo(() => {
    const now = new Date();
    const list = [];

    // ------------ STOCK ALERTS ------------
    for (const item of stockItems) {
      // ✅ Ignore archived items
      if (item?.archived_at) continue;

      const name =
        firstDefined(item, ["name", "item_name", "title", "product_name"]) || "Unnamed item";

      const site =
        firstDefined(item, ["site", "siteName", "site_id", "siteId"]) || "Unknown site";

      const location =
        firstDefined(item, ["location", "locationName", "location_id", "locationId"]) || "";

      const category =
        String(firstDefined(item, ["category", "categoryKey", "category_key"]) || "").trim() ||
        "unknown";

      const currentStock =
        safeNumber(firstDefined(item, ["current_stock", "currentStock", "qty", "quantity"])) ?? null;

      const minStock =
        safeNumber(firstDefined(item, ["min_stock", "minStock", "reorder_level", "reorderLevel"])) ??
        null;

      const expiryRaw = firstDefined(item, [
        "expiry_date",
        "expiryDate",
        "expires_at",
        "expiresAt",
        "expiry",
      ]);
      const expiryDate = parseMaybeDate(expiryRaw);

      let soonDays = globalExpirySoonDays;
      const perCat = safeNumber(categoryThresholds?.[category]);
      if (perCat !== null && perCat > 0) soonDays = perCat;

      const soonCutoff = new Date(now.getTime() + soonDays * 86400000);

      if (expiryDate) {
        if (expiryDate < now) {
          list.push({
            id: `expired-stock-${item.id}`,
            source: "stock",
            type: "expired",
            severity: "critical",
            title: `${name} expired`,
            message: `Expired on ${formatDate(expiryDate)}. Remove from ${site}${
              location ? ` • ${location}` : ""
            } and replace immediately.`,
            sortTime: expiryDate.getTime(),
          });
        } else if (soonDays > 0 && expiryDate <= soonCutoff) {
          const days = daysBetween(now, expiryDate);
          list.push({
            id: `expiring-stock-${item.id}`,
            source: "stock",
            type: "expiring",
            severity: "warning",
            title: `${name} expiring soon`,
            message: `Expires in ${days} day${days === 1 ? "" : "s"} (${formatDate(
              expiryDate
            )}). Check rotation at ${site}${location ? ` • ${location}` : ""}.`,
            sortTime: expiryDate.getTime(),
          });
        }
      }

      if (currentStock !== null && minStock !== null) {
        if (currentStock <= 0) {
          list.push({
            id: `outofstock-stock-${item.id}`,
            source: "stock",
            type: "low_stock",
            severity: "critical",
            title: `${name} out of stock`,
            message: `0 remaining (min ${minStock}). Reorder for ${site}${
              location ? ` • ${location}` : ""
            }.`,
            sortTime: now.getTime(),
          });
        } else if (currentStock <= minStock) {
          list.push({
            id: `lowstock-stock-${item.id}`,
            source: "stock",
            type: "low_stock",
            severity: "warning",
            title: `${name} low stock`,
            message: `Only ${currentStock} remaining (min ${minStock}) at ${site}${
              location ? ` • ${location}` : ""
            }.`,
            sortTime: now.getTime(),
          });
        }
      }
    }

    // ------------ TEMPERATURE ALERTS ------------
    const latestByUnit = new Map();
    for (const log of tempLogs) {
      const unitId = firstDefined(log, ["unitId", "unit_id", "unit"]) || "";
      if (!unitId) continue;
      if (!latestByUnit.has(unitId)) latestByUnit.set(unitId, log);
    }

    for (const log of latestByUnit.values()) {
      const dt =
        log?.measured_at?.toDate?.() ||
        log?.created_at?.toDate?.() ||
        (log?.datetime ? new Date(log.datetime) : null);

      const tempValue = firstDefined(log, ["temp", "temperature"]);
      const tNum = safeNumber(tempValue);

      const unitRange = firstDefined(log, ["unitRange"]) || null;

      const unitType = String(firstDefined(log, ["unitType", "unit_type"]) || "fridge");
      const fallbackRange =
        DEFAULT_TEMP_RANGES[unitType] ||
        (unitType === "freezer" ? DEFAULT_TEMP_RANGES.freezer : DEFAULT_TEMP_RANGES.fridge);

      const rangeToUse = unitRange || fallbackRange;

      const status = getTempStatus(rangeToUse, tNum);
      if (status.severity === "ok") continue;

      const site = firstDefined(log, ["siteId", "site", "siteName"]) || "Unknown site";
      const unitName =
        firstDefined(log, ["unitName", "unit_name"]) || (firstDefined(log, ["unitId"]) || "Unit");

      const rangeLabel = rangeToUse ? `${rangeToUse.min} to ${rangeToUse.max}°C` : "—";

      list.push({
        id: `temp-${log.id}`,
        source: "temperature",
        type: status.label === "Out of range" ? "temp_out" : "temp_borderline",
        severity: status.severity === "critical" ? "critical" : "warning",
        title: `${unitName} temperature ${status.label.toLowerCase()}`,
        message: `${tNum ?? "—"} °C (range ${rangeLabel}) • ${site} • ${
          dt ? formatDateTime(dt) : "Unknown time"
        }`,
        sortTime: dt ? dt.getTime() : now.getTime(),
      });
    }

    list.sort((a, b) => {
      const s = severityRank(a.severity) - severityRank(b.severity);
      if (s !== 0) return s;
      return (a.sortTime || 0) - (b.sortTime || 0);
    });

    return list;
  }, [stockItems, tempLogs, globalExpirySoonDays, categoryThresholds]);

  const activeAlerts = useMemo(() => {
    return generatedAlerts.filter((a) => !resolvedMap?.[a.id]);
  }, [generatedAlerts, resolvedMap]);

  const resolvedAlerts = useMemo(() => {
    const entries = Object.entries(resolvedMap || {}).map(([id, meta]) => ({ id, meta }));
    const byId = new Map(generatedAlerts.map((a) => [a.id, a]));
    const now = new Date();

    const rows = entries.map(({ id, meta }) => {
      const gen = byId.get(id);

      const resolvedAt =
        meta?.resolved_at?.toDate?.() || (meta?.resolved_at ? new Date(meta.resolved_at) : null);

      return {
        id,
        title: gen?.title || id,
        message: gen?.message || "This alert is currently not active (condition cleared).",
        severity: gen?.severity || "warning",
        source: gen?.source || "unknown",
        sortTime: resolvedAt ? resolvedAt.getTime() : now.getTime(),
        resolved_by: meta?.resolved_by || "—",
        resolved_at: resolvedAt,
      };
    });

    rows.sort((a, b) => (b.sortTime || 0) - (a.sortTime || 0));
    return rows;
  }, [resolvedMap, generatedAlerts]);

  const counts = useMemo(() => {
    const critical = activeAlerts.filter((a) => a.severity === "critical").length;
    const warn = activeAlerts.filter((a) => a.severity !== "critical").length;
    const temp = activeAlerts.filter((a) => a.source === "temperature").length;
    const stock = activeAlerts.filter((a) => a.source === "stock").length;
    return {
      critical,
      warn,
      total: activeAlerts.length,
      temp,
      stock,
      resolved: resolvedAlerts.length,
    };
  }, [activeAlerts, resolvedAlerts]);

  async function resolveAlert(alertId) {
    if (!authUser) {
      alert("You must be signed in to resolve alerts.");
      return;
    }
    try {
      await setDoc(doc(db, RESOLUTIONS_COL, alertId), {
        resolved_at: serverTimestamp(),
        resolved_by: resolvedByLabel,
      });
    } catch (err) {
      console.error("Resolve alert failed:", err);
      alert(`Could not resolve alert (check Firestore rules): ${String(err?.message || err)}`);
    }
  }

  async function unresolveAlert(alertId) {
    if (!authUser) {
      alert("You must be signed in.");
      return;
    }
    if (!isAdmin) {
      alert("Only System Admin can unresolve alerts.");
      return;
    }
    try {
      await deleteDoc(doc(db, RESOLUTIONS_COL, alertId));
    } catch (err) {
      console.error("Unresolve failed:", err);
      alert(`Could not unresolve alert (check Firestore rules): ${String(err?.message || err)}`);
    }
  }

  const intelligence = useMemo(() => {
    return buildOperationsIntelligence({ activeAlerts, resolvedAlerts, counts });
  }, [activeAlerts, resolvedAlerts, counts]);

  const operationalStatusClass =
    intelligence.status === "critical"
      ? "border-rose-400/40 bg-rose-500/15 text-rose-50"
      : intelligence.status === "attention"
        ? "border-amber-400/40 bg-amber-500/15 text-amber-50"
        : "border-emerald-400/40 bg-emerald-500/15 text-emerald-50";

  const todaysPriorityCards = [
    { label: "Critical", value: counts.critical, tone: "rose", icon: AlertTriangle },
    { label: "Due today", value: counts.warn, tone: "amber", icon: Clock },
    { label: "Active alerts", value: counts.total, tone: "cyan", icon: Activity },
    { label: "Resolved", value: counts.resolved, tone: "emerald", icon: CheckCircle },
  ];

  const changedSinceYesterday = [
    { label: "Stock alerts", value: counts.stock, change: counts.stock > 0 ? "+" + counts.stock : "No change", icon: Package },
    { label: "Temperature", value: counts.temp, change: counts.temp > 0 ? "+" + counts.temp : "Stable", icon: Thermometer },
    { label: "Governance", value: 0, change: "Awaiting SAR feed", icon: ShieldCheck },
    { label: "Purchasing", value: counts.stock, change: counts.stock > 0 ? "Action likely" : "Quiet", icon: ClipboardList },
  ];

  const myQueue = [
    { label: "To review", value: counts.total, detail: "Active operational items" },
    { label: "Stock", value: counts.stock, detail: "Reorder or rotate" },
    { label: "Temperature", value: counts.temp, detail: "Check latest reading" },
    { label: "Settings", value: emailEnabled ? "On" : "Off", detail: "Email hooks" },
  ];

  const liveActivity = [
    counts.total > 0
      ? { time: "Now", title: `${counts.total} active alert${counts.total === 1 ? "" : "s"} detected`, detail: "MedAI has refreshed operational priorities." }
      : { time: "Now", title: "No active alerts detected", detail: "Stock and temperature checks are currently clear." },
    settingsLoading
      ? { time: "Live", title: "Loading alert settings", detail: "Practice-wide thresholds are being checked." }
      : { time: "Live", title: "Alert thresholds loaded", detail: `${globalExpirySoonDays} day global expiry threshold active.` },
    { time: "Today", title: `${resolvedAlerts.length} resolved alert${resolvedAlerts.length === 1 ? "" : "s"} on record`, detail: "Resolved items remain auditable." },
  ];

  const AlertCard = ({ alert, resolved = false }) => (
    <Card
      key={alert.id}
      className={`border p-4 ${
        alert.severity === "critical"
          ? "border-rose-500/35 bg-rose-500/10"
          : "border-amber-400/35 bg-amber-500/10"
      }`}
    >
      <div className="flex items-start gap-3 text-sm">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-slate-950/40">
          {alert.source === "temperature" ? (
            <Thermometer className={`h-4 w-4 ${alert.severity === "critical" ? "text-rose-100" : "text-amber-100"}`} />
          ) : alert.type === "expired" || alert.type === "low_stock" ? (
            <AlertTriangle className="h-4 w-4 text-rose-100" />
          ) : (
            <Package className="h-4 w-4 text-amber-100" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-slate-50">{alert.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-100/80">{alert.message}</p>
              <p className="mt-2 text-[11px] uppercase tracking-wide text-slate-300/70">
                Source <span className="text-slate-200">{alert.source}</span>
              </p>
            </div>
            {resolved ? (
              <Button
                variant="outline"
                className="rounded-full border-rose-400/20 bg-rose-500/10 text-xs text-rose-100 hover:bg-rose-500/15"
                onClick={() => unresolveAlert(alert.id)}
                disabled={!authUser || !isAdmin}
              >
                Unresolve
              </Button>
            ) : (
              <Button
                variant="outline"
                className="rounded-full border-white/10 bg-slate-900/30 text-xs text-slate-200 hover:bg-slate-900/50"
                onClick={() => resolveAlert(alert.id)}
                disabled={!authUser}
              >
                Resolve
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );

  return (
    <div className="w-full space-y-5">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/60 p-5 shadow-2xl shadow-slate-950/40 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-3xl bg-gradient-to-br from-teal-300 via-emerald-300 to-cyan-400 shadow-[0_0_40px_rgba(45,212,191,0.45)]">
              <Activity className="h-6 w-6 text-slate-950" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">Operations Centre</h2>
                <span className="rounded-full border border-teal-300/25 bg-teal-300/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-teal-100">
                  Powered by MedAI
                </span>
              </div>
              <p className="mt-1 max-w-3xl text-sm text-slate-400">
                A live operational workspace for stock, temperature, governance, purchasing and daily practice priorities.
              </p>
              <div className="mt-2">
                <span className="mt-pill-muted inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium">
                  {authLoading
                    ? "Checking sign-in…"
                    : authUser
                      ? `Signed in as ${resolvedByLabel}${isAdmin ? " • System Admin" : ""}`
                      : "Not signed in"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="rounded-full border-white/10 bg-slate-900/40 text-xs text-slate-200 hover:bg-slate-900/60"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings className="mr-2 h-4 w-4" />
              Alert settings
            </Button>
          </div>
        </div>
      </section>

      {(loadError || tempError || settingsError) && (
        <Card className="border-rose-500/30 bg-rose-500/10 p-4">
          <div className="space-y-1 text-sm text-rose-100">
            {loadError ? <div>Stock error: <span className="font-semibold text-rose-50">{loadError}</span></div> : null}
            {tempError ? <div>Temperature error: <span className="font-semibold text-rose-50">{tempError}</span></div> : null}
            {settingsError ? <div>Settings error: <span className="font-semibold text-rose-50">{settingsError}</span></div> : null}
          </div>
        </Card>
      )}

      <section className={`rounded-[1.75rem] border p-4 ${operationalStatusClass}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950/30">
              {intelligence.status === "stable" ? <CheckCircle className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
            </div>
            <div>
              <p className="text-sm font-semibold">{intelligence.statusLabel}</p>
              <p className="text-xs opacity-80">
                MedAI risk scan: {intelligence.riskScore}/100 • {counts.total} active operational item{counts.total === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <div className="rounded-full bg-slate-950/25 px-3 py-1 text-xs font-semibold">
            Updated live from Firestore
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Card className="border-white/10 bg-slate-950/50 p-5 xl:col-span-7">
          <div className="mb-4 flex items-center gap-2">
            <Brain className="h-5 w-5 text-teal-200" />
            <div>
              <h3 className="font-semibold text-slate-50">MedAI Daily Brief</h3>
              <p className="text-xs text-slate-400">Rule-based operational intelligence, ready for future LLM integration.</p>
            </div>
          </div>
          <div className="rounded-3xl border border-teal-300/15 bg-teal-300/10 p-4">
            <p className="text-sm font-semibold text-teal-50">Good morning Gwyn.</p>
            <div className="mt-3 grid gap-2 text-sm text-slate-100/90">
              {intelligence.briefLines.map((line, idx) => (
                <div key={idx} className="flex gap-2">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-teal-200" />
                  <span>{line}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card className="border-white/10 bg-slate-950/50 p-5 xl:col-span-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-200" />
              <h3 className="font-semibold text-slate-50">Today's Priorities</h3>
            </div>
            <span className="text-xs text-slate-500">AI-ranked</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {todaysPriorityCards.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className={`rounded-3xl border p-4 transition-colors ${priorityCardClass(item.label, item.value)}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs uppercase tracking-wide opacity-70">{item.label}</p>
                    <Icon className="h-4 w-4 opacity-70" />
                  </div>
                  <p className="mt-2 text-2xl font-semibold">{item.value}</p>
                </div>
              );
            })}
          </div>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Card className="border-white/10 bg-slate-950/50 p-5 xl:col-span-4">
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-cyan-200" />
            <h3 className="font-semibold text-slate-50">What's Changed Since Yesterday</h3>
          </div>
          <div className="space-y-3">
            {changedSinceYesterday.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-900/40 p-3">
                  <div className="flex items-center gap-3">
                    <Icon className="h-4 w-4 text-slate-300" />
                    <div>
                      <p className="text-sm font-medium text-slate-100">{item.label}</p>
                      <p className="text-xs text-slate-500">Current {item.value}</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-slate-800/70 px-2.5 py-1 text-xs text-slate-200">{item.change}</span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="border-white/10 bg-slate-950/50 p-5 xl:col-span-4">
          <div className="mb-4 flex items-center gap-2">
            <Brain className="h-5 w-5 text-violet-200" />
            <h3 className="font-semibold text-slate-50">AI Suggested Actions</h3>
          </div>
          <div className="space-y-3">
            {intelligence.suggestedActions.map((action) => (
              <div key={action.id} className="rounded-2xl border border-white/10 bg-slate-900/40 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-50">{action.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-400">{action.detail}</p>
                    <p className="mt-2 text-[11px] text-slate-500">Linked to: <span className="text-slate-300">{action.alertTitle}</span></p>
                  </div>
                  <div className="text-right">
                    <span className="rounded-full bg-teal-300/10 px-2 py-1 text-[11px] font-semibold text-teal-100">{action.score}/100</span>
                    <p className="mt-2 text-[11px] text-slate-500">{action.eta}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="border-white/10 bg-slate-950/50 p-5 xl:col-span-4">
          <div className="mb-4 flex items-center gap-2">
            <Users className="h-5 w-5 text-emerald-200" />
            <h3 className="font-semibold text-slate-50">My Queue</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {myQueue.map((item) => (
              <div key={item.label} className="rounded-2xl border border-white/10 bg-slate-900/40 p-3">
                <p className="text-xs text-slate-400">{item.label}</p>
                <p className="mt-1 text-xl font-semibold text-slate-50">{item.value}</p>
                <p className="mt-1 text-[11px] text-slate-500">{item.detail}</p>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-12">
          <StockVerificationWidget items={stockItems} actor={authUser} />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Card className="border-white/10 bg-slate-950/50 p-5 xl:col-span-12">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl border border-teal-400/20 bg-teal-500/10 text-teal-200">
                <Thermometer className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-50">MedTrak Connect</h3>
                <p className="mt-1 text-sm text-slate-400">{connectIntelligence.headline}</p>
                <p className="mt-1 text-xs text-slate-500">Cold-chain readings feed Operations Centre, Practice Pulse and future compliance reports.</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3">
                <p className="text-[11px] text-slate-500">Connect</p>
                <p className="text-xl font-black text-slate-50">{connectIntelligence.healthScore}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3">
                <p className="text-[11px] text-slate-500">Devices</p>
                <p className="text-xl font-black text-slate-50">{connectIntelligence.devices.length}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3">
                <p className="text-[11px] text-slate-500">Alerts</p>
                <p className="text-xl font-black text-slate-50">{connectIntelligence.critical.length + connectIntelligence.offline.length}</p>
              </div>
            </div>
          </div>
        </Card>
      </section>


      <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Card className="border-white/10 bg-slate-950/50 p-5 xl:col-span-4">
          <div className="mb-4 flex items-center gap-2">
            <Activity className="h-5 w-5 text-teal-200" />
            <h3 className="font-semibold text-slate-50">Live Activity</h3>
          </div>
          <div className="space-y-3">
            {liveActivity.map((item, idx) => (
              <div key={idx} className="flex gap-3 rounded-2xl border border-white/10 bg-slate-900/40 p-3">
                <span className="w-12 shrink-0 text-xs font-semibold text-teal-200">{item.time}</span>
                <div>
                  <p className="text-sm font-medium text-slate-100">{item.title}</p>
                  <p className="text-xs text-slate-500">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="border-white/10 bg-slate-950/50 p-5 xl:col-span-8">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-200" />
              <div>
                <h3 className="font-semibold text-slate-50">Alerts Widget</h3>
                <p className="text-xs text-slate-400">Alerts are now one part of the Operations Centre, not the whole page.</p>
              </div>
            </div>
            <div className="inline-flex gap-1 rounded-full border border-white/10 bg-slate-900/40 p-1">
              <button
                className={`rounded-full px-3 py-1.5 text-xs ${view === "active" ? "bg-slate-800/70 text-slate-50" : "text-slate-300 hover:bg-slate-800/40"}`}
                onClick={() => setView("active")}
              >
                Active ({counts.total})
              </button>
              <button
                className={`rounded-full px-3 py-1.5 text-xs ${view === "resolved" ? "bg-slate-800/70 text-slate-50" : "text-slate-300 hover:bg-slate-800/40"}`}
                onClick={() => setView("resolved")}
              >
                Resolved ({counts.resolved})
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {view === "active" && activeAlerts.length === 0 && !loadError && !tempError ? (
              <Card className="border-emerald-400/30 bg-emerald-500/10 p-4">
                <p className="text-sm text-emerald-50">No active alerts 🎉</p>
                <p className="mt-1 text-xs text-emerald-100/70">Auto-generated from expiry dates, minimum stock levels and latest temperature readings.</p>
              </Card>
            ) : null}

            {view === "resolved" && resolvedAlerts.length === 0 ? (
              <Card className="border-slate-700/30 bg-slate-900/40 p-4">
                <p className="text-sm text-slate-200">No resolved alerts yet.</p>
                <p className="mt-1 text-xs text-slate-400">Resolve an alert to move it here.</p>
              </Card>
            ) : null}

            {view === "active" && activeAlerts.map((alert) => <AlertCard key={alert.id} alert={alert} />)}
            {view === "resolved" && resolvedAlerts.map((row) => <AlertCard key={row.id} alert={row} resolved />)}
          </div>
        </Card>
      </section>

      {/* Settings Drawer */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur">
          <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-slate-900/95 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold text-slate-50 flex items-center gap-2">
                  <Settings className="h-5 w-5 text-teal-300" />
                  Alert settings
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  These settings are stored <span className="text-slate-200">practice-wide</span> in Firestore (
                  <span className="text-slate-200">settings/alerts</span>).
                  {!isAdmin ? " (View only — admin required to edit.)" : ""}
                </div>
              </div>
              <Button
                variant="outline"
                className="rounded-full border-white/10 bg-slate-900/40 text-xs text-slate-200 hover:bg-slate-900/60"
                onClick={() => setSettingsOpen(false)}
                disabled={savingSettings}
              >
                <X className="h-4 w-4 mr-1.5" />
                Close
              </Button>
            </div>

            <div className="mt-5 space-y-4">
              <Card className="p-4 border-slate-700/40 bg-slate-950/40">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-50">Email hooks (placeholder)</div>
                    <div className="text-xs text-slate-400 mt-1">
                      Turning this on doesn’t send emails yet — it’s the switch we’ll connect to Power Automate / Cloud Functions.
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    disabled={!isAdmin || savingSettings}
                    className={`rounded-full text-xs ${
                      draftEmailEnabled
                        ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
                        : "border-white/10 bg-slate-900/40 text-slate-200"
                    }`}
                    onClick={() => setDraftEmailEnabled((v) => !v)}
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    {draftEmailEnabled ? "Enabled" : "Disabled"}
                  </Button>
                </div>
              </Card>

              <Card className="p-4 border-slate-700/40 bg-slate-950/40">
                <div className="text-sm font-semibold text-slate-50">Expiry thresholds</div>
                <div className="text-xs text-slate-400 mt-1">
                  Global threshold applies unless a category override is set above 0.
                </div>

                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-300">Global “expiring soon” days</label>
                    <Input
                      disabled={!isAdmin || savingSettings}
                      value={String(draftGlobalExpirySoonDays)}
                      onChange={(e) =>
                        setDraftGlobalExpirySoonDays(Math.max(0, Number(e.target.value || 0)))
                      }
                      placeholder="e.g. 30"
                    />
                  </div>

                  <div className="text-xs text-slate-400 flex items-end">
                    Tip: set a category to <span className="text-slate-200 font-semibold mx-1">0</span>
                    to disable expiring-soon alerts for that category.
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Object.keys({ ...DEFAULT_CATEGORY_THRESHOLDS, ...draftCategoryThresholds }).map((cat) => (
                    <div key={cat}>
                      <label className="text-xs text-slate-300">{cat} (days)</label>
                      <Input
                        disabled={!isAdmin || savingSettings}
                        value={String(draftCategoryThresholds?.[cat] ?? DEFAULT_CATEGORY_THRESHOLDS[cat] ?? 0)}
                        onChange={(e) => {
                          const n = Math.max(0, Number(e.target.value || 0));
                          setDraftCategoryThresholds((prev) => ({ ...(prev || {}), [cat]: n }));
                        }}
                      />
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex items-center justify-end gap-2">
                  <Button
                    variant="outline"
                    disabled={savingSettings}
                    onClick={() => {
                      // Reset draft to current live values
                      setDraftEmailEnabled(emailEnabled);
                      setDraftGlobalExpirySoonDays(globalExpirySoonDays);
                      setDraftCategoryThresholds(categoryThresholds);
                    }}
                  >
                    Reset
                  </Button>

                  <Button
                    disabled={!isAdmin || savingSettings}
                    onClick={savePracticeSettings}
                    title={!isAdmin ? "System Admin only" : "Save practice-wide settings"}
                  >
                    {savingSettings ? "Saving…" : "Save"}
                  </Button>
                </div>

                {!isAdmin ? (
                  <div className="mt-3 text-xs text-slate-400">
                    You can view settings, but only a <span className="text-slate-200">System Admin</span> can save changes.
                  </div>
                ) : null}
              </Card>

              <Card className="p-4 border-slate-700/40 bg-slate-950/40">
                <div className="text-sm font-semibold text-slate-50">Resolved alerts</div>
                <div className="text-xs text-slate-400 mt-1">
                  Practice-wide. Admin status is read from <span className="text-slate-200">users/{`{uid}`}</span>.
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
