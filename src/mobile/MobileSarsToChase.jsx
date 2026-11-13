import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import SarBell from "@/components/governance/SarBell";
import { useSarsToChase } from "@/modules/governance/useSarsToChase";
import { dueWords, lastReminderText } from "@/modules/governance/sarReminderModel";

// For the Practice Manager and line managers, on the phone: the live SARs assigned to your team, most urgent first, each with the reminder
// bell. The server builds the list and it holds no patient details (see functions/services/sarReminderService.js).
const STATUS = { new: "New", assigned: "Assigned", in_progress: "In progress", quality_check: "Quality check" };

export default function MobileSarsToChase() {
  const navigate = useNavigate();
  const { canChase, rows, loading, error, reload } = useSarsToChase();
  return (
    <main className="pvx-mobile-page pvx-mobile-stack">
      <section className="pvx-mobile-card">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate("/dashboard")} className="grid h-10 w-10 place-items-center rounded-2xl border border-[var(--medtrak-border)]" aria-label="Back"><ChevronLeft className="h-5 w-5" /></button>
          <div className="flex-1">
            <p className="text-xs font-bold uppercase tracking-[.14em] text-[var(--medtrak-accent)]">Governance</p>
            <h1 className="pvx-mobile-title">SARs to chase</h1>
          </div>
        </div>
        <p className="mt-2 text-sm text-[var(--medtrak-muted)]">Open SARs assigned to the people you manage, most urgent first. Press the bell to remind someone it needs prioritising.</p>
      </section>
      {error && <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-600">{error} <button type="button" className="underline" onClick={() => reload()}>Try again</button></p>}
      {loading ? <p className="py-1 text-sm text-[var(--medtrak-muted)]">Opening…</p> : !canChase ? (
        <p className="rounded-xl border border-dashed border-[var(--medtrak-border)] p-6 text-center text-sm text-[var(--medtrak-muted)]">Nobody reports to you on the organisation chart, so there is nothing to chase.</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--medtrak-border)] p-6 text-center text-sm text-[var(--medtrak-muted)]">There are no open SARs assigned to your team.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="flex items-start justify-between gap-3 rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-3.5">
              <div className="min-w-0">
                <p className="font-bold">{row.reference}</p>
                <p className="mt-0.5 text-sm text-[var(--medtrak-muted)]">{row.assignedToName || "Unassigned"} · {STATUS[row.status] || row.status}</p>
                <p className="mt-1 text-sm font-semibold">{row.dueLabel ? `Due ${row.dueLabel}` : "No due date"} · {dueWords(row.daysLeft)}</p>
                {lastReminderText(row) && <p className="mt-1 text-xs text-[var(--medtrak-muted)]">{lastReminderText(row)}</p>}
              </div>
              <SarBell row={row} onSent={() => reload()} compact />
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
