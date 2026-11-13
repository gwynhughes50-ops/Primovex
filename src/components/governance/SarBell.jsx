import { useState } from "react";
import { Bell, BellRing } from "lucide-react";
import { BELL_STYLE, bellLabel, bellTone, confirmText, lastReminderText } from "@/modules/governance/sarReminderModel";
import { sendSarReminder } from "@/modules/governance/services/sarReminderClient";

// The reminder bell. Only shown to someone the server says may remind about this SAR (the Practice Manager, or the line manager of the
// person it is assigned to): `row` comes from the server's list, so no row means no bell. Pressing it asks first, then sends a
// reminder with fixed wording to the person the SAR is assigned to. One reminder a day for each SAR.
export default function SarBell({ row, onSent, compact = false, align = "right" }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState("");
  if (!row) return null;

  const tone = bellTone(row.daysLeft);
  const Icon = row.remindedToday ? BellRing : Bell;
  const last = lastReminderText(row);

  async function send() {
    setBusy(true); setProblem(""); setNote("");
    try {
      const result = await sendSarReminder(row.id);
      if (result.sent) setNote(`Reminder sent to ${result.assigneeName || row.assignedToName || "them"}.`);
      else setNote(`A reminder was already sent today${result.lastReminderByName ? ` by ${result.lastReminderByName}` : ""}.`);
      await onSent?.();
    } catch (err) {
      setProblem(err?.message && !/internal/i.test(err.message) ? err.message : "The reminder could not be sent. Try again.");
    } finally { setBusy(false); }
  }

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); setNote(""); setProblem(""); }}
        title={bellLabel(row)}
        aria-label={bellLabel(row)}
        aria-expanded={open}
        className={`inline-flex items-center justify-center rounded-full border ${compact ? "h-9 w-9" : "p-2"} transition ${BELL_STYLE[tone]}`}
      >
        <Icon className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={`Remind about ${row.reference}`}
          onClick={(e) => e.stopPropagation()}
          className={`absolute z-40 mt-2 w-72 rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-3 text-left text-sm shadow-xl ${align === "left" ? "left-0" : "right-0"}`}
        >
          {note ? (
            <p role="status" className="font-semibold text-emerald-600">{note}</p>
          ) : row.remindedToday ? (
            <p className="text-[var(--medtrak-text)]">A reminder was already sent today{row.lastReminderByName ? ` by ${row.lastReminderByName}` : ""}. You can send another tomorrow.</p>
          ) : (
            <p className="text-[var(--medtrak-text)]">{confirmText(row)}</p>
          )}
          {problem && <p role="alert" className="mt-2 font-semibold text-rose-600">{problem}</p>}
          {last && !note && <p className="mt-2 text-xs text-[var(--medtrak-muted)]">{last}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-[var(--medtrak-border)] px-3 py-1.5 text-xs font-bold">{note || row.remindedToday ? "Close" : "Cancel"}</button>
            {!note && !row.remindedToday && (
              <button type="button" disabled={busy} onClick={send} className="rounded-xl bg-[var(--medtrak-accent)] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60">{busy ? "Sending…" : "Send reminder"}</button>
            )}
          </div>
        </div>
      )}
    </span>
  );
}
