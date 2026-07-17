import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/common/StatusBadge";
import { normalizeNotification, toDate } from "@/services/notificationCentreService";
import { Icons } from "@/config/medtrakIcons";

function formatDue(notification) {
  if (notification.overdue) return "Overdue";
  if (notification.dueDays === null || notification.dueDays === undefined) return "No due date";
  if (notification.dueDays === 0) return "Due today";
  if (notification.dueDays === 1) return "Due tomorrow";
  return `Due in ${notification.dueDays} days`;
}

function fmtDate(value) {
  const d = toDate(value);
  return d ? d.toLocaleString() : "";
}

export default function NotificationItem({ notification, onOpen, onComplete, onSnooze, compact = false }) {
  const item = normalizeNotification(notification);

  return (
    <div className={`rounded-2xl border p-4 ${item.priorityClass}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={item.priority}>{item.priorityLabel}</StatusBadge>
            <span className="rounded-full border border-slate-700/70 bg-slate-950/40 px-2.5 py-1 text-xs font-semibold text-slate-200">
              {item.moduleLabel}
            </span>
            {item.snoozed && (
              <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-2.5 py-1 text-xs font-semibold text-sky-100">
                Snoozed
              </span>
            )}
          </div>

          <h3 className="mt-3 truncate text-base font-bold text-slate-50">
            {item.title || "Notification"}
          </h3>
          <p className="mt-1 text-sm text-slate-200/90">{item.message || "—"}</p>

          {!compact && (
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-300/80">
              <span>{formatDue(item)}</span>
              {item.snoozedUntil && <span>Wakes: {fmtDate(item.snoozedUntil)}</span>}
              {item.createdAt && <span>Created: {fmtDate(item.createdAt)}</span>}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {item.actionUrl && (
            <Button type="button" size="sm" onClick={() => onOpen?.(item)} className="rounded-full bg-slate-100 text-slate-950 hover:bg-white">
              Open
            </Button>
          )}
          <Button type="button" size="sm" variant="outline" onClick={() => onComplete?.(item)} className="rounded-full border-slate-600 bg-slate-950/30 text-slate-100 hover:bg-slate-800">
            <Icons.check className="mr-1 h-4 w-4" /> Complete
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => onSnooze?.(item, "tomorrow")} className="rounded-full border-slate-600 bg-slate-950/30 text-slate-100 hover:bg-slate-800">
            Snooze
          </Button>
        </div>
      </div>
    </div>
  );
}
