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
  Pencil,
  Archive,
  RotateCcw,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import useSiteSpaceNames from "@/hooks/useSiteSpaceNames";
import { namesWithCurrent } from "@/lib/stockPickerOptions";
import { FREQUENCY_OPTIONS, RETIRE_REASONS } from "@/services/compliance/complianceRules";
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
  restoreComplianceAsset,
  retireComplianceAsset,
  updateComplianceAsset,
} from "@/services/compliance/complianceQrService";
import { printHtmlDocument } from "@/lib/printHtmlDocument";

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
          <div class="topline">${escapeHtml(getAssetTypeConfig(asset.assetType).icon)} PRIMOVEX</div>
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
<html><head><meta charset="utf-8" /><title>Primovex QR Labels</title>
<style>
body{font-family:Arial,system-ui,sans-serif;margin:20px;color:#0f172a}.grid{display:grid;grid-template-columns:repeat(2, 88mm);gap:12mm}.label{border:1px solid #cbd5e1;border-radius:12px;padding:12px;text-align:center;break-inside:avoid}.topline{font-size:11px;font-weight:700;letter-spacing:.12em;color:#0f766e}.code{font-size:22px;font-weight:800;margin-top:4px}.name{font-size:13px;font-weight:700}.loc{font-size:12px;color:#475569;margin-top:2px}.small{font-size:8px;color:#94a3b8;margin-top:8px;word-break:break-all}img{width:42mm;height:42mm;margin:auto}@media print{body{margin:10mm}.no-print{display:none}.grid{gap:8mm}}
</style></head><body><button class="no-print" onclick="window.print()">Print labels</button><div class="grid">${cards}</div></body></html>`;
}

// See printHtmlDocument for why this isn't window.open() - that reliably
// shows "Popup blocked" in the packaged desktop app.
function openPrintLabels(assets) {
  printHtmlDocument(printableLabelsHtml(assets));
}

// siteAssets: this site's assets (retired ones too); checks: the latest checks; sites: the site picker state from the page.
export default function ComplianceQrEngine({ assets: siteAssets = [], checks = [], sites }) {
  const { user, displayName, can, isAdmin } = useAuth();
  const mayManage = can("compliance.manageAssets") || isAdmin;
  const actor = { uid: user?.uid || "", displayName: displayName || user?.email || "" };
  const assets = useMemo(() => siteAssets.filter((a) => a.active !== false), [siteAssets]);
  const retired = useMemo(() => siteAssets.filter((a) => a.active === false), [siteAssets]);
  const recent = useMemo(() => checks.slice(0, 20), [checks]);
  const [showRetired, setShowRetired] = useState(false);
  const [editing, setEditing] = useState(null); // { id, label, location, frequency, minTempC, maxTempC, countdownSeconds }
  const [retiring, setRetiring] = useState(null); // { id, reason }
  const [rowBusy, setRowBusy] = useState("");
  const [rowMessage, setRowMessage] = useState("");
  const [formSite, setFormSite] = useState("");
  const { spaceNamesFor } = useSiteSpaceNames(true);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  // Only what actually varies per asset: type, location, and a name that Primovex
  // suggests from the two (editable). Check mode is fixed by type, so it's never
  // asked. The asset id is assigned by Primovex, not typed in, so the audit trail
  // can't get a duplicate or made-up code. Frequency defaults from the type too -
  // "how often" is tucked behind an optional link, since the type's standard is
  // right for almost every asset.
  const [form, setForm] = useState({
    assetType: "fire_point",
    label: "",
    labelTouched: false,
    location: "",
    minTempC: "",
    maxTempC: "",
    countdownSeconds: "",
    frequency: "weekly",
    frequencyTouched: false,
  });
  const [showFrequency, setShowFrequency] = useState(false);

  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");

  const newSite = formSite || sites?.newSiteId || "main_branch";
  // a place is picked from the practice's rooms (Practice Admin > Spaces); if none are set up for the site it can be typed
  const rooms = useMemo(() => spaceNamesFor(sites?.nameOf?.(newSite) || ""), [spaceNamesFor, sites, newSite]);
  const locationOptions = namesWithCurrent(rooms, form.location);

  const selectedType = useMemo(() => getAssetTypeConfig(form.assetType), [form.assetType]);

  // What Primovex will assign the new asset - shown, never typed. Recomputed
  // live so it's still right if someone else creates an asset of the same
  // type in another tab while this form is open.
  const nextAssetCode = useMemo(() => generateNextAssetCode(form.assetType, assets), [form.assetType, assets]);

  // A name the person hasn't typed over yet tracks the type and location, so
  // "Reception" + Fire Point becomes "Reception Fire Point" without being asked.
  // Once they edit it directly, it's theirs and stops following.
  useEffect(() => {
    if (form.labelTouched) return;
    const suggested = [form.location.trim(), selectedType.label].filter(Boolean).join(" ");
    setForm((prev) => (prev.labelTouched ? prev : { ...prev, label: suggested }));
  }, [form.location, selectedType, form.labelTouched]);

  function applyTypeDefaults(type) {
    const config = getAssetTypeConfig(type);
    setForm((prev) => ({
      ...prev,
      assetType: type,
      minTempC: config.minTempC ?? "",
      maxTempC: config.maxTempC ?? "",
      countdownSeconds: config.countdownSeconds ?? "",
      frequency: prev.frequencyTouched ? prev.frequency : config.defaultFrequency,
    }));
    setShowFrequency(false);
  }

  async function handleCreateAsset() {
    setMsg("");
    if (!form.location.trim()) {
      setMsg("Enter the location.");
      return;
    }
    try {
      setSaving(true);
      const assetCode = generateNextAssetCode(form.assetType, assets);
      await createComplianceAsset({
        assetType: form.assetType,
        assetCode,
        label: form.label.trim() || selectedType.label,
        location: form.location.trim(),
        checkMode: selectedType.checkMode,
        frequency: form.frequency || selectedType.defaultFrequency,
        minTempC: form.minTempC,
        maxTempC: form.maxTempC,
        countdownSeconds: form.countdownSeconds,
        siteId: newSite,
      });
      setMsg(`${assetCode} created. QR/NFC payload ready.`);
      setForm({
        assetType: form.assetType,
        label: "",
        labelTouched: false,
        location: "",
        minTempC: selectedType.minTempC ?? "",
        maxTempC: selectedType.maxTempC ?? "",
        countdownSeconds: selectedType.countdownSeconds ?? "",
        frequency: selectedType.defaultFrequency,
        frequencyTouched: false,
      });
      setShowFrequency(false);
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
      const r = await importLegacyComplianceAssets(assets, { siteId: newSite });
      setImportMsg(r.total === 0 ? "There are no call points or outlets in the old lists." : r.created === 0 ? "Everything in the old lists is already here." : `Brought across ${r.created} item${r.created === 1 ? "" : "s"}. Print their labels or write their tags to start using them.`);
    } catch (error) {
      console.error(error);
      setImportMsg("Could not bring the old lists across. Check your permissions.");
    } finally {
      setImporting(false);
    }
  }

  function startEdit(asset) {
    setRowMessage("");
    setRetiring(null);
    setEditing({ id: asset.id, label: asset.label || "", location: asset.location || "", frequency: asset.frequency || getAssetTypeConfig(asset.assetType).defaultFrequency, minTempC: asset.minTempC ?? "", maxTempC: asset.maxTempC ?? "", countdownSeconds: asset.countdownSeconds ?? "" });
  }

  async function saveEdit(asset) {
    setRowBusy(asset.id); setRowMessage("");
    try {
      await updateComplianceAsset(asset, editing, actor);
      setEditing(null);
      setRowMessage(`${asset.assetCode} updated.`);
    } catch (error) {
      setRowMessage(error?.message || "Could not save the change. Check you have permission.");
    } finally { setRowBusy(""); }
  }

  async function retire(asset) {
    setRowBusy(asset.id); setRowMessage("");
    try {
      await retireComplianceAsset(asset, { reason: retiring.reason, actor });
      setRetiring(null);
      setRowMessage(`${asset.assetCode} retired. It stays on record and can be restored.`);
    } catch (error) {
      setRowMessage(error?.message || "Could not retire it. Check you have permission.");
    } finally { setRowBusy(""); }
  }

  async function restore(asset) {
    setRowBusy(asset.id); setRowMessage("");
    try { await restoreComplianceAsset(asset, actor); setRowMessage(`${asset.assetCode} is back in use.`); } catch (error) { setRowMessage(error?.message || "Could not restore it."); } finally { setRowBusy(""); }
  }

  // edit / retire / print one label, under each asset in the register
  function RowActions({ asset }) {
    const type = getAssetTypeConfig(asset.assetType);
    const isEditing = editing?.id === asset.id;
    const isRetiring = retiring?.id === asset.id;
    const field = "mt-1 w-full rounded-lg border border-white/10 bg-slate-950/50 px-2 py-1.5 text-sm text-slate-100 [&>option]:bg-slate-900";
    const roomsHere = namesWithCurrent(spaceNamesFor(sites?.nameOf?.(asset.siteId) || ""), editing?.location || asset.location);
    return (
      <div className="mt-3 border-t border-white/5 pt-3">
        {!isEditing && !isRetiring && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => openPrintLabels([asset])} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-white/5"><Printer className="h-3.5 w-3.5" aria-hidden="true" /> Print this label</button>
            <button type="button" onClick={() => startEdit(asset)} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-white/5"><Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit</button>
            <button type="button" onClick={() => { setEditing(null); setRowMessage(""); setRetiring({ id: asset.id, reason: "" }); }} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-slate-300 hover:bg-white/5"><Archive className="h-3.5 w-3.5" aria-hidden="true" /> Retire</button>
          </div>
        )}
        {isEditing && (
          <div className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs text-slate-300">Name<input className={field} value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} /></label>
              <label className="text-xs text-slate-300">Location
                {roomsHere.length > 0
                  ? <select className={field} value={editing.location} onChange={(e) => setEditing({ ...editing, location: e.target.value })}><option value="">Choose the room…</option>{roomsHere.map((name) => <option key={name} value={name}>{name}</option>)}</select>
                  : <input className={field} value={editing.location} onChange={(e) => setEditing({ ...editing, location: e.target.value })} />}
              </label>
              {type.key !== "fire_point" && (
                <label className="text-xs text-slate-300">How often<select className={field} value={editing.frequency} onChange={(e) => setEditing({ ...editing, frequency: e.target.value })}>{FREQUENCY_OPTIONS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</select></label>
              )}
              {type.checkMode === "temperature" && (
                <>
                  <label className="text-xs text-slate-300">Lowest safe °C<input type="number" className={field} value={editing.minTempC} onChange={(e) => setEditing({ ...editing, minTempC: e.target.value })} /></label>
                  <label className="text-xs text-slate-300">Highest safe °C<input type="number" className={field} value={editing.maxTempC} onChange={(e) => setEditing({ ...editing, maxTempC: e.target.value })} /></label>
                </>
              )}
              {type.countdownSeconds ? <label className="text-xs text-slate-300">Run the water for (seconds)<input type="number" min="0" max="600" className={field} value={editing.countdownSeconds} onChange={(e) => setEditing({ ...editing, countdownSeconds: e.target.value })} /></label> : null}
            </div>
            <p className="text-[11px] text-slate-500">The code and the tag stay the same, so the printed label is still right.</p>
            <div className="flex gap-2">
              <Button disabled={rowBusy === asset.id} onClick={() => saveEdit(asset)} className="rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 text-xs text-slate-950">Save</Button>
              <Button variant="outline" onClick={() => setEditing(null)} className="rounded-full border-white/10 bg-slate-900/40 text-xs text-slate-200">Cancel</Button>
            </div>
          </div>
        )}
        {isRetiring && (
          <div className="space-y-2">
            <p className="text-xs text-slate-300">Retiring {asset.assetCode} stops it counting towards what is due. Its checks stay on record.</p>
            <select className={field} value={retiring.reason} onChange={(e) => setRetiring({ ...retiring, reason: e.target.value })} aria-label="Why is it being retired"><option value="">Why?</option>{RETIRE_REASONS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select>
            <div className="flex gap-2">
              <Button disabled={!retiring.reason || rowBusy === asset.id} onClick={() => retire(asset)} className="rounded-full bg-rose-600 text-xs text-white">Retire it</Button>
              <Button variant="outline" onClick={() => setRetiring(null)} className="rounded-full border-white/10 bg-slate-900/40 text-xs text-slate-200">Cancel</Button>
            </div>
          </div>
        )}
      </div>
    );
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
              Give fire points, water outlets, fridges and emergency equipment a Primovex QR/NFC identity. Staff scan the asset, complete one action, and Primovex records the audit trail, time, user, location and Pulse impact in the background.
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

            {sites?.options?.length > 1 && (
              <label className="text-xs text-slate-300">
                Site
                <select value={newSite} onChange={(e) => { setFormSite(e.target.value); setForm((p) => ({ ...p, location: "" })); }} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 [&>option]:bg-slate-900">
                  {sites.options.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
                </select>
              </label>
            )}

            <label className="text-xs text-slate-300">
              Location
              {locationOptions.length > 0 ? (
                <select value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 [&>option]:bg-slate-900">
                  <option value="">Choose the room…</option>
                  {locationOptions.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              ) : (
                <Input value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} placeholder="Reception" />
              )}
            </label>

            <label className="text-xs text-slate-300">
              Asset ID
              <div className="mt-1 flex h-9 items-center rounded-xl border border-white/10 bg-slate-950/30 px-3 text-sm text-slate-300">
                {nextAssetCode}
              </div>
              <span className="mt-1 block text-[11px] text-slate-500">Assigned automatically, for the audit trail.</span>
            </label>

            <label className="text-xs text-slate-300 sm:col-span-2">
              Name / label
              <Input
                value={form.label}
                onChange={(e) => setForm((p) => ({ ...p, label: e.target.value, labelTouched: true }))}
                placeholder="Reception fire call point"
              />
            </label>

            {selectedType.key !== "fire_point" && (
              <div className="text-xs text-slate-300 sm:col-span-2">
                {showFrequency ? (
                  <label className="block">
                    How often should this be checked?
                    <select
                      value={form.frequency}
                      onChange={(e) => setForm((p) => ({ ...p, frequency: e.target.value, frequencyTouched: true }))}
                      className="mt-1 w-full max-w-[220px] rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-100"
                    >
                      {FREQUENCY_OPTIONS.map((f) => <option key={f.key} className="bg-slate-950" value={f.key}>{f.label}</option>)}
                    </select>
                  </label>
                ) : (
                  <button type="button" onClick={() => setShowFrequency(true)} className="text-teal-300 underline underline-offset-2 hover:text-teal-200">
                    This one needs checking more or less often than usual ({selectedType.defaultFrequency})
                  </button>
                )}
              </div>
            )}

            {selectedType.countdownSeconds ? (
              <label className="text-xs text-slate-300">
                Run the water for (seconds)
                <Input type="number" min="0" max="600" value={form.countdownSeconds} onChange={(e) => setForm((p) => ({ ...p, countdownSeconds: e.target.value }))} />
                <span className="mt-1 block text-[11px] text-slate-500">The phone counts this down before the temperature can be entered. 30 unless this outlet needs longer.</span>
              </label>
            ) : null}

            {selectedType.checkMode === "temperature" && (
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
            <span className="text-teal-100">{selectedType.icon} {selectedType.label}</span> uses <span className="text-white">{selectedType.checkMode === "temperature" ? "temperature" : "pass / fail"}</span> checks, checked <span className="text-white">{form.frequency}</span>, and can be identified by QR, NFC, barcode or manual ID.
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

          {rowMessage && <p className="mb-3 rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-200" role="status">{rowMessage}</p>}
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
                          <div className="text-xs text-slate-400">{asset.location || "No location"}</div>
                          <div className="mt-1 break-all text-[11px] text-slate-500">{payload}</div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <img alt="QR" src={getQrImageUrl(payload, 90)} className="h-16 w-16 rounded-lg bg-white p-1" />
                      </div>
                    </div>
                    {mayManage && RowActions({ asset })}
                  </div>
                );
              })
            )}
          </div>
          {retired.length > 0 && (
            <div className="mt-4 border-t border-white/10 pt-3">
              <button type="button" onClick={() => setShowRetired((v) => !v)} className="text-xs font-semibold text-slate-400 underline">{showRetired ? "Hide" : "Show"} {retired.length} retired</button>
              {showRetired && (
                <ul className="mt-2 space-y-2">
                  {retired.map((asset) => (
                    <li key={asset.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/5 bg-slate-950/30 px-3 py-2 text-sm text-slate-300">
                      <span>{assetTitle(asset)} <span className="text-xs text-slate-500">· {asset.retiredReasonLabel || "retired"}{asset.retiredByName ? `, ${asset.retiredByName}` : ""}</span></span>
                      {mayManage && <button type="button" disabled={rowBusy === asset.id} onClick={() => restore(asset)} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-white/5"><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Restore</button>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
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
