import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import SectionCard from "@/components/common/SectionCard";
import StatusBadge from "@/components/common/StatusBadge";
import NotificationItem from "@/components/notifications/NotificationItem";
import { useAuth } from "@/contexts/AuthContext";
import useNotifications from "@/hooks/useNotifications";
import { Icons } from "@/config/medtrakIcons";

function greetingName(displayName, email) {
  const raw = displayName || email || "there";
  return String(raw).split(" ")[0];
}

function getPulseTone(score) {
  if (score >= 95) return { label: "Excellent", status: "success", ring: "text-emerald-300", border: "border-emerald-400/30", bg: "bg-emerald-500/10" };
  if (score >= 85) return { label: "Attention", status: "warning", ring: "text-amber-300", border: "border-amber-400/30", bg: "bg-amber-500/10" };
  return { label: "Action needed", status: "critical", ring: "text-rose-300", border: "border-rose-400/30", bg: "bg-rose-500/10" };
}

export default function OperationsCentre() {
  const navigate = useNavigate();
  const { user, displayName, role } = useAuth();
  const { summary, snooze, complete, loading } = useNotifications(user?.uid);

  const counts = summary?.counts || { critical: 0, high: 0, routine: 0, info: 0, total: 0 };
  const active = summary?.active || [];
  const topItems = active.slice(0, 4);

  const pulseScore = useMemo(() => {
    const penalty = counts.critical * 8 + counts.high * 4 + counts.routine * 1;
    return Math.max(0, Math.min(100, 100 - penalty));
  }, [counts]);

  const pulse = getPulseTone(pulseScore);
  const firstName = greetingName(displayName, user?.email);

  const openNotification = (item) => {
    if (item?.actionUrl) navigate(item.actionUrl);
  };

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-slate-800/70 bg-slate-900/70 p-5 text-slate-100 shadow-xl backdrop-blur">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-teal-400/30 bg-teal-400/10 px-3 py-1 text-xs font-semibold text-teal-200">
              <Icons.dashboard className="h-3.5 w-3.5" /> Operations Centre
            </div>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-50 sm:text-3xl">
              Good morning, {firstName}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Your personal inbox, practice priorities and operational health in one calm workspace.
            </p>
            {role && <p className="mt-2 text-xs text-slate-500">Current role: {role}</p>}
          </div>

          <div className={`flex items-center gap-4 rounded-3xl border ${pulse.border} ${pulse.bg} p-4`}>
            <div className="relative grid h-24 w-24 place-items-center rounded-full border border-slate-700/80 bg-slate-950/70">
              <div className={`text-3xl font-black ${pulse.ring}`}>{pulseScore}%</div>
              <div className="absolute bottom-5 text-[0.62rem] uppercase tracking-wide text-slate-400">Pulse</div>
            </div>
            <div>
              <StatusBadge status={pulse.status}>{pulse.label}</StatusBadge>
              <p className="mt-2 text-sm text-slate-300">
                {counts.total === 0 ? "No active priorities." : `${counts.total} active item${counts.total === 1 ? "" : "s"} need attention.`}
              </p>
              <Button type="button" variant="ghost" className="mt-2 rounded-full px-3 text-xs text-slate-200 hover:bg-slate-800" onClick={() => navigate("/notifications")}>
                Open Inbox
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-100">
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-200/80">Critical</p>
          <p className="mt-1 text-3xl font-black">{counts.critical || 0}</p>
        </div>
        <div className="rounded-2xl border border-orange-400/30 bg-orange-500/10 p-4 text-orange-100">
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-200/80">High</p>
          <p className="mt-1 text-3xl font-black">{counts.high || 0}</p>
        </div>
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-amber-100">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-200/80">Routine</p>
          <p className="mt-1 text-3xl font-black">{counts.routine || 0}</p>
        </div>
        <div className="rounded-2xl border border-sky-400/30 bg-sky-500/10 p-4 text-sky-100">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-200/80">Info</p>
          <p className="mt-1 text-3xl font-black">{counts.info || 0}</p>
        </div>
      </section>

      <SectionCard
        title="Today's priorities"
        description="Items assigned to you. Snoozed items stay hidden until their reminder time, but overdue items still escalate."
        actions={
          <Button variant="outline" className="rounded-full border-slate-700 bg-slate-950/40 text-slate-100 hover:bg-slate-800" onClick={() => navigate("/notifications")}>
            View all
          </Button>
        }
      >
        {loading ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-6 text-sm text-slate-400">Loading your inbox…</div>
        ) : topItems.length === 0 ? (
          <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-6 text-sm text-emerald-100">
            No active priorities. MedTrak+ will bring items here when they need your attention.
          </div>
        ) : (
          <div className="space-y-3">
            {topItems.map((item) => (
              <NotificationItem
                key={item.id}
                notification={item}
                compact
                onOpen={openNotification}
                onComplete={(n) => complete(n.id)}
                onSnooze={(n, option) => snooze(n.id, option)}
              />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
