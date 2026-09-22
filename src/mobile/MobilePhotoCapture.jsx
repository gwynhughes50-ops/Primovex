import { Camera, Check, X } from "lucide-react";
import useCameraCapture from "@/hooks/useCameraCapture";

// The mobile equivalent of the desktop PhotoCapture dialog, styled as a
// bottom sheet to match the rest of the mobile app rather than a centred
// desktop-style modal. Shares the same camera-handling hook, so a permission
// refusal or missing camera behaves identically on both platforms.
export default function MobilePhotoCapture({ open, onClose, onCapture }) {
  const { videoRef, error, captureFrame } = useCameraCapture(open);

  if (!open) return null;

  function capture() {
    const dataUrl = captureFrame();
    if (!dataUrl) return;
    onCapture(dataUrl);
  }

  return (
    <div className="fixed inset-x-0 top-0 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-[95] flex items-end bg-black/60">
      <section className="w-full rounded-t-[2rem] border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-[var(--medtrak-text)] shadow-2xl">
        <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-[var(--medtrak-border)]" />
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-sm font-bold"><Camera className="h-5 w-5 text-[var(--medtrak-accent)]" /> Take a photo</p>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full border border-[var(--medtrak-border)]"><X className="h-4 w-4" /></button>
        </div>

        {error ? (
          <div className="mt-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300" role="alert">{error}</div>
        ) : (
          <video ref={videoRef} autoPlay playsInline muted className="mt-3 w-full rounded-2xl border border-[var(--medtrak-border)] bg-black" />
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} className="min-h-14 rounded-2xl border border-[var(--medtrak-border)] px-3 py-3 text-lg font-bold">Cancel</button>
          <button type="button" onClick={capture} disabled={!!error} className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[var(--medtrak-accent)] px-3 py-3 text-lg font-bold text-white disabled:opacity-40"><Check className="h-5 w-5" /> Capture</button>
        </div>
      </section>
    </div>
  );
}
