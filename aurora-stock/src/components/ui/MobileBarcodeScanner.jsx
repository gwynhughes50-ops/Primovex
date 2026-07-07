import React, { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Camera, Keyboard } from "lucide-react";

/**
 * MobileBarcodeScanner
 * Uses ZXing for much better mobile barcode detection than native BarcodeDetector.
 *
 * Props:
 * - onScan(code: string)
 */
export default function MobileBarcodeScanner({ onScan }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [errText, setErrText] = useState("");
  const [manual, setManual] = useState("");
  const [manualMode, setManualMode] = useState(false);

  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const readerRef = useRef(null);
  const stoppedRef = useRef(false);

  const stopScanner = () => {
    stoppedRef.current = true;

    try {
      controlsRef.current?.stop?.();
    } catch {
      // ignore
    }

    controlsRef.current = null;

    try {
      const stream = videoRef.current?.srcObject;
      if (stream?.getTracks) {
        stream.getTracks().forEach((track) => track.stop());
      }
    } catch {
      // ignore
    }

    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      } catch {
        // ignore
      }
    }
  };

  const close = () => {
    stopScanner();
    setOpen(false);
    setStatus("");
    setErrText("");
    setManualMode(false);
  };

  const submitCode = (value) => {
    const code = String(value || "").trim();
    if (!code) return;

    onScan?.(code);
    setManual("");
    close();
  };

  const startScanner = async () => {
    setErrText("");
    setStatus("Starting camera…");
    stoppedRef.current = false;

    if (!navigator?.mediaDevices?.getUserMedia) {
      setErrText("Camera API not available in this browser. Use manual entry.");
      setStatus("");
      setManualMode(true);
      return;
    }

    try {
      stopScanner();
      stoppedRef.current = false;

      const reader = new BrowserMultiFormatReader();

            readerRef.current = reader;

      setStatus("Camera active. Hold the barcode inside the box and keep still.");

      const controls = await reader.decodeFromConstraints(
        {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        videoRef.current,
        (result, error, controls) => {
          if (stoppedRef.current) return;

          if (result) {
            const text = result.getText?.() || String(result);
            if (text) {
              setStatus(`Scanned: ${text}`);
              submitCode(text);
            }
          }
        }
      );

      controlsRef.current = controls;
    } catch (e) {
      const name = e?.name || "ScannerError";
      const msg = e?.message || String(e);

      setErrText(
        `${name}: ${msg}\n\nTry better light, hold the phone still, or use manual entry.`
      );
      setStatus("");
      setManualMode(true);
      stopScanner();
    }
  };

  useEffect(() => {
    if (!open || manualMode) return;

    const t = setTimeout(() => {
      startScanner();
    }, 100);

    return () => {
      clearTimeout(t);
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, manualMode]);

  useEffect(() => {
    const handleMobileLock = () => close();
    window.addEventListener("medtrak-mobile-lock", handleMobileLock);

    return () => {
      window.removeEventListener("medtrak-mobile-lock", handleMobileLock);
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitManual = () => submitCode(manual);

  return (
    <>
      <Button
  data-mobile-scan-button
  onClick={() => setOpen(true)}
  className="hidden"
  variant="outline"
>
        <Camera className="h-4 w-4" />
        Scan
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur">
          <div className="w-full max-w-md rounded-2xl border border-slate-700/70 bg-slate-900/95 p-4 shadow-2xl text-slate-100">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Scan barcode</p>
                <p className="text-xs text-slate-400">
                  Rear camera scanning with manual fallback.
                </p>
              </div>

              <button
                type="button"
                onClick={close}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-slate-200 hover:bg-slate-700"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {!manualMode && (
              <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-black">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  className="h-72 w-full object-cover"
                />

                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-28 w-64 rounded-2xl border-2 border-teal-400/80 shadow-[0_0_30px_rgba(45,212,191,0.45)]" />
                </div>

                <div className="pointer-events-none absolute bottom-3 left-3 right-3 rounded-xl bg-black/50 px-3 py-2 text-xs text-white">
                  Fill the box with the barcode. Move slowly until it locks.
                </div>
              </div>
            )}

            {status && (
              <p className="mt-3 text-xs text-slate-300 whitespace-pre-line">
                {status}
              </p>
            )}

            {errText && (
              <p className="mt-3 text-xs text-rose-200 whitespace-pre-line">
                {errText}
              </p>
            )}

            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-slate-400">Manual barcode entry</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => {
                    stopScanner();
                    setManualMode((v) => !v);
                    setStatus("");
                    setErrText("");
                  }}
                >
                  <Keyboard className="mr-1 h-3.5 w-3.5" />
                  {manualMode ? "Use camera" : "Manual"}
                </Button>
              </div>

              <div className="flex gap-2">
                <Input
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submitManual();
                    }
                  }}
                  placeholder="Type or paste barcode…"
                />
                <Button onClick={submitManual} disabled={!manual.trim()}>
                  Add
                </Button>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setManualMode(false);
                  setErrText("");
                  setStatus("");
                  startScanner();
                }}
              >
                Retry camera
              </Button>
              <Button variant="ghost" onClick={close}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
