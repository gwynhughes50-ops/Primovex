import React, { useEffect, useMemo, useState } from "react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Flame,
  Thermometer,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Clock,
  Settings2,
  Plus,
  Trash2,
  PlugZap,
  ClipboardList,
  FileSignature,
  Droplets,
  Printer,
  X,
  QrCode,
  LayoutDashboard,
  History,
  SprayCan,
  Wrench,
  FlaskConical,
  FileBadge,
} from "lucide-react";
import { db } from "../lib/firebase";
import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { addDocResendSafe } from "@/lib/resendSafeWrites";
import { printHtmlDocument } from "@/lib/printHtmlDocument";
import ComplianceQrEngine from "@/components/compliance/ComplianceQrEngine";
import ComplianceOverview from "@/components/compliance/ComplianceOverview";
import ChecksHistory from "@/components/compliance/ChecksHistory";
import CoshhRegister from "@/components/compliance/CoshhRegister";
import CertificatesRegister from "@/components/compliance/CertificatesRegister";
import { useAuth } from "@/contexts/AuthContext";
import CleaningPanel from "@/modules/facilities/components/CleaningPanel";
import MaintenancePanel from "@/modules/facilities/components/MaintenancePanel";
import { checkPerson, checkTime, localDateInput } from "@/components/compliance/complianceView";
import { getComplianceChecksBetween, subscribeComplianceAssets, subscribeRecentComplianceChecks } from "@/services/compliance/complianceQrService";
import useComplianceSites from "@/modules/compliance/useComplianceSites";
import { subscribeCleaningLogs } from "@/modules/facilities/services/cleaningRecordService";
import PatRegisterPanel from "@/components/compliance/PatRegisterPanel";

// ---------- UI helpers ----------
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

const SELECT_CLASS =
  "bg-transparent text-xs text-slate-100 outline-none cursor-pointer " +
  "[&>option]:bg-slate-900 [&>option]:text-slate-100 " +
  "[&>option:hover]:bg-slate-700";

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function nowHHmm() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function makeDisplayName(label, pointNumber) {
  const l = String(label || "").trim();
  const p = String(pointNumber || "").trim();
  if (!l && !p) return "Call point";
  if (l && p) return `${l} #${p}`;
  return l || p;
}

// ---------- FIRE CHECKS ----------
const FIRE_CHECKS = [
  { key: "safetySigns", label: "Check safety signs & notices" },
  { key: "fireDoorsMove", label: "Fire doors move freely" },
  { key: "fireDoorsClose", label: "Fire doors close fully" },
  { key: "noFaults", label: "No faults detected" },
  { key: "exitsGood", label: "All exits in good state of repair" },
];

// ---------- WATER TEMPS ----------
const WATER_FREQUENCIES = ["daily", "weekly", "monthly", "quarterly", "annually"];

function outletDisplay(o) {
  const name = String(o.name || "").trim();
  const loc = String(o.location || "").trim();
  const type = String(o.type || "").trim();
  const freq = String(o.frequency || "").trim();
  const bits = [];
  if (loc) bits.push(loc);
  if (type) bits.push(type);
  if (freq) bits.push(freq);
  return `${name || "Outlet"}${bits.length ? ` • ${bits.join(" • ")}` : ""}`;
}

// ---------- PRINT HELPERS ----------
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// See printHtmlDocument for why this isn't window.open() - that reliably
// shows "Popup blocked" in the packaged desktop app.
const openPrintWindow = printHtmlDocument;

function basePrintHtml({ title, bodyHtml }) {
  const css = `
    :root { color-scheme: light; }
    body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; margin: 28px; color: #0f172a; }
    h1 { font-size: 18px; margin: 0 0 6px; }
    h2 { font-size: 14px; margin: 22px 0 8px; padding-bottom: 6px; border-bottom: 1px solid #e2e8f0; }
    .meta { font-size: 12px; color: #334155; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #e2e8f0; padding: 8px; font-size: 12px; vertical-align: top; }
    th { background: #f8fafc; text-align: left; }
    .pill { display: inline-block; border: 1px solid #e2e8f0; padding: 2px 8px; border-radius: 999px; font-size: 11px; }
    .small { font-size: 11px; color: #475569; }
    .muted { color: #64748b; }
    @media print {
      a { color: inherit; text-decoration: none; }
      .no-print { display: none !important; }
      body { margin: 16mm; }
    }
  `;

  return `
  <!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(title)}</title>
      <style>${css}</style>
    </head>
    <body>
      ${bodyHtml}
    </body>
  </html>
  `;
}

function inDateRange(key, from, to) {
  // keys are YYYY-MM-DD; lexical compare works
  const k = String(key || "").trim();
  if (!k) return false;
  if (from && k < from) return false;
  if (to && k > to) return false;
  return true;
}


// ---------- Page ----------
// Whoever can see compliance gets the full page (with the COSHH register as one more tab). Someone who can only
// see the COSHH register (a partner, say) gets a page with just that, and none of the compliance data loads.
export default function Compliance() {
  const { can } = useAuth();
  if (!can("compliance.read")) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Compliance</h1>
          <p className="text-sm text-slate-400">COSHH register</p>
        </div>
        <CoshhRegister />
      </div>
    );
  }
  return <ComplianceFull canCoshh={can("coshh.read")} />;
}

