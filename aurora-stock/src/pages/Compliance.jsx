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
  Mail,
} from "lucide-react";
import { db } from "../lib/firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";

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

function openPrintWindow(html) {
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) {
    alert("Pop-up blocked. Please allow pop-ups for printing.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  // Give browser a tick to render before print
  setTimeout(() => {
    w.print();
  }, 250);
}

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

function isValidEmail(email) {
  const s = String(email || "").trim();
  if (!s) return false;
  // Simple sanity check (good enough for UI)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

// ---------- Page ----------
export default function Compliance() {
  const SITE_ID = "main_branch";
  const [tab, setTab] = useState("fire"); // fire | water | pat

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
  const [printEmail, setPrintEmail] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);

  const [printSel, setPrintSel] = useState({
    fire: true,
    water: true,
    pat: true,
    includeRegisters: true, // include call points/outlets/assets lists
  });

  // subscriptions for printing
  useEffect(() => {
    const unsub1 = onSnapshot(
      query(collection(db, "fire_weekly_checks"), orderBy("createdAt", "desc"), limit(200)),
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setPrintFireChecks(rows.filter((r) => String(r.siteId || "").trim() === SITE_ID));
      }
    );

    const unsub2 = onSnapshot(
      query(collection(db, "pat_test_sessions"), orderBy("createdAt", "desc"), limit(200)),
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setPrintPatSessions(rows.filter((r) => String(r.siteId || "").trim() === SITE_ID));
      }
    );

    const unsub3 = onSnapshot(
      query(collection(db, "water_temp_rounds"), orderBy("createdAt", "desc"), limit(200)),
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const filtered = rows.filter((r) => String(r.siteId || r.site || "").trim() === SITE_ID);
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
          .filter((r) => r.active && r.siteId === SITE_ID)
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
          .filter((r) => r.active && r.siteId === SITE_ID)
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
          .filter((r) => r.active && r.siteId === SITE_ID)
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
  }, []);

  const buildReportHtml = () => {
    const from = printFrom.trim() || "";
    const to = printTo.trim() || "";
    const now = new Date();
    const meta =
      `Site: Main Branch (main_branch) • Generated: ${now.toLocaleString()}` +
      (from || to ? ` • Date filter: ${from || "…"} to ${to || "…"} ` : "");

    const sections = [];

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

      sections.push(`
        <h2>Fire Checks</h2>
        ${regHtml}
        <div class="small muted">Recent fire checks (${rows.length})</div>
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

      sections.push(`
        <h2>Water Temperatures</h2>
        ${regHtml}
        <div class="small muted">Recent rounds (${rows.length})</div>
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

    const bodyHtml = `
      <h1>Aurora Compliance Report</h1>
      <div class="meta">${escapeHtml(meta)}</div>
      ${sections.join("")}
      <div class="small muted" style="margin-top: 22px;">End of report.</div>
    `;

    return basePrintHtml({ title: "Aurora Compliance Report", bodyHtml });
  };

  const buildAndPrint = () => {
    const html = buildReportHtml();
    openPrintWindow(html);
  };

  const sendReportEmail = async () => {
    if (!printSel.fire && !printSel.water && !printSel.pat) {
      alert("Please choose at least one section to include.");
      return;
    }
    const toEmail = printEmail.trim();
    if (!isValidEmail(toEmail)) {
      alert("Please enter a valid email address.");
      return;
    }

    setSendingEmail(true);
    try {
      const html = buildReportHtml();

      const functions = getFunctions();
      const fn = httpsCallable(functions, "sendComplianceReport");

      await fn({
        siteId: SITE_ID,
        emailTo: toEmail,
        from: printFrom.trim() || "",
        to: printTo.trim() || "",
        selection: printSel,
        html,
      });

      alert("Email sent.");
      setPrintOpen(false);
      setPrintEmail("");
    } catch (e) {
      console.error("sendComplianceReport error:", e);
      alert("Could not send email. Check Cloud Function logs / configuration.");
    } finally {
      setSendingEmail(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Compliance</h1>
          <p className="text-sm text-slate-400">Water Temps • Fire Checks • PAT</p>
        </div>

        <Button
          variant="outline"
          className="rounded-full border-white/10 bg-slate-900/40 text-xs text-slate-200 hover:bg-slate-900/60"
          onClick={() => setPrintOpen(true)}
        >
          <Printer className="mr-2 h-4 w-4" />
          Export / Print (PDF)
        </Button>
      </div>

      <Card className="border border-white/10 bg-slate-900/70 backdrop-blur p-2 shadow-lg">
        <div className="flex flex-wrap gap-2">
          <TabButton active={tab === "fire"} onClick={() => setTab("fire")} icon={Flame} label="Fire Checks" />
          <TabButton active={tab === "water"} onClick={() => setTab("water")} icon={Droplets} label="Water Temps" />
          <TabButton active={tab === "pat"} onClick={() => setTab("pat")} icon={PlugZap} label="PAT Testing" />
        </div>
      </Card>

      {tab === "fire" && <FireChecksTab />}
      {tab === "water" && <WaterTempsTab />}
      {tab === "pat" && <PatTestingTab />}

      {/* PRINT MODAL */}
      {printOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900/95 p-5 shadow-2xl">
            <div className="flex items-start justify-between">
              <h3 className="text-sm font-semibold text-slate-100">Export / Print compliance report</h3>
              <button className="text-slate-400 hover:text-slate-200" onClick={() => setPrintOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-3 text-xs text-slate-400">
              Choose what to include, then print/save as PDF — or email the report.
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

            <div className="mt-3">
              <label className="text-xs text-slate-300">Email to (optional)</label>
              <Input
                value={printEmail}
                onChange={(e) => setPrintEmail(e.target.value)}
                placeholder="name@nhs.net"
                inputMode="email"
              />
              <div className="mt-1 text-[0.7rem] text-slate-500">
                Email sends a PDF attachment using a Firebase Cloud Function.
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

            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                className="rounded-full border-white/10 bg-slate-900/40 text-xs text-slate-200 hover:bg-slate-900/60"
                onClick={() => setPrintOpen(false)}
              >
                Cancel
              </Button>

              <Button
                variant="outline"
                className="rounded-full border-white/10 bg-slate-900/40 text-xs text-slate-200 hover:bg-slate-900/60"
                onClick={sendReportEmail}
                disabled={sendingEmail}
                title="Send PDF to email (requires Cloud Function configured)"
              >
                <Mail className="mr-2 h-4 w-4" />
                {sendingEmail ? "Sending..." : "Send to email"}
              </Button>

              <Button
                className="rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 text-slate-950 text-xs"
                onClick={() => {
                  if (!printSel.fire && !printSel.water && !printSel.pat) {
                    alert("Please choose at least one section to include.");
                    return;
                  }
                  setPrintOpen(false);
                  buildAndPrint();
                }}
              >
                Generate PDF / Print
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Fire Checks Tab (unchanged logic) ----------
function FireChecksTab() {
  const SITE_ID = "main_branch";

  const [callPoints, setCallPoints] = useState([]);
  const [callPointId, setCallPointId] = useState("");
  const [cpModalOpen, setCpModalOpen] = useState(false);
  const [cpErr, setCpErr] = useState("");
  const [cpForm, setCpForm] = useState({ label: "", pointNumber: "" });

  const [initials, setInitials] = useState("");
  const [dateKey, setDateKey] = useState(todayKey());
  const [time, setTime] = useState(nowHHmm());
  const [notes, setNotes] = useState("");
  const [firePanelChecked, setFirePanelChecked] = useState(true);

  const [checks, setChecks] = useState(() =>
    FIRE_CHECKS.reduce((acc, c) => {
      acc[c.key] = true;
      return acc;
    }, {})
  );

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [recent, setRecent] = useState([]);

  // Load call points
  useEffect(() => {
    const qy = query(collection(db, "fire_call_points"));
    return onSnapshot(
      qy,
      (snap) => {
        const rows = snap.docs.map((d) => {
          const data = d.data() || {};
          const siteId = String(data.siteId ?? data.site ?? "").trim();
          const label = String(data.label || "").trim();
          const pointNumber = String(data.pointNumber || "").trim();
          const displayName = String(data.displayName || makeDisplayName(label, pointNumber)).trim();
          const active = data.active !== false;
          return { id: d.id, siteId, label, pointNumber, displayName, active };
        });

        const filtered = rows
          .filter((r) => r.active && r.siteId === SITE_ID)
          .sort((a, b) => a.displayName.localeCompare(b.displayName));

        setCallPoints(filtered);
        setCallPointId((prev) => (prev && filtered.some((c) => c.id === prev) ? prev : filtered[0]?.id || ""));
      },
      (err) => console.error("fire_call_points subscribe error:", err)
    );
  }, []);

  // Load recent checks (no index needed)
  useEffect(() => {
    const qy = query(collection(db, "fire_weekly_checks"), orderBy("createdAt", "desc"), limit(50));
    return onSnapshot(
      qy,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const filtered = rows.filter((r) => String(r.siteId || "").trim() === SITE_ID).slice(0, 25);
        setRecent(filtered);
      },
      (err) => console.error("fire_weekly_checks subscribe error:", err)
    );
  }, []);

  const status = useMemo(() => {
    const allChecklistTrue = FIRE_CHECKS.every((c) => checks[c.key] === true);
    return allChecklistTrue && firePanelChecked === true ? "pass" : "fail";
  }, [checks, firePanelChecked]);

  const toggle = (key) => setChecks((p) => ({ ...p, [key]: !p[key] }));

  const resetForm = () => {
    setInitials("");
    setNotes("");
    setDateKey(todayKey());
    setTime(nowHHmm());
    setFirePanelChecked(true);
    setChecks(FIRE_CHECKS.reduce((acc, c) => ((acc[c.key] = true), acc), {}));
    setMsg("");
  };

  const getCallPointDisplayForRow = (r) => {
    const snapName = typeof r.callPointNameSnapshot === "string" ? r.callPointNameSnapshot.trim() : "";
    if (snapName) return snapName;
    const fromLookup = callPoints.find((cp) => cp.id === r.callPointId)?.displayName;
    if (fromLookup) return fromLookup;
    if (r.callPointId) return "Call point";
    return "";
  };

  const saveCheck = async () => {
    setMsg("");
    if (!initials.trim()) return setMsg("Please enter initials.");
    if (!callPointId) return setMsg("Please select the call point tested.");

    const cp = callPoints.find((c) => c.id === callPointId);
    const callPointNameSnapshot = (cp?.displayName && String(cp.displayName).trim()) || "Call point";

    setSaving(true);
    try {
      await addDoc(collection(db, "fire_weekly_checks"), {
        siteId: SITE_ID,
        dateKey,
        time,
        initials: initials.trim().toUpperCase(),
        callPointId,
        callPointNameSnapshot,
        firePanelChecked: !!firePanelChecked,
        checks: { ...checks },
        notes: notes.trim(),
        status,
        createdAt: serverTimestamp(),
      });
      setMsg(status === "pass" ? "Saved (PASS)." : "Saved (FAIL).");
      resetForm();
    } catch (e) {
      console.error("Save fire check error:", e);
      setMsg("Failed to save. Check Firestore rules/permissions.");
    } finally {
      setSaving(false);
    }
  };

  const addCallPoint = async () => {
    setCpErr("");
    const label = cpForm.label.trim();
    const pointNumber = cpForm.pointNumber.trim();
    if (!label) return setCpErr("Floor/area label is required (e.g. Top floor).");
    if (!pointNumber) return setCpErr("Point number is required (e.g. 1).");
    const displayName = makeDisplayName(label, pointNumber);

    try {
      const docRef = await addDoc(collection(db, "fire_call_points"), {
        siteId: SITE_ID,
        label,
        pointNumber,
        displayName,
        active: true,
        createdAt: serverTimestamp(),
      });
      setCpForm({ label: "", pointNumber: "" });
      setCallPointId(docRef.id);
    } catch (e) {
      console.error("Add call point error:", e);
      setCpErr("Failed to add call point.");
    }
  };

  const deleteCallPoint = async (id, name) => {
    if (!window.confirm(`Delete call point "${name}"?`)) return;
    try {
      await deleteDoc(doc(db, "fire_call_points", id));
    } catch (e) {
      console.error("Delete call point error:", e);
      alert("Could not delete call point.");
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border border-white/10 bg-slate-900/60 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-slate-100 font-semibold">Weekly Fire Alarm Test & Checks</div>
            <div className="text-xs text-slate-400 mt-1">
              Select call point tested, confirm panel, complete checklist.
            </div>
          </div>

          <div
            className={
              status === "pass"
                ? "inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200"
                : "inline-flex items-center gap-2 rounded-full border border-rose-500/20 bg-rose-500/10 px-3 py-1 text-xs text-rose-200"
            }
          >
            {status === "pass" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {status === "pass" ? "PASS" : "FAIL"}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <div>
            <label className="text-xs text-slate-300 inline-flex items-center gap-2">
              <Calendar className="h-4 w-4 text-slate-400" /> Date
            </label>
            <Input type="date" value={dateKey} onChange={(e) => setDateKey(e.target.value)} />
          </div>

          <div>
            <label className="text-xs text-slate-300 inline-flex items-center gap-2">
              <Clock className="h-4 w-4 text-slate-400" /> Time
            </label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>

          <div>
            <label className="text-xs text-slate-300">Initials</label>
            <Input value={initials} onChange={(e) => setInitials(e.target.value)} placeholder="e.g. GC" />
          </div>

          <div className="flex items-end justify-end">
            <Button
              variant="outline"
              className="rounded-full border-white/10 bg-slate-900/40 text-xs text-slate-200 hover:bg-slate-900/60"
              onClick={() => setCpModalOpen(true)}
            >
              <Settings2 className="mr-1.5 h-4 w-4" />
              Manage call points
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs text-slate-300">Call point tested</label>
            <div className="mt-1 rounded-2xl border border-white/10 bg-slate-950/30 px-3 py-2">
              <select className={SELECT_CLASS} value={callPointId} onChange={(e) => setCallPointId(e.target.value)}>
                {callPoints.length === 0 ? (
                  <option value="">No call points found — add one</option>
                ) : (
                  callPoints.map((cp) => (
                    <option key={cp.id} value={cp.id}>
                      {cp.displayName}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-300">Main fire panel/board</label>
            <label className="mt-1 flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/30 px-3 py-2">
              <span className="text-sm text-slate-100">Fire panel active & operational</span>
              <input type="checkbox" checked={!!firePanelChecked} onChange={(e) => setFirePanelChecked(e.target.checked)} />
            </label>
          </div>
        </div>

        <div className="mt-4 grid gap-2">
          {FIRE_CHECKS.map((c) => (
            <label key={c.key} className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/30 px-3 py-2">
              <span className="text-sm text-slate-100">{c.label}</span>
              <input type="checkbox" checked={!!checks[c.key]} onChange={() => toggle(c.key)} />
            </label>
          ))}
        </div>

        <div className="mt-4">
          <label className="text-xs text-slate-300">Notes (optional)</label>
          <textarea
            className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="If faults/issues, record here."
          />
        </div>

        {msg && (
          <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/30 px-3 py-2 text-xs text-slate-200">
            {msg}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="outline"
            className="rounded-full border-white/10 bg-slate-900/40 text-xs text-slate-200 hover:bg-slate-900/60"
            onClick={resetForm}
            disabled={saving}
          >
            Reset
          </Button>
          <Button
            className="rounded-full bg-gradient-to-r from-rose-400 to-amber-300 text-slate-950 text-xs"
            onClick={saveCheck}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save weekly check"}
          </Button>
        </div>
      </Card>

      <Card className="border border-white/10 bg-slate-900/60">
        <div className="border-b border-white/10 px-4 py-3">
          <div className="text-slate-100 font-semibold">Recent checks</div>
          <div className="text-xs text-slate-400 mt-1">Last 25 entries for Main Branch.</div>
        </div>

        <div className="divide-y divide-white/10">
          {recent.length === 0 ? (
            <div className="px-4 py-10 text-center text-xs text-slate-400">No fire checks recorded yet.</div>
          ) : (
            recent.map((r) => {
              const cpName = getCallPointDisplayForRow(r);
              return (
                <div key={r.id} className="px-4 py-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-slate-100">
                      {r.dateKey} {r.time} • {r.initials || "—"}
                      {cpName ? <span className="text-slate-400"> • {cpName}</span> : null}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">{r.notes ? r.notes : "No notes"}</div>
                  </div>

                  <div
                    className={
                      r.status === "pass"
                        ? "rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200"
                        : "rounded-full border border-rose-500/20 bg-rose-500/10 px-3 py-1 text-xs text-rose-200"
                    }
                  >
                    {String(r.status || "pass").toUpperCase()}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>

      {cpModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900/95 p-5 shadow-2xl">
            <div className="flex items-start justify-between">
              <h3 className="text-sm font-semibold text-slate-100">Manage call points</h3>
              <button className="text-slate-400 hover:text-slate-200" onClick={() => { setCpErr(""); setCpModalOpen(false); }}>
                ✕
              </button>
            </div>

            {cpErr && (
              <div className="mt-3 rounded-xl bg-rose-500/10 border border-rose-500/20 px-3 py-2 text-xs text-rose-200">
                {cpErr}
              </div>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-1">
                <label className="text-xs text-slate-300">Floor/area</label>
                <Input value={cpForm.label} onChange={(e) => setCpForm((p) => ({ ...p, label: e.target.value }))} placeholder="Top floor" />
              </div>
              <div className="sm:col-span-1">
                <label className="text-xs text-slate-300">Point #</label>
                <Input value={cpForm.pointNumber} onChange={(e) => setCpForm((p) => ({ ...p, pointNumber: e.target.value }))} placeholder="1" />
              </div>
              <div className="sm:col-span-1 flex items-end">
                <Button className="w-full rounded-full bg-emerald-400 text-slate-950 hover:bg-emerald-300 text-xs" onClick={addCallPoint}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  Add
                </Button>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/30">
              <div className="border-b border-white/10 px-4 py-2 text-xs text-slate-300">Existing call points</div>
              <div className="divide-y divide-white/10">
                {callPoints.length === 0 ? (
                  <div className="px-4 py-8 text-center text-xs text-slate-400">No call points yet.</div>
                ) : (
                  callPoints.map((cp) => (
                    <div key={cp.id} className="px-4 py-3 flex items-center justify-between">
                      <div className="text-sm text-slate-100">{cp.displayName}</div>
                      <Button
                        variant="outline"
                        className="rounded-full border-white/10 bg-slate-900/40 text-xs text-rose-300 hover:bg-slate-900/60"
                        onClick={() => deleteCallPoint(cp.id, cp.displayName)}
                      >
                        <Trash2 className="mr-1.5 h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <Button
                variant="outline"
                className="rounded-full border-white/10 bg-slate-900/40 text-xs text-slate-200 hover:bg-slate-900/60"
                onClick={() => { setCpErr(""); setCpModalOpen(false); }}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- WATER TEMPS TAB (moved into Compliance, uses siteId) ----------
function WaterTempsTab() {
  const SITE_ID = "main_branch";

  const [outlets, setOutlets] = useState([]);
  const [include, setInclude] = useState({});
  const [results, setResults] = useState({});

  const [initials, setInitials] = useState("");
  const [dateKey, setDateKey] = useState(todayKey());
  const [time, setTime] = useState(nowHHmm());
  const [notes, setNotes] = useState("");

  const [freqFilter, setFreqFilter] = useState("all");

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const [recent, setRecent] = useState([]);

  // manage outlets modal
  const [modalOpen, setModalOpen] = useState(false);
  const [oErr, setOErr] = useState("");
  const [oForm, setOForm] = useState({
    name: "",
    location: "",
    type: "hot",
    frequency: "weekly",
    order: "",
  });

  // load outlets (siteId only)
  useEffect(() => {
    const qy = query(collection(db, "water_outlets"));
    return onSnapshot(
      qy,
      (snap) => {
        const rows = snap.docs.map((d) => {
          const data = d.data() || {};
          const siteId = String(data.siteId || "").trim(); // ✅ siteId only
          const active = data.active !== false;

          return {
            id: d.id,
            siteId,
            active,
            name: String(data.name || "").trim(),
            location: String(data.location || "").trim(),
            type: String(data.type || "").trim(), // hot/cold
            frequency: String(data.frequency || "").trim(),
            order: typeof data.order === "number" ? data.order : null,
          };
        });

        const filtered = rows
          .filter((r) => r.active && r.siteId === SITE_ID)
          .sort((a, b) => {
            const ao = a.order ?? 9999;
            const bo = b.order ?? 9999;
            if (ao !== bo) return ao - bo;
            return outletDisplay(a).localeCompare(outletDisplay(b));
          });

        setOutlets(filtered);

        // defaults
        setInclude((prev) => {
          const next = { ...prev };
          for (const o of filtered) {
            if (typeof next[o.id] !== "boolean") next[o.id] = true;
          }
          return next;
        });

        setResults((prev) => {
          const next = { ...prev };
          for (const o of filtered) {
            if (!next[o.id]) {
              next[o.id] = { tempC: "", secondsToStable: "", flushed: false, notes: "" };
            }
          }
          return next;
        });
      },
      (e) => console.error("water_outlets subscribe error:", e)
    );
  }, []);

  // load recent rounds
  useEffect(() => {
    const qy = query(collection(db, "water_temp_rounds"), orderBy("createdAt", "desc"), limit(25));
    return onSnapshot(
      qy,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        // allow old "site" rounds too just in case
        const filtered = rows.filter((r) => String(r.siteId || r.site || "").trim() === SITE_ID);
        setRecent(filtered);
      },
      (e) => console.error("water_temp_rounds subscribe error:", e)
    );
  }, []);

  const visibleOutlets = useMemo(() => {
    if (freqFilter === "all") return outlets;
    return outlets.filter((o) => String(o.frequency || "").toLowerCase() === freqFilter);
  }, [outlets, freqFilter]);

  const includeAllVisible = () => {
    setInclude((prev) => {
      const next = { ...prev };
      for (const o of visibleOutlets) next[o.id] = true;
      return next;
    });
  };

  const includeNoneVisible = () => {
    setInclude((prev) => {
      const next = { ...prev };
      for (const o of visibleOutlets) next[o.id] = false;
      return next;
    });
  };

  const setOutletResult = (outletId, patch) => {
    setResults((prev) => ({
      ...prev,
      [outletId]: { ...(prev[outletId] || {}), ...patch },
    }));
  };

  const resetRound = () => {
    setInitials("");
    setDateKey(todayKey());
    setTime(nowHHmm());
    setNotes("");
    setMsg("");
    setResults((prev) => {
      const next = { ...prev };
      for (const o of outlets) {
        next[o.id] = { tempC: "", secondsToStable: "", flushed: false, notes: "" };
      }
      return next;
    });
  };

  const saveRound = async () => {
    setMsg("");

    if (!initials.trim()) return setMsg("Please enter initials.");

    const chosen = visibleOutlets.filter((o) => include[o.id] === true);
    if (chosen.length === 0) return setMsg("No outlets included. Tick at least one.");

    const entries = chosen.map((o) => {
      const r = results[o.id] || {};
      return {
        outletId: o.id,
        outletNameSnapshot: o.name,
        outletLocationSnapshot: o.location,
        frequencySnapshot: o.frequency,
        type: o.type,
        tempC: r.tempC === "" ? null : Number(r.tempC),
        secondsToStable: r.secondsToStable === "" ? null : Number(r.secondsToStable),
        flushed: !!r.flushed,
        notes: String(r.notes || "").trim(),
      };
    });

    setSaving(true);
    try {
      await addDoc(collection(db, "water_temp_rounds"), {
        siteId: SITE_ID,
        dateKey,
        time,
        initials: initials.trim().toUpperCase(),
        status: "completed",
        roundNotes: String(notes || "").trim(),
        entries,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setMsg(`Saved water temp round (${entries.length} outlet${entries.length === 1 ? "" : "s"}).`);
      resetRound();
    } catch (e) {
      console.error("Save water round error:", e);
      setMsg("Failed to save. Check Firestore rules/permissions.");
    } finally {
      setSaving(false);
    }
  };

  // outlets management
  const addOutlet = async () => {
    setOErr("");
    const name = oForm.name.trim();
    const location = oForm.location.trim();
    const type = String(oForm.type || "").trim();
    const frequency = String(oForm.frequency || "").trim();
    const order = oForm.order === "" ? null : Number(oForm.order);

    if (!name) return setOErr("Name is required (e.g. Sentinel Hot - furthest outlet).");
    if (!location) return setOErr("Location is required (e.g. Ground Floor).");
    if (!type) return setOErr("Type is required (hot/cold).");
    if (!frequency) return setOErr("Frequency is required.");

    try {
      await addDoc(collection(db, "water_outlets"), {
        siteId: SITE_ID, // ✅ siteId now
        name,
        location,
        type,
        frequency,
        order: Number.isFinite(order) ? order : null,
        active: true,
        createdAt: serverTimestamp(),
      });
      setOForm({ name: "", location: "", type: "hot", frequency: "weekly", order: "" });
    } catch (e) {
      console.error("Add outlet error:", e);
      setOErr("Failed to add outlet.");
    }
  };

  const deleteOutlet = async (id, name) => {
    if (!window.confirm(`Delete outlet "${name}"?`)) return;
    try {
      await deleteDoc(doc(db, "water_outlets", id));
    } catch (e) {
      console.error("Delete outlet error:", e);
      alert("Could not delete outlet.");
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border border-white/10 bg-slate-900/60 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-slate-100 font-semibold">Water Temperature Log</div>
            <div className="text-xs text-slate-400 mt-1">
              Tick which outlets were checked today (doesn’t have to be all). Save as a “round”.
            </div>
          </div>
          <Button
            variant="outline"
            className="rounded-full border-white/10 bg-slate-900/40 text-xs text-slate-200 hover:bg-slate-900/60"
            onClick={() => setModalOpen(true)}
          >
            <Settings2 className="mr-1.5 h-4 w-4" />
            Manage outlets
          </Button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-5">
          <div className="sm:col-span-2">
            <label className="text-xs text-slate-300 inline-flex items-center gap-2">
              <Calendar className="h-4 w-4 text-slate-400" /> Date
            </label>
            <Input type="date" value={dateKey} onChange={(e) => setDateKey(e.target.value)} />
          </div>
          <div className="sm:col-span-1">
            <label className="text-xs text-slate-300 inline-flex items-center gap-2">
              <Clock className="h-4 w-4 text-slate-400" /> Time
            </label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-slate-300">Initials</label>
            <Input value={initials} onChange={(e) => setInitials(e.target.value)} placeholder="e.g. GC" />
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <label className="text-xs text-slate-300">Frequency filter</label>
            <div className="mt-1 rounded-2xl border border-white/10 bg-slate-950/30 px-3 py-2">
              <select className={SELECT_CLASS} value={freqFilter} onChange={(e) => setFreqFilter(e.target.value)}>
                <option value="all">All</option>
                {WATER_FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-1 text-[0.7rem] text-slate-500">Filter helps when only some outlets are due.</div>
          </div>

          <div className="sm:col-span-2 flex items-end justify-end gap-2">
            <Button
              variant="outline"
              className="rounded-full border-white/10 bg-slate-900/40 text-xs text-slate-200 hover:bg-slate-900/60"
              onClick={includeAllVisible}
            >
              Include all (shown)
            </Button>
            <Button
              variant="outline"
              className="rounded-full border-white/10 bg-slate-900/40 text-xs text-slate-200 hover:bg-slate-900/60"
              onClick={includeNoneVisible}
            >
              Include none (shown)
            </Button>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/30 overflow-hidden">
          <div className="border-b border-white/10 px-4 py-2 text-xs text-slate-300">Outlets ({visibleOutlets.length})</div>

          {visibleOutlets.length === 0 ? (
            <div className="px-4 py-10 text-center text-xs text-slate-400">
              No outlets found for this frequency. Add outlets in “Manage outlets”.
            </div>
          ) : (
            <div className="divide-y divide-white/10">
              {visibleOutlets.map((o) => {
                const r = results[o.id] || {};
                const isIncluded = include[o.id] === true;

                return (
                  <div key={o.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <label className="flex items-center gap-2 text-xs text-slate-200">
                          <input
                            type="checkbox"
                            checked={isIncluded}
                            onChange={(e) => setInclude((p) => ({ ...p, [o.id]: e.target.checked }))}
                          />
                          Include
                        </label>

                        <div>
                          <div className={`text-sm font-medium ${isIncluded ? "text-slate-100" : "text-slate-500"}`}>
                            {o.name || "Outlet"}
                          </div>
                          <div className={`text-xs mt-0.5 ${isIncluded ? "text-slate-400" : "text-slate-600"}`}>
                            {o.location || "—"} • {o.type || "—"} • {o.frequency || "—"}
                          </div>
                        </div>
                      </div>

                      <label
                        className={`flex items-center gap-2 text-xs ${isIncluded ? "text-slate-200" : "text-slate-600"} ${
                          isIncluded ? "" : "opacity-40 pointer-events-none"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={!!r.flushed}
                          onChange={(e) => setOutletResult(o.id, { flushed: e.target.checked })}
                        />
                        Flushed
                      </label>
                    </div>

                    <div className={`mt-3 grid gap-3 sm:grid-cols-4 ${isIncluded ? "" : "opacity-40 pointer-events-none"}`}>
                      <div>
                        <label className="text-xs text-slate-300">Temp (°C)</label>
                        <Input
                          value={r.tempC ?? ""}
                          onChange={(e) => setOutletResult(o.id, { tempC: e.target.value })}
                          placeholder="e.g. 52"
                        />
                      </div>

                      <div>
                        <label className="text-xs text-slate-300">Seconds to stable</label>
                        <Input
                          value={r.secondsToStable ?? ""}
                          onChange={(e) => setOutletResult(o.id, { secondsToStable: e.target.value })}
                          placeholder="e.g. 30"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="text-xs text-slate-300">Notes (optional)</label>
                        <Input
                          value={r.notes ?? ""}
                          onChange={(e) => setOutletResult(o.id, { notes: e.target.value })}
                          placeholder="Any issues (slow to heat, etc.)"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-4">
          <label className="text-xs text-slate-300">Round notes (optional)</label>
          <textarea
            className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything about today’s checks"
          />
        </div>

        {msg && (
          <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/30 px-3 py-2 text-xs text-slate-200">
            {msg}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="outline"
            className="rounded-full border-white/10 bg-slate-900/40 text-xs text-slate-200 hover:bg-slate-900/60"
            onClick={resetRound}
            disabled={saving}
          >
            Reset
          </Button>

          <Button
            className="rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 text-slate-950 text-xs"
            onClick={saveRound}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save water temp round"}
          </Button>
        </div>
      </Card>

      <Card className="border border-white/10 bg-slate-900/60">
        <div className="border-b border-white/10 px-4 py-3">
          <div className="text-slate-100 font-semibold">Recent rounds</div>
          <div className="text-xs text-slate-400 mt-1">Latest saved rounds (Main Branch).</div>
        </div>

        <div className="divide-y divide-white/10">
          {recent.length === 0 ? (
            <div className="px-4 py-10 text-center text-xs text-slate-400">No water rounds saved yet.</div>
          ) : (
            recent.map((r) => (
              <div key={r.id} className="px-4 py-3 flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-slate-100">
                    {r.dateKey || "—"} {r.time || ""} • {r.initials || "—"}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Outlets: {Array.isArray(r.entries) ? r.entries.length : 0}
                    {r.roundNotes ? ` • ${r.roundNotes}` : ""}
                  </div>
                </div>
                <div className="rounded-full border border-white/10 bg-slate-950/30 px-3 py-1 text-xs text-slate-200">Water</div>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Manage outlets modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900/95 p-5 shadow-2xl">
            <div className="flex items-start justify-between">
              <h3 className="text-sm font-semibold text-slate-100">Manage outlets</h3>
              <button className="text-slate-400 hover:text-slate-200" onClick={() => { setOErr(""); setModalOpen(false); }}>
                ✕
              </button>
            </div>

            {oErr && (
              <div className="mt-3 rounded-xl bg-rose-500/10 border border-rose-500/20 px-3 py-2 text-xs text-rose-200">
                {oErr}
              </div>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="text-xs text-slate-300">Name</label>
                <Input value={oForm.name} onChange={(e) => setOForm((p) => ({ ...p, name: e.target.value }))} placeholder="Sentinel Hot - furthest outlet" />
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs text-slate-300">Location</label>
                <Input value={oForm.location} onChange={(e) => setOForm((p) => ({ ...p, location: e.target.value }))} placeholder="Ground Floor" />
              </div>

              <div>
                <label className="text-xs text-slate-300">Type</label>
                <div className="mt-1 rounded-2xl border border-white/10 bg-slate-950/30 px-3 py-2">
                  <select className={SELECT_CLASS} value={oForm.type} onChange={(e) => setOForm((p) => ({ ...p, type: e.target.value }))}>
                    <option value="hot">hot</option>
                    <option value="cold">cold</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-300">Frequency</label>
                <div className="mt-1 rounded-2xl border border-white/10 bg-slate-950/30 px-3 py-2">
                  <select className={SELECT_CLASS} value={oForm.frequency} onChange={(e) => setOForm((p) => ({ ...p, frequency: e.target.value }))}>
                    {WATER_FREQUENCIES.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-300">Order (optional)</label>
                <Input value={oForm.order} onChange={(e) => setOForm((p) => ({ ...p, order: e.target.value }))} placeholder="e.g. 1" />
              </div>

              <div className="flex items-end">
                <Button className="w-full rounded-full bg-emerald-400 text-slate-950 hover:bg-emerald-300 text-xs" onClick={addOutlet}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  Add outlet
                </Button>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/30">
              <div className="border-b border-white/10 px-4 py-2 text-xs text-slate-300">Existing outlets ({outlets.length})</div>
              <div className="divide-y divide-white/10">
                {outlets.length === 0 ? (
                  <div className="px-4 py-8 text-center text-xs text-slate-400">No outlets yet.</div>
                ) : (
                  outlets.map((o) => (
                    <div key={o.id} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="text-sm text-slate-100">{outletDisplay(o)}</div>
                      <Button
                        variant="outline"
                        className="rounded-full border-white/10 bg-slate-900/40 text-xs text-rose-300 hover:bg-slate-900/60"
                        onClick={() => deleteOutlet(o.id, o.name || "Outlet")}
                      >
                        <Trash2 className="mr-1.5 h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <Button
                variant="outline"
                className="rounded-full border-white/10 bg-slate-900/40 text-xs text-slate-200 hover:bg-slate-900/60"
                onClick={() => { setOErr(""); setModalOpen(false); }}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- PAT TESTING (your existing PAT code preserved) ----------
function PatTestingTab() {
  const SITE_ID = "main_branch";
  const [subTab, setSubTab] = useState("register"); // register | session

  return (
    <div className="space-y-6">
      <Card className="border border-white/10 bg-slate-900/60 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-slate-100 font-semibold">PAT Testing</div>
            <div className="text-xs text-slate-400 mt-1">
              Maintain a register and save PAT sessions/certificates.
            </div>
          </div>
          <div className="flex gap-2">
            <TabButton active={subTab === "register"} onClick={() => setSubTab("register")} icon={ClipboardList} label="Register" />
            <TabButton active={subTab === "session"} onClick={() => setSubTab("session")} icon={FileSignature} label="New Session" />
          </div>
        </div>
      </Card>

      {subTab === "register" && <PatRegister SITE_ID={SITE_ID} />}
      {subTab === "session" && <PatSession SITE_ID={SITE_ID} />}
    </div>
  );
}

function PatRegister({ SITE_ID }) {
  const [assets, setAssets] = useState([]);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({
    tag: "",
    name: "",
    makeModel: "",
    location: "",
    serialNumber: "",
  });

  useEffect(() => {
    const qy = query(collection(db, "pat_assets"));
    return onSnapshot(
      qy,
      (snap) => {
        const rows = snap.docs.map((d) => {
          const data = d.data() || {};
          const siteId = String(data.siteId || "").trim();
          const active = data.active !== false;
          return { id: d.id, ...data, siteId, active };
        });

        const filtered = rows
          .filter((r) => r.active && r.siteId === SITE_ID)
          .sort((a, b) => String(a.tag || "").localeCompare(String(b.tag || "")));

        setAssets(filtered);
      },
      (e) => console.error("pat_assets subscribe error:", e)
    );
  }, []);

  const addAsset = async () => {
    setErr("");
    const tag = form.tag.trim();
    const name = form.name.trim();
    if (!tag) return setErr("Tag is required (e.g. R-1).");
    if (!name) return setErr("Name is required (e.g. PC + Lead).");

    try {
      await addDoc(collection(db, "pat_assets"), {
        siteId: SITE_ID,
        tag,
        name,
        makeModel: form.makeModel.trim(),
        location: form.location.trim(),
        serialNumber: form.serialNumber.trim(),
        active: true,
        createdAt: serverTimestamp(),
      });
      setForm({ tag: "", name: "", makeModel: "", location: "", serialNumber: "" });
    } catch (e) {
      console.error("Add PAT asset error:", e);
      setErr("Failed to add asset (check rules).");
    }
  };

  const deleteAsset = async (id, tag) => {
    if (!window.confirm(`Delete PAT asset "${tag}"?`)) return;
    try {
      await deleteDoc(doc(db, "pat_assets", id));
    } catch (e) {
      console.error("Delete PAT asset error:", e);
      alert("Could not delete asset.");
    }
  };

  return (
    <Card className="border border-white/10 bg-slate-900/60 p-4">
      <div className="text-slate-100 font-semibold">Equipment register</div>
      <div className="text-xs text-slate-400 mt-1">
        Add appliances once, then tick results in sessions.
      </div>

      {err && (
        <div className="mt-3 rounded-xl bg-rose-500/10 border border-rose-500/20 px-3 py-2 text-xs text-rose-200">
          {err}
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-5">
        <div>
          <label className="text-xs text-slate-300">Tag</label>
          <Input value={form.tag} onChange={(e) => setForm((p) => ({ ...p, tag: e.target.value }))} placeholder="R-1" />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-slate-300">Name</label>
          <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="PC + Lead" />
        </div>
        <div>
          <label className="text-xs text-slate-300">Location</label>
          <Input value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} placeholder="Ground Floor Reception" />
        </div>
        <div>
          <label className="text-xs text-slate-300">Serial (opt)</label>
          <Input value={form.serialNumber} onChange={(e) => setForm((p) => ({ ...p, serialNumber: e.target.value }))} placeholder="15408108" />
        </div>
        <div className="sm:col-span-3">
          <label className="text-xs text-slate-300">Make/Model (opt)</label>
          <Input value={form.makeModel} onChange={(e) => setForm((p) => ({ ...p, makeModel: e.target.value }))} placeholder="Dell Monitor / Extension Lead etc" />
        </div>
        <div className="sm:col-span-2 flex items-end">
          <Button className="w-full rounded-full bg-emerald-400 text-slate-950 hover:bg-emerald-300 text-xs" onClick={addAsset}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add to register
          </Button>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/30">
        <div className="border-b border-white/10 px-4 py-2 text-xs text-slate-300">
          Registered items ({assets.length})
        </div>
        <div className="divide-y divide-white/10">
          {assets.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-slate-400">No PAT items yet.</div>
          ) : (
            assets.map((a) => (
              <div key={a.id} className="px-4 py-3 flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm text-slate-100 font-medium">
                    {a.tag} • {a.name}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {(a.location || "—")}
                    {a.makeModel ? ` • ${a.makeModel}` : ""}
                    {a.serialNumber ? ` • SN ${a.serialNumber}` : ""}
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="rounded-full border-white/10 bg-slate-900/40 text-xs text-rose-300 hover:bg-slate-900/60"
                  onClick={() => deleteAsset(a.id, a.tag)}
                >
                  <Trash2 className="mr-1.5 h-4 w-4" />
                  Delete
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </Card>
  );
}

function PatSession({ SITE_ID }) {
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
          .filter((r) => r.active && r.siteId === SITE_ID)
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
  }, []);

  useEffect(() => {
    const qy = query(collection(db, "pat_test_sessions"), orderBy("createdAt", "desc"), limit(20));
    return onSnapshot(
      qy,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setRecent(rows.filter((r) => String(r.siteId || "").trim() === SITE_ID));
      },
      (e) => console.error("pat_test_sessions subscribe error:", e)
    );
  }, []);

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

      await addDoc(collection(db, "pat_test_sessions"), {
        siteId: SITE_ID,
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
        <div className="text-slate-100 font-semibold">New PAT test session</div>
        <div className="text-xs text-slate-400 mt-1">Choose included items (all or subset), then save.</div>

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
