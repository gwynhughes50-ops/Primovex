import { AlertTriangle, CheckCircle2, ChevronRight, Gauge, ShieldCheck, Sparkles, CircleDashed } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import useOperationsSummary from '../hooks/useOperationsSummary';
import { buildOperationsTimeline, changesSince } from '../engine/operationsTimeline';

const panel = 'rounded-2xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-panel)] shadow-xl shadow-black/10';

function tone(priority) {
  return priority === 'critical' ? 'text-rose-300 bg-rose-500/10' : priority === 'high' ? 'text-amber-200 bg-amber-500/10' : 'text-[color:var(--medtrak-text)] bg-white/[0.04]';
}

export default function OperationsBrief({ inventory, temperature, recentMoves = [] }) {
  const navigate = useNavigate();
  const context = { inventory, temperature, recentMoves };
  const summary = useOperationsSummary(context);
  const score = summary.readiness.overall;
  const top = summary.priorities.slice(0, 4);
  const timeline = buildOperationsTimeline(context);
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1); yesterday.setHours(0, 0, 0, 0);
  const recentChanges = changesSince(timeline, yesterday).slice(0, 3);
  const healthyModules = summary.contributions.filter((item) => item.connected && Number.isFinite(item.readiness) && item.readiness >= 90);
  const unconnected = summary.contributions.filter((item) => !item.connected || !Number.isFinite(item.readiness));

  return (
    <section className={`${panel} overflow-hidden p-5 sm:p-6`}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--medtrak-accent)]"><Sparkles className="h-4 w-4" /> Morning operations brief</div>
          <h1 className="mt-2 text-2xl font-semibold text-[color:var(--medtrak-text)]">{summary.headline}</h1>
          <p className="mt-2 text-sm text-[color:var(--medtrak-muted)]">Your live operational picture, assembled only from approved connected contributors.</p>
        </div>
        <div className="min-w-[205px] rounded-2xl border border-[color:var(--medtrak-border)] bg-white/[0.03] p-4">
          <div className="flex items-center justify-between text-sm text-[color:var(--medtrak-muted)]"><span>Practice readiness</span><ShieldCheck className="h-4 w-4 text-[color:var(--medtrak-accent)]" /></div>
          <div className="mt-2 text-4xl font-semibold text-[color:var(--medtrak-text)]">{score ?? '—'}{score !== null ? '%' : ''}</div>
          <div className="mt-2 text-xs text-[color:var(--medtrak-muted)]">Based on {summary.connectedModules} live contributors</div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {summary.readiness.modules.map((module) => (
          <div key={module.id} className="rounded-xl border border-[color:var(--medtrak-border)] bg-white/[0.025] p-3">
            <div className="flex items-center justify-between gap-3"><span className="text-sm text-[color:var(--medtrak-muted)]">{module.label}</span><span className="font-semibold text-[color:var(--medtrak-text)]">{module.score}%</span></div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/20"><div className="h-full rounded-full bg-[color:var(--medtrak-accent)]" style={{ width: `${module.score}%` }} /></div>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <div>
          <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold text-[color:var(--medtrak-text)]">Today’s priorities</h2><span className="text-xs text-[color:var(--medtrak-muted)]">{summary.priorities.length} total</span></div>
          {top.length ? <div className="space-y-2">{top.map((item) => (
            <button key={item.id} type="button" onClick={() => item.route && navigate(item.route)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-white/[0.07] ${tone(item.priority)}`}>
              <AlertTriangle className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{item.title}</span>{item.detail && <span className="block truncate text-xs opacity-70">{item.detail}</span>}</span><ChevronRight className="h-4 w-4 shrink-0 opacity-60" />
            </button>
          ))}</div> : <div className="flex items-center gap-3 rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100"><CheckCircle2 className="h-5 w-5" /> No connected operational priorities need attention.</div>}
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-[color:var(--medtrak-border)] bg-white/[0.025] p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[color:var(--medtrak-text)]"><CheckCircle2 className="h-4 w-4 text-emerald-300" /> Completed and healthy</h2>
            <div className="mt-3 space-y-2">{healthyModules.length ? healthyModules.map((item) => <div key={item.id} className="flex items-center justify-between text-sm"><span className="text-[color:var(--medtrak-muted)]">{item.label}</span><span className="font-medium text-emerald-300">{item.readiness}%</span></div>) : <p className="text-sm text-[color:var(--medtrak-muted)]">No connected area is above 90% yet.</p>}</div>
          </div>
          <div className="rounded-xl border border-[color:var(--medtrak-border)] bg-white/[0.025] p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[color:var(--medtrak-text)]"><Gauge className="h-4 w-4 text-[color:var(--medtrak-accent)]" /> Since yesterday</h2>
            <div className="mt-3 space-y-2">{recentChanges.length ? recentChanges.map((item) => <button key={item.id} onClick={() => item.route && navigate(item.route)} className="block w-full truncate text-left text-sm text-[color:var(--medtrak-muted)] hover:text-[color:var(--medtrak-text)]">• {item.title}</button>) : <p className="text-sm text-[color:var(--medtrak-muted)]">No recorded operational changes.</p>}</div>
          </div>
          {unconnected.length > 0 && <div className="flex items-start gap-2 rounded-xl border border-[color:var(--medtrak-border)] p-3 text-xs text-[color:var(--medtrak-muted)]"><CircleDashed className="mt-0.5 h-4 w-4 shrink-0" /><span>{unconnected.length} reserved areas are not yet connected and are excluded from readiness.</span></div>}
        </div>
      </div>
    </section>
  );
}
