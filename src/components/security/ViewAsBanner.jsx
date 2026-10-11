import { Eye, Smartphone } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { previewFrameRole } from "@/core/identity/viewAs";

export const OPEN_PHONE_PREVIEW = "primovex:phone-preview";

// Shown while a System Admin is looking at Primovex as another kind of account (see core/identity/viewAs.js), so it
// is never mistaken for the real thing. On the desktop it offers a phone preview and a way back; inside the phone
// preview frame it is a slim reminder only.
export default function ViewAsBanner({ compact = false }) {
  const { viewingAs, realRole, setViewAs } = useAuth();
  const frameRole = previewFrameRole();
  if (!viewingAs) return null;
  if (frameRole || compact) {
    return (
      <div role="status" className="fixed inset-x-0 top-0 z-[300] flex items-center justify-center gap-1.5 bg-amber-500 px-3 py-1 text-center text-[11px] font-bold text-slate-950">
        <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> Previewing as {viewingAs}
      </div>
    );
  }
  return (
    <div role="status" className="sticky top-0 z-[60] flex flex-wrap items-center justify-between gap-2 bg-amber-500 px-4 py-2 text-sm text-slate-950">
      <p className="flex min-w-0 items-center gap-2 font-semibold"><Eye className="h-4 w-4 shrink-0" aria-hidden="true" /> Viewing Primovex as <b>{viewingAs}</b>. You are still signed in as {realRole}, so anything you do is recorded as you.</p>
      <div className="flex gap-2">
        <button type="button" onClick={() => window.dispatchEvent(new CustomEvent(OPEN_PHONE_PREVIEW, { detail: { role: viewingAs } }))} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950/10 px-3 py-1 font-bold hover:bg-slate-950/20"><Smartphone className="h-4 w-4" aria-hidden="true" /> Phone preview</button>
        <button type="button" onClick={() => setViewAs(null)} className="rounded-lg bg-slate-950 px-3 py-1 font-bold text-amber-100 hover:bg-slate-800">Back to {realRole}</button>
      </div>
    </div>
  );
}
