import React, { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FileText,
  Thermometer,
  Package,
  Calendar,
  ArrowLeftRight,
  Download,
  ChevronDown,
  MapPin,
  LocateFixed,
  Tags,
  AlertTriangle,
} from "lucide-react";

import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";

import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";

// -------------------- Firestore collections --------------------
const ITEMS_COL = "stock_items";
const MOVES_COL = "stock_movements";
const TEMP_COL = "temperature_logs";

// -------------------- Filter sentinel values --------------------
const ALL_SITES = "__ALL_SITES__";
const ALL_LOCATIONS = "__ALL_LOCATIONS__";
const ALL_CATEGORIES = "__ALL_CATEGORIES__";

// -------------------- Category labels --------------------
const categoryLabels = {
  non_medical: "Non Medical",
  medicinal: "Medicinal",
  vaccines: "Vaccines",
  emergency_drugs: "Emergency Drugs",
  dressings: "Dressings",
  equipment: "Equipment",
};

const norm = (v) => String(v ?? "").trim().toLowerCase();

// -------------------- Resolvers / helpers --------------------
function resolveSite(row) {
  const raw = String(
    row?.site ||
      row?.siteName ||
      row?.site_name ||
      row?.siteId ||
      row?.site_id ||
      ""
  ).trim();

  // Treat "Both sites" as "no specific building"
  if (raw.toLowerCase() === "both sites") return "";
  return raw;
}

function resolveLocation(row) {
  const raw = String(row?.location || row?.room || row?.storage_location || "").trim();

  // Treat "All" as unknown/blank
  if (raw.toLowerCase() === "all") return "";
  return raw;
}

function resolveCategoryKey(row) {
  return String(
    row?.category ||
      row?.categoryKey ||
      row?.category_name ||
      row?.categoryName ||
      ""
  ).trim();
}

function categoryLabelFromItem(item) {
  const key = resolveCategoryKey(item);
  const label = categoryLabels[key] || key;
  const cleaned = String(label || "").trim();
  return cleaned ? cleaned : "Uncategorised";
}

function isNeedsAttention(item) {
  const site = resolveSite(item);
  const loc = resolveLocation(item);
  return !site || !loc;
}

function stockStatus(item) {
  const cur = Number(item.current_stock ?? item.qty ?? 0);
  const min = Number(item.min_stock ?? 0);

  if (cur === 0) {
    return {
      label: "Out of Stock",
      pill: "bg-rose-500/15 text-rose-200 border-rose-500/20",
    };
  }
  if (cur <= min) {
    return {
      label: "Low Stock",
      pill: "bg-amber-500/15 text-amber-200 border-amber-500/20",
    };
  }
  return {
    label: "OK",
    pill: "bg-emerald-500/15 text-emerald-200 border-emerald-500/20",
  };
}

function formatDateTimeAny(v) {
  let d = null;
  if (!v) return "";
  if (typeof v === "string") d = new Date(v);
  else if (v instanceof Date) d = v;
  else if (v?.toDate) d = v.toDate();
  else d = new Date(v);

  if (!d || Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function toCSV(rows) {
  const escape = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const headers = Object.keys(rows[0] || {});
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => escape(r[h])).join(","));
  return lines.join("\n");
}

