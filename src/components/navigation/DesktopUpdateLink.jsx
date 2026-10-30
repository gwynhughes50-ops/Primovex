import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import ReleaseUpdateCard from "@/release/ReleaseUpdateCard";
import { getInstalledVersion, isDesktopApp } from "@/release/updateService";

// "Check for updates" at the foot of the desktop sidebar, for everyone who signs in (not only people with access to the Security
// Centre, where the update card also lives). It shows the installed version and opens the update card, which checks straight away.
// The update check is only in the installed Windows app: the website and the phone update themselves. The website shows just its version number.

const WEB_VERSION = typeof __PRIMOVEX_VERSION__ !== "undefined" ? __PRIMOVEX_VERSION__ : "";
const WEB_BUILD = typeof __PRIMOVEX_BUILD__ !== "undefined" ? __PRIMOVEX_BUILD__ : "";

export default function DesktopUpdateLink({ collapsed = false }) {
  const [version, setVersion] = useState("");
  const [open, setOpen] = useState(false);
  const desktop = isDesktopApp();
  useEffect(() => { if (desktop) getInstalledVersion().then(setVersion); }, [desktop]);
  // The website updates itself, so there is nothing to check, but the version it is running is shown in the same place so a person can say which one they have
  if (!desktop) return collapsed || !WEB_VERSION ? null : <p className="mb-1 px-3 py-1 text-xs text-[var(--medtrak-muted)]" title={WEB_BUILD ? `Build ${WEB_BUILD}` : undefined}>Version {WEB_VERSION}</p>;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title="Check for updates" aria-label={`Check for updates. Installed version ${version}`}
        className={`mb-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs text-[var(--medtrak-muted)] hover:bg-[var(--medtrak-bg)] ${collapsed ? "justify-center px-0" : ""}`}>
        <RefreshCw className="h-4 w-4 shrink-0" aria-hidden="true" />
        {!collapsed && <span className="min-w-0 truncate">Version {version || "…"} · Check for updates</span>}
      </button>
      {open && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/50 p-4" role="presentation">
          <div role="dialog" aria-modal="true" aria-label="Check for updates" className="w-full max-w-md">
            <div className="mb-2 flex justify-end"><button type="button" onClick={() => setOpen(false)} className="rounded-full bg-[var(--medtrak-panel)] p-2 text-[var(--medtrak-muted)] shadow" aria-label="Close"><X className="h-4 w-4" /></button></div>
            <ReleaseUpdateCard autoCheck />
          </div>
        </div>
      )}
    </>
  );
}
