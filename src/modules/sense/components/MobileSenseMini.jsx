import { Boxes, ClipboardCheck, MapPin, MessageSquareWarning, Sparkles, SprayCan, X } from "lucide-react";
import { useSenseSession } from "@/contexts/SenseSessionContext";

function elapsed(startedAt) {
  const value = startedAt?.toDate ? startedAt.toDate() : startedAt ? new Date(startedAt) : null;
  if (!value || Number.isNaN(value.getTime())) return "just now";
  const minutes = Math.max(0, Math.floor((Date.now() - value.getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

export default function MobileSenseMini({ onStock, onIssues, onChecks, onCleaning, onAsk }) {
  const { activeSenseSession, clear, loading } = useSenseSession();
  if (!activeSenseSession) return null;

  const roomName = activeSenseSession.senseObjectName || activeSenseSession.senseObjectId || "Active room";

  return (
    <section className="mx-4 mt-3 rounded-3xl border border-[color-mix(in_srgb,var(--medtrak-accent)_32%,var(--medtrak-border))] bg-[var(--medtrak-panel)] p-4 text-[var(--medtrak-text)] shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--medtrak-accent)_12%,var(--medtrak-panel))] text-[var(--medtrak-accent)]">
            <MapPin className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[0.66rem] font-bold uppercase tracking-[0.16em] text-[var(--medtrak-accent)]">Sense room active</p>
            <h2 className="truncate text-lg font-bold">{roomName}</h2>
            <p className="text-xs text-[var(--medtrak-muted)]">Working here for {elapsed(activeSenseSession.startedAt)}</p>
          </div>
        </div>
        <button type="button" onClick={() => clear("manual_room_clear")} disabled={loading} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)]" aria-label="Clear active room">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2">
        <Action icon={Boxes} label="Stock" onClick={onStock} />
        <Action icon={SprayCan} label="Cleaning" onClick={onCleaning} />
        <Action icon={MessageSquareWarning} label="Issues" onClick={onIssues} />
        <Action icon={ClipboardCheck} label="Checks" onClick={onChecks} />
      </div>

      <button type="button" onClick={onAsk} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-[color-mix(in_srgb,var(--medtrak-accent)_32%,var(--medtrak-border))] bg-[color-mix(in_srgb,var(--medtrak-accent)_9%,var(--medtrak-panel))] px-4 py-3 font-semibold text-[var(--medtrak-accent)]">
        <Sparkles className="h-4 w-4" /> Ask Primovex about this room
      </button>
    </section>
  );
}

function Action({ icon: Icon, label, onClick }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-[4.2rem] flex-col items-center justify-center gap-1 rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] px-1 py-2 text-center text-[0.68rem] font-semibold">
      <Icon className="h-4 w-4 text-[var(--medtrak-accent)]" />
      <span>{label}</span>
    </button>
  );
}
