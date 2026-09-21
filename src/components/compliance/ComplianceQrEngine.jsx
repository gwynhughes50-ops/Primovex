import React, { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CheckCircle2,
  XCircle,
  QrCode,
  SmartphoneNfc,
  Printer,
  Plus,
  Flame,
  Droplets,
  Thermometer,
  ShieldCheck,
} from "lucide-react";
import {
  COMPLIANCE_ASSET_TYPES,
  buildComplianceQrPayload,
  createComplianceAsset,
  generateNextAssetCode,
  getAssetTypeConfig,
  getNextFirePointToTest,
  getQrImageUrl,
  isComplianceCheckDue,
  isFireAlarmTestDueThisWeek,
  importLegacyComplianceAssets,
  subscribeComplianceAssets,
  subscribeRecentComplianceChecks,
} from "@/services/compliance/complianceQrService";

function typeIcon(type) {
  if (String(type || "").startsWith("fire")) return Flame;
  if (String(type || "").startsWith("water")) return Droplets;
  if (["fridge", "freezer"].includes(type)) return Thermometer;
  return ShieldCheck;
}

function assetTitle(asset) {
  return [asset.assetCode, asset.label].filter(Boolean).join(" • ") || "Compliance asset";
}

// Asset fields (label/location/assetCode) are free text staff enter when
// adding a compliance asset — escape before interpolating into the print
// window's HTML, or a label like `<img src=x onerror=...>` would execute as
// script in that window the next time anyone prints labels for it.
function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function printableLabelsHtml(assets) {
  const cards = assets
    .map((asset) => {
      const payload = buildComplianceQrPayload(asset);
      return `
        <section class="label">
          <div class="topline">${escapeHtml(getAssetTypeConfig(asset.assetType).icon)} MEDTRAK+</div>
          <img alt="QR" src="${escapeHtml(getQrImageUrl(payload, 180))}" />
          <div class="code">${escapeHtml(asset.assetCode || asset.id)}</div>
          <div class="name">${escapeHtml(asset.label || "Compliance asset")}</div>
          <div class="loc">${escapeHtml(asset.location || "")}</div>
          <div class="small">${escapeHtml(payload)}</div>
        </section>
      `;
    })
    .join("");

  return `<!doctype html>
<html><head><meta charset="utf-8" /><title>MedTrak QR Labels</title>
<style>
body{font-family:Arial,system-ui,sans-serif;margin:20px;color:#0f172a}.grid{display:grid;grid-template-columns:repeat(2, 88mm);gap:12mm}.label{border:1px solid #cbd5e1;border-radius:12px;padding:12px;text-align:center;break-inside:avoid}.topline{font-size:11px;font-weight:700;letter-spacing:.12em;color:#0f766e}.code{font-size:22px;font-weight:800;margin-top:4px}.name{font-size:13px;font-weight:700}.loc{font-size:12px;color:#475569;margin-top:2px}.small{font-size:8px;color:#94a3b8;margin-top:8px;word-break:break-all}img{width:42mm;height:42mm;margin:auto}@media print{body{margin:10mm}.no-print{display:none}.grid{gap:8mm}}
</style></head><body><button class="no-print" onclick="window.print()">Print labels</button><div class="grid">${cards}</div></body></html>`;
}

function openPrintLabels(assets) {
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) return alert("Pop-up blocked. Please allow pop-ups for QR labels.");
  w.document.open();
  w.document.write(printableLabelsHtml(assets));
  w.document.close();
  setTimeout(() => w.print(), 300);
}

