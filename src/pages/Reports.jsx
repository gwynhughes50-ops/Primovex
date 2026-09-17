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
  ShieldAlert,
  FileSearch,
} from "lucide-react";

import jsPDF from "jspdf";
import "jspdf-autotable";

import { collection, limit, onSnapshot, orderBy, query, Timestamp, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { normalizeStockItemCategory } from "@/services/stockService";
import { categoryLabel as taxonomyCategoryLabel, subcategoryLabel as taxonomySubcategoryLabel } from "@/data/stockCategories";
import { useAuth } from "@/contexts/AuthContext";
import {
  CONCERN_CATEGORIES,
  CONCERN_OUTCOME_LABELS,
  CONCERN_SOURCES,
  friendly as friendlyConcern,
  subscribeConcerns,
  toDate as toConcernDate,
} from "@/modules/governance/services/concernService";
import {
  SAR_COLLECTION,
  SAR_REQUEST_TYPES,
  SAR_STATUSES,
  getRequestTypeLabel,
  getStatusLabel as getSarStatusLabel,
  toDate as toSarDate,
} from "@/modules/governance/services/sarService";

// -------------------- Firestore collections --------------------
const ITEMS_COL = "stock_items";
const MOVES_COL = "stock_movements";
const TEMP_COL = "temperature_logs";

// -------------------- Filter sentinel values --------------------
const ALL_SITES = "__ALL_SITES__";
const ALL_LOCATIONS = "__ALL_LOCATIONS__";
const ALL_CATEGORIES = "__ALL_CATEGORIES__";

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

  // "Both sites" is a real, legitimate value for dual-site stock — it must
  // not be treated as missing (that used to false-flag "Needs attention"
  // and silently drop these items from a site-specific report).
  return raw;
}

function resolveLocation(row) {
  const raw = String(row?.location || row?.room || row?.storage_location || "").trim();

  // Treat "All" as unknown/blank
  if (raw.toLowerCase() === "all") return "";
  return raw;
}

function resolveCategoryKey(row) {
  return normalizeStockItemCategory(row).category;
}

function categoryLabelFromItem(item) {
  const resolved = normalizeStockItemCategory(item);
  const sub = taxonomySubcategoryLabel(resolved.category, resolved.subcategory);
  const main = taxonomyCategoryLabel(resolved.category);
  return sub && sub !== main ? `${main} › ${sub}` : main;
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

// Parses a bare "YYYY-MM-DD" date as a LOCAL calendar date, not UTC midnight
// — `new Date("2026-03-01")` parses as UTC, which can flip Expired vs.
// Expiring-soon status early/late by up to an hour right at the day
// boundary, depending on time of day and BST. Compares calendar dates only.
function parseCalendarDate(value) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
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

// Neutralizes CSV/Excel formula injection — a value starting with =, +, -
// or @ can execute as a formula when the export is opened in Excel.
function neutralizeFormula(s) {
  return /^[=+\-@]/.test(s) ? `'${s}` : s;
}

function toCSV(rows) {
  const escape = (v) => {
    const s = neutralizeFormula(String(v ?? ""));
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const headers = Object.keys(rows[0] || {});
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => escape(r[h])).join(","));
  return lines.join("\n");
}

function toExcelSpreadsheetXml(rows) {
  const escapeXml = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
  const headers = Object.keys(rows[0] || {});
  const cellXml = (value) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return `<Cell><Data ss:Type="Number">${value}</Data></Cell>`;
    }
    return `<Cell><Data ss:Type="String">${escapeXml(neutralizeFormula(String(value ?? "")))}</Data></Cell>`;
  };
  const rowXml = (values) => `<Row>${values.map(cellXml).join("")}</Row>`;
  return `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Report"><Table>${rowXml(headers)}${rows.map((row) => rowXml(headers.map((header) => row[header]))).join("")}</Table></Worksheet></Workbook>`;
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

