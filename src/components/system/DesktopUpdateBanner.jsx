import { useEffect, useRef, useState } from "react";
import { checkForDesktopUpdate, installDesktopUpdate, isDesktopApp } from "@/release/updateService";

// "A new version of Primovex is ready": a box in the middle of the screen, shown in the installed Windows app when a newer signed release has been published. It checks
// shortly after the app opens and every few hours while it stays open. Nothing is forced: the person presses Update now at a good
// point, the new version downloads, and the app restarts into it. Later hides it until the next check.

const FIRST_CHECK_MS = 20 * 1000;
const EVERY_MS = 4 * 60 * 60 * 1000;
// when a check could not reach the update address at all, look again soon (after 2, 10 and 30 minutes) instead of waiting hours
const AFTER_FAILURE_MS = [2 * 60 * 1000, 10 * 60 * 1000, 30 * 60 * 1000];

export default function DesktopUpdateBanner() {
  const [found, setFound] = useState(null); // { update, version }
  const [phase, setPhase] = useState("idle"); // idle | installing | error
  const [message, setMessage] = useState("");
  const [hidden, setHidden] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    if (!import.meta.env.PROD || !isDesktopApp()) return undefined;
    let live = true;
    let retry;
    let failures = 0;
    const check = async () => {
      if (busy.current) return;
      try {
        const result = await checkForDesktopUpdate();
        failures = 0;
        if (live && result.supported && result.available) { setFound({ update: result.update, version: result.version, notes: result.notes }); setHidden(false); }
      } catch (error) {
        console.warn("Primovex update check failed", error?.message || error);
        if (live && failures < AFTER_FAILURE_MS.length) retry = setTimeout(check, AFTER_FAILURE_MS[failures]);
        failures += 1;
      }
    };
    const first = setTimeout(check, FIRST_CHECK_MS);
    const timer = setInterval(() => { failures = 0; check(); }, EVERY_MS);
    return () => { live = false; clearTimeout(first); clearTimeout(retry); clearInterval(timer); };
  }, []);

  if (!found || hidden) return null;

  const install = async () => {
    busy.current = true;
    setPhase("installing");
    setMessage("Downloading the update…");
    try {
      await installDesktopUpdate(found.update, ({ downloaded, total }) => {
        setMessage(total ? `Downloading the update… ${Math.round((downloaded / total) * 100)}%` : "Downloading the update…");
      });
    } catch (error) {
      busy.current = false;
      setPhase("error");
      setMessage(error?.message || "The update could not be installed. Try again in a moment.");
    }
  };

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="desktop-update-title" className="w-full max-w-md rounded-3xl border border-teal-300/50 bg-slate-900 p-6 text-slate-50 shadow-2xl">
        <p id="desktop-update-title" className="text-xl font-black">{phase === "installing" ? "Updating Primovex" : "A new version of Primovex is ready"}</p>
        {phase === "installing" ? (
          <p className="mt-3 text-sm text-slate-300">{message} Primovex will restart by itself when it is done.</p>
        ) : (
          <>
            {found.version && <p className="mt-1 text-sm font-semibold text-teal-300">Version {found.version}</p>}
            {found.notes && <p className="mt-3 text-sm text-slate-300">{found.notes}</p>}
            {phase === "error" && <p className="mt-3 text-sm text-rose-300">{message}</p>}
            <div className="mt-5 flex gap-3">
              <button type="button" onClick={install} className="min-h-11 flex-1 rounded-xl bg-teal-400 px-4 font-bold text-slate-950">{phase === "error" ? "Try again" : "Update now"}</button>
              <button type="button" onClick={() => setHidden(true)} className="min-h-11 rounded-xl border border-slate-600 px-5 font-bold">Later</button>
            </div>
            <p className="mt-3 text-xs text-slate-400">Save anything you are in the middle of first. Primovex restarts to finish.</p>
          </>
        )}
      </div>
    </div>
  );
}
