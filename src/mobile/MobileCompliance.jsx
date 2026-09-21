import React, { useEffect, useMemo, useState } from "react";
import MobileBarcodeScanner from "@/components/ui/MobileBarcodeScanner";
import {
  CheckCircle2,
  Droplets,
  Flame,
  Keyboard,
  QrCode,
  ShieldCheck,
  Sparkles,
  SmartphoneNfc,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { nativeNfcAvailable, writeNfcUrl } from "@/modules/sense/services/nfcService";
import {
  buildComplianceQrPayload,
  findComplianceAssetByScan,
  getAssetTypeConfig,
  getCountdownSeconds,
  getNextFirePointToTest,
  isComplianceCheckDue,
  isFireAlarmTestDueThisWeek,
  isFlushableAsset,
  recordComplianceCheck,
  subscribeComplianceAssets,
} from "@/services/compliance/complianceQrService";
import { PassFailSheet, TemperatureCheckSheet } from "@/mobile/compliance/CheckSheets";

function assetLabel(asset) {
  return [asset?.assetCode, asset?.label].filter(Boolean).join(" • ") || "Compliance asset";
}

function DueRow({ asset, onOpen }) {
  return (
    <button type="button" onClick={() => onOpen(asset)} className="w-full rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-3 text-left">
      <div className="font-semibold text-[var(--medtrak-text)]">{assetLabel(asset)}</div>
      <div className="text-xs text-[var(--medtrak-muted)]">{asset.location || "No location"}</div>
    </button>
  );
}

// The caretaker's compliance screen. The job is "tap a tag": the tag says what
// it is, the right check opens, and who did it and when are recorded by Primovex
// without being asked. Everything else on the screen is a fallback.
export default function MobileCompliance({ pendingNfcScan, onConsumeNfcScan }) {
  const SITE_ID = "main_branch";
  const { isAdmin, user, displayName } = useAuth();
  const [assets, setAssets] = useState([]);
  const [activeAsset, setActiveAsset] = useState(null);
  const [sheetKey, setSheetKey] = useState(0);
  const [manualId, setManualId] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [scanError, setScanError] = useState("");
  const [nfcActive, setNfcActive] = useState(false);
  const [showAllAssets, setShowAllAssets] = useState(false);
  const [writingTagFor, setWritingTagFor] = useState(null);
  const [writeMessage, setWriteMessage] = useState("");

  useEffect(() => subscribeComplianceAssets(setAssets, console.error, { siteId: SITE_ID }), []);

  const dueAssets = useMemo(() => assets.filter((asset) => isComplianceCheckDue(asset)), [assets]);
  const dueWater = useMemo(() => dueAssets.filter((asset) => String(asset.assetType || "").startsWith("water_")), [dueAssets]);
  const dueOther = useMemo(() => dueAssets.filter((asset) => !String(asset.assetType || "").startsWith("water_")), [dueAssets]);
  const failing = useMemo(() => assets.filter((asset) => asset.lastCheckResult === "fail").length, [assets]);
  const fireTestDue = useMemo(() => isFireAlarmTestDueThisWeek(assets), [assets]);
  const nextFirePoint = useMemo(() => getNextFirePointToTest(assets), [assets]);

  function openCheck(asset, identificationMethod, scanRaw) {
    setResult(null);
    setScanError("");
    setActiveAsset({ ...asset, identificationMethod, scanRaw });
    setSheetKey((k) => k + 1);
  }

  async function handleScan(code, method = "qr") {
    setScanError("");
    setResult(null);
    try {
      const asset = await findComplianceAssetByScan(code, { siteId: SITE_ID });
      openCheck(asset, method, code);
    } catch (error) {
      console.error(error);
      setScanError(error?.message || "Asset not found. Try entering the code.");
    }
  }

  // A compliance tag scanned anywhere in the app (MobileLayout's global NFC
  // listener) lands here as a prop rather than a local event, since the
  // native reader-mode listener that actually detects the tap lives outside
  // this component entirely.
  useEffect(() => {
    if (!pendingNfcScan) return;
    handleScan(pendingNfcScan.value, pendingNfcScan.method);
    setNfcActive(false);
    onConsumeNfcScan?.();
  }, [pendingNfcScan]);

  // MainActivity.kt's NFC reader mode already runs whenever the app is in the
  // foreground, so on the installed app a tap just works. This only puts the
  // screen into a waiting state; Web NFC is a fallback for testing in a mobile
  // browser.
  async function startNfcRead() {
    setScanError("");
    if (nativeNfcAvailable()) {
      setNfcActive(true);
      return;
    }
    if (!("NDEFReader" in window)) {
      setScanError("NFC is not supported here. Use Scan QR or enter the code.");
      return;
    }
    try {
      setNfcActive(true);
      const reader = new window.NDEFReader();
      await reader.scan();
      reader.onreading = async (event) => {
        const record = event.message.records[0];
        let text = event.serialNumber || "";
        try {
          if (record?.recordType === "text") {
            text = new TextDecoder(record.encoding || "utf-8").decode(record.data);
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
      setScanError(error?.message || "NFC read failed. Use Scan QR instead.");
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

  async function submitCheck(fields) {
    if (!activeAsset) return;
    setBusy(true);
    setScanError("");
    try {
      const check = await recordComplianceCheck(activeAsset, {
        ...fields,
        // The person's name as the practice knows them, not just their login email.
        actor: { uid: user?.uid || null, email: user?.email || null, displayName: displayName || user?.displayName || user?.email || "Unknown user" },
        source: "mobile_compliance",
        identificationMethod: activeAsset.identificationMethod || "qr",
        scanRaw: activeAsset.scanRaw,
      });
      const temp = check.checkMode === "temperature" && check.tempC !== null && check.tempC !== undefined ? ` (${check.tempC}°C)` : "";
      setResult({ ok: check.result === "pass", label: assetLabel(activeAsset), temp });
      setActiveAsset(null);
    } catch (error) {
      console.error(error);
      setScanError("Could not save the check. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const config = getAssetTypeConfig(activeAsset?.assetType);
  const isTemperature = activeAsset?.checkMode === "temperature";

  return (
    <div className="pvx-mobile-page pvx-compliance-page">
      <div className="mx-auto max-w-md">
        <div className="pvx-compliance-hero">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-[var(--medtrak-accent)]">Primovex Mobile</p>
          <h1 className="mt-2 text-2xl font-bold">Compliance</h1>
          <p className="mt-1 text-sm text-[var(--medtrak-muted)]">Tap a tag with your phone. Primovex records who and when.</p>
        </div>

        <button
          type="button"
          onClick={startNfcRead}
          className="mt-4 flex w-full items-center gap-4 rounded-[1.5rem] bg-[var(--medtrak-accent)] px-5 py-6 text-left text-white shadow-lg active:scale-[0.99]"
        >
          <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/20 ${nfcActive ? "animate-pulse" : ""}`}>
            <SmartphoneNfc className="h-8 w-8" />
          </span>
          <span>
            <span className="block text-xl font-bold">Tap a tag</span>
            <span className="block text-sm text-white/85">{nfcActive ? "Hold the phone to the tag…" : "Hold the phone to a fire point or water outlet tag"}</span>
          </span>
        </button>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <button type="button" onClick={() => document.querySelector("[data-compliance-scan-button]")?.click()} className="flex items-center justify-center gap-2 rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-4 py-3 font-semibold">
            <QrCode className="h-5 w-5 text-[var(--medtrak-accent)]" /> Scan QR
          </button>
          <button type="button" onClick={() => setShowManual((v) => !v)} className="flex items-center justify-center gap-2 rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-4 py-3 font-semibold">
            <Keyboard className="h-5 w-5 text-[var(--medtrak-accent)]" /> Enter code
          </button>
        </div>

        {showManual && (
          <div className="mt-3 flex gap-2 rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-3">
            <input
              value={manualId}
              onChange={(e) => setManualId(e.target.value)}
              placeholder="FP-007"
              aria-label="Asset code"
              className="min-w-0 flex-1 rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] px-4 py-3 text-[var(--medtrak-text)] outline-none"
            />
            <button type="button" onClick={() => manualId && handleScan(manualId, "manual")} className="rounded-xl bg-[var(--medtrak-accent)] px-5 py-3 font-bold text-white">Go</button>
          </div>
        )}

        {result && (
          <div className={`mt-4 flex items-center gap-3 rounded-[1.5rem] border p-4 ${result.ok ? "border-emerald-500/40 bg-emerald-500/10" : "border-rose-500/40 bg-rose-500/10"}`} role="status">
            {result.ok ? <CheckCircle2 className="h-7 w-7 text-emerald-600" /> : <XCircle className="h-7 w-7 text-rose-600" />}
            <div>
              <div className="font-bold">{result.ok ? "Saved: pass" : "Saved: fail"}{result.temp}</div>
              <div className="text-sm text-[var(--medtrak-muted)]">{result.label}{result.ok ? "" : ". The caretaker has been alerted."}</div>
            </div>
          </div>
        )}

        {scanError && (
          <div className="mt-4 rounded-[1.5rem] border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-700" role="alert">{scanError}</div>
        )}

        {nextFirePoint && (
          <div className={`mt-5 rounded-[1.5rem] border p-4 ${fireTestDue ? "border-amber-500/40 bg-amber-500/10" : "border-[var(--medtrak-border)] bg-[var(--medtrak-panel)]"}`}>
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold"><Flame className="h-4 w-4 text-amber-500" /> Weekly fire test</div>
            <p className="text-xs text-[var(--medtrak-muted)]">{fireTestDue ? "No call point tested this week yet." : "A call point has been tested this week."}</p>
            <button type="button" onClick={() => openCheck(nextFirePoint, "manual_fire_rotation")} className="mt-3 w-full rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-3 text-left">
              <div className="font-semibold">Next up: {assetLabel(nextFirePoint)}</div>
              <div className="text-xs text-[var(--medtrak-muted)]">{nextFirePoint.location || "No location"} · {nextFirePoint.lastCheckAt ? "Longest since last tested" : "Never tested yet"}</div>
            </button>
          </div>
        )}

        {(dueWater.length > 0 || dueOther.length > 0 || failing > 0) && (
          <div className="mt-5 rounded-[1.5rem] border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-4">
            <div className="mb-3 flex items-center justify-between gap-2 text-sm font-semibold">
              <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[var(--medtrak-accent)]" /> To do</span>
              {failing > 0 && <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-xs font-bold text-rose-700">{failing} failing</span>}
            </div>
            {dueWater.length > 0 && (
              <div className="mb-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--medtrak-muted)]"><Droplets className="h-3.5 w-3.5" /> Water outlets</p>
                <div className="space-y-2">{dueWater.slice(0, 8).map((asset) => <DueRow key={asset.id} asset={asset} onOpen={(a) => openCheck(a, "manual_due_list")} />)}</div>
              </div>
            )}
            {dueOther.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--medtrak-muted)]">Other checks</p>
                <div className="space-y-2">{dueOther.slice(0, 8).map((asset) => <DueRow key={asset.id} asset={asset} onOpen={(a) => openCheck(a, "manual_due_list")} />)}</div>
              </div>
            )}
          </div>
        )}
        {dueAssets.length === 0 && !nextFirePoint && assets.length > 0 && (
          <p className="mt-5 text-center text-sm text-[var(--medtrak-muted)]">Nothing due. Compliance is up to date.</p>
        )}

        {isAdmin && (
          <div className="mt-5 rounded-[1.5rem] border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-4">
            <button type="button" onClick={() => setShowAllAssets((v) => !v)} className="flex w-full items-center justify-between text-sm font-semibold">
              <span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-[var(--medtrak-accent)]" /> Write tags ({assets.length})</span>
              <span className="text-xs text-[var(--medtrak-muted)]">{showAllAssets ? "Hide" : "Show"}</span>
            </button>
            {showAllAssets && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-[var(--medtrak-muted)]">Create the asset on desktop first (Compliance, Assets and tags), then write its tag here. Writing needs the phone's own NFC chip.</p>
                {assets.map((asset) => (
                  <div key={asset.id} className="rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{assetLabel(asset)}</div>
                        <div className="truncate text-xs text-[var(--medtrak-muted)]">{asset.location || "No location"} · {asset.frequency || "monthly"}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => writeAssetTag(asset)}
                        disabled={writingTagFor === asset.id || !nativeNfcAvailable()}
                        className="shrink-0 rounded-xl bg-[var(--medtrak-accent)] px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
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

      {activeAsset && isTemperature && (
        <TemperatureCheckSheet
          key={sheetKey}
          asset={activeAsset}
          seconds={getCountdownSeconds(activeAsset)}
          showFlushed={isFlushableAsset(activeAsset)}
          busy={busy}
          onSubmit={submitCheck}
          onCancel={() => setActiveAsset(null)}
        />
      )}
      {activeAsset && !isTemperature && (
        <PassFailSheet
          key={sheetKey}
          asset={activeAsset}
          eyebrow={activeAsset.assetType === "fire_point" ? "Fire point test" : config.label}
          busy={busy}
          onSubmit={submitCheck}
          onCancel={() => setActiveAsset(null)}
        />
      )}

      <MobileBarcodeScanner
        onScan={(code) => handleScan(code, "qr")}
        triggerAttribute="data-compliance-scan-button"
        title="Scan compliance QR"
        helper="Scan the QR label on the fire point, water outlet or asset."
      />
    </div>
  );
}
