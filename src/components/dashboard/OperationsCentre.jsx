import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import SectionCard from "@/components/common/SectionCard";
import StatusBadge from "@/components/common/StatusBadge";
import NotificationItem from "@/components/notifications/NotificationItem";
import { useAuth } from "@/contexts/AuthContext";
import useNotifications from "@/hooks/useNotifications";
import { Icons } from "@/config/medtrakIcons";
import { buildGovernancePrompts, getConcernMetrics, subscribeConcerns } from "@/modules/governance/services/concernService";
import useConnectedDevices from "@/hooks/useConnectedDevices";
import useStock from "@/hooks/useStock";
import { buildMedAIContext } from "@/services/medai";
import { priorityTone } from "@/services/medai/priorityEngine";
import PrimovexInsightCard from "@/components/common/PrimovexInsightCard";

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
  const { intelligence: connectIntelligence } = useConnectedDevices();
  const { allItems: stockItems = [] } = useStock({ includeArchived: false });
  const [concerns, setConcerns] = useState([]);

  useEffect(() => {
    const unsub = subscribeConcerns(setConcerns, () => setConcerns([]));
    return () => unsub?.();
  }, []);

  const counts = summary?.counts || { critical: 0, high: 0, routine: 0, info: 0, total: 0 };
  const active = summary?.active || [];
  const topItems = active.slice(0, 4);

  const pulseScore = useMemo(() => {
    const penalty = counts.critical * 8 + counts.high * 4 + counts.routine * 1;
    return Math.max(0, Math.min(100, 100 - penalty));
  }, [counts]);

  const pulse = getPulseTone(pulseScore);
  const governanceMetrics = useMemo(() => getConcernMetrics(concerns), [concerns]);
  const governancePrompts = useMemo(() => buildGovernancePrompts(concerns).slice(0, 2), [concerns]);
  const firstName = greetingName(displayName, user?.email);
  const medai = useMemo(() => buildMedAIContext({
    firstName,
    notificationsSummary: summary,
    governanceMetrics,
    governancePrompts,
    connectIntelligence,
    stockItems,
  }), [firstName, summary, governanceMetrics, governancePrompts, connectIntelligence, stockItems]);

  const openNotification = (item) => {
    if (item?.actionUrl) navigate(item.actionUrl);
  };

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-slate-800/70 bg-slate-900/70 p-5 text-slate-100 shadow-xl backdrop-blur">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mt-pill inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold">
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

      <section className="grid gap-4 xl:grid-cols-[1.4fr_0.9fr]">
        <SectionCard
          title="MedAI Daily Brief"
          description="MedAI reads the user-permitted operational picture and turns it into a practical morning briefing."
          actions={
            <span className="mt-ai-badge inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide">
              <Icons.pulse className="h-3.5 w-3.5" /> {medai.score}% confidence
            </span>
          }
        >
          <div className="mt-ai-surface rounded-3xl border p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="mt-ai-kicker text-xs font-black uppercase tracking-[0.18em]">{medai.brief.headline}</p>
                <h2 className="mt-ai-heading mt-2 text-2xl font-black">{medai.brief.title}</h2>
                <div className="mt-ai-body mt-4 space-y-2 text-sm leading-6">
                  {medai.brief.lines.map((line) => (
                    <p key={line} className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-300" />
                      <span>{line}</span>
                    </p>
                  ))}
                </div>
              </div>
              <div className="mt-card-strong rounded-2xl border p-4 text-sm lg:w-56">
                <p className="mt-ai-label text-xs font-bold uppercase tracking-wide">Estimated admin time</p>
                <p className="mt-ai-heading mt-1 text-3xl font-black">{medai.brief.estimatedAdminTime}</p>
                <p className="mt-ai-label mt-3 text-xs">Recommended focus</p>
                <p className="mt-ai-focus mt-1 font-semibold">{medai.brief.recommendedFocus}</p>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="MedAI Insights" description="Cross-module signals that may deserve management attention.">
          <div className="space-y-3">
            {medai.insights.map((insight) => (
              <PrimovexInsightCard
                key={insight.id}
                eyebrow={insight.domain}
                title={insight.title}
                body={insight.body}
                status={<span className={`h-2.5 w-2.5 rounded-full ${insight.tone === "success" ? "bg-emerald-400" : "bg-amber-400"}`} aria-label={insight.tone} />}
              />
            ))}
          </div>
        </SectionCard>
      </section>

      <SectionCard
        title="MedAI Recommendations"
        description="Explainable next-best actions. MedAI suggests, people decide."
      >
        <div className="grid gap-3 lg:grid-cols-2">
          {medai.recommendations.slice(0, 4).map((item) => {
            const tone = priorityTone(item.priority);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => item.sourceUrl && navigate(item.sourceUrl)}
                className={`rounded-3xl border p-4 text-left transition hover:scale-[1.01] ${tone.card}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${tone.badge}`}>
                      <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
                      {item.priority} · {item.score}
                    </span>
                    <h3 className="mt-3 font-black text-white">{item.title}</h3>
                    <p className="mt-1 text-sm text-slate-300">{item.summary}</p>
                  </div>
                  <span className="shrink-0 rounded-full border border-white/10 bg-slate-950/50 px-3 py-1 text-xs font-bold text-slate-200">{item.estimate}</span>
                </div>
                <div className="mt-3 rounded-2xl border border-white/10 bg-slate-950/40 p-3 text-xs text-slate-300">
                  <p className="font-bold text-slate-100">Why MedAI surfaced this</p>
                  <ul className="mt-1 list-disc space-y-1 pl-4">
                    {(item.reasons.length ? item.reasons : [item.summary]).slice(0, 2).map((reason) => <li key={reason}>{reason}</li>)}
                  </ul>
                </div>
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard
        title="Governance Intelligence"
        description="Listening to People case health, deadlines and learning actions."
        actions={
          <Button variant="outline" className="rounded-full border-slate-700 bg-slate-950/40 text-slate-100 hover:bg-slate-800" onClick={() => navigate("/governance/concerns")}>
            Open concerns
          </Button>
        }
      >
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-sky-400/30 bg-sky-500/10 p-4 text-sky-100">
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-200/80">Open</p>
            <p className="mt-1 text-3xl font-black">{governanceMetrics.open}</p>
          </div>
          <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-rose-100">
            <p className="text-xs font-semibold uppercase tracking-wide text-rose-200/80">High</p>
            <p className="mt-1 text-3xl font-black">{governanceMetrics.high}</p>
          </div>
          <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-amber-100">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-200/80">Due week</p>
            <p className="mt-1 text-3xl font-black">{governanceMetrics.dueWeek}</p>
          </div>
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-emerald-100">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200/80">Health</p>
            <p className="mt-1 text-3xl font-black">{governanceMetrics.avgHealth}%</p>
          </div>
        </div>
        <div className="mt-3 grid gap-2 lg:grid-cols-2">
          {governancePrompts.map((prompt) => (
            <div key={prompt} className="rounded-2xl border border-violet-400/20 bg-violet-500/10 p-3 text-sm text-violet-100">
              {prompt}
            </div>
          ))}
        </div>
      </SectionCard>

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
