import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { previewFrameName, previewFrameRole } from "@/core/identity/viewAs";
import { OPEN_PHONE_PREVIEW } from "./ViewAsBanner";

// A phone-sized window on the desktop showing the phone app as another kind of account sees it. It is the real
// phone app in a frame, signed in as the administrator but showing the chosen role's screens, so nothing about the
// administrator's own window changes. The phone's own PIN lock appears inside it the first time.
export default function PhonePreview() {
  const { canViewAs } = useAuth();
  const [role, setRole] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const open = (event) => setRole(event.detail?.role || "");
    window.addEventListener(OPEN_PHONE_PREVIEW, open);
    return () => window.removeEventListener(OPEN_PHONE_PREVIEW, open);
  }, []);

  // never inside another preview, and only for an administrator
  if (!role || !canViewAs || previewFrameRole()) return null;
  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm" role="dialog" aria-label={`Phone preview as ${role}`}>
      <div className="flex max-h-full flex-col items-center gap-3">
        <div className="flex w-full items-center justify-between gap-4 rounded-full border border-white/15 bg-slate-900 px-4 py-2 text-white shadow-lg">
          <p className="text-sm font-semibold">Phone as <b>{role}</b></p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setReload((n) => n + 1)} className="inline-flex items-center gap-1.5 rounded-full border border-white/40 px-3 py-1 text-sm font-semibold text-white hover:bg-white/15"><RefreshCw className="h-4 w-4" aria-hidden="true" /> Restart</button>
            <button type="button" onClick={() => setRole("")} className="inline-flex items-center gap-1.5 rounded-full border border-white/40 px-3 py-1 text-sm font-semibold text-white hover:bg-white/15"><X className="h-4 w-4" aria-hidden="true" /> Close</button>
          </div>
        </div>
        <div className="overflow-hidden rounded-[2.5rem] border-[10px] border-slate-900 bg-white shadow-2xl" style={{ width: 390, height: "min(780px, calc(100vh - 8rem))" }}>
          <iframe key={`${role}-${reload}`} name={previewFrameName(role)} src="/" title={`Phone preview as ${role}`} className="h-full w-full border-0" />
        </div>
      </div>
    </div>
  );
}
