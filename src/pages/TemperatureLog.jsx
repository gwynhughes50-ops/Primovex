import React, { useEffect, useMemo, useState } from "react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Thermometer,
  Calendar,
  ChevronDown,
  Plus,
  MapPin,
  Printer,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";

import {
  collection,
  addDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase";

/* =========================================================
   Shared constants + helpers
   ========================================================= */

const TEMP_COLLECTION = "temperature_logs";
const UNITS_COLLECTION = "temperature_units";
const INCIDENTS_COLLECTION = "temperature_incidents";

// Labels only; actual siteId comes from your docs.
const SITES = [
  { id: "main_branch", name: "Main Branch" },
  { id: "branch_a", name: "Branch A" },
  { id: "branch_b", name: "Branch B" },
];

const DEFAULT_RANGES = {
  fridge: { min: 2, max: 8 },
  freezer20: { min: -25, max: -15 },
  freezer40: { min: -45, max: -35 },
};

// ✅ Dark-theme dropdown options fix
const SELECT_CLASS =
  "bg-transparent text-xs text-slate-100 outline-none cursor-pointer " +
  "[&>option]:bg-slate-900 [&>option]:text-slate-100 " +
  "[&>option:hover]:bg-slate-700";

function siteLabel(siteId) {
  return SITES.find((s) => s.id === siteId)?.name || siteId || "Site";
}

function safeNumber(v) {
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function normalizeUnitType(t) {
  const v = String(t || "").trim().toLowerCase();
  if (!v) return "fridge";
  if (v === "fridge") return "fridge";
  if (v === "freezer20" || v.includes("-20") || v.includes("20")) return "freezer20";
  if (v === "freezer40" || v.includes("-40") || v.includes("40")) return "freezer40";
  if (v === "freezer") return "freezer20";
  return v;
}

function getStatusForReading(unitRange, tempC) {
  const t = Number(tempC);
  if (Number.isNaN(t) || !unitRange) {
    return { label: "Unknown", className: "text-slate-400" };
  }

  const { min, max } = unitRange;

  if (t < min || t > max) {
    return { label: "Out of range", className: "text-rose-400" };
  }

  const span = max - min;
  const margin = span * 0.1;

  if (t < min + margin || t > max - margin) {
    return { label: "Borderline", className: "text-amber-300" };
  }

  return { label: "In range", className: "text-emerald-300" };
}

function toDateKey(isoOrLocal) {
  const d = new Date(isoOrLocal);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getAmPmSlot(isoOrLocal) {
  const d = new Date(isoOrLocal);
  const h = d.getHours();
  return h < 12 ? "AM" : "PM";
}

function formatDateTime(ts) {
  if (!ts) return "—";
  const d =
    ts?.toDate?.() ||
    (typeof ts === "string" ? new Date(ts) : ts instanceof Date ? ts : new Date(ts));
  if (!d || Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getCurrentRole() {
  return localStorage.getItem("aurora_role") || "practice_manager";
}

/* =========================================================
   Tab Button UI
   ========================================================= */

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

/* =========================================================
   MAIN PAGE (Tabs: Log + Incidents)
   ========================================================= */

export default function TemperatureLog() {
  const [tab, setTab] = useState("log"); // log | incidents

  return (
    <div className="space-y-6">
      {/* Top header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-teal-500/15 text-teal-200 border border-white/10">
            <Thermometer className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-100">Temperature</h1>
            <p className="text-sm text-slate-400">Logs + incident workflow (practice-wide)</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Card className="border border-white/10 bg-slate-900/70 backdrop-blur p-2 shadow-lg">
        <div className="flex flex-wrap gap-2">
          <TabButton active={tab === "log"} onClick={() => setTab("log")} icon={Thermometer} label="Log" />
          <TabButton active={tab === "incidents"} onClick={() => setTab("incidents")} icon={AlertTriangle} label="Incidents" />
        </div>
      </Card>

      {tab === "log" && <TemperatureLogTab />}
      {tab === "incidents" && <TemperatureIncidentsTab />}
    </div>
  );
}

/* =========================================================
   TAB: Temperature Log (reads temperature_logs + units)
   ========================================================= */

function TemperatureLogTab() {
  const [readings, setReadings] = useState([]);
  const [units, setUnits] = useState([]);

  // Filters
  const [siteFilter, setSiteFilter] = useState("all");
  const [unitFilter, setUnitFilter] = useState("all");
  const [dateRange, setDateRange] = useState("7d");

  // Modal
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [newReading, setNewReading] = useState({
    datetime: "",
    siteId: "main_branch",
    unitId: "",
    temp: "",
    recordedBy: "",
    notes: "",
  });

  const role = getCurrentRole();
  const canLog = role === "admin" || role === "practice_manager";

  // Units
  useEffect(() => {
    const qy = query(collection(db, UNITS_COLLECTION), orderBy("site", "asc"));
    return onSnapshot(
      qy,
      (snap) => {
        const rows = snap.docs.map((d) => {
          const data = d.data();

          const siteId = data.site ?? data.siteId ?? "";
          const unitType = normalizeUnitType(data.unitType);
          const fallback = DEFAULT_RANGES[unitType] || DEFAULT_RANGES.fridge;

          const rangeMin = safeNumber(data.rangeMin);
          const rangeMax = safeNumber(data.rangeMax);

          return {
            id: d.id,
            siteId,
            name: data.unitName ?? data.name ?? d.id,
            type: unitType,
            active: data.active !== false,
            range: {
              min: rangeMin !== null ? rangeMin : fallback.min,
              max: rangeMax !== null ? rangeMax : fallback.max,
            },
            sortOrder: safeNumber(data.sortOrder) ?? 9999,
          };
        });

        rows.sort((a, b) => {
          const s = String(a.siteId).localeCompare(String(b.siteId));
          if (s !== 0) return s;
          const o = (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999);
          if (o !== 0) return o;
          return String(a.name).localeCompare(String(b.name));
        });

        setUnits(rows);

        // Ensure modal unit is valid for chosen site
        setNewReading((prev) => {
          const options = rows.filter((u) => u.active && u.siteId === prev.siteId);
          const stillValid = options.some((u) => u.id === prev.unitId);
          if (stillValid) return prev;
          return { ...prev, unitId: options[0]?.id || "" };
        });
      },
      (err) => console.error("temperature_units subscribe error:", err)
    );
  }, []);

  // Logs
  useEffect(() => {
    const qy = query(collection(db, TEMP_COLLECTION), orderBy("created_at", "desc"));
    return onSnapshot(
      qy,
      (snap) => {
        const rows = snap.docs.map((d) => {
          const data = d.data();

          const dt =
            data.measured_at?.toDate?.() ||
            data.created_at?.toDate?.() ||
            (data.datetime ? new Date(data.datetime) : null);

          return {
            id: d.id,
            datetime: dt ? dt.toISOString() : "",

            siteId: data.siteId ?? data.site ?? "",
            siteName: data.siteName ?? "",

            unitId: data.unitId ?? data.unit ?? "",
            unitName: data.unitName ?? "",
            unitType: normalizeUnitType(data.unitType ?? "fridge"),

            unitRange: data.unitRange ?? null,

            temp: data.temp ?? data.temperature ?? "",
            recordedBy: data.recordedBy ?? data.recorded_by ?? "",
            notes: data.notes ?? "",

            dateKey: data.dateKey ?? data.date_key ?? "",
            slot: data.slot ?? "",
          };
        });

        setReadings(rows);
      },
      (err) => console.error("temperature_logs subscribe error:", err)
    );
  }, []);

  const unitsForSite = useMemo(() => {
    return units.filter((u) => u.active && u.siteId === newReading.siteId);
  }, [units, newReading.siteId]);

  const filteredUnitsForFilterBar = useMemo(() => {
    const list = units.filter((u) => u.active);
    if (siteFilter === "all") return list;
    return list.filter((u) => u.siteId === siteFilter);
  }, [units, siteFilter]);

  const filteredReadings = useMemo(() => {
    let list = [...readings];

    if (siteFilter !== "all") list = list.filter((r) => r.siteId === siteFilter);
    if (unitFilter !== "all") list = list.filter((r) => r.unitId === unitFilter);

    if (dateRange !== "all") {
      const now = new Date();
      let days = 7;
      if (dateRange === "24h") days = 1;
      if (dateRange === "30d") days = 30;
      const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      list = list.filter((r) => r.datetime && new Date(r.datetime) >= cutoff);
    }

    return list;
  }, [readings, siteFilter, unitFilter, dateRange]);

  const outOfRangeLatest = useMemo(() => {
    const latestByUnit = new Map();
    for (const r of filteredReadings) {
      if (!r.unitId) continue;
      if (!latestByUnit.has(r.unitId)) latestByUnit.set(r.unitId, r);
    }

    const bad = [];
    for (const r of latestByUnit.values()) {
      const unit = units.find((u) => u.id === r.unitId);
      const range = r.unitRange || unit?.range || null;
      const status = getStatusForReading(range, r.temp);
      if (status.label === "Out of range") bad.push(r);
    }

    return bad.sort((a, b) => new Date(b.datetime || 0) - new Date(a.datetime || 0));
  }, [filteredReadings, units]);

  const handleNewChange = (field, value) => setNewReading((prev) => ({ ...prev, [field]: value }));

  const handleSiteChangeInModal = (siteId) => {
    const firstUnit = units.find((u) => u.active && u.siteId === siteId);
    setNewReading((prev) => ({
      ...prev,
      siteId,
      unitId: firstUnit ? firstUnit.id : "",
    }));
  };

  const handlePrint = () => window.print();

  const handleSaveReading = async () => {
    setSaveError("");

    if (!newReading.datetime || !newReading.temp || !newReading.unitId) {
      setSaveError("Please fill Date & Time, Unit and Temperature.");
      return;
    }

    const measuredAt = new Date(newReading.datetime);
    if (Number.isNaN(measuredAt.getTime())) {
      setSaveError("Invalid Date & Time.");
      return;
    }

    const unit = units.find((u) => u.id === newReading.unitId);
    const site = SITES.find((s) => s.id === newReading.siteId);

    if (!unit) {
      setSaveError("Selected unit not found. Check temperature_units in Firestore.");
      return;
    }

    const dateKey = toDateKey(newReading.datetime);
    const slot = getAmPmSlot(newReading.datetime);

    // AM/PM lock per unit/day
    const duplicate = readings.some(
      (r) => r.unitId === newReading.unitId && r.dateKey === dateKey && r.slot === slot
    );
    if (duplicate) {
      setSaveError(`AM/PM lock: a ${slot} reading already exists for this unit on ${dateKey}.`);
      return;
    }

    const tempNum = Number(newReading.temp);
    if (Number.isNaN(tempNum)) {
      setSaveError("Temperature must be a number (e.g. 4.1).");
      return;
    }

    try {
      await addDoc(collection(db, TEMP_COLLECTION), {
        created_at: serverTimestamp(),
        measured_at: measuredAt,

        temp: tempNum,
        recordedBy: newReading.recordedBy || "",
        notes: newReading.notes || "",

        siteId: newReading.siteId,
        siteName: site?.name || siteLabel(newReading.siteId),

        unitId: newReading.unitId,
        unitName: unit?.name || "Unknown unit",
        unitType: unit?.type || "fridge",

        // snapshot unit range at time of reading
        unitRange: unit?.range || null,

        dateKey,
        slot,
        source: "manual",
      });

      setNewReading((prev) => ({
        ...prev,
        datetime: "",
        temp: "",
        recordedBy: "",
        notes: "",
      }));
      setIsLogOpen(false);
    } catch (err) {
      console.error("TemperatureLog save error:", err);
      setSaveError("Failed to save reading. Check Firestore rules and try again.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Actions row */}
      <div className="flex flex-wrap gap-2 justify-end">
        <Button
          variant="outline"
          className="rounded-full border-white/10 bg-slate-900/40 text-xs text-slate-200 hover:bg-slate-900/60"
          onClick={handlePrint}
        >
          <Printer className="mr-1.5 h-4 w-4" />
          Print / PDF
        </Button>

        <Button
          className="rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 px-4 py-2 text-xs font-medium text-slate-950 shadow-sm hover:from-teal-400 hover:to-emerald-300"
          onClick={() => canLog && setIsLogOpen(true)}
          disabled={!canLog}
          title={!canLog ? "You don’t have permission to log temperatures." : ""}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Log Temperature
        </Button>
      </div>

      {/* Out-of-range banner */}
      {outOfRangeLatest.length > 0 && (
        <Card className="border border-rose-500/30 bg-rose-500/10 backdrop-blur p-4 shadow-lg">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-200 border border-rose-500/20">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-rose-100">
                Temperature alert: one or more units are out of range
              </p>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {outOfRangeLatest.slice(0, 6).map((r) => {
                  const unit = units.find((u) => u.id === r.unitId);
                  const range = r.unitRange || unit?.range;
                  return (
                    <div key={r.id} className="rounded-xl border border-rose-500/20 bg-slate-950/30 px-3 py-2">
                      <p className="text-xs font-medium text-slate-100">
                        {r.siteName || r.siteId || "Unknown site"} —{" "}
                        {r.unitName || unit?.name || r.unitId || "Unknown unit"}{" "}
                        <span className="text-slate-400">({r.unitType})</span>
                      </p>
                      <p className="text-xs text-rose-200">
                        {r.temp} °C •{" "}
                        {r.datetime ? new Date(r.datetime).toLocaleString("en-GB") : "Unknown time"}
                      </p>
                      {range ? (
                        <p className="text-[0.7rem] text-rose-100/70">
                          Range: {range.min} to {range.max}°C
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Filters */}
      <Card className="border border-white/10 bg-slate-900/70 backdrop-blur p-4 shadow-lg">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-3">
            {/* Site filter */}
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-800/80 px-3 py-1.5 text-xs text-slate-200">
              <MapPin className="h-4 w-4 text-slate-400 pointer-events-none" />
              <select
                className={SELECT_CLASS}
                value={siteFilter}
                onChange={(e) => {
                  const site = e.target.value;
                  setSiteFilter(site);
                  if (site !== "all") {
                    const stillValid = units.some((u) => u.id === unitFilter && u.siteId === site);
                    if (!stillValid) setUnitFilter("all");
                  }
                }}
              >
                <option value="all">All Sites</option>
                {Array.from(
                  new Set([...SITES.map((s) => s.id), ...units.map((u) => u.siteId).filter(Boolean)])
                ).map((sid) => (
                  <option key={sid} value={sid}>
                    {siteLabel(sid)}
                  </option>
                ))}
              </select>
              <ChevronDown className="h-3 w-3 text-slate-400 pointer-events-none" />
            </div>

            {/* Unit filter */}
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-800/80 px-3 py-1.5 text-xs text-slate-200">
              <Thermometer className="h-4 w-4 text-slate-400 pointer-events-none" />
              <select className={SELECT_CLASS} value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)}>
                <option value="all">All Units</option>
                {filteredUnitsForFilterBar.map((u) => (
                  <option key={u.id} value={u.id}>
                    {siteLabel(u.siteId)} — {u.name} ({u.type}) — {u.range?.min} to {u.range?.max}°C
                  </option>
                ))}
              </select>
              <ChevronDown className="h-3 w-3 text-slate-400 pointer-events-none" />
            </div>

            {/* Date range */}
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-800/80 px-3 py-1.5 text-xs text-slate-200">
              <Calendar className="h-4 w-4 text-slate-400 pointer-events-none" />
              <select className={SELECT_CLASS} value={dateRange} onChange={(e) => setDateRange(e.target.value)}>
                <option value="24h">Last 24 hours</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="all">All time</option>
              </select>
              <ChevronDown className="h-3 w-3 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card className="border border-white/10 bg-slate-900/60 backdrop-blur shadow-lg">
        <div className="border-b border-white/10 px-4 py-3">
          <p className="text-sm font-semibold text-slate-100">Recent Readings</p>
          <p className="mt-0.5 text-[0.7rem] text-slate-400">
            Tip: AM/PM lock is enabled (max one AM + one PM reading per unit per day).
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-slate-900/60 text-xs font-medium text-slate-300">
                <th className="px-4 py-2">Date &amp; Time</th>
                <th className="px-4 py-2">Site</th>
                <th className="px-4 py-2">Unit</th>
                <th className="px-4 py-2">Temperature</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Recorded By</th>
                <th className="px-4 py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {filteredReadings.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-xs text-slate-400">
                    No temperature readings found. Click{" "}
                    <span className="font-medium text-slate-200">"Log Temperature"</span> to add one.
                  </td>
                </tr>
              ) : (
                filteredReadings.map((r) => {
                  const unit = units.find((u) => u.id === r.unitId);
                  const range = r.unitRange || unit?.range || null;
                  const status = getStatusForReading(range, r.temp);
                  const dt = r.datetime ? new Date(r.datetime) : null;

                  return (
                    <tr key={r.id} className="border-b border-white/10 last:border-0">
                      <td className="px-4 py-2 text-xs text-slate-200">
                        {dt
                          ? dt.toLocaleString("en-GB", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}{" "}
                        {r.slot ? <span className="text-slate-400">({r.slot})</span> : null}
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-200">
                        {r.siteName || siteLabel(r.siteId) || "—"}
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-200">
                        {(r.unitName || unit?.name || r.unitId || "—")}{" "}
                        <span className="text-slate-400">({r.unitType})</span>
                        {range ? (
                          <div className="text-[0.7rem] text-slate-400">
                            Range: {range.min} to {range.max}°C
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-200">{r.temp} °C</td>
                      <td className="px-4 py-2 text-xs">
                        <span className={status.className}>{status.label}</span>
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-200">{r.recordedBy || "—"}</td>
                      <td className="px-4 py-2 text-xs text-slate-200">{r.notes || "—"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Log Temperature modal */}
      {isLogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/95 p-5 shadow-2xl">
            <h2 className="text-sm font-semibold text-slate-50">Log temperature</h2>

            {saveError && (
              <div className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                {saveError}
              </div>
            )}

            <div className="mt-4 space-y-3 text-sm">
              <div>
                <label className="text-xs text-slate-300">Date &amp; time</label>
                <input
                  type="datetime-local"
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  value={newReading.datetime}
                  onChange={(e) => handleNewChange("datetime", e.target.value)}
                />
                {newReading.datetime && (
                  <p className="mt-1 text-[0.7rem] text-slate-500">
                    Slot: <span className="text-slate-300">{getAmPmSlot(newReading.datetime)}</span>{" "}
                    (AM/PM lock enabled)
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs text-slate-300">Site</label>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100
                             [&>option]:bg-slate-900 [&>option]:text-slate-100 [&>option:hover]:bg-slate-700"
                  value={newReading.siteId}
                  onChange={(e) => handleSiteChangeInModal(e.target.value)}
                >
                  {Array.from(
                    new Set([...SITES.map((s) => s.id), ...units.map((u) => u.siteId).filter(Boolean)])
                  ).map((sid) => (
                    <option key={sid} value={sid}>
                      {siteLabel(sid)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-300">Unit (fridge/freezer)</label>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100
                             [&>option]:bg-slate-900 [&>option]:text-slate-100 [&>option:hover]:bg-slate-700"
                  value={newReading.unitId}
                  onChange={(e) => handleNewChange("unitId", e.target.value)}
                >
                  {unitsForSite.length === 0 ? (
                    <option value="">No units found for this site (check temperature_units)</option>
                  ) : (
                    unitsForSite.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.type}) — {u.range?.min} to {u.range?.max}°C
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-300">Temperature (°C)</label>
                <Input
                  value={newReading.temp}
                  onChange={(e) => handleNewChange("temp", e.target.value)}
                  placeholder="e.g. 4.1"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300">Recorded by</label>
                <Input
                  value={newReading.recordedBy}
                  onChange={(e) => handleNewChange("recordedBy", e.target.value)}
                  placeholder="e.g. J. Smith"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300">Notes</label>
                <Input
                  value={newReading.notes}
                  onChange={(e) => handleNewChange("notes", e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200"
                onClick={() => {
                  setSaveError("");
                  setIsLogOpen(false);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-xl bg-gradient-to-r from-teal-500 to-emerald-400 px-3 py-1.5 text-xs font-medium text-slate-950"
                onClick={handleSaveReading}
              >
                Save reading
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================
   TAB: Temperature Incidents (with in-app Resolve modal)
   ========================================================= */

function TemperatureIncidentsTab() {
  const [units, setUnits] = useState([]);
  const [incidents, setIncidents] = useState([]);

  const [siteFilter, setSiteFilter] = useState("__ALL__");
  const [statusFilter, setStatusFilter] = useState("open"); // open | resolved | all

  const [isOpenModal, setIsOpenModal] = useState(false);
  const [modalError, setModalError] = useState("");

  // ✅ Resolve modal state (NO window.prompt)
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolveTarget, setResolveTarget] = useState(null);
  const [resolveBy, setResolveBy] = useState("");
  const [resolveNotes, setResolveNotes] = useState("");
  const [resolveErr, setResolveErr] = useState("");

  const [newIncident, setNewIncident] = useState({
    unitId: "",
    observedTemp: "",
    summary: "",
    details: "",
    actionsTaken: "",
    quarantined: false,
    discarded: false,
    movedToBackupUnit: false,
    stockNotes: "",
    openedBy: "",
  });

  // Load units
  useEffect(() => {
    const qy = query(collection(db, UNITS_COLLECTION), orderBy("site", "asc"));
    return onSnapshot(
      qy,
      (snap) => {
        const rows = snap.docs.map((d) => {
          const data = d.data();
          const type = normalizeUnitType(data.unitType);
          const fallback = DEFAULT_RANGES[type] || DEFAULT_RANGES.fridge;

          const min = safeNumber(data.rangeMin);
          const max = safeNumber(data.rangeMax);

          return {
            id: d.id,
            siteId: data.site ?? data.siteId ?? "",
            name: data.unitName ?? data.name ?? d.id,
            type,
            active: data.active !== false,
            range: {
              min: min !== null ? min : fallback.min,
              max: max !== null ? max : fallback.max,
            },
          };
        });

        rows.sort((a, b) => {
          const s = String(a.siteId).localeCompare(String(b.siteId));
          if (s !== 0) return s;
          return String(a.name).localeCompare(String(b.name));
        });

        setUnits(rows);

        // Default unit selection
        setNewIncident((prev) => {
          if (prev.unitId && rows.some((u) => u.id === prev.unitId)) return prev;
          const first = rows.find((u) => u.active) || rows[0];
          return { ...prev, unitId: first?.id || "" };
        });
      },
      (err) => console.error("temperature_units subscribe error:", err)
    );
  }, []);

  // Load incidents
  useEffect(() => {
    const qy = query(collection(db, INCIDENTS_COLLECTION), orderBy("openedAt", "desc"));
    return onSnapshot(
      qy,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setIncidents(rows);
      },
      (err) => console.error("temperature_incidents subscribe error:", err)
    );
  }, []);

  const siteOptions = useMemo(() => {
    const vals = Array.from(new Set(units.map((u) => u.siteId).filter(Boolean)));
    vals.sort((a, b) => a.localeCompare(b));
    return [
      { value: "__ALL__", label: "All Sites" },
      ...vals.map((v) => ({ value: v, label: siteLabel(v) })),
    ];
  }, [units]);

  const filteredIncidents = useMemo(() => {
    return incidents.filter((i) => {
      const siteOk = siteFilter === "__ALL__" ? true : String(i.siteId || "") === siteFilter;
      const statusOk = statusFilter === "all" ? true : String(i.status || "open") === statusFilter;
      return siteOk && statusOk;
    });
  }, [incidents, siteFilter, statusFilter]);

  const openCount = useMemo(
    () => incidents.filter((i) => String(i.status || "open") === "open").length,
    [incidents]
  );
  const resolvedCount = useMemo(
    () => incidents.filter((i) => String(i.status || "open") === "resolved").length,
    [incidents]
  );

  const handleNewChange = (field, value) => setNewIncident((p) => ({ ...p, [field]: value }));

  const resetModal = () => {
    setModalError("");
    setNewIncident((prev) => ({
      ...prev,
      observedTemp: "",
      summary: "",
      details: "",
      actionsTaken: "",
      quarantined: false,
      discarded: false,
      movedToBackupUnit: false,
      stockNotes: "",
      openedBy: "",
    }));
  };

  const createIncident = async () => {
    setModalError("");

    const unit = units.find((u) => u.id === newIncident.unitId);
    if (!unit) return setModalError("Please select a unit.");
    if (!newIncident.summary.trim()) return setModalError("Please add a short summary.");

    const tempNum = newIncident.observedTemp === "" ? null : Number(newIncident.observedTemp);
    if (newIncident.observedTemp !== "" && Number.isNaN(tempNum)) {
      return setModalError("Observed temperature must be a number.");
    }

    try {
      await addDoc(collection(db, INCIDENTS_COLLECTION), {
        unitId: unit.id,
        unitName: unit.name,
        unitType: unit.type,
        siteId: unit.siteId || "",
        expectedRange: unit.range,

        observedTemp: tempNum,

        summary: newIncident.summary.trim(),
        details: newIncident.details.trim(),

        actionsTaken: newIncident.actionsTaken.trim(),
        affectedStock: {
          quarantined: !!newIncident.quarantined,
          discarded: !!newIncident.discarded,
          movedToBackupUnit: !!newIncident.movedToBackupUnit,
          stockNotes: newIncident.stockNotes.trim(),
        },

        status: "open",
        openedAt: serverTimestamp(),
        openedBy: newIncident.openedBy.trim() || "",

        resolvedAt: null,
        resolvedBy: null,
        resolutionNotes: "",
      });

      resetModal();
      setIsOpenModal(false);
    } catch (e) {
      console.error("Create incident error:", e);
      setModalError("Failed to create incident. Check Firestore rules.");
    }
  };

  // ✅ Open resolve modal
  const openResolve = (incident) => {
    setResolveErr("");
    setResolveTarget(incident);
    setResolveBy("");
    setResolveNotes("");
    setResolveOpen(true);
  };

  // ✅ Submit resolve
  const submitResolve = async () => {
    setResolveErr("");

    if (!resolveTarget?.id) return setResolveErr("No incident selected.");
    if (!resolveNotes.trim()) return setResolveErr("Please add resolution notes.");

    try {
      await updateDoc(doc(db, INCIDENTS_COLLECTION, resolveTarget.id), {
        status: "resolved",
        resolvedAt: serverTimestamp(),
        resolvedBy: resolveBy.trim(),
        resolutionNotes: resolveNotes.trim(),
      });

      setResolveOpen(false);
      setResolveTarget(null);
    } catch (e) {
      console.error("Resolve incident error:", e);
      setResolveErr("Could not resolve incident. Check permissions/rules.");
    }
  };

  const reopenIncident = async (incidentId) => {
    if (!window.confirm("Re-open this incident?")) return;
    try {
      await updateDoc(doc(db, INCIDENTS_COLLECTION, incidentId), {
        status: "open",
        resolvedAt: null,
        resolvedBy: null,
        resolutionNotes: "",
      });
    } catch (e) {
      console.error("Reopen incident error:", e);
      alert("Could not re-open incident. Check permissions/rules.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-200 border border-white/10">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-slate-100">Incidents</h2>
            <p className="text-sm text-slate-400">Log out-of-range events and track resolution.</p>
          </div>
        </div>

        <Button
          className="rounded-full bg-gradient-to-r from-rose-400 to-amber-300 px-4 py-2 text-xs font-medium text-slate-950 shadow-sm hover:from-rose-300 hover:to-amber-200"
          onClick={() => setIsOpenModal(true)}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          New Incident
        </Button>
      </div>

      {/* Mini stats */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="border border-white/10 bg-slate-900/60 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-200 border border-white/10">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xl font-semibold text-slate-100">{openCount}</div>
              <div className="text-xs text-slate-400">Open</div>
            </div>
          </div>
        </Card>

        <Card className="border border-white/10 bg-slate-900/60 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-200 border border-white/10">
              <CheckCircle className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xl font-semibold text-slate-100">{resolvedCount}</div>
              <div className="text-xs text-slate-400">Resolved</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="border border-white/10 bg-slate-900/70 backdrop-blur p-4 shadow-lg">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-800/70 px-3 py-2 text-xs text-slate-200">
            <MapPin className="h-4 w-4 text-slate-400 pointer-events-none" />
            <select className={SELECT_CLASS} value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)}>
              {siteOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <ChevronDown className="h-3 w-3 text-slate-400 pointer-events-none" />
          </div>

          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-800/70 px-3 py-2 text-xs text-slate-200">
            <CheckCircle className="h-4 w-4 text-slate-400 pointer-events-none" />
            <select className={SELECT_CLASS} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
              <option value="all">All</option>
            </select>
            <ChevronDown className="h-3 w-3 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </Card>

      {/* List */}
      <Card className="border border-white/10 bg-slate-900/60 backdrop-blur shadow-lg">
        <div className="border-b border-white/10 px-4 py-3">
          <p className="text-sm font-semibold text-slate-100">Incidents</p>
        </div>

        <div className="divide-y divide-white/10">
          {filteredIncidents.length === 0 ? (
            <div className="px-4 py-10 text-center text-xs text-slate-400">No incidents match the current filters.</div>
          ) : (
            filteredIncidents.map((i) => {
              const status = String(i.status || "open");
              const range = i.expectedRange || null;

              return (
                <div key={i.id} className="px-4 py-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={
                            status === "open"
                              ? "inline-flex items-center rounded-full border border-rose-500/20 bg-rose-500/15 px-2 py-0.5 text-[11px] text-rose-200"
                              : "inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-200"
                          }
                        >
                          {status === "open" ? "OPEN" : "RESOLVED"}
                        </span>

                        <span className="text-xs font-semibold text-slate-100 truncate">{i.summary || "Incident"}</span>
                      </div>

                      <div className="mt-1 text-xs text-slate-300">
                        <span className="font-medium">{siteLabel(i.siteId)}</span> —{" "}
                        <span className="text-slate-100">{i.unitName || i.unitId}</span>{" "}
                        <span className="text-slate-400">({i.unitType || "unit"})</span>
                      </div>

                      <div className="mt-1 text-[0.7rem] text-slate-400">
                        Opened: {formatDateTime(i.openedAt)} {i.openedBy ? `• ${i.openedBy}` : ""}
                      </div>

                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <Card className="border border-white/10 bg-slate-950/30 p-3">
                          <div className="flex items-center gap-2 text-xs text-slate-200">
                            <Thermometer className="h-4 w-4 text-slate-400" />
                            Observed:{" "}
                            <span className="text-slate-100 font-semibold">
                              {i.observedTemp === null || i.observedTemp === undefined
                                ? "—"
                                : `${i.observedTemp} °C`}
                            </span>
                          </div>
                          {range ? (
                            <div className="mt-1 text-[0.7rem] text-slate-400">
                              Expected: {range.min} to {range.max} °C
                            </div>
                          ) : null}
                        </Card>

                        <Card className="border border-white/10 bg-slate-950/30 p-3">
                          <div className="text-xs font-medium text-slate-100">Affected stock</div>
                          <div className="mt-1 text-[0.7rem] text-slate-400">
                            {i.affectedStock?.quarantined ? "• Quarantined " : ""}
                            {i.affectedStock?.discarded ? "• Discarded " : ""}
                            {i.affectedStock?.movedToBackupUnit ? "• Moved " : ""}
                            {!i.affectedStock?.quarantined &&
                            !i.affectedStock?.discarded &&
                            !i.affectedStock?.movedToBackupUnit
                              ? "None recorded"
                              : ""}
                          </div>
                        </Card>
                      </div>

                      {i.details ? (
                        <div className="mt-2 text-xs text-slate-200 whitespace-pre-wrap">{i.details}</div>
                      ) : null}

                      {i.actionsTaken ? (
                        <div className="mt-2 text-xs text-slate-200">
                          <span className="text-slate-400">Actions:</span>{" "}
                          <span className="whitespace-pre-wrap">{i.actionsTaken}</span>
                        </div>
                      ) : null}

                      {status === "resolved" ? (
                        <div className="mt-2 text-xs text-emerald-200">
                          <span className="text-slate-400">Resolved:</span> {formatDateTime(i.resolvedAt)}{" "}
                          {i.resolvedBy ? `• ${i.resolvedBy}` : ""}
                          {i.resolutionNotes ? (
                            <div className="mt-1 text-xs text-slate-200 whitespace-pre-wrap">{i.resolutionNotes}</div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex gap-2 shrink-0">
                      {status === "open" ? (
                        <Button
                          className="rounded-full bg-emerald-400 text-slate-950 hover:bg-emerald-300 text-xs"
                          onClick={() => openResolve(i)}
                        >
                          <CheckCircle className="mr-1.5 h-4 w-4" />
                          Resolve
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          className="rounded-full border-white/10 bg-slate-900/40 text-xs text-slate-200 hover:bg-slate-900/60"
                          onClick={() => reopenIncident(i.id)}
                        >
                          Re-open
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>

      {/* New Incident modal */}
      {isOpenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900/95 p-5 shadow-2xl">
            <div className="flex items-start justify-between">
              <h3 className="text-sm font-semibold text-slate-100">New incident</h3>
              <button
                className="text-slate-400 hover:text-slate-200"
                onClick={() => {
                  resetModal();
                  setIsOpenModal(false);
                }}
              >
                ✕
              </button>
            </div>

            {modalError && (
              <div className="mt-3 rounded-xl bg-rose-500/10 border border-rose-500/20 px-3 py-2 text-xs text-rose-200">
                {modalError}
              </div>
            )}

            <div className="mt-4 space-y-3 text-sm">
              <div>
                <label className="text-xs text-slate-300">Unit</label>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100
                             [&>option]:bg-slate-900 [&>option]:text-slate-100 [&>option:hover]:bg-slate-700"
                  value={newIncident.unitId}
                  onChange={(e) => handleNewChange("unitId", e.target.value)}
                >
                  {units.filter((u) => u.active).map((u) => (
                    <option key={u.id} value={u.id}>
                      {siteLabel(u.siteId)} — {u.name} ({u.type})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-300">Observed temperature (optional)</label>
                <Input
                  value={newIncident.observedTemp}
                  onChange={(e) => handleNewChange("observedTemp", e.target.value)}
                  placeholder="e.g. 12.5"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300">Summary</label>
                <Input
                  value={newIncident.summary}
                  onChange={(e) => handleNewChange("summary", e.target.value)}
                  placeholder="Short title"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300">Details</label>
                <textarea
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  rows={3}
                  value={newIncident.details}
                  onChange={(e) => handleNewChange("details", e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs text-slate-300">Actions taken</label>
                <textarea
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  rows={3}
                  value={newIncident.actionsTaken}
                  onChange={(e) => handleNewChange("actionsTaken", e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs text-slate-300">Opened by</label>
                <Input
                  value={newIncident.openedBy}
                  onChange={(e) => handleNewChange("openedBy", e.target.value)}
                  placeholder="e.g. J. Smith"
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                className="rounded-full border-white/10 bg-slate-900/40 text-xs text-slate-200 hover:bg-slate-900/60"
                onClick={() => {
                  resetModal();
                  setIsOpenModal(false);
                }}
              >
                Cancel
              </Button>

              <Button
                className="rounded-full bg-rose-400 text-slate-950 hover:bg-rose-300 text-xs"
                onClick={createIncident}
              >
                Create
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ Resolve modal */}
      {resolveOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900/95 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-50">Resolve incident</h2>
                <p className="mt-0.5 text-[0.7rem] text-slate-400">{resolveTarget?.summary || "Incident"}</p>
              </div>
              <button
                type="button"
                className="rounded-xl border border-white/10 bg-slate-900/40 p-2 text-slate-200 hover:bg-slate-900/60"
                onClick={() => {
                  setResolveOpen(false);
                  setResolveTarget(null);
                  setResolveErr("");
                }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {resolveErr && (
              <div className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                {resolveErr}
              </div>
            )}

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs text-slate-300">Resolved by (optional)</label>
                <Input value={resolveBy} onChange={(e) => setResolveBy(e.target.value)} placeholder="e.g. J. Smith" />
              </div>

              <div>
                <label className="text-xs text-slate-300">Resolution notes (required)</label>
                <textarea
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  rows={4}
                  value={resolveNotes}
                  onChange={(e) => setResolveNotes(e.target.value)}
                  placeholder="What was done / outcome?"
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                className="rounded-full border-white/10 bg-slate-900/40 text-xs text-slate-200 hover:bg-slate-900/60"
                onClick={() => {
                  setResolveOpen(false);
                  setResolveTarget(null);
                  setResolveErr("");
                }}
              >
                Cancel
              </Button>

              <Button
                className="rounded-full bg-emerald-400 text-slate-950 hover:bg-emerald-300 text-xs"
                onClick={submitResolve}
              >
                Resolve
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

