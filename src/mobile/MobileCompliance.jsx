import React, { useEffect, useMemo, useState } from "react";
import MobileBarcodeScanner from "@/components/ui/MobileBarcodeScanner";
import {
  CheckCircle2,
  XCircle,
  QrCode,
  Sparkles,
  SmartphoneNfc,
  Thermometer,
  Keyboard,
  ShieldCheck,
  Flame,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { nativeNfcAvailable, writeNfcUrl } from "@/modules/sense/services/nfcService";
import {
  buildComplianceQrPayload,
  findComplianceAssetByScan,
  getAssetTypeConfig,
  getNextFirePointToTest,
  isComplianceCheckDue,
  isFireAlarmTestDueThisWeek,
  recordComplianceCheck,
  subscribeComplianceAssets,
} from "@/services/compliance/complianceQrService";

function assetLabel(asset) {
  return [asset?.assetCode, asset?.label].filter(Boolean).join(" • ") || "Compliance asset";
}

function resultText(result) {
  if (!result) return null;
  if (result.ok) return "Recorded";
  return "Issue raised";
}

export default function MobileCompliance({ pendingNfcScan, onConsumeNfcScan }) {
  const SITE_ID = "main_branch";
  const { isAdmin } = useAuth();
  const [assets, setAssets] = useState([]);
  const [activeAsset, setActiveAsset] = useState(null);
  const [manualId, setManualId] = useState("");
  const [tempC, setTempC] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [scanError, setScanError] = useState("");
  const [nfcActive, setNfcActive] = useState(false);
  const [result, setResult] = useState(null);
  const [showAllAssets, setShowAllAssets] = useState(false);
  const [writingTagFor, setWritingTagFor] = useState(null);
  const [writeMessage, setWriteMessage] = useState("");

  useEffect(() => subscribeComplianceAssets(setAssets, console.error, { siteId: SITE_ID }), []);

  const dueAssets = useMemo(() => assets.filter((asset) => isComplianceCheckDue(asset)), [assets]);
  const fireTestDue = useMemo(() => isFireAlarmTestDueThisWeek(assets), [assets]);
  const nextFirePoint = useMemo(() => getNextFirePointToTest(assets), [assets]);

  async function handleScan(code, method = "qr") {
    setScanError("");
    setResult(null);
    try {
      const asset = await findComplianceAssetByScan(code, { siteId: SITE_ID });
      setActiveAsset({ ...asset, identificationMethod: method, scanRaw: code });
      setTempC("");
      setNotes("");
      setMessage(`${asset.assetCode || "Asset"} ready.`);
    } catch (error) {
      console.error(error);
      setScanError(error?.message || "Asset not found. Try manual ID.");
    }
  }

  // A compliance tag scanned anywhere in the app (MobileLayout's global NFC
  // listener) lands here as a prop rather than a local event, since the
  // native reader-mode listener that actually detects the tap lives outside
  // this component entirely.
  useEffect(() => {
    if (!pendingNfcScan) return;
    handleScan(pendingNfcScan, "nfc");
    setNfcActive(false);
    onConsumeNfcScan?.();
  }, [pendingNfcScan]);

  // MainActivity.kt's NFC reader mode already runs continuously whenever the
  // app is foregrounded (see onResume) — there's no explicit "start" call on
  // the native path, tapping a tag anywhere just works. This just puts the UI
  // into a waiting state; the actual result arrives via the pendingNfcScan
  // prop above. Web NFC (NDEFReader) is kept only as a fallback for contexts
  // without the native bridge (e.g. testing in a mobile browser) — it's
  // deliberately unreliable in the installed Android app itself, see
  // nfcService.js's nfcSupported().
  async function startNfcRead() {
    setScanError("");
    if (nativeNfcAvailable()) {
      setNfcActive(true);
      setMessage("Hold the phone near the NFC tag…");
      return;
    }

    if (!("NDEFReader" in window)) {
      setScanError("NFC is not supported in this browser. Use QR scan or manual ID.");
      return;
    }

    try {
      setNfcActive(true);
      const reader = new window.NDEFReader();
      await reader.scan();
      setMessage("Hold the phone near the NFC tag…");
      reader.onreading = async (event) => {
        const record = event.message.records[0];
        let text = event.serialNumber || "";
        try {
          if (record?.recordType === "text") {
            const decoder = new TextDecoder(record.encoding || "utf-8");
            text = decoder.decode(record.data);
          }
        } catch {
          // keep serial fallback
        }
        await handleScan(text, "nfc");
        setNfcActive(false);
      };
    } catch (error) {
      console.error(error);
      setNfcActive(false);
      setScanError(error?.message || "NFC read failed. Use QR scan instead.");
    }
  }

  async function writeAssetTag(asset) {
    if (!nativeNfcAvailable()) {
      setWriteMessage("Tag writing needs the installed Android app.");
      return;
    }
    setWritingTagFor(asset.id);
    setWriteMessage("Hold a blank NFC tag to the back of the phone…");
    try {
      await writeNfcUrl(buildComplianceQrPayload(asset));
      setWriteMessage(`Tag written for ${asset.assetCode || asset.label}.`);
    } catch (error) {
      setWriteMessage(error?.message || "Could not write the tag.");
    } finally {
      setWritingTagFor(null);
    }
  }

  async function submitCheck(status) {
    if (!activeAsset) return;
    setBusy(true);
    setScanError("");
    try {
      const payload = {
        status,
        tempC,
        notes,
        source: "mobile_compliance",
        identificationMethod: activeAsset.identificationMethod || "qr",
        scanRaw: activeAsset.scanRaw,
      };
      const check = await recordComplianceCheck(activeAsset, payload);
      setResult({ ok: check.result === "pass", check });
      const tempSuffix = check.checkMode === "temperature" && check.tempC !== null && check.tempC !== undefined ? ` (${check.tempC}°C)` : "";
      setMessage(check.result === "pass" ? `All OK${tempSuffix}. Audit trail saved.` : `Issue detected${tempSuffix}. Pulse Event raised automatically.`);
      setActiveAsset(null);
      setTempC("");
      setNotes("");
    } catch (error) {
      console.error(error);
      setScanError("Could not record check. Check permissions or connection.");
    } finally {
      setBusy(false);
    }
  }

  const isTemperature = activeAsset?.checkMode === "temperature";
  const config = getAssetTypeConfig(activeAsset?.assetType);

  return (
    <div className="pvx-mobile-page pvx-compliance-page">
      <div className="mx-auto max-w-md">
        <div className="pvx-compliance-hero">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-[var(--medtrak-accent)]">Primovex Mobile</p>
              <h1 className="mt-2 text-2xl font-bold">Compliance</h1>
              <p className="mt-1 text-sm text-[var(--medtrak-muted)]">Scan the point, tap once, and Primovex records the rest.</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--medtrak-accent)_12%,var(--medtrak-panel))] text-[var(--medtrak-accent)]">
              <QrCode className="h-6 w-6" />
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-3">
              <div className="text-xl font-bold">{assets.length}</div>
              <div className="text-[10px] text-[var(--medtrak-muted)]">Assets</div>
            </div>
            <div className="rounded-2xl bg-amber-400/10 p-3 text-amber-100">
              <div className="text-xl font-bold">{dueAssets.length}</div>
              <div className="text-[10px] text-amber-200/80">Due</div>
            </div>
            <div className="rounded-2xl bg-rose-400/10 p-3 text-rose-100">
              <div className="text-xl font-bold">{assets.filter((a) => a.lastCheckResult === "fail").length}</div>
              <div className="text-[10px] text-rose-200/80">Issues</div>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => document.querySelector("[data-compliance-scan-button]")?.click()}
            className="rounded-[1.5rem] bg-[var(--medtrak-accent)] px-4 py-5 text-left font-bold text-white shadow-lg active:scale-[0.99]"
          >
            <QrCode className="mb-3 h-7 w-7" />
            Scan QR
          </button>
          <button
            type="button"
            onClick={startNfcRead}
            className="rounded-[1.5rem] border border-[color-mix(in_srgb,var(--medtrak-accent)_28%,var(--medtrak-border))] bg-[color-mix(in_srgb,var(--medtrak-accent)_8%,var(--medtrak-panel))] px-4 py-5 text-left font-bold text-[var(--medtrak-accent)] active:scale-[0.99]"
          >
            <SmartphoneNfc className="mb-3 h-7 w-7" />
            {nfcActive ? "Ready…" : "Tap NFC"}
          </button>
        </div>

        <div className="mt-4 rounded-[1.5rem] border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-4">
          <label className="text-xs font-semibold uppercase tracking-wide text-[var(--medtrak-muted)]">Manual Asset ID</label>
          <div className="mt-2 flex gap-2">
            <input
              value={manualId}
              onChange={(e) => setManualId(e.target.value)}
              placeholder="FP-007"
              className="min-w-0 flex-1 rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] px-4 py-3 text-[var(--medtrak-text)] outline-none"
            />
            <button
              type="button"
              onClick={() => manualId && handleScan(manualId, "manual")}
              className="rounded-2xl bg-[color-mix(in_srgb,var(--medtrak-accent)_10%,var(--medtrak-panel))] px-4 py-3 text-[var(--medtrak-accent)]"
            >
              <Keyboard className="h-5 w-5" />
            </button>
          </div>
        </div>

        {activeAsset && (
          <div className="fixed inset-0 z-[80] flex items-end bg-black/60 backdrop-blur-sm">
            <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-[2rem] border border-teal-400/20 bg-slate-950 p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl">
              <div className="mx-auto max-w-md">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-[var(--medtrak-accent)]">Asset identified</p>
                    <h2 className="mt-1 text-2xl font-bold text-white">{assetLabel(activeAsset)}</h2>
                    <p className="mt-1 text-sm text-[var(--medtrak-muted)]">{activeAsset.location || "No location"} • {config.label}</p>
                  </div>
                  <button type="button" onClick={() => setActiveAsset(null)} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 text-slate-300">
                    <XCircle className="h-5 w-5" />
                  </button>
                </div>

                {isTemperature ? (
                  <div className="mt-5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-[var(--medtrak-muted)]">Temperature °C</label>
                    <div className="mt-2 flex items-center gap-3 rounded-[1.5rem] border border-white/10 bg-slate-900 px-4 py-3">
                      <Thermometer className="h-6 w-6 text-teal-200" />
                      <input
                        autoFocus
                        type="number"
                        step="0.1"
                        value={tempC}
                        onChange={(e) => setTempC(e.target.value)}
                        placeholder="12.4"
                        className="w-full bg-transparent text-3xl font-bold text-white outline-none"
                      />
                    </div>
                    <p className="mt-2 text-xs text-slate-500">Range: {activeAsset.minTempC ?? "—"}°C to {activeAsset.maxTempC ?? "—"}°C</p>
                    <button
                      type="button"
                      onClick={() => submitCheck("pass")}
                      disabled={busy || tempC === ""}
                      className="mt-4 w-full rounded-[1.5rem] bg-teal-400 px-4 py-4 text-lg font-bold text-slate-950 disabled:opacity-50"
                    >
                      Record temperature
                    </button>
                  </div>
                ) : (
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => submitCheck("pass")}
                      disabled={busy}
                      className="rounded-[1.5rem] bg-emerald-400 px-4 py-6 text-center text-lg font-bold text-slate-950 disabled:opacity-50"
                    >
                      <CheckCircle2 className="mx-auto mb-2 h-9 w-9" />
                      All OK
                    </button>
                    <button
                      type="button"
                      onClick={() => submitCheck("fail")}
                      disabled={busy}
                      className="rounded-[1.5rem] bg-rose-500 px-4 py-6 text-center text-lg font-bold text-white disabled:opacity-50"
                    >
                      <XCircle className="mx-auto mb-2 h-9 w-9" />
                      Not working
                    </button>
                  </div>
                )}

                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional note"
                  rows={2}
                  className="mt-4 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none"
                />

                <button
                  type="button"
                  onClick={() => setActiveAsset(null)}
                  className="mt-3 w-full rounded-2xl bg-slate-800 px-4 py-3 text-slate-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {(message || result) && (
          <div className={`mt-4 rounded-[1.5rem] border p-4 ${result?.ok === false ? "border-rose-400/30 bg-rose-400/10 text-rose-100" : "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"}`}>
            <div className="flex items-center gap-3">
              {result?.ok === false ? <XCircle className="h-6 w-6" /> : <CheckCircle2 className="h-6 w-6" />}
              <div>
                <div className="font-bold">{resultText(result) || "Ready"}</div>
                <div className="text-sm opacity-80">{message}</div>
              </div>
            </div>
          </div>
        )}

        {scanError && (
          <div className="mt-4 rounded-[1.5rem] border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-100">
            {scanError}
          </div>
        )}

        {nextFirePoint && (
          <div className={`mt-5 rounded-[1.5rem] border p-4 ${fireTestDue ? "border-amber-400/30 bg-amber-400/10" : "border-[var(--medtrak-border)] bg-[var(--medtrak-panel)]"}`}>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--medtrak-text)]"><Flame className="h-4 w-4 text-amber-500" /> Weekly fire alarm test</div>
            <p className="text-xs text-[var(--medtrak-muted)]">{fireTestDue ? "No call point has been tested this week." : "A call point was tested this week — all good."} Test one call point weekly, rotating through them all.</p>
            <button
              type="button"
              onClick={() => setActiveAsset({ ...nextFirePoint, identificationMethod: "manual_fire_rotation" })}
              className="mt-3 w-full rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-3 text-left"
            >
              <div className="font-semibold text-[var(--medtrak-text)]">Next up: {assetLabel(nextFirePoint)}</div>
              <div className="text-xs text-[var(--medtrak-muted)]">{nextFirePoint.location || "No location"} · {nextFirePoint.lastCheckAt ? "Longest since last tested" : "Never tested yet"}</div>
            </button>
          </div>
        )}

        <div className="mt-5 rounded-[1.5rem] border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--medtrak-text)]"><ShieldCheck className="h-4 w-4 text-teal-200" /> Due checks</div>
          <div className="space-y-2">
            {dueAssets.slice(0, 6).map((asset) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => setActiveAsset({ ...asset, identificationMethod: "manual_due_list" })}
                className="w-full rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-3 text-left"
              >
                <div className="font-semibold text-[var(--medtrak-text)]">{assetLabel(asset)}</div>
                <div className="text-xs text-[var(--medtrak-muted)]">{asset.location || "No location"}</div>
              </button>
            ))}
            {dueAssets.length === 0 && <p className="text-sm text-[var(--medtrak-muted)]">No due checks. Compliance is calm.</p>}
          </div>
        </div>

        {isAdmin && (
          <div className="mt-4 rounded-[1.5rem] border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-4">
            <button type="button" onClick={() => setShowAllAssets((v) => !v)} className="flex w-full items-center justify-between text-sm font-semibold text-[var(--medtrak-text)]">
              <span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-teal-200" /> All assets ({assets.length})</span>
              <span className="text-xs text-[var(--medtrak-muted)]">{showAllAssets ? "Hide" : "Show"}</span>
            </button>
            {showAllAssets && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-[var(--medtrak-muted)]">Create the asset on desktop first (Compliance → Create QR/NFC asset), then write its tag here — NFC writing needs the phone's native chip.</p>
                {assets.map((asset) => (
                  <div key={asset.id} className="rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-[var(--medtrak-text)]">{assetLabel(asset)}</div>
                        <div className="truncate text-xs text-[var(--medtrak-muted)]">{asset.location || "No location"} · {asset.frequency || "monthly"}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => writeAssetTag(asset)}
                        disabled={writingTagFor === asset.id || !nativeNfcAvailable()}
                        className="shrink-0 rounded-full border border-[var(--medtrak-border)] px-3 py-2 text-xs font-bold text-[var(--medtrak-text)] disabled:opacity-50"
                      >
                        {writingTagFor === asset.id ? "Hold tag…" : "Write tag"}
                      </button>
                    </div>
                  </div>
                ))}
                {assets.length === 0 && <p className="text-sm text-[var(--medtrak-muted)]">No compliance assets registered yet.</p>}
              </div>
            )}
            {writeMessage && <p className="mt-3 text-xs text-[var(--medtrak-muted)]">{writeMessage}</p>}
            {!nativeNfcAvailable() && <p className="mt-2 text-xs text-amber-600">Tag writing needs the installed Android app.</p>}
          </div>
        )}
      </div>

      <MobileBarcodeScanner
        onScan={(code) => handleScan(code, "qr")}
        triggerAttribute="data-compliance-scan-button"
        title="Scan compliance QR"
        helper="Scan the QR label on the fire point, water outlet or asset."
      />
    </div>
  );
}
