import React, { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, ChecksumException, DecodeHintType, FormatException } from "@zxing/library";
import { openAppSettings } from "@tauri-apps/plugin-barcode-scanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, CheckCircle2, Keyboard, Settings, X } from "lucide-react";

const SETTINGS_KEY = "primovex.barcode.settings.v1";
const DEFAULT_SETTINGS = { vibrate: true, successPause: 280 };
const readSettings = () => {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") }; }
  catch { return DEFAULT_SETTINGS; }
};
const isNativeMobileApp = () => Boolean(window.__TAURI_INTERNALS__) && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

export default function MobileBarcodeScanner({
  onScan,
  triggerAttribute = "data-mobile-scan-button",
  title = "Scan barcode",
  helper = "Point the rear camera at a product barcode. Manual entry is always available.",
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [errText, setErrText] = useState("");
  const [manual, setManual] = useState("");
  const [manualMode, setManualMode] = useState(false);
  const [permissionBlocked, setPermissionBlocked] = useState(false);
  const [scannerBusy, setScannerBusy] = useState(false);
  const [successCode, setSuccessCode] = useState("");
  const [settings, setSettings] = useState(readSettings);
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const videoTrackRef = useRef(null);
  const stoppedRef = useRef(false);
  const lastGuidanceRef = useRef(0);

  const saveSettings = (next) => {
    setSettings(next);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  };
  const stopScanner = () => {
    stoppedRef.current = true;
    try { controlsRef.current?.stop?.(); } catch {}
    controlsRef.current = null;
    try { videoRef.current?.srcObject?.getTracks?.().forEach((track) => track.stop()); } catch {}
    videoTrackRef.current = null;
    if (videoRef.current) {
      try { videoRef.current.pause(); videoRef.current.srcObject = null; } catch {}
    }
    setScannerBusy(false);
  };
  const resetState = () => {
    setStatus(""); setErrText(""); setManualMode(false); setPermissionBlocked(false);
    setScannerBusy(false); setSuccessCode("");
  };
  const close = () => { stopScanner(); setOpen(false); resetState(); };
  const submitCode = async (value) => {
    const code = String(value || "").trim();
    if (!code) return;
    stopScanner(); setSuccessCode(code); setStatus("Barcode captured");
    if (settings.vibrate && navigator.vibrate) navigator.vibrate([45, 30, 70]);
    await new Promise((resolve) => setTimeout(resolve, settings.successPause));
    onScan?.(code); setManual(""); close();
  };
  const showManualFallback = (message, blocked = false) => {
    setManualMode(true); setPermissionBlocked(blocked); setStatus(""); setErrText(message);
  };
  const refocusCamera = async () => {
    const track = videoTrackRef.current;
    if (!track?.applyConstraints) return;
    try {
      const capabilities = track.getCapabilities?.() || {};
      if (Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes("single-shot")) {
        await track.applyConstraints({ advanced: [{ focusMode: "single-shot" }] });
      }
      if (Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes("continuous")) {
        window.setTimeout(() => track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }).catch(() => {}), 350);
      }
      setStatus("Refocusing… keep the barcode still and ensure the numbers are sharp.");
    } catch {}
  };
  const startScanner = async () => {
    if (scannerBusy) return;
    setScannerBusy(true); setPermissionBlocked(false); setErrText("");
    setStatus("Starting rear camera…"); stoppedRef.current = false;
    if (!navigator?.mediaDevices?.getUserMedia) {
      showManualFallback("Camera scanning is not available on this device. Enter the barcode manually.");
      setScannerBusy(false); return;
    }
    try {
      stopScanner(); stoppedRef.current = false; setScannerBusy(true);
      const hints = new Map();
      hints.set(DecodeHintType.TRY_HARDER, true);
      hints.set(DecodeHintType.ALSO_INVERTED, true);
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.CODE_93, BarcodeFormat.ITF,
        BarcodeFormat.CODABAR, BarcodeFormat.DATA_MATRIX, BarcodeFormat.QR_CODE,
        BarcodeFormat.RSS_14, BarcodeFormat.RSS_EXPANDED, BarcodeFormat.PDF_417, BarcodeFormat.AZTEC,
      ]);
      const reader = new BrowserMultiFormatReader(hints, 250);
      controlsRef.current = await reader.decodeFromConstraints({
        audio: false,
        video: {
          facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 },
          advanced: [{ focusMode: "continuous" }],
        },
      }, videoRef.current, (result, error) => {
        if (!stoppedRef.current && result) submitCode(result.getText?.() || String(result));
        if (!stoppedRef.current && (error instanceof ChecksumException || error instanceof FormatException)) {
          const now = Date.now();
          if (now - lastGuidanceRef.current > 1200) {
            lastGuidanceRef.current = now;
            setStatus("Barcode detected. Hold still and move slightly closer.");
          }
        }
      });
      videoTrackRef.current = videoRef.current?.srcObject?.getVideoTracks?.()[0] || null;
      const capabilities = videoTrackRef.current?.getCapabilities?.() || {};
      if (Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes("continuous")) {
        await videoTrackRef.current.applyConstraints({ advanced: [{ focusMode: "continuous" }] }).catch(() => {});
      }
      setStatus("Camera active. Keep the complete barcode visible and move back until the numbers are sharp.");
    } catch (error) {
      const blocked = error?.name === "NotAllowedError" || error?.name === "SecurityError";
      const message = blocked
        ? "Camera access is blocked. Allow camera permission for Primovex, then retry."
        : `${error?.name || "ScannerError"}: ${error?.message || error}`;
      stopScanner(); showManualFallback(message, blocked);
    } finally { setScannerBusy(false); }
  };
  const openScanner = () => {
    resetState();
    if (isNativeMobileApp() && window.PrimovexBarcode?.startScan) {
      window.PrimovexBarcode.startScan();
      return;
    }
    setOpen(true);
  };

  useEffect(() => {
    const handleNativeBarcode = (event) => {
      const detail = event?.detail || {};
      if (detail.type === "result" && detail.value) {
        const code = String(detail.value).trim();
        if (settings.vibrate && navigator.vibrate) navigator.vibrate([45, 30, 70]);
        onScan?.(code);
      } else if (detail.type === "error") {
        resetState();
        setOpen(true);
        showManualFallback(detail.value || "The native barcode scanner could not start.", true);
      }
    };
    window.addEventListener("primovex-native-barcode", handleNativeBarcode);
    return () => window.removeEventListener("primovex-native-barcode", handleNativeBarcode);
  }, [onScan, settings.vibrate]);

  useEffect(() => {
    if (!open || manualMode || successCode) return undefined;
    const timer = window.setTimeout(startScanner, 120);
    return () => window.clearTimeout(timer);
  }, [open, manualMode, successCode]);
  useEffect(() => {
    const handleMobileLock = () => close();
    window.addEventListener("medtrak-mobile-lock", handleMobileLock);
    return () => { window.removeEventListener("medtrak-mobile-lock", handleMobileLock); stopScanner(); };
  }, []);

  return <>
    <Button {...{ [triggerAttribute]: true }} onClick={openScanner} className="hidden" variant="outline" disabled={scannerBusy}>
      <Camera className="h-4 w-4" />Scan
    </Button>
    {open && <div className="fixed inset-0 z-[150] flex flex-col bg-black px-3 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-[max(.75rem,env(safe-area-inset-top))] text-white">
      <div className="flex items-start justify-between gap-3 rounded-2xl !bg-[#071a33] p-3 !text-white" style={{ backgroundColor: "#071a33", color: "#fff" }}>
        <div><p className="font-bold">{title}</p><p className="mt-0.5 text-xs text-white/80">{status || helper}</p></div>
        <button type="button" onClick={close} className="inline-flex h-11 min-w-11 items-center justify-center rounded-full border border-white/30 bg-black/55 px-3 font-semibold text-white" aria-label="Close barcode scanner">
          <X className="mr-1 h-5 w-5" />Close
        </button>
      </div>

      <div className="relative my-3 min-h-0 flex-1 overflow-hidden rounded-3xl border-2 border-[var(--medtrak-accent)] bg-black">
        {!manualMode && !successCode && <>
          <video ref={videoRef} playsInline muted autoPlay onClick={refocusCamera} className="h-full min-h-[16rem] w-full object-cover" />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className="h-32 w-[82%] max-w-sm rounded-3xl border-[3px] border-[var(--medtrak-accent)] shadow-[0_0_0_999px_rgba(0,0,0,.32)]" /></div>
          <p className="pointer-events-none absolute bottom-3 left-3 right-3 rounded-xl !bg-black/75 px-3 py-2 text-center text-xs font-semibold !text-white" style={{ backgroundColor: "rgba(0,0,0,.78)", color: "#fff" }}>Move back until the printed numbers are sharp · tap preview to refocus</p>
        </>}
        {successCode && <div className="grid h-full min-h-[16rem] place-items-center bg-slate-950 text-center"><div>
          <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-400" /><p className="mt-3 font-bold">Barcode captured</p><p className="mt-1 text-xs text-white/70">{successCode}</p>
        </div></div>}
        {manualMode && !successCode && <div className="grid h-full min-h-[16rem] place-items-center bg-slate-950 px-6 text-center text-sm text-white/80">Camera paused. Enter the number below or retry the camera.</div>}
      </div>

      <div className="rounded-2xl border border-white/20 !bg-[#071a33] p-3 !text-white" style={{ backgroundColor: "#071a33", color: "#fff" }}>
        {errText && <div className="mb-3 rounded-xl bg-red-950/75 p-2 text-xs"><p>{errText}</p>
          {permissionBlocked && isNativeMobileApp() && <Button variant="outline" size="sm" className="mt-2 border-white/30 bg-transparent text-white" onClick={() => openAppSettings()}><Settings className="mr-2 h-4 w-4" />Open Android settings</Button>}
        </div>}
        <p className="mb-2 text-xs text-white/75">Manual barcode entry</p>
        <div className="flex gap-2">
          <Input value={manual} onChange={(event) => setManual(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); submitCode(manual); } }} inputMode="numeric" autoComplete="off" placeholder="Type barcode…" className="border-white/25 bg-white text-slate-950" />
          <Button onClick={() => submitCode(manual)} disabled={!manual.trim()}>Use</Button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="secondary" className="flex-1" disabled={scannerBusy} onClick={() => { stopScanner(); setManualMode(false); setErrText(""); window.setTimeout(startScanner, 80); }}><Camera className="mr-2 h-4 w-4" />{scannerBusy ? "Opening…" : "Retry camera"}</Button>
          <Button variant="outline" className="border-white/30 bg-transparent text-white" onClick={() => { stopScanner(); setManualMode((value) => !value); setErrText(""); }}><Keyboard className="mr-2 h-4 w-4" />{manualMode ? "Camera" : "Manual"}</Button>
        </div>
        <label className="mt-3 flex items-center gap-2 text-xs text-white/70"><input type="checkbox" checked={settings.vibrate} onChange={(event) => saveSettings({ ...settings, vibrate: event.target.checked })} />Vibrate after a successful scan</label>
      </div>
    </div>}
  </>;
}
