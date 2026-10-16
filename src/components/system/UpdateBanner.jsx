import { useEffect, useRef, useState } from "react";
import { CHECK_EVERY_MS, newerVersionReady } from "@/lib/appUpdate";

// "A new version of Primovex is ready": shown on the web app (iPhone Home Screen, browser) when a newer version has been published.
// It checks when the app is opened or brought back to the front, and every few minutes while it is open. Nothing is forced: the
// person taps Update when they are at a good point, so nothing half-typed is lost.

const isNativeApp = () => Boolean(window.__TAURI_INTERNALS__) || import.meta.env.MODE === "android";

export default function UpdateBanner() {
  const [ready, setReady] = useState(false);
  const lastCheck = useRef(0);
  useEffect(() => {
    if (!import.meta.env.PROD || isNativeApp()) return undefined;
    let live = true;
    const check = async (force = false) => {
      const now = Date.now();
      if (!force && now - lastCheck.current < CHECK_EVERY_MS) return;
      lastCheck.current = now;
      if (await newerVersionReady() && live) setReady(true);
    };
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    check(true);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    const timer = setInterval(() => check(), CHECK_EVERY_MS);
    return () => { live = false; document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("focus", onVisible); clearInterval(timer); };
  }, []);
  if (!ready) return null;
  return (
    <div role="status" className="fixed inset-x-3 z-[400] flex items-center justify-between gap-3 rounded-2xl border border-teal-300/50 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-50 shadow-2xl" style={{ bottom: "max(5.5rem, env(safe-area-inset-bottom))" }}>
      <span>A new version of Primovex is ready.</span>
      <button type="button" onClick={() => window.location.reload()} className="min-h-10 shrink-0 rounded-xl bg-teal-400 px-4 font-bold text-slate-950">Update now</button>
    </div>
  );
}
