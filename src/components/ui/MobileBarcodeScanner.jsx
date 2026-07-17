import React, { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import {
  Format,
  checkPermissions,
  openAppSettings,
  requestPermissions,
  scan,
} from "@tauri-apps/plugin-barcode-scanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, CheckCircle2, Keyboard, Settings, X } from "lucide-react";

const MOBILE_FORMATS = [
  Format.EAN13, Format.EAN8, Format.UPC_A, Format.UPC_E,
  Format.Code128, Format.Code39, Format.ITF, Format.Codabar,
  Format.DataMatrix, Format.QRCode,
];
const SETTINGS_KEY = "primovex.barcode.settings.v1";
const DEFAULT_SETTINGS = { vibrate: true, successPause: 280 };

function readSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") }; }
  catch { return DEFAULT_SETTINGS; }
}
function isNativeMobileApp() {
  return Boolean(window.__TAURI_INTERNALS__) && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}
function isGranted(value) { return value === "granted"; }
function canPrompt(value) { return value === "prompt" || value === "prompt-with-rationale"; }

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
  const [nativeBusy, setNativeBusy] = useState(false);
  const [successCode, setSuccessCode] = useState("");
  const [settings, setSettings] = useState(readSettings);
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const stoppedRef = useRef(false);

  const saveSettings = (next) => {
    setSettings(next);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  };
  const stopBrowserScanner = () => {
    stoppedRef.current = true;
    try { controlsRef.current?.stop?.(); } catch {}
    controlsRef.current = null;
    try { videoRef.current?.srcObject?.getTracks?.().forEach((track) => track.stop()); } catch {}
    if (videoRef.current) { try { videoRef.current.pause(); videoRef.current.srcObject = null; } catch {} }
  };
  const resetState = () => {
    setStatus(""); setErrText(""); setManualMode(false);
    setPermissionBlocked(false); setNativeBusy(false); setSuccessCode("");
  };
  const close = () => { stopBrowserScanner(); setOpen(false); resetState(); };
  const submitCode = async (value) => {
    const code = String(value || "").trim();
    if (!code) return;
    stopBrowserScanner();
    setSuccessCode(code);
    setStatus("Barcode captured");
    if (settings.vibrate && navigator.vibrate) navigator.vibrate([45, 30, 70]);
    await new Promise((resolve) => setTimeout(resolve, settings.successPause));
    onScan?.(code);
    setManual("");
    close();
  };
  const showManualFallback = (message, blocked = false) => {
    setOpen(true); setManualMode(true); setPermissionBlocked(blocked);
    setStatus(""); setErrText(message);
  };
  const startNativeScanner = async () => {
    if (nativeBusy) return;
    setNativeBusy(true); setPermissionBlocked(false); setErrText("");
    try {
      let permission = await checkPermissions();
      if (!isGranted(permission) && canPrompt(permission)) permission = await requestPermissions();
      if (!isGranted(permission)) {
        showManualFallback("Camera access is switched off for Primovex. Enable it in Android settings or enter the barcode manually.", true);
        return;
      }
      setStatus("Camera ready. Centre the barcode and hold still.");
      const result = await scan({ cameraDirection: "back", formats: MOBILE_FORMATS, windowed: false });
      if (result?.content) await submitCode(result.content);
    } catch (error) {
      const message = String(error?.message || error || "Camera scanner could not start.");
      if (!/cancel/i.test(message)) showManualFallback(`${message}\n\nRetry the camera or enter the barcode manually.`);
    } finally { setNativeBusy(false); }
  };
  const startBrowserScanner = async () => {
    setErrText(""); setStatus("Starting camera…"); stoppedRef.current = false;
    if (!navigator?.mediaDevices?.getUserMedia) return showManualFallback("Camera scanning is not available here. Enter the barcode manually.");
    try {
      stopBrowserScanner(); stoppedRef.current = false;
      const reader = new BrowserMultiFormatReader();
      setStatus("Camera active. Fill the frame with the barcode.");
      controlsRef.current = await reader.decodeFromConstraints({ audio:false, video:{ facingMode:{ ideal:"environment" }, width:{ ideal:1280 }, height:{ ideal:720 } } }, videoRef.current, (result) => {
        if (!stoppedRef.current && result) submitCode(result.getText?.() || String(result));
      });
    } catch (error) {
      const blocked = error?.name === "NotAllowedError";
      showManualFallback(blocked ? "Camera access is blocked. Allow camera permission, then retry." : `${error?.name || "ScannerError"}: ${error?.message || error}`, blocked);
      stopBrowserScanner();
    }
  };
  const openScanner = async () => { resetState(); if (isNativeMobileApp()) await startNativeScanner(); else setOpen(true); };

  useEffect(() => {
    if (!open || manualMode || isNativeMobileApp()) return;
    const timer = setTimeout(startBrowserScanner, 100);
    return () => { clearTimeout(timer); stopBrowserScanner(); };
  }, [open, manualMode]);
  useEffect(() => {
    const handleMobileLock = () => close();
    window.addEventListener("medtrak-mobile-lock", handleMobileLock);
    return () => { window.removeEventListener("medtrak-mobile-lock", handleMobileLock); stopBrowserScanner(); };
  }, []);

  return <>
    <Button {...{ [triggerAttribute]: true }} onClick={openScanner} className="hidden" variant="outline" disabled={nativeBusy}><Camera className="h-4 w-4"/>Scan</Button>
    {open && <div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/65 px-3 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-[max(.75rem,env(safe-area-inset-top))] backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-[1.75rem] border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-4 text-[var(--medtrak-text)] shadow-2xl">
        <div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">{title}</p><p className="text-xs text-[var(--medtrak-muted)]">{helper}</p></div><button onClick={close} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--medtrak-border)] bg-[var(--medtrak-surface)]" aria-label="Close scanner"><X className="h-4 w-4"/></button></div>
        {successCode ? <div className="grid min-h-64 place-items-center rounded-2xl border border-[color-mix(in_srgb,var(--medtrak-success,#12b76a)_35%,var(--medtrak-border))] bg-[color-mix(in_srgb,var(--medtrak-success,#12b76a)_10%,var(--medtrak-panel))] text-center"><div><CheckCircle2 className="mx-auto h-14 w-14 text-[var(--medtrak-success,#12b76a)]"/><p className="mt-3 font-bold">Barcode captured</p><p className="mt-1 text-xs text-[var(--medtrak-muted)]">{successCode}</p></div></div> : null}
        {!successCode && !manualMode && !isNativeMobileApp() && <div className="relative min-h-[18rem] overflow-hidden rounded-2xl border border-[var(--medtrak-border)] bg-black"><video ref={videoRef} playsInline muted autoPlay className="block h-[min(52vh,24rem)] min-h-[18rem] w-full object-cover"/><div className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className="h-28 w-64 rounded-2xl border-2 border-[var(--medtrak-accent)] shadow-[0_0_0_999px_rgba(0,0,0,.38)]"/></div><div className="absolute bottom-3 left-3 right-3 rounded-xl bg-black/60 px-3 py-2 text-xs text-white">Move slowly until Primovex locks onto the barcode.</div></div>}
        {status && !successCode && <p className="mt-3 text-xs text-[var(--medtrak-muted)]">{status}</p>}
        {errText && <div className="mt-3 rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-surface)] p-3 text-xs"><p className="whitespace-pre-line">{errText}</p>{permissionBlocked && <Button variant="outline" size="sm" className="mt-3" onClick={() => openAppSettings()}><Settings className="mr-2 h-4 w-4"/>Open Android settings</Button>}</div>}
        {!successCode && <div className="mt-4 space-y-2"><div className="flex items-center justify-between gap-2"><p className="text-xs text-[var(--medtrak-muted)]">Manual barcode entry</p>{!isNativeMobileApp() && <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { stopBrowserScanner(); setManualMode(v=>!v); setStatus(""); setErrText(""); }}><Keyboard className="mr-1 h-3.5 w-3.5"/>{manualMode ? "Use camera" : "Manual"}</Button>}</div><div className="flex gap-2"><Input value={manual} onChange={e=>setManual(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter"){e.preventDefault();submitCode(manual);} }} inputMode="numeric" autoComplete="off" placeholder="Type or paste barcode…"/><Button onClick={()=>submitCode(manual)} disabled={!manual.trim()}>Use</Button></div></div>}
        {!successCode && <div className="mt-4 flex items-center justify-between gap-3"><label className="flex items-center gap-2 text-xs text-[var(--medtrak-muted)]"><input type="checkbox" checked={settings.vibrate} onChange={e=>saveSettings({...settings,vibrate:e.target.checked})}/>Vibrate on scan</label><div className="flex gap-2"><Button variant="outline" disabled={nativeBusy} onClick={()=>{setErrText("");setPermissionBlocked(false);if(isNativeMobileApp())startNativeScanner();else{setManualMode(false);startBrowserScanner();}}}><Camera className="mr-2 h-4 w-4"/>{nativeBusy?"Opening…":"Retry"}</Button><Button variant="ghost" onClick={close}>Close</Button></div></div>}
      </div>
    </div>}
  </>;
}
