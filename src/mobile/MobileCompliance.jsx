import React, { useEffect, useMemo, useState } from "react";
import MobileBarcodeScanner from "@/components/ui/MobileBarcodeScanner";
import {
  CheckCircle2,
  XCircle,
  QrCode,
  SmartphoneNfc,
  Thermometer,
  Keyboard,
  ShieldCheck,
} from "lucide-react";
import {
  findComplianceAssetByScan,
  getAssetTypeConfig,
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

export default function MobileCompliance() {
  const SITE_ID = "main_branch";
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

  useEffect(() => subscribeComplianceAssets(setAssets, console.error, { siteId: SITE_ID }), []);

  const dueAssets = useMemo(() => assets.filter((asset) => !asset.lastCheckAt || asset.lastCheckResult === "fail"), [assets]);

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

  async function startNfcRead() {
    setScanError("");
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
      setMessage(check.result === "pass" ? "All OK. Audit trail saved." : "Issue detected. Pulse Event raised automatically.");
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
    <div className="min-h-screen bg-slate-950 px-4 pb-28 pt-5 text-white">
      <div className="mx-auto max-w-md">
        <div className="rounded-[2rem] border border-teal-400/20 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 p-5 shadow-2xl shadow-teal-950/30">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-teal-300">MedTrak Mobile</p>
              <h1 className="mt-2 text-2xl font-bold">Compliance QR</h1>
              <p className="mt-1 text-sm text-slate-400">Scan the point, tap once, and MedTrak records the rest.</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-400/10 text-teal-100">
              <QrCode className="h-6 w-6" />
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-slate-900/70 p-3">
              <div className="text-xl font-bold">{assets.length}</div>
              <div className="text-[10px] text-slate-400">Assets</div>
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
            className="rounded-[1.5rem] bg-teal-400 px-4 py-5 text-left font-bold text-slate-950 shadow-lg shadow-teal-500/20 active:scale-[0.99]"
          >
            <QrCode className="mb-3 h-7 w-7" />
            Scan QR
          </button>
          <button
            type="button"
            onClick={startNfcRead}
            className="rounded-[1.5rem] border border-violet-400/20 bg-violet-400/10 px-4 py-5 text-left font-bold text-violet-100 active:scale-[0.99]"
          >
            <SmartphoneNfc className="mb-3 h-7 w-7" />
            {nfcActive ? "Ready…" : "Tap NFC"}
          </button>
        </div>

        <div className="mt-4 rounded-[1.5rem] border border-white/10 bg-slate-900/70 p-4">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Manual Asset ID</label>
          <div className="mt-2 flex gap-2">
            <input
              value={manualId}
              onChange={(e) => setManualId(e.target.value)}
              placeholder="FP-007"
              className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none"
            />
            <button
              type="button"
              onClick={() => manualId && handleScan(manualId, "manual")}
              className="rounded-2xl bg-slate-800 px-4 py-3 text-slate-100"
            >
              <Keyboard className="h-5 w-5" />
            </button>
          </div>
        </div>

        {activeAsset && (
          <div className="fixed inset-0 z-[80] flex items-end bg-black/60 backdrop-blur-sm">
            <div className="w-full rounded-t-[2rem] border border-teal-400/20 bg-slate-950 p-5 shadow-2xl">
              <div className="mx-auto max-w-md">
                <p className="text-xs font-bold uppercase tracking-wide text-teal-300">Asset identified</p>
                <h2 className="mt-1 text-2xl font-bold text-white">{assetLabel(activeAsset)}</h2>
                <p className="mt-1 text-sm text-slate-400">{activeAsset.location || "No location"} • {config.label}</p>

                {isTemperature ? (
                  <div className="mt-5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Temperature °C</label>
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

        <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-slate-900/60 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white"><ShieldCheck className="h-4 w-4 text-teal-200" /> Due checks</div>
          <div className="space-y-2">
            {dueAssets.slice(0, 6).map((asset) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => setActiveAsset({ ...asset, identificationMethod: "manual_due_list" })}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/50 p-3 text-left"
              >
                <div className="font-semibold text-white">{assetLabel(asset)}</div>
                <div className="text-xs text-slate-400">{asset.location || "No location"}</div>
              </button>
            ))}
            {dueAssets.length === 0 && <p className="text-sm text-slate-400">No due checks. Compliance is calm.</p>}
          </div>
        </div>
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
