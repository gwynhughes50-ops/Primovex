import { MapPin, X } from "lucide-react";
import { useSenseSession } from "@/contexts/SenseSessionContext";

export default function ActiveSenseBanner() {
  const { activeSenseSession, clear } = useSenseSession();
  if (!activeSenseSession) return null;

  return (
    <div className="fixed inset-x-3 top-[max(4.2rem,calc(env(safe-area-inset-top)+3.2rem))] z-[68] rounded-2xl border border-[color-mix(in_srgb,var(--medtrak-accent)_28%,var(--medtrak-border))] bg-[var(--medtrak-panel)] px-3 py-2.5 shadow-lg">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--medtrak-accent)_12%,var(--medtrak-panel))] text-[var(--medtrak-accent)]">
          <MapPin className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[var(--medtrak-accent)]">Active Sense location</p>
          <p className="truncate text-sm font-bold text-[var(--medtrak-text)]">{activeSenseSession.senseObjectName}</p>
          <p className="text-xs text-[var(--medtrak-muted)]">Scanned stock will use this room as the suggested destination.</p>
        </div>
        <button type="button" onClick={() => clear("user_cleared_room")} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[var(--medtrak-border)]" aria-label="Clear active room">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
