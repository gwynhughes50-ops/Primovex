import React, { useState } from "react";
import { Button } from "./button";
import { Camera, X, Check } from "lucide-react";
import useCameraCapture from "@/hooks/useCameraCapture";

export default function PhotoCapture({ onCapture, buttonLabel = "Take photo", disabled = false }) {
  const [open, setOpen] = useState(false);
  const { videoRef, error, captureFrame } = useCameraCapture(open);

  const handleCapture = () => {
    const dataUrl = captureFrame();
    if (!dataUrl) return;
    if (onCapture) onCapture(dataUrl);
    setOpen(false);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="text-xs px-3 py-2 flex items-center gap-1"
        onClick={() => setOpen(true)}
        disabled={disabled}
      >
        <Camera className="h-4 w-4" />
        {buttonLabel}
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900/95 p-4 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-slate-50">
                Take photo
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-slate-200 hover:bg-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {error ? (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300" role="alert">
                {error}
              </div>
            ) : (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full rounded-xl border border-slate-700 bg-black"
              />
            )}

            <div className="flex justify-end gap-2 mt-4">
              <Button
                type="button"
                variant="ghost"
                className="text-xs px-3 py-1.5"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="text-xs px-3 py-1.5 flex items-center gap-1"
                onClick={handleCapture}
                disabled={!!error}
              >
                <Check className="h-4 w-4" />
                Capture
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