function ComplianceFull({ canCoshh }) {
  // Assets and the last 45 days of checks are read once here and shared with the tabs (they used to read the same
  // collection five times, each with its own row limit). "" means every site.
  const [allAssets, setAllAssets] = useState([]);
  const [recentChecks, setRecentChecks] = useState([]);
  useEffect(() => subscribeComplianceAssets(setAllAssets, console.error, { includeInactive: true }), []);
  useEffect(() => subscribeRecentComplianceChecks(setRecentChecks, console.error, { sinceDays: 45, max: 4000 }), []);
  const usedSiteIds = useMemo(() => [...new Set([...allAssets.map((a) => a.siteId), ...recentChecks.map((c) => c.siteId)].filter(Boolean))], [allAssets, recentChecks]);
  const sites = useComplianceSites(usedSiteIds);
  const siteId = sites.siteId;
  const inSite = (row) => !siteId || String(row.siteId || row.site || "").trim() === siteId;
  const siteAssets = useMemo(() => allAssets.filter(inSite), [allAssets, siteId]);
  const siteChecks = useMemo(() => recentChecks.filter(inSite), [recentChecks, siteId]);
  const [tab, setTab] = useState("overview"); // overview | history | cleaning | maintenance | assets | pat | certificates | coshh

  // For printing we keep our own “recent” datasets at page level
  const [printFireChecks, setPrintFireChecks] = useState([]);
  const [printPatSessions, setPrintPatSessions] = useState([]);
  const [printWaterRounds, setPrintWaterRounds] = useState([]);
  const [printFireCallPoints, setPrintFireCallPoints] = useState([]);
  const [printWaterOutlets, setPrintWaterOutlets] = useState([]);
  const [printPatAssets, setPrintPatAssets] = useState([]);

  // Print modal state
  const [printOpen, setPrintOpen] = useState(false);
  const [printFrom, setPrintFrom] = useState(""); // YYYY-MM-DD
  const [printTo, setPrintTo] = useState(""); // YYYY-MM-DD
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState("");

  const [printSel, setPrintSel] = useState({
    fire: true,
    water: true,
    pat: true,
    cleaning: true,
    includeRegisters: true, // include call points/outlets/assets lists
  });

  // cleaning logs, for the printed report (the tag checks are read for the chosen dates when printing)
  const [printCleaning, setPrintCleaning] = useState([]);
  useEffect(() => subscribeCleaningLogs(setPrintCleaning, console.error), []);

  // subscriptions for printing
  useEffect(() => {
    const unsub1 = onSnapshot(
      query(collection(db, "fire_weekly_checks"), orderBy("createdAt", "desc"), limit(200)),
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setPrintFireChecks(rows.filter(inSite));
      }
    );

    const unsub2 = onSnapshot(
      query(collection(db, "pat_test_sessions"), orderBy("createdAt", "desc"), limit(200)),
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setPrintPatSessions(rows.filter(inSite));
      }
    );

    const unsub3 = onSnapshot(
      query(collection(db, "water_temp_rounds"), orderBy("createdAt", "desc"), limit(200)),
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const filtered = rows.filter(inSite);
        setPrintWaterRounds(filtered);
      }
    );

    const unsub4 = onSnapshot(query(collection(db, "fire_call_points")), (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPrintFireCallPoints(
        rows
          .map((r) => ({
            ...r,
            siteId: String(r.siteId ?? r.site ?? "").trim(),
            active: r.active !== false,
            displayName: String(r.displayName || makeDisplayName(r.label, r.pointNumber)).trim(),
          }))
          .filter((r) => r.active && inSite(r))
          .sort((a, b) => String(a.displayName).localeCompare(String(b.displayName)))
      );
    });

    const unsub5 = onSnapshot(query(collection(db, "water_outlets")), (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPrintWaterOutlets(
        rows
          .map((r) => ({
            ...r,
            siteId: String(r.siteId || "").trim(), // ✅ siteId only
            active: r.active !== false,
            name: String(r.name || "").trim(),
            location: String(r.location || "").trim(),
            type: String(r.type || "").trim(),
            frequency: String(r.frequency || "").trim(),
            order: typeof r.order === "number" ? r.order : null,
          }))
          .filter((r) => r.active && inSite(r))
          .sort((a, b) => {
            const ao = a.order ?? 9999;
            const bo = b.order ?? 9999;
            if (ao !== bo) return ao - bo;
            return outletDisplay(a).localeCompare(outletDisplay(b));
          })
      );
    });

    const unsub6 = onSnapshot(query(collection(db, "pat_assets")), (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPrintPatAssets(
        rows
          .map((r) => ({
            ...r,
            siteId: String(r.siteId || "").trim(),
            active: r.active !== false,
            tag: String(r.tag || "").trim(),
            name: String(r.name || "").trim(),
            location: String(r.location || "").trim(),
            makeModel: String(r.makeModel || "").trim(),
            serialNumber: String(r.serialNumber || "").trim(),
          }))
          .filter((r) => r.active && inSite(r))
          .sort((a, b) => a.tag.localeCompare(b.tag))
      );
    });

    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
      unsub5();
      unsub6();
    };
  }, [siteId]);

  const buildReportHtml = (printChecks = []) => {
    const from = printFrom.trim() || "";
    const to = printTo.trim() || "";
    const now = new Date();
    const meta =
      `Site: ${siteId ? sites.nameOf(siteId) : "All sites"} • Generated: ${now.toLocaleString()}` +
      (from || to ? ` • Date filter: ${from || "…"} to ${to || "…"} ` : "");

    const sections = [];
    const dayOf = (d) => (d ? localDateInput(d) : "");
    const timeOf = (d) => (d ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "");
    const dateOf = (d) => (d ? d.toLocaleDateString("en-GB") : "");
    const recordedCell = (r) => (r.manualEntry ? "By hand" + (r.manualReason ? ": " + r.manualReason : "") : "Phone");
    const tagChecks = (prefix) =>
      printChecks
        .filter((c) => String(c.assetType || "").startsWith(prefix) && inDateRange(dayOf(checkTime(c)), from, to))
        .sort((a, b) => (checkTime(b)?.getTime() || 0) - (checkTime(a)?.getTime() || 0));

    if (printSel.fire) {
      const rows = printFireChecks.filter((r) => inDateRange(r.dateKey, from, to)).slice(0, 200);

      let regHtml = "";
      if (printSel.includeRegisters) {
        regHtml = `
          <div class="small muted">Registered call points (${printFireCallPoints.length})</div>
          <table>
            <thead><tr><th>Call point</th></tr></thead>
            <tbody>
              ${
                printFireCallPoints
                  .map((cp) => `<tr><td>${escapeHtml(cp.displayName)}</td></tr>`)
                  .join("") || `<tr><td class="muted">None</td></tr>`
              }
            </tbody>
          </table>
        `;
      }

      const tagFire = tagChecks("fire_");
      const tagFireHtml = `
        <div class="small muted">Tag checks (${tagFire.length})</div>
        <table>
          <thead><tr><th>Date</th><th>Time</th><th>By</th><th>Point</th><th>Result</th><th>Notes / issues</th><th>Recorded</th></tr></thead>
          <tbody>
            ${tagFire.length ? tagFire.map((c) => `<tr><td>${escapeHtml(dateOf(checkTime(c)))}</td><td>${escapeHtml(timeOf(checkTime(c)))}</td><td>${escapeHtml(checkPerson(c))}</td><td>${escapeHtml([c.assetCode, c.assetLabel].filter(Boolean).join(" "))}</td><td>${escapeHtml(String(c.result || "").toUpperCase())}</td><td>${escapeHtml(c.notes || "")}</td><td>${escapeHtml(recordedCell(c))}</td></tr>`).join("") : `<tr><td colspan="7" class="muted">No tag checks in range.</td></tr>`}
          </tbody>
        </table>
      `;

      sections.push(`
        <h2>Fire Checks</h2>
        ${regHtml}
        ${tagFireHtml}
        <div class="small muted">Earlier fire checks, typed in before tag checks (${rows.length})</div>
        <table>
          <thead>
            <tr>
              <th>Date</th><th>Time</th><th>Initials</th><th>Call point</th><th>Panel OK</th><th>Status</th><th>Notes</th>
            </tr>
          </thead>
          <tbody>
            ${
              rows.length
                ? rows
                    .map(
                      (r) => `
                    <tr>
                      <td>${escapeHtml(r.dateKey)}</td>
                      <td>${escapeHtml(r.time)}</td>
                      <td>${escapeHtml(r.initials)}</td>
                      <td>${escapeHtml(r.callPointNameSnapshot || "")}</td>
                      <td>${r.firePanelChecked ? "Yes" : "No"}</td>
                      <td>${escapeHtml(String(r.status || "").toUpperCase())}</td>
                      <td>${escapeHtml(r.notes || "")}</td>
                    </tr>
                  `
                    )
                    .join("")
                : `<tr><td colspan="7" class="muted">No fire checks in range.</td></tr>`
            }
          </tbody>
        </table>
      `);
    }

    if (printSel.water) {
      const rows = printWaterRounds.filter((r) => inDateRange(r.dateKey, from, to)).slice(0, 200);

      let regHtml = "";
      if (printSel.includeRegisters) {
        regHtml = `
          <div class="small muted">Registered outlets (${printWaterOutlets.length})</div>
          <table>
            <thead><tr><th>Outlet</th><th>Location</th><th>Type</th><th>Frequency</th></tr></thead>
            <tbody>
              ${
                printWaterOutlets.length
                  ? printWaterOutlets
                      .map(
                        (o) => `
                        <tr>
                          <td>${escapeHtml(o.name)}</td>
                          <td>${escapeHtml(o.location)}</td>
                          <td>${escapeHtml(o.type)}</td>
                          <td>${escapeHtml(o.frequency)}</td>
                        </tr>
                      `
                      )
                      .join("")
                  : `<tr><td colspan="4" class="muted">None</td></tr>`
              }
            </tbody>
          </table>
        `;
      }

      const roundsHtml = rows.length
        ? rows
            .map((r) => {
              const entries = Array.isArray(r.entries) ? r.entries : [];
              const entryRows = entries
                .map(
                  (e) => `
                  <tr>
                    <td>${escapeHtml(e.outletNameSnapshot || "")}</td>
                    <td>${escapeHtml(e.outletLocationSnapshot || "")}</td>
                    <td>${escapeHtml(e.type || "")}</td>
                    <td>${escapeHtml(e.frequencySnapshot || "")}</td>
                    <td>${e.tempC ?? ""}</td>
                    <td>${e.secondsToStable ?? ""}</td>
                    <td>${e.flushed ? "Yes" : "No"}</td>
                    <td>${escapeHtml(e.notes || "")}</td>
                  </tr>
                `
                )
                .join("");

              return `
                <div style="margin-top: 14px;">
                  <div class="pill">Round</div>
                  <div class="small">
                    <strong>${escapeHtml(r.dateKey || "")} ${escapeHtml(r.time || "")}</strong>
                    • ${escapeHtml(r.initials || "")}
                    ${r.roundNotes ? ` • <span class="muted">${escapeHtml(r.roundNotes)}</span>` : ""}
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th>Outlet</th><th>Location</th><th>Type</th><th>Freq</th><th>Temp °C</th><th>Secs stable</th><th>Flushed</th><th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${entryRows || `<tr><td colspan="8" class="muted">No entries</td></tr>`}
                    </tbody>
                  </table>
                </div>
              `;
            })
            .join("")
        : `<div class="muted small">No water rounds in range.</div>`;

      const tagWater = tagChecks("water_");
      const tagWaterHtml = `
        <div class="small muted">Tag checks (${tagWater.length})</div>
        <table>
          <thead><tr><th>Date</th><th>Time</th><th>By</th><th>Outlet</th><th>Location</th><th>Temp °C</th><th>Result</th><th>Flushed</th><th>Run time (s)</th><th>Notes / issues</th><th>Recorded</th></tr></thead>
          <tbody>
            ${tagWater.length ? tagWater.map((c) => `<tr><td>${escapeHtml(dateOf(checkTime(c)))}</td><td>${escapeHtml(timeOf(checkTime(c)))}</td><td>${escapeHtml(checkPerson(c))}</td><td>${escapeHtml([c.assetCode, c.assetLabel].filter(Boolean).join(" "))}</td><td>${escapeHtml(c.location || "")}</td><td>${c.tempC ?? ""}</td><td>${escapeHtml(String(c.result || "").toUpperCase())}</td><td>${c.flushed === true ? "Yes" : c.flushed === false ? "No" : ""}</td><td>${c.countdown?.seconds ?? ""}</td><td>${escapeHtml(c.notes || "")}</td><td>${escapeHtml(recordedCell(c))}</td></tr>`).join("") : `<tr><td colspan="11" class="muted">No tag checks in range.</td></tr>`}
          </tbody>
        </table>
      `;

      sections.push(`
        <h2>Water Temperatures</h2>
        ${regHtml}
        ${tagWaterHtml}
        <div class="small muted">Earlier rounds, typed in before tag checks (${rows.length})</div>
        ${roundsHtml}
      `);
    }

    if (printSel.pat) {
      const rows = printPatSessions.filter((r) => inDateRange(r.testDate, from, to)).slice(0, 200);

      let regHtml = "";
      if (printSel.includeRegisters) {
        regHtml = `
          <div class="small muted">PAT Register (${printPatAssets.length})</div>
          <table>
            <thead><tr><th>Tag</th><th>Name</th><th>Location</th><th>Make/Model</th><th>Serial</th></tr></thead>
            <tbody>
              ${
                printPatAssets.length
                  ? printPatAssets
                      .map(
                        (a) => `
                        <tr>
                          <td>${escapeHtml(a.tag)}</td>
                          <td>${escapeHtml(a.name)}</td>
                          <td>${escapeHtml(a.location)}</td>
                          <td>${escapeHtml(a.makeModel)}</td>
                          <td>${escapeHtml(a.serialNumber)}</td>
                        </tr>
                      `
                      )
                      .join("")
                  : `<tr><td colspan="5" class="muted">None</td></tr>`
              }
            </tbody>
          </table>
        `;
      }

      const sessionsHtml = rows.length
        ? rows
            .map((s) => {
              const entries = Array.isArray(s.entries) ? s.entries : [];
              const entryRows = entries
                .map(
                  (e) => `
                  <tr>
                    <td>${escapeHtml(e.tagSnapshot || "")}</td>
                    <td>${escapeHtml(e.nameSnapshot || "")}</td>
                    <td>${escapeHtml(e.locationSnapshot || "")}</td>
                    <td>${escapeHtml(e.okToUse || "")}</td>
                    <td>${escapeHtml(e.plugFlexBodyOk || "")}</td>
                    <td>${escapeHtml(e.earthContinuity || "")}</td>
                    <td>${escapeHtml(e.insulationResistance || "")}</td>
                    <td>${escapeHtml(e.fuseRating || "")}</td>
                    <td>${escapeHtml(e.notes || "")}</td>
                  </tr>
                `
                )
                .join("");

              return `
                <div style="margin-top: 14px;">
                  <div class="pill">Session</div>
                  <div class="small">
                    <strong>${escapeHtml(s.testDate || "")}</strong>
                    • Tester: ${escapeHtml(s.testerName || "")}
                    ${s.certificateRef ? ` • Ref ${escapeHtml(s.certificateRef)}` : ""}
                    ${s.retestDate ? ` • Retest ${escapeHtml(s.retestDate)}` : ""}
                    ${s.testEquipmentUsed ? ` • Equipment ${escapeHtml(s.testEquipmentUsed)}` : ""}
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th>Tag</th><th>Name</th><th>Location</th><th>OK to use</th><th>Plug/Flex/Body</th><th>Earth</th><th>Insulation</th><th>Fuse</th><th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${entryRows || `<tr><td colspan="9" class="muted">No entries</td></tr>`}
                    </tbody>
                  </table>
                </div>
              `;
            })
            .join("")
        : `<div class="muted small">No PAT sessions in range.</div>`;

      sections.push(`
        <h2>PAT Testing</h2>
        ${regHtml}
        <div class="small muted">PAT sessions (${rows.length})</div>
        ${sessionsHtml}
      `);
    }

    if (printSel.cleaning) {
      const cleanRows = printCleaning
        .filter((r) => inDateRange(dayOf(r.cleanedAt?.toDate ? r.cleanedAt.toDate() : null), from, to))
        .slice(0, 300);
      sections.push(`
        <h2>Cleaning</h2>
        <div class="small muted">Cleaning records (${cleanRows.length})</div>
        <table>
          <thead><tr><th>Date</th><th>Time</th><th>Room</th><th>Cleaned by</th><th>Took</th><th>Notes / issues</th><th>Recorded</th></tr></thead>
          <tbody>
            ${cleanRows.length ? cleanRows.map((r) => { const d = r.cleanedAt?.toDate ? r.cleanedAt.toDate() : null; return `<tr><td>${escapeHtml(dateOf(d))}</td><td>${escapeHtml(timeOf(d))}</td><td>${escapeHtml(r.roomName || "")}</td><td>${escapeHtml(r.cleanedBy || "")}</td><td>${Number.isFinite(r.durationSeconds) ? Math.max(1, Math.round(r.durationSeconds / 60)) + " min" : ""}</td><td>${escapeHtml((r.issueReported ? "Issue: " : "") + (r.notes || ""))}</td><td>${escapeHtml(r.manualEntry ? "By hand" + (r.manualReason ? ": " + r.manualReason : "") : "Room tag")}</td></tr>`; }).join("") : `<tr><td colspan="7" class="muted">No cleaning records in range.</td></tr>`}
          </tbody>
        </table>
      `);
    }

    const bodyHtml = `
      <h1>Aurora Compliance Report</h1>
      <div class="meta">${escapeHtml(meta)}</div>
      ${sections.join("")}
      <div class="small muted" style="margin-top: 22px;">End of report.</div>
    `;

    return basePrintHtml({ title: "Compliance Report", bodyHtml });
  };

  // Reads every check in the chosen dates (not just what is on screen), then prints.
  const buildAndPrint = async () => {
    if (!printSel.fire && !printSel.water && !printSel.pat && !printSel.cleaning) {
      setPrintError("Choose at least one section to include.");
      return;
    }
    setPrintError("");
    setPrinting(true);
    try {
      const found = await getComplianceChecksBetween({ from: printFrom.trim(), to: printTo.trim(), siteId });
      openPrintWindow(buildReportHtml(found));
      setPrintOpen(false);
    } catch (error) {
      console.error("Compliance report: could not read the checks", error);
      setPrintError("Could not read the checks to print. Check your connection and try again.");
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Compliance</h1>
          <p className="text-sm text-slate-400">Fire • Water • Cleaning • Maintenance • PAT • Certificates • COSHH</p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {sites.options.length > 1 && (
            <label className="flex items-center gap-2 text-xs text-slate-300">
              Site
              <select value={siteId} onChange={(e) => sites.setSiteId(e.target.value)} aria-label="Show compliance for" className="rounded-full border border-white/10 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-100 outline-none [&>option]:bg-slate-900">
                <option value="">All sites</option>
                {sites.options.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
              </select>
            </label>
          )}
          <Button
            variant="outline"
            className="rounded-full border-white/10 bg-slate-900/40 text-xs text-slate-200 hover:bg-slate-900/60"
            onClick={() => { setPrintError(""); setPrintOpen(true); }}
          >
            <Printer className="mr-2 h-4 w-4" />
            Export / Print (PDF)
          </Button>
        </div>
      </div>

      <Card className="border border-white/10 bg-slate-900/70 backdrop-blur p-2 shadow-lg">
        <div className="flex flex-wrap gap-2">
          <TabButton active={tab === "overview"} onClick={() => setTab("overview")} icon={LayoutDashboard} label="Overview" />
          <TabButton active={tab === "history"} onClick={() => setTab("history")} icon={History} label="Checks history" />
          <TabButton active={tab === "cleaning"} onClick={() => setTab("cleaning")} icon={SprayCan} label="Cleaning" />
          <TabButton active={tab === "maintenance"} onClick={() => setTab("maintenance")} icon={Wrench} label="Maintenance" />
          <TabButton active={tab === "assets"} onClick={() => setTab("assets")} icon={QrCode} label="Assets and tags" />
          <TabButton active={tab === "pat"} onClick={() => setTab("pat")} icon={PlugZap} label="PAT Testing" />
          <TabButton active={tab === "certificates"} onClick={() => setTab("certificates")} icon={FileBadge} label="Certificates" />
          {canCoshh && <TabButton active={tab === "coshh"} onClick={() => setTab("coshh")} icon={FlaskConical} label="COSHH" />}
        </div>
      </Card>

      {tab === "overview" && <ComplianceOverview assets={siteAssets.filter((a) => a.active !== false)} checks={siteChecks} onGoTab={setTab} />}
      {tab === "history" && <ChecksHistory siteId={siteId} legacyFire={printFireChecks} legacyWater={printWaterRounds} />}
      {tab === "cleaning" && <CleaningPanel />}
      {tab === "maintenance" && <MaintenancePanel />}
      {tab === "assets" && <ComplianceQrEngine assets={siteAssets} checks={siteChecks} sites={sites} />}
      {tab === "pat" && <PatTestingTab siteId={siteId} newSiteId={sites.newSiteId} siteName={sites.nameOf?.(sites.newSiteId) || ""} />}
      {tab === "certificates" && <CertificatesRegister />}
      {tab === "coshh" && canCoshh && <CoshhRegister />}

      {/* PRINT MODAL */}
      {printOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900/95 p-5 shadow-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <div className="flex items-start justify-between">
              <h3 className="text-sm font-semibold text-slate-100">Export / Print compliance report</h3>
              <button className="text-slate-400 hover:text-slate-200" onClick={() => setPrintOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-3 text-xs text-slate-400">
              Choose what to include, then print or save as a PDF. The report covers {siteId ? sites.nameOf(siteId) : "all sites"}.
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-slate-300">From (optional)</label>
                <Input
                  type="date"
                  value={printFrom}
                  max={printTo || undefined}
                  onChange={(e) => setPrintFrom(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-slate-300">To (optional)</label>
                <Input
                  type="date"
                  value={printTo}
                  min={printFrom || undefined}
                  onChange={(e) => setPrintTo(e.target.value)}
                />
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/30 px-3 py-2">
                <span className="text-sm text-slate-100">Include Fire Checks</span>
                <input
                  type="checkbox"
                  checked={!!printSel.fire}
                  onChange={(e) => setPrintSel((p) => ({ ...p, fire: e.target.checked }))}
                />
              </label>

              <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/30 px-3 py-2">
                <span className="text-sm text-slate-100">Include Water Temps</span>
                <input
                  type="checkbox"
                  checked={!!printSel.water}
                  onChange={(e) => setPrintSel((p) => ({ ...p, water: e.target.checked }))}
                />
              </label>

              <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/30 px-3 py-2">
                <span className="text-sm text-slate-100">Include Cleaning</span>
                <input
                  type="checkbox"
                  checked={!!printSel.cleaning}
                  onChange={(e) => setPrintSel((p) => ({ ...p, cleaning: e.target.checked }))}
                />
              </label>

              <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/30 px-3 py-2">
                <span className="text-sm text-slate-100">Include PAT Testing</span>
                <input
                  type="checkbox"
                  checked={!!printSel.pat}
                  onChange={(e) => setPrintSel((p) => ({ ...p, pat: e.target.checked }))}
                />
              </label>

              <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/30 px-3 py-2">
                <span className="text-sm text-slate-100">Include registers (call points / outlets / PAT register)</span>
                <input
                  type="checkbox"
                  checked={!!printSel.includeRegisters}
                  onChange={(e) => setPrintSel((p) => ({ ...p, includeRegisters: e.target.checked }))}
                />
              </label>
            </div>

            {printError && <p className="mt-3 text-sm text-rose-300" role="alert">{printError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                className="rounded-full border-white/10 bg-slate-900/40 text-xs text-slate-200 hover:bg-slate-900/60"
                onClick={() => setPrintOpen(false)}
              >
                Cancel
              </Button>

              <Button
                className="rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 text-slate-950 text-xs"
                disabled={printing}
                onClick={buildAndPrint}
              >
                {printing ? "Reading the records…" : "Generate PDF / Print"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- PAT TESTING (your existing PAT code preserved) ----------
function PatTestingTab({ siteId = "", newSiteId = "main_branch", siteName = "" }) {
  const [subTab, setSubTab] = useState("register"); // register | history | session

  return (
    <div className="space-y-6">
      <Card className="border border-white/10 bg-slate-900/60 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-slate-100 font-semibold">PAT Testing</div>
            <div className="text-xs text-slate-400 mt-1">
              The register shows when each appliance is next due. The caretaker tests them on his phone, one at a time.
            </div>
          </div>
          <div className="flex gap-2">
            <TabButton active={subTab === "register"} onClick={() => setSubTab("register")} icon={ClipboardList} label="Register" />
            <TabButton active={subTab === "history"} onClick={() => setSubTab("history")} icon={History} label="Test history" />
            <TabButton active={subTab === "session"} onClick={() => setSubTab("session")} icon={FileSignature} label="Paper session" />
          </div>
        </div>
      </Card>

      {subTab === "register" && <PatRegisterPanel siteId={siteId} newSiteId={newSiteId} siteName={siteName} />}
      {subTab === "history" && <PatRegisterPanel view="history" siteId={siteId} newSiteId={newSiteId} siteName={siteName} />}
      {subTab === "session" && <PatSession siteId={siteId} newSiteId={newSiteId} />}
    </div>
  );
}

function PatSession({ siteId, newSiteId }) {
  const inSite = (row) => !siteId || String(row.siteId || "").trim() === siteId;
  const [assets, setAssets] = useState([]);
  const [recent, setRecent] = useState([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const [header, setHeader] = useState({
    testDate: todayKey(),
    testerName: "",
    certificateRef: "",
    clientLandlord: "",
    testEquipmentUsed: "",
    retestDate: "",
  });

  const [results, setResults] = useState({});
  const [include, setInclude] = useState({});

  useEffect(() => {
    const qy = query(collection(db, "pat_assets"));
    return onSnapshot(
      qy,
      (snap) => {
        const rows = snap.docs.map((d) => {
          const data = d.data() || {};
          return {
            id: d.id,
            siteId: String(data.siteId || "").trim(),
            active: data.active !== false,
            tag: String(data.tag || "").trim(),
            name: String(data.name || "").trim(),
            makeModel: String(data.makeModel || "").trim(),
            location: String(data.location || "").trim(),
            serialNumber: String(data.serialNumber || "").trim(),
          };
        });

        const filtered = rows
          .filter((r) => r.active && inSite(r))
          .sort((a, b) => a.tag.localeCompare(b.tag));

        setAssets(filtered);

        setResults((prev) => {
          const next = { ...prev };
          for (const a of filtered) {
            if (!next[a.id]) {
              next[a.id] = {
                fuseRating: "",
                insulationResistance: "Pass",
                earthContinuity: "Pass",
                plugFlexBodyOk: "Yes",
                okToUse: "Yes",
                notes: "",
              };
            }
          }
          return next;
        });

        setInclude((prev) => {
          const next = { ...prev };
          for (const a of filtered) {
            if (typeof next[a.id] !== "boolean") next[a.id] = true;
          }
          return next;
        });
      },
      (e) => console.error("pat_assets subscribe error:", e)
    );
  }, [siteId]);

  useEffect(() => {
    const qy = query(collection(db, "pat_test_sessions"), orderBy("createdAt", "desc"), limit(20));
    return onSnapshot(
      qy,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setRecent(rows.filter(inSite));
      },
      (e) => console.error("pat_test_sessions subscribe error:", e)
    );
  }, [siteId]);

  const setAssetResult = (assetId, patch) => {
    setResults((prev) => ({
      ...prev,
      [assetId]: { ...(prev[assetId] || {}), ...patch },
    }));
  };

  const includeAll = () => {
    setInclude((prev) => {
      const next = { ...prev };
      for (const a of assets) next[a.id] = true;
      return next;
    });
  };

  const includeNone = () => {
    setInclude((prev) => {
      const next = { ...prev };
      for (const a of assets) next[a.id] = false;
      return next;
    });
  };

  const saveSession = async () => {
    setMsg("");
    if (!header.testerName.trim()) return setMsg("Please enter tester name/initials.");

    const chosen = assets.filter((a) => include[a.id] === true);
    if (chosen.length === 0) return setMsg("No items included. Tick at least one item.");

    setSaving(true);
    try {
      const entries = chosen.map((a) => {
        const r = results[a.id] || {};
        return {
          assetId: a.id,
          tagSnapshot: a.tag,
          nameSnapshot: a.name,
          locationSnapshot: a.location,
          makeModelSnapshot: a.makeModel,
          serialSnapshot: a.serialNumber,

          fuseRating: String(r.fuseRating || "").trim(),
          insulationResistance: String(r.insulationResistance || "").trim(),
          earthContinuity: String(r.earthContinuity || "").trim(),
          plugFlexBodyOk: String(r.plugFlexBodyOk || "").trim(),
          okToUse: String(r.okToUse || "").trim(),
          notes: String(r.notes || "").trim(),
        };
      });

      await addDocResendSafe(collection(db, "pat_test_sessions"), {
        siteId: newSiteId,
        testDate: header.testDate,
        retestDate: header.retestDate.trim(),
        testerName: header.testerName.trim(),
        certificateRef: header.certificateRef.trim(),
        clientLandlord: header.clientLandlord.trim(),
        testEquipmentUsed: header.testEquipmentUsed.trim(),
        entries,
        createdAt: serverTimestamp(),
      });

      setMsg(`Saved PAT session (${entries.length} item${entries.length === 1 ? "" : "s"}).`);
    } catch (e) {
      console.error("Save PAT session error:", e);
      setMsg("Failed to save PAT session (check rules).");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border border-white/10 bg-slate-900/60 p-4">
        <div className="text-slate-100 font-semibold">Record a session from paper</div>
        <div className="text-xs text-slate-400 mt-1">For a test done by someone else, or a paper certificate. Tests the caretaker does on his phone do not need this.</div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <label className="text-xs text-slate-300">Test date</label>
            <Input
              type="date"
              value={header.testDate}
              onChange={(e) => setHeader((p) => ({ ...p, testDate: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs text-slate-300">Tester</label>
            <Input value={header.testerName} onChange={(e) => setHeader((p) => ({ ...p, testerName: e.target.value }))} placeholder="e.g. Gordon Ellis / GC" />
          </div>
          <div>
            <label className="text-xs text-slate-300">Certificate ref (opt)</label>
            <Input value={header.certificateRef} onChange={(e) => setHeader((p) => ({ ...p, certificateRef: e.target.value }))} placeholder="Ref #" />
          </div>

          <div className="sm:col-span-2">
            <label className="text-xs text-slate-300">Client/Landlord (opt)</label>
            <Input value={header.clientLandlord} onChange={(e) => setHeader((p) => ({ ...p, clientLandlord: e.target.value }))} placeholder="Clarence Medical Centre" />
          </div>
          <div>
            <label className="text-xs text-slate-300">Test equipment used (opt)</label>
            <Input value={header.testEquipmentUsed} onChange={(e) => setHeader((p) => ({ ...p, testEquipmentUsed: e.target.value }))} placeholder="BAT PAT" />
          </div>

          <div>
            <label className="text-xs text-slate-300">Retest date (opt)</label>
            <Input
              type="date"
              value={header.retestDate}
              onChange={(e) => setHeader((p) => ({ ...p, retestDate: e.target.value }))}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-slate-400">
            Included items: {assets.filter((a) => include[a.id] === true).length} / {assets.length}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="rounded-full border-white/10 bg-slate-900/40 text-xs text-slate-200 hover:bg-slate-900/60"
              onClick={includeAll}
            >
              Include all
            </Button>
            <Button
              variant="outline"
              className="rounded-full border-white/10 bg-slate-900/40 text-xs text-slate-200 hover:bg-slate-900/60"
              onClick={includeNone}
            >
              Include none
            </Button>
          </div>
        </div>

        {msg && (
          <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/30 px-3 py-2 text-xs text-slate-200">
            {msg}
          </div>
        )}

        <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/30 overflow-hidden">
          <div className="border-b border-white/10 px-4 py-2 text-xs text-slate-300">Items ({assets.length})</div>

          {assets.length === 0 ? (
            <div className="px-4 py-10 text-center text-xs text-slate-400">No assets found. Add items in Register.</div>
          ) : (
            <div className="divide-y divide-white/10">
              {assets.map((a) => {
                const r = results[a.id] || {};
                const isIncluded = include[a.id] === true;

                return (
                  <div key={a.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 text-xs text-slate-200">
                          <input
                            type="checkbox"
                            checked={isIncluded}
                            onChange={(e) => setInclude((p) => ({ ...p, [a.id]: e.target.checked }))}
                          />
                          Include
                        </label>

                        <div>
                          <div className={`text-sm font-medium ${isIncluded ? "text-slate-100" : "text-slate-500"}`}>
                            {a.tag} • {a.name}
                          </div>
                          <div className={`text-xs mt-0.5 ${isIncluded ? "text-slate-400" : "text-slate-600"}`}>
                            {(a.location || "—")}
                            {a.makeModel ? ` • ${a.makeModel}` : ""}
                            {a.serialNumber ? ` • SN ${a.serialNumber}` : ""}
                          </div>
                        </div>
                      </div>

                      <div className={`flex flex-wrap gap-2 ${isIncluded ? "" : "opacity-40 pointer-events-none"}`}>
                        <PillSelect label="OK to use?" value={r.okToUse || "Yes"} onChange={(v) => setAssetResult(a.id, { okToUse: v })} options={["Yes", "No"]} />
                        <PillSelect
                          label="Plug/flex/body OK?"
                          value={r.plugFlexBodyOk || "Yes"}
                          onChange={(v) => setAssetResult(a.id, { plugFlexBodyOk: v })}
                          options={["Yes", "No"]}
                        />
                        <PillSelect
                          label="Earth continuity"
                          value={r.earthContinuity || "Pass"}
                          onChange={(v) => setAssetResult(a.id, { earthContinuity: v })}
                          options={["Pass", "Fail", "N/A"]}
                        />
                        <PillSelect
                          label="Insulation"
                          value={r.insulationResistance || "Pass"}
                          onChange={(v) => setAssetResult(a.id, { insulationResistance: v })}
                          options={["Pass", "Fail", "N/A", ">20MΩ"]}
                        />
                      </div>
                    </div>

                    <div className={`mt-3 grid gap-3 sm:grid-cols-3 ${isIncluded ? "" : "opacity-40 pointer-events-none"}`}>
                      <div>
                        <label className="text-xs text-slate-300">Fuse rating (opt)</label>
                        <Input value={r.fuseRating || ""} onChange={(e) => setAssetResult(a.id, { fuseRating: e.target.value })} placeholder="e.g. 3A / 5A / 13A" />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="text-xs text-slate-300">Notes (opt)</label>
                        <Input value={r.notes || ""} onChange={(e) => setAssetResult(a.id, { notes: e.target.value })} placeholder="Any faults/actions" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <Button
            className="rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 text-slate-950 text-xs"
            onClick={saveSession}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save PAT session"}
          </Button>
        </div>
      </Card>

      <Card className="border border-white/10 bg-slate-900/60">
        <div className="border-b border-white/10 px-4 py-3">
          <div className="text-slate-100 font-semibold">Recent PAT sessions</div>
          <div className="text-xs text-slate-400 mt-1">Last 20 sessions (Main Branch).</div>
        </div>

        <div className="divide-y divide-white/10">
          {recent.length === 0 ? (
            <div className="px-4 py-10 text-center text-xs text-slate-400">No PAT sessions yet.</div>
          ) : (
            recent.map((s) => (
              <div key={s.id} className="px-4 py-3 flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-slate-100">
                    {s.testDate || "—"} • {s.testerName || "—"}
                    {s.certificateRef ? <span className="text-slate-400"> • Ref {s.certificateRef}</span> : null}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Items: {Array.isArray(s.entries) ? s.entries.length : 0}
                    {s.testEquipmentUsed ? ` • ${s.testEquipmentUsed}` : ""}
                    {s.retestDate ? ` • Retest ${s.retestDate}` : ""}
                  </div>
                </div>
                <div className="rounded-full border border-white/10 bg-slate-950/30 px-3 py-1 text-xs text-slate-200">PAT</div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

function PillSelect({ label, value, onChange, options }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/30 px-3 py-2">
      <div className="text-[0.7rem] text-slate-400">{label}</div>
      <select className={SELECT_CLASS} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}
