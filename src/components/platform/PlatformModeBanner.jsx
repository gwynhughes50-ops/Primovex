import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getPlatformModeConfig, getStoredPlatformMode } from "@/config/platformMode";
import { Icons } from "@/config/medtrakIcons";

export default function PlatformModeBanner({ compact = false }) {
  const [mode, setMode] = useState(() => getStoredPlatformMode());
  const config = getPlatformModeConfig(mode);

  useEffect(() => {
    const update = () => setMode(getStoredPlatformMode());
    window.addEventListener("storage", update);
    window.addEventListener("medtrak:platform-mode-changed", update);
    return () => {
      window.removeEventListener("storage", update);
      window.removeEventListener("medtrak:platform-mode-changed", update);
    };
  }, []);

  if (mode === "live" && compact) return null;

  return (
    <div className={`mb-4 rounded-2xl border px-4 py-3 shadow-lg ${config.bannerClass}`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <span className={`mt-1 h-2.5 w-2.5 rounded-full ${config.dotClass}`} />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-black uppercase tracking-[0.2em]">{config.shortLabel}</span>
              <span className="rounded-full border border-white/15 px-2 py-0.5 text-[11px] font-semibold opacity-90">
                {mode === "live" ? "Production" : "Synthetic data"}
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 opacity-90">{config.dataPolicy}</p>
          </div>
        </div>
        <Link
          to="/practice-admin?tab=platform"
          className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold hover:bg-white/10"
        >
          <Icons.settings className="h-3.5 w-3.5" />
          Platform mode
        </Link>
      </div>
    </div>
  );
}