// -------------------- UI helpers --------------------
function TabButton({ active, onClick, icon: Icon, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 px-3 py-2 text-xs font-medium text-slate-950"
          : "inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-800/70 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
      }
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

/**
 * ✅ FIXED PillSelect
 * - NO <select> inside <button> (that breaks native dropdowns)
 * - Chevron/icons can't steal clicks (pointer-events-none)
 * - <select> fills the pill width so the whole thing is effectively clickable
 *
 * ✅ NEW: styles <option> so dropdown list is readable on dark theme
 */
function PillSelect({ value, onChange, options, disabled = false, icon: Icon }) {
  return (
    <div
      className={`relative inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-800/70 px-3 py-2 text-xs text-slate-200 ${
        disabled ? "opacity-60 cursor-not-allowed" : "hover:bg-slate-800 cursor-pointer"
      }`}
      style={{ minWidth: 170 }}
    >
      {Icon ? <Icon className="h-4 w-4 text-slate-400 pointer-events-none" /> : null}

      <select
        className="flex-1 min-w-[140px] appearance-none bg-transparent text-xs text-slate-100 outline-none cursor-pointer disabled:cursor-not-allowed
                   [&>option]:bg-slate-900 [&>option]:text-slate-100 [&>option:hover]:bg-slate-700"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        {(options || []).map((o) => (
          <option key={String(o.value)} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      <ChevronDown className="h-3 w-3 text-slate-400 pointer-events-none" />
    </div>
  );
}

function MiniStat({ title, value, icon: Icon, tone }) {
  const toneMap = {
    teal: "bg-teal-500/15 text-teal-200 border-white/10",
    rose: "bg-rose-500/15 text-rose-200 border-white/10",
    amber: "bg-amber-500/15 text-amber-200 border-white/10",
    emerald: "bg-emerald-500/15 text-emerald-200 border-white/10",
  };

  return (
    <Card className="border border-white/10 bg-slate-900/60 backdrop-blur p-4 shadow-lg">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-2xl border ${toneMap[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-lg font-semibold text-slate-100">{value}</p>
          <p className="text-xs text-slate-400">{title}</p>
        </div>
      </div>
    </Card>
  );
}

// -------------------- Tables --------------------
function EmptyRow({ cols }) {
  return (
    <tr>
      <td colSpan={cols} className="px-4 py-10 text-center text-xs text-slate-400">
        No results for the current filters.
      </td>
    </tr>
  );
}

function NeedsAttentionPill({ item }) {
  const needs = isNeedsAttention(item);
  if (!needs) return null;

  const missingSite = !resolveSite(item);
  const missingLoc = !resolveLocation(item);
  const label =
    missingSite && missingLoc
      ? "Missing site & location"
      : missingSite
      ? "Missing site"
      : "Missing location";

  return (
    <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-200">
      <AlertTriangle className="h-3 w-3" />
      {label}
    </span>
  );
}

function StockTable({ rows }) {
  return (
    <table className="min-w-full text-left text-sm">
      <thead>
        <tr className="border-b border-white/10 bg-slate-900/60 text-xs font-medium text-slate-300">
          <th className="px-4 py-2">Item</th>
          <th className="px-4 py-2">Category</th>
          <th className="px-4 py-2">Site</th>
          <th className="px-4 py-2">Location</th>
          <th className="px-4 py-2 text-right">Stock</th>
          <th className="px-4 py-2">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <EmptyRow cols={6} />
        ) : (
          rows.map((item) => {
            const st = stockStatus(item);
            const cur = Number(item.current_stock ?? item.qty ?? 0);
            return (
              <tr key={item.id} className="border-b border-white/10 last:border-0">
                <td className="px-4 py-3 text-xs text-slate-100">
                  <div className="font-medium flex items-center">
                    {item.name}
                    <NeedsAttentionPill item={item} />
                  </div>
                  {item.barcode && <div className="text-[0.7rem] text-slate-400">{item.barcode}</div>}
                </td>
                <td className="px-4 py-3 text-xs text-slate-200">{categoryLabelFromItem(item)}</td>
                <td className="px-4 py-3 text-xs text-slate-200">{resolveSite(item) || "—"}</td>
                <td className="px-4 py-3 text-xs text-slate-200">{resolveLocation(item) || "—"}</td>
                <td className="px-4 py-3 text-xs text-slate-200 text-right">{cur}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.7rem] ${st.pill}`}>
                    {st.label}
                  </span>
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}

function ExpiryTable({ rows }) {
  return (
    <table className="min-w-full text-left text-sm">
      <thead>
        <tr className="border-b border-white/10 bg-slate-900/60 text-xs font-medium text-slate-300">
          <th className="px-4 py-2">Item</th>
          <th className="px-4 py-2">Site</th>
          <th className="px-4 py-2">Location</th>
          <th className="px-4 py-2">Batch</th>
          <th className="px-4 py-2">Expiry</th>
          <th className="px-4 py-2">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <EmptyRow cols={6} />
        ) : (
          rows.map((item) => (
            <tr key={item.id} className="border-b border-white/10 last:border-0">
              <td className="px-4 py-3 text-xs text-slate-100">
                <div className="font-medium">{item.name}</div>
                {item.barcode && <div className="text-[0.7rem] text-slate-400">{item.barcode}</div>}
              </td>
              <td className="px-4 py-3 text-xs text-slate-200">{resolveSite(item) || "—"}</td>
              <td className="px-4 py-3 text-xs text-slate-200">{resolveLocation(item) || "—"}</td>
              <td className="px-4 py-3 text-xs text-slate-200">{item.batch_number || "—"}</td>
              <td className="px-4 py-3 text-xs text-slate-200">{item.expiry_date || "—"}</td>
              <td className="px-4 py-3 text-xs text-slate-200">{item.expiry_status}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function TransactionsTable({ rows }) {
  return (
    <table className="min-w-full text-left text-sm">
      <thead>
        <tr className="border-b border-white/10 bg-slate-900/60 text-xs font-medium text-slate-300">
          <th className="px-4 py-2">Date/Time</th>
          <th className="px-4 py-2">Item</th>
          <th className="px-4 py-2">Action</th>
          <th className="px-4 py-2 text-right">Qty</th>
          <th className="px-4 py-2">Site</th>
          <th className="px-4 py-2">User</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <EmptyRow cols={6} />
        ) : (
          rows.map((t) => (
            <tr key={t.id} className="border-b border-white/10 last:border-0">
              <td className="px-4 py-3 text-xs text-slate-200">{formatDateTimeAny(t.datetime)}</td>
              <td className="px-4 py-3 text-xs text-slate-100">{t.item}</td>
              <td className="px-4 py-3 text-xs text-slate-200">{t.action}</td>
              <td className="px-4 py-3 text-xs text-slate-200 text-right">{t.qty}</td>
              <td className="px-4 py-3 text-xs text-slate-200">{t.site || "—"}</td>
              <td className="px-4 py-3 text-xs text-slate-200">{t.user || "—"}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function TempTable({ rows }) {
  return (
    <table className="min-w-full text-left text-sm">
      <thead>
        <tr className="border-b border-white/10 bg-slate-900/60 text-xs font-medium text-slate-300">
          <th className="px-4 py-2">Date/Time</th>
          <th className="px-4 py-2">Site</th>
          <th className="px-4 py-2">Unit</th>
          <th className="px-4 py-2">Type</th>
          <th className="px-4 py-2 text-right">Temp (°C)</th>
          <th className="px-4 py-2">Recorded By</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <EmptyRow cols={6} />
        ) : (
          rows.map((t) => (
            <tr key={t.id} className="border-b border-white/10 last:border-0">
              <td className="px-4 py-3 text-xs text-slate-200">{formatDateTimeAny(t.datetime)}</td>
              <td className="px-4 py-3 text-xs text-slate-200">{t.site || "—"}</td>
              <td className="px-4 py-3 text-xs text-slate-200">{t.unit || "—"}</td>
              <td className="px-4 py-3 text-xs text-slate-200">{t.unitType || "—"}</td>
              <td className="px-4 py-3 text-xs text-slate-200 text-right">
                {Number.isFinite(t.temp) ? t.temp : "—"}
              </td>
              <td className="px-4 py-3 text-xs text-slate-200">{t.recordedBy || "—"}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

// -------------------- Main component --------------------
export default function Reports() {
  const [tab, setTab] = useState("stock"); // stock | expiry | tx | temp

  // Filters
  const [siteFilter, setSiteFilter] = useState(ALL_SITES);
  const [locationFilter, setLocationFilter] = useState(ALL_LOCATIONS);
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES);
  const [queryText, setQueryText] = useState("");

  // Extra helper filter
  const [needsAttentionOnly, setNeedsAttentionOnly] = useState(false);

  // Data
  const [stock, setStock] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [temps, setTemps] = useState([]);

  // item_id -> site fallback
  const siteByItemId = useMemo(() => {
    const m = new Map();
    for (const s of stock) if (s?.id) m.set(s.id, resolveSite(s));
    return m;
  }, [stock]);

  // Subscribe stock_items
  useEffect(() => {
    const qy = query(collection(db, ITEMS_COL));
    return onSnapshot(
      qy,
      (snap) => setStock(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error("Reports stock subscribe error:", err)
    );
  }, []);

  // Subscribe stock_movements
  useEffect(() => {
    const qy = query(collection(db, MOVES_COL), orderBy("created_at", "desc"));
    return onSnapshot(
      qy,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const mapped = rows.map((m) => {
          const type = String(m.type || "").toLowerCase();
          const action =
            type === "use"
              ? "Use"
              : type === "receive"
              ? "Receive"
              : type === "adjust"
              ? "Adjust"
              : type === "create"
              ? "Create"
              : type === "edit"
              ? "Edit"
              : type === "archive"
              ? "Archive"
              : type === "unarchive"
              ? "Unarchive"
              : m.type || "Movement";

          const delta = Number(m.delta ?? 0);
          const qty = Math.abs(delta);

          const site =
            String(m.site || m.site_id || "").trim() ||
            (siteByItemId.get(m.item_id) || "");

          const user =
            m.actor?.email ||
            m.actor?.displayName ||
            m.actor?.uid ||
            m.created_by ||
            m.createdBy ||
            "";

          return {
            id: m.id,
            datetime: m.created_at || m.createdAt || "",
            item: m.item_name || m.itemName || m.item_id || "Unknown item",
            action,
            qty,
            site,
            user,
          };
        });

        setTransactions(mapped);
      },
      (err) => console.error("Reports movements subscribe error:", err)
    );
  }, [siteByItemId]);

  // Subscribe temperature_logs
  useEffect(() => {
    const qy = query(collection(db, TEMP_COL), orderBy("created_at", "desc"));
    return onSnapshot(
      qy,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const mapped = rows.map((t) => ({
          id: t.id,
          datetime: t.created_at || t.datetime || t.recorded_at || "",
          site: String(t.site || t.site_id || "").trim(),
          unit: t.unit || t.fridge || t.device || "",
          unitType: t.unitType || t.unit_type || t.type || "",
          temp: Number(t.temp ?? t.temperature ?? ""),
          recordedBy: t.recordedBy || t.recorded_by || t.created_by || "",
          notes: t.notes || "",
        }));
        setTemps(mapped);
      },
      (err) => console.error("Reports temperature subscribe error:", err)
    );
  }, []);

  // On tx/temp tabs, location/category aren’t reliable -> disable + reset
  useEffect(() => {
    if (tab === "tx" || tab === "temp") {
      setCategoryFilter(ALL_CATEGORIES);
      setLocationFilter(ALL_LOCATIONS);
      setNeedsAttentionOnly(false);
    }
  }, [tab]);

  // Options from stock
  const siteOptions = useMemo(() => {
    const vals = stock.map(resolveSite).filter(Boolean).map((s) => s.trim());
    const unique = Array.from(new Set(vals)).sort((a, b) => a.localeCompare(b));
    return [{ value: ALL_SITES, label: "All Sites" }, ...unique.map((s) => ({ value: s, label: s }))];
  }, [stock]);

  const categoryOptions = useMemo(() => {
    const labels = stock.map(categoryLabelFromItem).filter(Boolean);
    const unique = Array.from(new Set(labels)).sort((a, b) => a.localeCompare(b));
    return [{ value: ALL_CATEGORIES, label: "All Categories" }, ...unique.map((c) => ({ value: c, label: c }))];
  }, [stock]);

  const locationOptions = useMemo(() => {
    const vals = stock
      .filter((i) => (siteFilter === ALL_SITES ? true : norm(resolveSite(i)) === norm(siteFilter)))
      .map(resolveLocation)
      .filter(Boolean)
      .map((l) => l.trim());

    const unique = Array.from(new Set(vals)).sort((a, b) => a.localeCompare(b));
    return [{ value: ALL_LOCATIONS, label: "All Locations" }, ...unique.map((l) => ({ value: l, label: l }))];
  }, [stock, siteFilter]);

  // If selected location disappears after changing site -> reset
  useEffect(() => {
    if (locationFilter !== ALL_LOCATIONS && !locationOptions.some((o) => o.value === locationFilter)) {
      setLocationFilter(ALL_LOCATIONS);
    }
  }, [locationOptions, locationFilter]);

  // Main filter for stock/expiry
  const filteredStock = useMemo(() => {
    const q = norm(queryText);

    return stock.filter((item) => {
      const itemSite = resolveSite(item);
      const itemLocation = resolveLocation(item);
      const itemCatLabel = categoryLabelFromItem(item);

      const matchesSite =
        siteFilter === ALL_SITES ? true : norm(itemSite) === norm(siteFilter);

      const matchesLocation =
        locationFilter === ALL_LOCATIONS ? true : norm(itemLocation) === norm(locationFilter);

      const matchesCat =
        categoryFilter === ALL_CATEGORIES ? true : norm(itemCatLabel) === norm(categoryFilter);

      const matchesNeedsAttention = !needsAttentionOnly || isNeedsAttention(item);

      const matchesQuery =
        !q ||
        norm(item?.name).includes(q) ||
        norm(item?.barcode).includes(q) ||
        norm(itemSite).includes(q) ||
        norm(itemLocation).includes(q) ||
        norm(itemCatLabel).includes(q) ||
        norm(item?.batch_number).includes(q);

      return matchesSite && matchesLocation && matchesCat && matchesNeedsAttention && matchesQuery;
    });
  }, [stock, siteFilter, locationFilter, categoryFilter, needsAttentionOnly, queryText]);

  // Transactions filter (site + query)
  const filteredTransactions = useMemo(() => {
    const q = norm(queryText);

    return transactions.filter((t) => {
      const site = String(t.site || "").trim();

      const matchesSite =
        siteFilter === ALL_SITES ? true : norm(site) === norm(siteFilter);

      const matchesQuery =
        !q ||
        norm(t.item).includes(q) ||
        norm(t.action).includes(q) ||
        norm(t.user).includes(q) ||
        norm(site).includes(q);

      return matchesSite && matchesQuery;
    });
  }, [transactions, siteFilter, queryText]);

  // Temps filter (site + query)
  const filteredTemps = useMemo(() => {
    const q = norm(queryText);

    return temps.filter((t) => {
      const site = String(t.site || "").trim();

      const matchesSite =
        siteFilter === ALL_SITES ? true : norm(site) === norm(siteFilter);

      const matchesQuery =
        !q ||
        norm(site).includes(q) ||
        norm(t.unit).includes(q) ||
        norm(t.unitType).includes(q) ||
        norm(t.recordedBy).includes(q) ||
        norm(t.notes).includes(q);

      return matchesSite && matchesQuery;
    });
  }, [temps, siteFilter, queryText]);

  // Expiry report
  const expiryRows = useMemo(() => {
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    return filteredStock
      .filter((i) => i.expiry_date)
      .map((i) => {
        const exp = new Date(i.expiry_date);
        const status =
          exp < now ? "Expired" : exp <= in30 ? "Expiring soon" : "OK";
        return { ...i, expiry_status: status };
      })
      .sort((a, b) => new Date(a.expiry_date) - new Date(b.expiry_date));
  }, [filteredStock]);

  const needsAttentionCount = useMemo(() => stock.filter(isNeedsAttention).length, [stock]);

  // Summary
  const summary = useMemo(() => {
    if (tab === "tx") {
      return {
        totalItems: filteredTransactions.length,
        outOfStock: 0,
        lowStock: 0,
        totalUnits: filteredTransactions.reduce((sum, t) => sum + (Number(t.qty) || 0), 0),
      };
    }
    if (tab === "temp") {
      return {
        totalItems: filteredTemps.length,
        outOfStock: 0,
        lowStock: 0,
        totalUnits: filteredTemps.length,
      };
    }

    const rows = tab === "expiry" ? expiryRows : filteredStock;
    const outOfStock = rows.filter((i) => Number(i.current_stock ?? i.qty ?? 0) === 0).length;
    const lowStock = rows.filter((i) => {
      const cur = Number(i.current_stock ?? i.qty ?? 0);
      const min = Number(i.min_stock ?? 0);
      return cur > 0 && cur <= min;
    }).length;

    const totalUnits = rows.reduce((sum, i) => sum + (Number(i.current_stock ?? i.qty ?? 0) || 0), 0);

    return {
      totalItems: rows.length,
      outOfStock,
      lowStock,
      totalUnits,
    };
  }, [tab, filteredStock, expiryRows, filteredTransactions, filteredTemps]);

  // Export rows match current tab
  const exportRows = useMemo(() => {
    if (tab === "stock") {
      return filteredStock.map((i) => ({
        Item: i.name,
        Barcode: i.barcode || "",
        Category: categoryLabelFromItem(i),
        Site: resolveSite(i) || "",
        Location: resolveLocation(i) || "",
        Stock: Number(i.current_stock ?? i.qty ?? 0),
        MinStock: Number(i.min_stock ?? 0),
        NeedsAttention: isNeedsAttention(i) ? "YES" : "",
      }));
    }

    if (tab === "expiry") {
      return expiryRows.map((i) => ({
        Item: i.name,
        Barcode: i.barcode || "",
        Category: categoryLabelFromItem(i),
        Site: resolveSite(i) || "",
        Location: resolveLocation(i) || "",
        Batch: i.batch_number || "",
        Expiry: i.expiry_date || "",
        ExpiryStatus: i.expiry_status,
        Stock: Number(i.current_stock ?? i.qty ?? 0),
        NeedsAttention: isNeedsAttention(i) ? "YES" : "",
      }));
    }

    if (tab === "tx") {
      return filteredTransactions.map((t) => ({
        DateTime: formatDateTimeAny(t.datetime),
        Item: t.item,
        Action: t.action,
        Quantity: t.qty,
        Site: t.site,
        User: t.user,
      }));
    }

    return filteredTemps.map((t) => ({
      DateTime: formatDateTimeAny(t.datetime),
      Site: t.site,
      Unit: t.unit,
      UnitType: t.unitType,
      TemperatureC: t.temp,
      RecordedBy: t.recordedBy,
      Notes: t.notes || "",
    }));
  }, [tab, filteredStock, expiryRows, filteredTransactions, filteredTemps]);

  const exportBaseName = useMemo(() => {
    const map = {
      stock: "stock-levels",
      expiry: "expiry-report",
      tx: "transactions",
      temp: "temperature",
    };
    return `aurora-${map[tab]}-${new Date().toISOString().slice(0, 10)}`;
  }, [tab]);

  const handleExportCSV = () => {
    if (!exportRows.length) return;
    downloadBlob(
      `${exportBaseName}.csv`,
      new Blob([toCSV(exportRows)], { type: "text/csv;charset=utf-8" })
    );
  };

  const handleExportExcel = () => {
    if (!exportRows.length) return;
    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Report");
    XLSX.writeFile(wb, `${exportBaseName}.xlsx`);
  };

  const handleExportPDF = () => {
    if (!exportRows.length) return;

    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    doc.setFontSize(14);
    doc.text(`Aurora Stock Control — ${exportBaseName}`, 40, 40);

    const columns = Object.keys(exportRows[0] || {});
    const body = exportRows.map((r) => columns.map((c) => String(r[c] ?? "")));

    doc.autoTable({
      startY: 60,
      head: [columns],
      body,
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [15, 23, 42] },
      margin: { left: 40, right: 40 },
    });

    doc.save(`${exportBaseName}.pdf`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-teal-500/15 text-teal-200 border border-white/10">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-100">Reports</h1>
            <p className="text-sm text-slate-400">
              Filter by Site (building), Location (room/cupboard), and Category.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="rounded-full border-white/10 bg-slate-900/40 text-xs text-slate-200 hover:bg-slate-900/60"
            onClick={handleExportCSV}
          >
            <Download className="mr-1.5 h-4 w-4" />
            Export CSV
          </Button>
          <Button
            variant="outline"
            className="rounded-full border-white/10 bg-slate-900/40 text-xs text-slate-200 hover:bg-slate-900/60"
            onClick={handleExportExcel}
          >
            <Download className="mr-1.5 h-4 w-4" />
            Export Excel
          </Button>
          <Button
            className="rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 px-4 py-2 text-xs font-medium text-slate-950 shadow-sm hover:from-teal-400 hover:to-emerald-300"
            onClick={handleExportPDF}
          >
            <Download className="mr-1.5 h-4 w-4" />
            Export PDF
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Card className="border border-white/10 bg-slate-900/70 backdrop-blur p-2 shadow-lg">
        <div className="flex flex-wrap gap-2">
          <TabButton active={tab === "stock"} onClick={() => setTab("stock")} icon={Package} label="Stock Levels" />
          <TabButton active={tab === "expiry"} onClick={() => setTab("expiry")} icon={Calendar} label="Expiry Report" />
          <TabButton active={tab === "tx"} onClick={() => setTab("tx")} icon={ArrowLeftRight} label="Transactions" />
          <TabButton active={tab === "temp"} onClick={() => setTab("temp")} icon={Thermometer} label="Temperature" />
        </div>
      </Card>

      {/* Filters */}
      <Card className="border border-white/10 bg-slate-900/70 backdrop-blur p-4 shadow-lg">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-3 items-center">
            <PillSelect icon={MapPin} value={siteFilter} onChange={setSiteFilter} options={siteOptions} />

            <PillSelect
              icon={LocateFixed}
              value={locationFilter}
              onChange={setLocationFilter}
              options={locationOptions}
              disabled={tab === "tx" || tab === "temp"}
            />

            <PillSelect
              icon={Tags}
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={categoryOptions}
              disabled={tab === "tx" || tab === "temp"}
            />

            <Input
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder="Search item, barcode, batch, location…"
              className="h-10 w-72 rounded-full border-white/10 bg-slate-800/70 text-slate-100 placeholder:text-slate-400"
            />

            <button
              type="button"
              onClick={() => setNeedsAttentionOnly((v) => !v)}
              className={
                needsAttentionOnly
                  ? "inline-flex items-center gap-2 rounded-full bg-amber-500/20 text-amber-200 border border-amber-500/20 px-3 py-2 text-xs"
                  : "inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-800/70 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
              }
              title="Show only items missing a real Site or Location"
              disabled={tab === "tx" || tab === "temp"}
            >
              <AlertTriangle className="h-4 w-4" />
              Needs attention
              <span className="ml-1 rounded-full bg-black/30 px-2 py-0.5 text-[11px]">
                {needsAttentionCount}
              </span>
            </button>
          </div>
        </div>
      </Card>

      {/* Summary cards */}
      <div className="grid gap-3 md:grid-cols-4">
        <MiniStat
          title={tab === "tx" || tab === "temp" ? "Records" : "Total Items"}
          value={summary.totalItems}
          icon={Package}
          tone="teal"
        />
        <MiniStat title="Out of Stock" value={summary.outOfStock} icon={FileText} tone="rose" />
        <MiniStat title="Low Stock" value={summary.lowStock} icon={FileText} tone="amber" />
        <MiniStat
          title={tab === "tx" ? "Total Qty" : tab === "temp" ? "Logs" : "Total Units"}
          value={summary.totalUnits}
          icon={Package}
          tone="emerald"
        />
      </div>

      {/* Table */}
      <Card className="border border-white/10 bg-slate-900/60 backdrop-blur shadow-lg">
        <div className="border-b border-white/10 px-4 py-3">
          <p className="text-sm font-semibold text-slate-100">
            {tab === "stock" && "Stock Levels"}
            {tab === "expiry" && "Expiry Report"}
            {tab === "tx" && "Transactions"}
            {tab === "temp" && "Temperature"}
          </p>
          <p className="mt-0.5 text-[0.7rem] text-slate-400">
            Filters apply to the current tab. Exports match what you see.
          </p>
        </div>

        <div className="overflow-x-auto">
          {tab === "stock" && <StockTable rows={filteredStock} />}
          {tab === "expiry" && <ExpiryTable rows={expiryRows} />}
          {tab === "tx" && <TransactionsTable rows={filteredTransactions} />}
          {tab === "temp" && <TempTable rows={filteredTemps} />}
        </div>
      </Card>
    </div>
  );
}
