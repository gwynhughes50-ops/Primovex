import React, { useEffect, useMemo, useState } from "react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  AlertTriangle,
  Package,
  CheckCircle,
  Thermometer,
  Settings,
  X,
  Activity,
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
import { normalizeStockItemCategory } from "@/services/stockService";
import {
  DEFAULT_CATEGORY_THRESHOLDS,
  DEFAULT_EXPIRY_SOON_DAYS,
  RESOLVED_HOLD_DAYS,
  daysUntilExpiry,
  expiryStatus,
  resolutionApplies,
  resolutionDetails,
  stockAlertId,
  stockLevelStatus,
} from "@/lib/stockAlerts";
import { categoryLabel as stockCategoryLabel } from "@/data/stockCategories";

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

// The "expiring soon" windows are stored practice-wide in Firestore
// (settings/alerts); their defaults, and the rules that decide expired /
// expiring / low stock, are shared with the rest of the app in
// src/lib/stockAlerts.js so every screen agrees.

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

// What to tell a person when a read or a save fails: plain words, never the database's own message
const isPermission = (err) => /permission|insufficient/i.test(String(err?.code || err?.message || err || ""));
const loadProblem = (message) => (isPermission(message) ? "You don't have permission to see this." : "It couldn't be loaded just now.");
const saveProblem = (err) => (isPermission(err) ? "You don't have permission to do that." : "Please try again in a moment.");

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


  // Data
  const [stockItems, setStockItems] = useState([]);
  const [tempLogs, setTempLogs] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [tempError, setTempError] = useState("");
  const [notice, setNotice] = useState("");

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
  const [globalExpirySoonDays, setGlobalExpirySoonDays] = useState(DEFAULT_EXPIRY_SOON_DAYS);
  const [categoryThresholds, setCategoryThresholds] = useState(DEFAULT_CATEGORY_THRESHOLDS);

  // Draft values (edited in modal; only saved when clicking Save)
  const [draftGlobalExpirySoonDays, setDraftGlobalExpirySoonDays] = useState(DEFAULT_EXPIRY_SOON_DAYS);
  const [draftCategoryThresholds, setDraftCategoryThresholds] = useState(DEFAULT_CATEGORY_THRESHOLDS);
  const [savingSettings, setSavingSettings] = useState(false);

  // Governance activity (concerns + SARs due/overdue) — was previously a
  // hardcoded "Awaiting SAR feed" placeholder that never read real data.

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
        const mergedGlobal = safeNumber(data?.global_expiry_days);
        const mergedCats = data?.category_expiry_days || {};

        const liveGlobal = mergedGlobal === null ? DEFAULT_EXPIRY_SOON_DAYS : Math.max(0, mergedGlobal);

        const liveCats = {
          ...DEFAULT_CATEGORY_THRESHOLDS,
          ...(typeof mergedCats === "object" && mergedCats ? mergedCats : {}),
        };

        setGlobalExpirySoonDays(liveGlobal);
        setCategoryThresholds(liveCats);

        // If modal isn't open, keep draft in sync with live
        // (so user always starts editing current values)
        if (!settingsOpen) {
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
      setDraftGlobalExpirySoonDays(globalExpirySoonDays);
      setDraftCategoryThresholds(categoryThresholds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsOpen]);

  async function savePracticeSettings() {
    if (!authUser) {
      setNotice("Sign in to change the settings.");
      return;
    }
    if (!isAdmin) {
      setNotice("Only an administrator can change the practice's alert settings.");
      return;
    }

    setSavingSettings(true);
    try {
      await setDoc(
        doc(db, SETTINGS_DOC_PATH),
        {
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
      setNotice(`The settings couldn't be saved. ${saveProblem(err)}`);
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
        setTempLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((row) => row.archived !== true));
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

      const category = normalizeStockItemCategory(item).category;

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

      // Same decision as the stock cards, the phone and the desktop pop-up
      // (src/lib/stockAlerts.js), using the windows being edited on this page.
      const status = expiryDate
        ? expiryStatus(item, { categoryId: category, settings: { globalDays: globalExpirySoonDays, categoryDays: categoryThresholds }, now })
        : null;

      if (expiryDate) {
        if (status === "expired") {
          list.push({
            id: stockAlertId("expired", item.id),
            source: "stock",
            state: "expired",
            item,
            type: "expired",
            severity: "critical",
            title: `${name} expired`,
            message: `Expired on ${formatDate(expiryDate)}. Remove from ${site}${
              location ? ` • ${location}` : ""
            } and replace immediately.`,
            sortTime: expiryDate.getTime(),
          });
        } else if (status === "soon") {
          const days = daysUntilExpiry(item, now);
          list.push({
            id: stockAlertId("soon", item.id),
            source: "stock",
            state: "soon",
            item,
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

      const level = stockLevelStatus(item);
      if (level) {
        if (level === "out") {
          list.push({
            id: stockAlertId("out", item.id),
            source: "stock",
            state: "out",
            item,
            type: "low_stock",
            severity: "critical",
            title: `${name} out of stock`,
            message: `0 remaining (min ${minStock ?? 0}). Reorder for ${site}${
              location ? ` • ${location}` : ""
            }.`,
            sortTime: now.getTime(),
          });
        } else {
          list.push({
            id: stockAlertId("low", item.id),
            source: "stock",
            state: "low",
            item,
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

  // A resolved alert hides the problem only while it is the same problem (see resolutionApplies in src/lib/stockAlerts.js); once the expiry date has changed, the
  // item was restocked or the hold period has passed, it comes back, marked "Back again".
  const activeAlerts = useMemo(() => {
    const now = new Date();
    return generatedAlerts
      .map((a) => {
        const made = resolvedMap?.[a.id];
        if (!made) return a;
        return a.source === "stock" && !resolutionApplies(made, a.state, a.item, now) ? { ...a, backAgain: true } : null;
      })
      .filter(Boolean);
  }, [generatedAlerts, resolvedMap]);

  const resolvedAlerts = useMemo(() => {
    const now = new Date();
    const byId = new Map(generatedAlerts.map((a) => [a.id, a]));
    // one that has come back is active again, so it is not listed as resolved
    const entries = Object.entries(resolvedMap || {})
      .map(([id, meta]) => ({ id, meta }))
      .filter(({ id, meta }) => {
        const gen = byId.get(id);
        return !(gen && gen.source === "stock" && !resolutionApplies(meta, gen.state, gen.item, now));
      });

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

  // Saves what the problem looked like (the expiry date or the stock level) with the resolution, so it can come back if it changes
  async function resolveAlert(alertItem) {
    if (!authUser) {
      setNotice("Sign in to resolve an alert.");
      return;
    }
    setNotice("");
    try {
      await setDoc(doc(db, RESOLUTIONS_COL, alertItem.id), {
        resolved_at: serverTimestamp(),
        resolved_by: resolvedByLabel,
        ...(alertItem.source === "stock" ? resolutionDetails(alertItem.state, alertItem.item) : { kind: "temperature" }),
      });
    } catch (err) {
      console.error("Resolve alert failed:", err);
      setNotice(`That alert couldn't be resolved. ${saveProblem(err)}`);
    }
  }

  async function unresolveAlert(alertId) {
    if (!authUser) {
      setNotice("Sign in to do that.");
      return;
    }
    if (!isAdmin) {
      setNotice("Only an administrator can un-resolve an alert.");
      return;
    }
    setNotice("");
    try {
      await deleteDoc(doc(db, RESOLUTIONS_COL, alertId));
    } catch (err) {
      console.error("Unresolve failed:", err);
      setNotice(`That alert couldn't be un-resolved. ${saveProblem(err)}`);
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
              <p className="font-semibold text-slate-50">
                {alert.title}
                {alert.backAgain ? <span className="ml-2 rounded-full border border-white/15 bg-slate-950/40 px-2 py-0.5 align-middle text-[11px] font-medium text-slate-200">Back again</span> : null}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-100/80">{alert.message}</p>
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
                onClick={() => resolveAlert(alert)}
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
                <h2 className="text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">Alerts</h2>
              </div>
              <p className="mt-1 max-w-3xl text-sm text-slate-400">
                Stock and temperature alerts, what has been resolved, and the practice's alert settings.
              </p>
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
            {loadError ? <div>Stock alerts: <span className="font-semibold text-rose-50">{loadProblem(loadError)}</span></div> : null}
            {tempError ? <div>Temperature alerts: <span className="font-semibold text-rose-50">{loadProblem(tempError)}</span></div> : null}
            {settingsError ? <div>Alert settings: <span className="font-semibold text-rose-50">{loadProblem(settingsError)}</span></div> : null}
          </div>
        </Card>
      )}

      {notice && (
        <Card className="border-amber-400/30 bg-amber-500/10 p-4" role="status">
          <div className="flex items-start justify-between gap-3 text-sm text-amber-50">
            <span>{notice}</span>
            <button type="button" className="text-xs font-semibold underline" onClick={() => setNotice("")}>Dismiss</button>
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
                {counts.total === 0 ? "No active alerts" : `${counts.total} active alert${counts.total === 1 ? "" : "s"}${counts.critical ? `, ${counts.critical} critical` : ""}`}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Card className="border-white/10 bg-slate-950/50 p-5 xl:col-span-12">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-200" />
              <div>
                <h3 className="font-semibold text-slate-50">Alerts</h3>
                <p className="text-xs text-slate-400">Made from expiry dates, minimum stock levels and the latest temperature readings. Resolve one to move it to Resolved.</p>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-white/10 bg-slate-900/95 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold text-slate-50 flex items-center gap-2">
                  <Settings className="h-5 w-5 text-teal-300" />
                  Alert settings
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  These settings apply to the whole practice.
                  {!isAdmin ? " You can look, but only an administrator can change them." : ""}
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
                  {/* Only the fixed taxonomy's own categories, never whatever
                      raw keys happen to already be saved in Firestore — the
                      settings doc can still hold pre-taxonomy-migration keys
                      (e.g. "non_medical", "emergency_drugs") that have no
                      friendly label and would otherwise render as their own
                      broken-looking row. */}
                  {Object.keys(DEFAULT_CATEGORY_THRESHOLDS).map((cat) => (
                    <div key={cat}>
                      <label className="text-xs text-slate-300">{stockCategoryLabel(cat)} (days)</label>
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
                  Anyone who can change stock or temperatures can resolve an alert; only an administrator can un-resolve one. A resolved alert comes back after {RESOLVED_HOLD_DAYS} days if the problem is still there, and sooner if the item gets a different expiry date, or is restocked and later runs low again.
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