export default function ComplianceQrEngine() {
  const SITE_ID = "main_branch";
  const [assets, setAssets] = useState([]);
  const [recent, setRecent] = useState([]);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    assetType: "fire_point",
    assetCode: "",
    label: "",
    location: "",
    department: "",
    checkMode: "pass_fail",
    frequency: "weekly",
    minTempC: "",
    maxTempC: "",
    countdownSeconds: "",
  });

  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");

  useEffect(() => subscribeComplianceAssets(setAssets, console.error, { siteId: SITE_ID }), []);
  useEffect(() => subscribeRecentComplianceChecks(setRecent, console.error, { siteId: SITE_ID, max: 20 }), []);

  // Suggests the next code for the default type once assets have actually
  // loaded — applyTypeDefaults below only fires on a user-driven type
  // change, so the very first code (for the form's initial default type)
  // needs its own trigger. Only fills it in while the field is still blank,
  // so it never clobbers something the user's already typed.
  useEffect(() => {
    setForm((prev) => (prev.assetCode ? prev : { ...prev, assetCode: generateNextAssetCode(prev.assetType, assets) }));
  }, [assets]);

  const selectedType = useMemo(() => getAssetTypeConfig(form.assetType), [form.assetType]);

  function applyTypeDefaults(type) {
    const config = getAssetTypeConfig(type);
    setForm((prev) => ({
      ...prev,
      assetType: type,
      assetCode: generateNextAssetCode(type, assets),
      checkMode: config.checkMode,
      frequency: config.defaultFrequency,
      minTempC: config.minTempC ?? "",
      maxTempC: config.maxTempC ?? "",
      countdownSeconds: config.countdownSeconds ?? "",
    }));
  }

  async function handleCreateAsset() {
    setMsg("");
    try {
      setSaving(true);
      await createComplianceAsset({ ...form, siteId: SITE_ID });
      setMsg("Asset created. QR/NFC payload ready.");
      setForm((prev) => ({ ...prev, assetCode: "", label: "", location: "", department: "" }));
    } catch (error) {
      console.error(error);
      setMsg(error?.message || "Could not create asset.");
    } finally {
      setSaving(false);
    }
  }

  async function importOld() {
    setImportMsg("");
    setImporting(true);
    try {
      const r = await importLegacyComplianceAssets(assets, { siteId: SITE_ID });
      setImportMsg(r.total === 0 ? "There are no call points or outlets in the old lists." : r.created === 0 ? "Everything in the old lists is already here." : `Brought across ${r.created} item${r.created === 1 ? "" : "s"}. Print their labels or write their tags to start using them.`);
    } catch (error) {
      console.error(error);
      setImportMsg("Could not bring the old lists across. Check your permissions.");
    } finally {
      setImporting(false);
    }
  }

  const dueCount = assets.filter((asset) => isComplianceCheckDue(asset)).length;
  const failedCount = assets.filter((asset) => asset.lastCheckResult === "fail").length;
  const fireTestDue = isFireAlarmTestDueThisWeek(assets);
  const nextFirePoint = getNextFirePointToTest(assets);
  const qrReady = assets.length;

  return (
    <div className="space-y-6">
      <Card className="border border-white/10 bg-slate-900/70 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-teal-400/20 bg-teal-400/10 px-3 py-1 text-xs font-semibold text-teal-100">
              <QrCode className="h-4 w-4" /> QR / NFC Compliance Engine
            </div>
            <h2 className="mt-3 text-2xl font-semibold text-slate-50">Assets and tags</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">
              Give fire points, water outlets, fridges and emergency equipment a MedTrak QR/NFC identity. Staff scan the asset, complete one action, and MedTrak records the audit trail, time, user, location and Pulse impact in the background.
            </p>
          </div>
          <div className="space-y-3">
          <div className="grid min-w-[300px] grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
              <div className="text-2xl font-bold text-white">{qrReady}</div>
              <div className="text-[11px] text-slate-400">QR assets</div>
            </div>
            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3">
              <div className="text-2xl font-bold text-amber-100">{dueCount}</div>
              <div className="text-[11px] text-amber-200/80">Needs check</div>
            </div>
            <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-3">
              <div className="text-2xl font-bold text-rose-100">{failedCount}</div>
              <div className="text-[11px] text-rose-200/80">Failed</div>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-3 text-xs text-slate-300">
            <div className="font-semibold text-slate-100">Have call points or outlets in the old lists?</div>
            <p className="mt-1 text-slate-400">Bring them across as assets, ready for a tag. The old records stay as they are.</p>
            <button type="button" onClick={importOld} disabled={importing} className="mt-2 rounded-full border border-white/10 bg-slate-900/60 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-800 disabled:opacity-50">{importing ? "Bringing across…" : "Bring across the old lists"}</button>
            {importMsg && <p className="mt-2 text-teal-200" role="status">{importMsg}</p>}
          </div>
          </div>
        </div>
      </Card>

      {nextFirePoint && (
        <Card className={`border p-5 ${fireTestDue ? "border-amber-400/30 bg-amber-400/10" : "border-white/10 bg-slate-900/70"}`}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Flame className="mt-0.5 h-5 w-5 text-amber-400" />
              <div>
                <h3 className="text-base font-semibold text-slate-50">Weekly fire alarm test</h3>
                <p className="mt-1 text-sm text-slate-300">
                  {fireTestDue ? "No call point has been tested this week." : "A call point was tested this week — all good."} BS 5839-1 practice: test one call point weekly, a different one each time, rotating through them all.
                </p>
                <p className="mt-2 text-xs text-slate-400">Next up: <span className="text-slate-100">{assetTitle(nextFirePoint)}</span> · {nextFirePoint.location || "No location"} · {nextFirePoint.lastCheckAt ? "longest since last tested" : "never tested yet"}</p>
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="border border-white/10 bg-slate-900/70 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-50">Create QR/NFC asset</h3>
              <p className="text-xs text-slate-400">This generates the asset identity used by QR codes and NFC tags.</p>
            </div>
            <Plus className="h-5 w-5 text-teal-200" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-slate-300">
              Asset type
              <select
                value={form.assetType}
                onChange={(event) => applyTypeDefaults(event.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-100"
              >
                {COMPLIANCE_ASSET_TYPES.map((type) => (
                  <option key={type.key} value={type.key} className="bg-slate-950">
                    {type.icon} {type.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs text-slate-300">
              Asset ID
              <Input value={form.assetCode} onChange={(e) => setForm((p) => ({ ...p, assetCode: e.target.value }))} placeholder="e.g. FP-007" />
            </label>

            <label className="text-xs text-slate-300 sm:col-span-2">
              Name / label
              <Input value={form.label} onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))} placeholder="Reception fire call point" />
            </label>

            <label className="text-xs text-slate-300">
              Location
              <Input value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} placeholder="Reception" />
            </label>

            <label className="text-xs text-slate-300">
              Department / owner
              <Input value={form.department} onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))} placeholder="Caretaker" />
            </label>

            <label className="text-xs text-slate-300">
              Check mode
              <select
                value={form.checkMode}
                onChange={(e) => setForm((p) => ({ ...p, checkMode: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-100"
              >
                <option className="bg-slate-950" value="pass_fail">Pass / Fail</option>
                <option className="bg-slate-950" value="temperature">Temperature</option>
              </select>
            </label>

            <label className="text-xs text-slate-300">
              Frequency
              <select
                value={form.frequency}
                onChange={(e) => setForm((p) => ({ ...p, frequency: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-100"
              >
                {['daily','weekly','monthly','quarterly','annually'].map((f) => <option key={f} className="bg-slate-950" value={f}>{f}</option>)}
              </select>
            </label>

            {selectedType.countdownSeconds ? (
              <label className="text-xs text-slate-300">
                Run the water for (seconds)
                <Input type="number" min="0" max="600" value={form.countdownSeconds} onChange={(e) => setForm((p) => ({ ...p, countdownSeconds: e.target.value }))} />
                <span className="mt-1 block text-[11px] text-slate-500">The phone counts this down before the temperature can be entered. 30 unless this outlet needs longer.</span>
              </label>
            ) : null}

            {form.checkMode === "temperature" && (
              <>
                <label className="text-xs text-slate-300">
                  Minimum °C
                  <Input type="number" value={form.minTempC} onChange={(e) => setForm((p) => ({ ...p, minTempC: e.target.value }))} />
                </label>
                <label className="text-xs text-slate-300">
                  Maximum °C
                  <Input type="number" value={form.maxTempC} onChange={(e) => setForm((p) => ({ ...p, maxTempC: e.target.value }))} />
                </label>
              </>
            )}
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/40 p-3 text-xs text-slate-300">
            Suggested workflow: <span className="text-teal-100">{selectedType.icon} {selectedType.label}</span> uses <span className="text-white">{form.checkMode}</span> checks and can be identified by QR, NFC, barcode or manual ID.
          </div>

          {msg && <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-200">{msg}</div>}

          <Button onClick={handleCreateAsset} disabled={saving} className="mt-4 w-full rounded-xl bg-gradient-to-r from-teal-500 to-emerald-400 font-semibold text-slate-950">
            {saving ? "Creating..." : "Create asset and QR payload"}
          </Button>
        </Card>

        <Card className="border border-white/10 bg-slate-900/70 p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-50">QR/NFC asset register</h3>
              <p className="text-xs text-slate-400">Print labels or run quick desktop test checks.</p>
            </div>
            <Button variant="outline" className="rounded-full border-white/10 bg-slate-900/40 text-xs text-slate-200" onClick={() => openPrintLabels(assets)} disabled={!assets.length}>
              <Printer className="mr-2 h-4 w-4" /> Print labels
            </Button>
          </div>

          <div className="max-h-[560px] space-y-3 overflow-auto pr-1">
            {assets.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/30 p-8 text-center text-sm text-slate-400">
                No QR/NFC compliance assets yet. Create the first fire point or water outlet to generate a label.
              </div>
            ) : (
              assets.map((asset) => {
                const Icon = typeIcon(asset.assetType);
                const payload = buildComplianceQrPayload(asset);
                return (
                  <div key={asset.id} className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-400/10 text-teal-100">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="font-semibold text-slate-50">{assetTitle(asset)}</div>
                          <div className="text-xs text-slate-400">{asset.location || "No location"} • {asset.frequency || "monthly"} • {asset.checkMode || "pass_fail"}</div>
                          <div className="mt-1 break-all text-[11px] text-slate-500">{payload}</div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <img alt="QR" src={getQrImageUrl(payload, 90)} className="h-16 w-16 rounded-lg bg-white p-1" />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>

      <Card className="border border-white/10 bg-slate-900/70 p-5">
        <h3 className="text-base font-semibold text-slate-50">Recent QR/NFC checks</h3>
        <div className="mt-3 divide-y divide-white/10 rounded-2xl border border-white/10 bg-slate-950/30">
          {recent.length === 0 ? (
            <div className="p-5 text-sm text-slate-400">No QR/NFC checks recorded yet.</div>
          ) : recent.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
              <div>
                <div className="font-semibold text-slate-100">{row.assetCode || row.assetLabel} • {row.assetLabel}</div>
                <div className="text-xs text-slate-400">{row.location || "No location"} • {row.actor?.displayName || "Unknown"}</div>
              </div>
              <div className="flex items-center gap-2">
                {row.checkMode === "temperature" && row.tempC !== null && row.tempC !== undefined && (
                  <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">{row.tempC}°C</span>
                )}
                <div className={`rounded-full px-3 py-1 text-xs font-semibold ${row.result === "pass" ? "bg-emerald-400/10 text-emerald-100" : "bg-rose-400/10 text-rose-100"}`}>{String(row.result || "").toUpperCase()}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
