import { useEffect, useRef, useState } from "react";
import { checkForDesktopUpdate, installDesktopUpdate, isDesktopApp } from "@/release/updateService";

// "A new version of Primovex is ready": shown in the installed Windows app when a newer signed release has been published. It checks
// shortly after the app opens and every few hours while it stays open. Nothing is forced: the person presses Update now at a good
// point, the new version downloads, and the app restarts into it. Later hides it until the next check.

const FIRST_CHECK_MS = 20 * 1000;
const EVERY_MS = 4 * 60 * 60 * 1000;

export default function DesktopUpdateBanner() {
  const [found, setFound] = useState(null); // { update, version }
  const [phase, setPhase] = useState("idle"); // idle | installing | error
  const [message, setMessage] = useState("");
  const [hidden, setHidden] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    if (!import.meta.env.PROD || !isDesktopApp()) return undefined;
    let live = true;
    const check = async () => {
      if (busy.current) return;
      try {
        const result = await checkForDesktopUpdate();
        if (live && result.supported && result.available) { setFound({ update: result.update, version: result.version }); setHidden(false); }
      } catch (error) {
        console.warn("Primovex update check failed", error?.message || error);
      }
    };
    const first = setTimeout(check, FIRST_CHECK_MS);
    const timer = setInterval(check, EVERY_MS);
    return () => { live = false; clearTimeout(first); clearInterval(timer); };
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
    <div role="status" className="fixed bottom-4 right-4 z-[400] flex max-w-sm flex-col gap-3 rounded-2xl border border-teal-300/50 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-50 shadow-2xl">
      <span>{phase === "installing" ? message : `A new version of Primovex${found.version ? ` (${found.version})` : ""} is ready.`}</span>
      {phase === "error" && <span className="text-xs font-normal text-rose-300">{message}</span>}
      {phase !== "installing" && (
        <div className="flex gap-2">
          <button type="button" onClick={install} className="min-h-10 flex-1 rounded-xl bg-teal-400 px-4 font-bold text-slate-950">{phase === "error" ? "Try again" : "Update now"}</button>
          <button type="button" onClick={() => setHidden(true)} className="min-h-10 rounded-xl border border-slate-600 px-4 font-bold">Later</button>
        </div>
      )}
    </div>
  );
}
