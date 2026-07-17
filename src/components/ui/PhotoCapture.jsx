import React, { useEffect, useRef, useState } from "react";
import { Button } from "./button";
import { Camera, X, Check } from "lucide-react";

export default function PhotoCapture({ onCapture, buttonLabel = "Take photo" }) {
  const [open, setOpen] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (err) {
        console.error("Camera error", err);
      }
    }

    start();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [open]);

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement("canvas");
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, width, height);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
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
      >
        <Camera className="h-4 w-4" />
        {buttonLabel}
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur">
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

            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full rounded-xl border border-slate-700 bg-black"
            />

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