function ConcernsTable({ rows }) {
  return (
    <table className="min-w-full text-left text-sm">
      <thead>
        <tr className="border-b border-white/10 bg-slate-900/60 text-xs font-medium text-slate-300">
          <th className="px-4 py-2">Reference</th>
          <th className="px-4 py-2">Received</th>
          <th className="px-4 py-2">Category</th>
          <th className="px-4 py-2">Source</th>
          <th className="px-4 py-2">Status</th>
          <th className="px-4 py-2">Outcome</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <EmptyRow cols={6} />
        ) : (
          rows.map((c) => (
            <tr key={c.id} className="border-b border-white/10 last:border-0">
              <td className="px-4 py-3 text-xs text-slate-100">{c.reference}</td>
              <td className="px-4 py-3 text-xs text-slate-200">{formatDateTimeAny(c.receivedAt)}</td>
              <td className="px-4 py-3 text-xs text-slate-200">{friendlyConcern(c.category)}</td>
              <td className="px-4 py-3 text-xs text-slate-200">{friendlyConcern(c.source)}</td>
              <td className="px-4 py-3 text-xs text-slate-200">{friendlyConcern(c.status)}</td>
              <td className="px-4 py-3 text-xs text-slate-200">{c.outcome ? CONCERN_OUTCOME_LABELS[c.outcome] : "—"}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function SarsTable({ rows }) {
  return (
    <table className="min-w-full text-left text-sm">
      <thead>
        <tr className="border-b border-white/10 bg-slate-900/60 text-xs font-medium text-slate-300">
          <th className="px-4 py-2">Reference</th>
          <th className="px-4 py-2">Received</th>
          <th className="px-4 py-2">Request type</th>
          <th className="px-4 py-2">Status</th>
          <th className="px-4 py-2">Due</th>
          <th className="px-4 py-2">Assigned to</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <EmptyRow cols={6} />
        ) : (
          rows.map((s) => (
            <tr key={s.id} className="border-b border-white/10 last:border-0">
              <td className="px-4 py-3 text-xs text-slate-100">{s.reference}</td>
              <td className="px-4 py-3 text-xs text-slate-200">{formatDateTimeAny(s.receivedDate)}</td>
              <td className="px-4 py-3 text-xs text-slate-200">{s.requestTypeLabel || getRequestTypeLabel(s.requestType)}</td>
              <td className="px-4 py-3 text-xs text-slate-200">{getSarStatusLabel(s.status)}</td>
              <td className="px-4 py-3 text-xs text-slate-200">{formatDateTimeAny(s.dueDate)}</td>
              <td className="px-4 py-3 text-xs text-slate-200">{s.assignedToName || "—"}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

// A simple horizontal-bar breakdown — count per category/type/status, the
// core of an annual return ("how many of each").
function BreakdownCard({ title, counts, labelFor, total }) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return (
    <Card className="border border-white/10 bg-slate-900/60 backdrop-blur p-4 shadow-lg">
      <p className="text-sm font-semibold text-slate-100">{title}</p>
      <div className="mt-3 space-y-2">
        {entries.length === 0 ? (
          <p className="text-xs text-slate-400">No records for the current filters.</p>
        ) : (
          entries.map(([key, count]) => {
            const pct = total ? Math.round((count / total) * 100) : 0;
            return (
              <div key={key} className="flex items-center gap-2 text-xs text-slate-300">
                <span className="w-32 shrink-0 truncate">{labelFor ? labelFor(key) : key}</span>
                <div className="h-2 flex-1 rounded-full bg-slate-800">
                  <div className="h-2 rounded-full bg-gradient-to-r from-teal-500 to-emerald-400" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-8 shrink-0 text-right font-mono">{count}</span>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}

// -------------------- Main component --------------------
export default function Reports() {
  const { can } = useAuth();
  const [tab, setTab] = useState("stock"); // stock | expiry | tx | temp | concerns | sars

  // Filters
  const [siteFilter, setSiteFilter] = useState(ALL_SITES);
  const [locationFilter, setLocationFilter] = useState(ALL_LOCATIONS);
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES);
  const [queryText, setQueryText] = useState("");

  // Extra helper filter
  const [needsAttentionOnly, setNeedsAttentionOnly] = useState(false);

  // Date range — applies across every tab. datePreset drives dateFrom/dateTo.
  const [datePreset, setDatePreset] = useState("all"); // all | this_year | last_year | custom
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const { dateFrom, dateTo } = useMemo(() => {
    const now = new Date();
    if (datePreset === "this_year") {
      return { dateFrom: new Date(now.getFullYear(), 0, 1), dateTo: new Date(now.getFullYear(), 11, 31, 23, 59, 59) };
    }
    if (datePreset === "last_year") {
      return { dateFrom: new Date(now.getFullYear() - 1, 0, 1), dateTo: new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59) };
    }
    if (datePreset === "custom") {
      return {
        dateFrom: customFrom ? parseCalendarDate(customFrom) : null,
        dateTo: customTo ? new Date(parseCalendarDate(customTo).getTime() + 24 * 60 * 60 * 1000 - 1) : null,
      };
    }
    return { dateFrom: null, dateTo: null };
  }, [datePreset, customFrom, customTo]);

  const canSeeConcerns = can("governance.concernsTeam") || can("governance.partnerAccess");
  const canSeeSars = can("governance.read");

  // Data
  const [stock, setStock] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [temps, setTemps] = useState([]);
  const [concerns, setConcerns] = useState([]);
  const [sars, setSars] = useState([]);

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

  // Subscribe stock_movements — bounded by the selected date range (falls
  // back to a hard ceiling when no range is set, so a full history never
  // loads and renders unbounded).
  useEffect(() => {
    const clauses = [collection(db, MOVES_COL)];
    if (dateFrom) clauses.push(where("created_at", ">=", Timestamp.fromDate(dateFrom)));
    if (dateTo) clauses.push(where("created_at", "<=", Timestamp.fromDate(dateTo)));
    clauses.push(orderBy("created_at", "desc"));
    clauses.push(limit(2000));
    const qy = query(...clauses);
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
  }, [siteByItemId, dateFrom, dateTo]);

  // Subscribe temperature_logs — same date-bounding as movements.
  useEffect(() => {
    const clauses = [collection(db, TEMP_COL)];
    if (dateFrom) clauses.push(where("created_at", ">=", Timestamp.fromDate(dateFrom)));
    if (dateTo) clauses.push(where("created_at", "<=", Timestamp.fromDate(dateTo)));
    clauses.push(orderBy("created_at", "desc"));
    clauses.push(limit(2000));
    const qy = query(...clauses);
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
  }, [dateFrom, dateTo]);

  // Subscribe governance_concerns — reuses the same helper the Concerns
  // page itself uses, so visibility already matches isConcernsTeam /
  // partnerAccess / involvement exactly, no new Firestore rule needed.
  useEffect(() => {
    if (!canSeeConcerns) { setConcerns([]); return undefined; }
    return subscribeConcerns(setConcerns, (err) => console.error("Reports concerns subscribe error:", err));
  }, [canSeeConcerns]);

  // Subscribe governance_sars — same read pattern GovernanceSARs.jsx uses.
  useEffect(() => {
    if (!canSeeSars) { setSars([]); return undefined; }
    const qy = query(collection(db, SAR_COLLECTION), orderBy("receivedDate", "desc"), limit(2000));
    return onSnapshot(
      qy,
      (snap) => setSars(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error("Reports SARs subscribe error:", err)
    );
  }, [canSeeSars]);

  // Site/location/category filters only apply to stock-based tabs -> reset
  // them (and the search text, since its meaning changes per tab) when
  // switching to a tab where they don't apply.
  useEffect(() => {
    if (tab === "tx" || tab === "temp" || tab === "concerns" || tab === "sars") {
      setCategoryFilter(ALL_CATEGORIES);
      setLocationFilter(ALL_LOCATIONS);
      setNeedsAttentionOnly(false);
    }
    if (tab === "concerns" || tab === "sars") {
      setSiteFilter(ALL_SITES);
    }
    setQueryText("");
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

  // Concerns filter (date range + query) — category/site/needsAttention
  // don't apply to this tab.
  const filteredConcerns = useMemo(() => {
    const q = norm(queryText);
    return concerns.filter((c) => {
      const received = toConcernDate(c.receivedAt);
      const matchesDate = (!dateFrom || (received && received >= dateFrom)) && (!dateTo || (received && received <= dateTo));
      const matchesQuery =
        !q ||
        norm(c.reference).includes(q) ||
        norm(c.summary).includes(q) ||
        norm(c.category).includes(q) ||
        norm(c.source).includes(q) ||
        norm(c.status).includes(q);
      return matchesDate && matchesQuery;
    });
  }, [concerns, dateFrom, dateTo, queryText]);

  const concernBreakdown = useMemo(() => {
    const byCategory = {};
    const byStatus = {};
    const byOutcome = {};
    const bySource = {};
    for (const c of filteredConcerns) {
      byCategory[c.category || "other"] = (byCategory[c.category || "other"] || 0) + 1;
      byStatus[c.status || "received"] = (byStatus[c.status || "received"] || 0) + 1;
      bySource[c.source || "other"] = (bySource[c.source || "other"] || 0) + 1;
      if (c.outcome) byOutcome[c.outcome] = (byOutcome[c.outcome] || 0) + 1;
    }
    const closedCount = filteredConcerns.filter((c) => c.status === "closed").length;
    return { byCategory, byStatus, byOutcome, bySource, closedCount };
  }, [filteredConcerns]);

  // SARs filter (date range + query)
  const filteredSars = useMemo(() => {
    const q = norm(queryText);
    return sars.filter((s) => {
      const received = toSarDate(s.receivedDate);
      const matchesDate = (!dateFrom || (received && received >= dateFrom)) && (!dateTo || (received && received <= dateTo));
      const matchesQuery =
        !q ||
        norm(s.reference).includes(q) ||
        norm(s.requestTypeLabel).includes(q) ||
        norm(s.status).includes(q) ||
        norm(s.assignedToName).includes(q);
      return matchesDate && matchesQuery;
    });
  }, [sars, dateFrom, dateTo, queryText]);

  const sarBreakdown = useMemo(() => {
    const byType = {};
    const byStatus = {};
    let onTime = 0;
    let late = 0;
    for (const s of filteredSars) {
      byType[s.requestType || "other"] = (byType[s.requestType || "other"] || 0) + 1;
      byStatus[s.status || "new"] = (byStatus[s.status || "new"] || 0) + 1;
      if (s.status === SAR_STATUSES.completed && s.completedAt && s.dueDate) {
        const completed = toSarDate(s.completedAt);
        const due = toSarDate(s.dueDate);
        if (completed && due) { if (completed <= due) onTime += 1; else late += 1; }
      }
    }
    return { byType, byStatus, onTime, late };
  }, [filteredSars]);

  // Expiry report
  const expiryRows = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in30 = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

    return filteredStock
      .filter((i) => i.expiry_date)
      .map((i) => {
        const exp = parseCalendarDate(i.expiry_date);
        const status =
          !exp ? "OK" : exp < today ? "Expired" : exp <= in30 ? "Expiring soon" : "OK";
        return { ...i, expiry_status: status };
      })
      .sort((a, b) => (parseCalendarDate(a.expiry_date)?.getTime() || 0) - (parseCalendarDate(b.expiry_date)?.getTime() || 0));
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
    if (tab === "concerns") {
      return {
        totalItems: filteredConcerns.length,
        outOfStock: filteredConcerns.filter((c) => c.priority === "high").length,
        lowStock: concernBreakdown.closedCount,
        totalUnits: filteredConcerns.length - concernBreakdown.closedCount,
      };
    }
    if (tab === "sars") {
      return {
        totalItems: filteredSars.length,
        outOfStock: sarBreakdown.late,
        lowStock: sarBreakdown.onTime,
        totalUnits: filteredSars.filter((s) => s.status !== SAR_STATUSES.completed).length,
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
  }, [tab, filteredStock, expiryRows, filteredTransactions, filteredTemps, filteredConcerns, concernBreakdown, filteredSars, sarBreakdown]);

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

    if (tab === "temp") {
      return filteredTemps.map((t) => ({
        DateTime: formatDateTimeAny(t.datetime),
        Site: t.site,
        Unit: t.unit,
        UnitType: t.unitType,
        TemperatureC: t.temp,
        RecordedBy: t.recordedBy,
        Notes: t.notes || "",
      }));
    }

    if (tab === "concerns") {
      return filteredConcerns.map((c) => ({
        Reference: c.reference || "",
        Received: formatDateTimeAny(c.receivedAt),
        Category: friendlyConcern(c.category),
        Source: friendlyConcern(c.source),
        Priority: friendlyConcern(c.priority),
        Status: friendlyConcern(c.status),
        Outcome: c.outcome ? CONCERN_OUTCOME_LABELS[c.outcome] : "",
        Closed: c.closedAt ? formatDateTimeAny(c.closedAt) : "",
      }));
    }

    return filteredSars.map((s) => ({
      Reference: s.reference || "",
      Received: formatDateTimeAny(s.receivedDate),
      RequestType: s.requestTypeLabel || getRequestTypeLabel(s.requestType),
      Status: getSarStatusLabel(s.status),
      Due: formatDateTimeAny(s.dueDate),
      Completed: s.completedAt ? formatDateTimeAny(s.completedAt) : "",
      AssignedTo: s.assignedToName || "",
    }));
  }, [tab, filteredStock, expiryRows, filteredTransactions, filteredTemps, filteredConcerns, filteredSars]);

  const exportBaseName = useMemo(() => {
    const map = {
      stock: "stock-levels",
      expiry: "expiry-report",
      tx: "transactions",
      temp: "temperature",
      concerns: "concerns",
      sars: "sars",
    };
    return `primovex-${map[tab]}-${new Date().toISOString().slice(0, 10)}`;
  }, [tab]);

  const [exportMessage, setExportMessage] = useState("");
  const [exportBusy, setExportBusy] = useState(false);

  const handleExportCSV = () => {
    if (!exportRows.length) { setExportMessage("Nothing to export — no rows match the current filters."); return; }
    setExportMessage("");
    downloadBlob(
      `${exportBaseName}.csv`,
      new Blob([toCSV(exportRows)], { type: "text/csv;charset=utf-8" })
    );
  };

  const handleExportExcel = () => {
    if (!exportRows.length) { setExportMessage("Nothing to export — no rows match the current filters."); return; }
    setExportMessage("");
    downloadBlob(
      `${exportBaseName}.xml`,
      new Blob([toExcelSpreadsheetXml(exportRows)], { type: "application/vnd.ms-excel;charset=utf-8" })
    );
  };

  const handleExportPDF = () => {
    if (!exportRows.length) { setExportMessage("Nothing to export — no rows match the current filters."); return; }
    setExportMessage("");
    setExportBusy(true);
    try {
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      doc.setFontSize(14);
      doc.text(`Primovex Reports — ${exportBaseName}`, 40, 40);

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
    } finally {
      setExportBusy(false);
    }
  };

  const searchPlaceholder = {
    stock: "Search item, barcode, batch, location…",
    expiry: "Search item, barcode, batch, location…",
    tx: "Search item, action, user, site…",
    temp: "Search site, unit, recorded by, notes…",
    concerns: "Search reference, summary, category, source…",
    sars: "Search reference, request type, status, assigned to…",
  }[tab];

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
              Filter by Site, Location, Category and date range. Exports match what you see.
            </p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5">
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
              Export Excel XML
            </Button>
            <Button
              className="rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 px-4 py-2 text-xs font-medium text-slate-950 shadow-sm hover:from-teal-400 hover:to-emerald-300"
              onClick={handleExportPDF}
              disabled={exportBusy}
            >
              <Download className="mr-1.5 h-4 w-4" />
              {exportBusy ? "Generating…" : "Export PDF"}
            </Button>
          </div>
          {exportMessage && <p className="text-xs text-amber-300">{exportMessage}</p>}
        </div>
      </div>

      {/* Tabs */}
      <Card className="border border-white/10 bg-slate-900/70 backdrop-blur p-2 shadow-lg">
        <div className="flex flex-wrap gap-2">
          <TabButton active={tab === "stock"} onClick={() => setTab("stock")} icon={Package} label="Stock Levels" />
          <TabButton active={tab === "expiry"} onClick={() => setTab("expiry")} icon={Calendar} label="Expiry Report" />
          <TabButton active={tab === "tx"} onClick={() => setTab("tx")} icon={ArrowLeftRight} label="Transactions" />
          <TabButton active={tab === "temp"} onClick={() => setTab("temp")} icon={Thermometer} label="Temperature" />
          {canSeeConcerns && <TabButton active={tab === "concerns"} onClick={() => setTab("concerns")} icon={ShieldAlert} label="Concerns" />}
          {canSeeSars && <TabButton active={tab === "sars"} onClick={() => setTab("sars")} icon={FileSearch} label="SARs" />}
        </div>
      </Card>

      {/* Date range — applies to every tab */}
      <Card className="border border-white/10 bg-slate-900/70 backdrop-blur p-3 shadow-lg">
        <div className="flex flex-wrap items-center gap-2">
          <Calendar className="h-4 w-4 text-slate-400" />
          {[
            { value: "all", label: "All time" },
            { value: "this_year", label: "This year" },
            { value: "last_year", label: "Last year" },
            { value: "custom", label: "Custom" },
          ].map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => setDatePreset(preset.value)}
              className={
                datePreset === preset.value
                  ? "rounded-full bg-teal-500/20 border border-teal-400/40 px-3 py-1.5 text-xs font-semibold text-teal-100"
                  : "rounded-full border border-white/10 bg-slate-800/70 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
              }
            >
              {preset.label}
            </button>
          ))}
          {datePreset === "custom" && (
            <>
              <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-9 w-40 rounded-full border-white/10 bg-slate-800/70 text-xs text-slate-100" />
              <span className="text-xs text-slate-500">to</span>
              <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-9 w-40 rounded-full border-white/10 bg-slate-800/70 text-xs text-slate-100" />
            </>
          )}
        </div>
      </Card>

      {/* Filters */}
      <Card className="border border-white/10 bg-slate-900/70 backdrop-blur p-4 shadow-lg">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-3 items-center">
            <PillSelect icon={MapPin} value={siteFilter} onChange={setSiteFilter} options={siteOptions} disabled={tab === "concerns" || tab === "sars"} />

            <PillSelect
              icon={LocateFixed}
              value={locationFilter}
              onChange={setLocationFilter}
              options={locationOptions}
              disabled={tab === "tx" || tab === "temp" || tab === "concerns" || tab === "sars"}
            />

            <PillSelect
              icon={Tags}
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={categoryOptions}
              disabled={tab === "tx" || tab === "temp" || tab === "concerns" || tab === "sars"}
            />

            <Input
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder={searchPlaceholder}
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
              disabled={tab === "tx" || tab === "temp" || tab === "concerns" || tab === "sars"}
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
          title={tab === "tx" || tab === "temp" || tab === "concerns" || tab === "sars" ? "Records" : "Total Items"}
          value={summary.totalItems}
          icon={Package}
          tone="teal"
        />
        <MiniStat
          title={tab === "concerns" ? "High priority" : tab === "sars" ? "Completed late" : "Out of Stock"}
          value={summary.outOfStock}
          icon={tab === "concerns" || tab === "sars" ? AlertTriangle : FileText}
          tone="rose"
        />
        <MiniStat
          title={tab === "concerns" ? "Closed" : tab === "sars" ? "Completed on time" : "Low Stock"}
          value={summary.lowStock}
          icon={tab === "concerns" || tab === "sars" ? FileText : FileText}
          tone="amber"
        />
        <MiniStat
          title={tab === "tx" ? "Total Qty" : tab === "temp" ? "Logs" : tab === "concerns" ? "Still open" : tab === "sars" ? "Not yet completed" : "Total Units"}
          value={summary.totalUnits}
          icon={Package}
          tone="emerald"
        />
      </div>

      {/* Breakdown — the core of an annual return */}
      {tab === "concerns" && (
        <div className="grid gap-3 md:grid-cols-2">
          <BreakdownCard title="By category" counts={concernBreakdown.byCategory} labelFor={friendlyConcern} total={filteredConcerns.length} />
          <BreakdownCard title="By outcome (closed cases)" counts={concernBreakdown.byOutcome} labelFor={(k) => CONCERN_OUTCOME_LABELS[k] || k} total={concernBreakdown.closedCount} />
          <BreakdownCard title="By status" counts={concernBreakdown.byStatus} labelFor={friendlyConcern} total={filteredConcerns.length} />
          <BreakdownCard title="By source" counts={concernBreakdown.bySource} labelFor={friendlyConcern} total={filteredConcerns.length} />
        </div>
      )}
      {tab === "sars" && (
        <div className="grid gap-3 md:grid-cols-2">
          <BreakdownCard title="By request type" counts={sarBreakdown.byType} labelFor={getRequestTypeLabel} total={filteredSars.length} />
          <BreakdownCard title="By status" counts={sarBreakdown.byStatus} labelFor={getSarStatusLabel} total={filteredSars.length} />
        </div>
      )}

      {/* Table */}
      <Card className="border border-white/10 bg-slate-900/60 backdrop-blur shadow-lg">
        <div className="border-b border-white/10 px-4 py-3">
          <p className="text-sm font-semibold text-slate-100">
            {tab === "stock" && "Stock Levels"}
            {tab === "expiry" && "Expiry Report"}
            {tab === "tx" && "Transactions"}
            {tab === "temp" && "Temperature"}
            {tab === "concerns" && "Concerns"}
            {tab === "sars" && "SARs"}
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
          {tab === "concerns" && <ConcernsTable rows={filteredConcerns} />}
          {tab === "sars" && <SarsTable rows={filteredSars} />}
        </div>
      </Card>
    </div>
  );
}
