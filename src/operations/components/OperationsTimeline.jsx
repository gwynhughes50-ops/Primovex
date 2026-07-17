import { useMemo, useState } from 'react';
import { Activity, ChevronRight, Filter } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { buildOperationsTimeline } from '../engine/operationsTimeline';

const filters = ['All', 'Facilities', 'Inventory', 'Cold chain'];

function formatTime(value) {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function formatDay(value) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return 'Today';
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(date);
}

export default function OperationsTimeline({ context, compact = false }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('All');
  const timeline = useMemo(() => buildOperationsTimeline(context), [context]);
  const visible = timeline.filter((item) => filter === 'All' || item.module === filter).slice(0, compact ? 5 : 12);

  return (
    <section className="rounded-2xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-panel)] p-5 shadow-xl shadow-black/10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--medtrak-accent)]"><Activity className="h-4 w-4" /> Operations timeline</div>
          <h2 className="mt-1 text-lg font-semibold text-[color:var(--medtrak-text)]">What has happened</h2>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1"><Filter className="h-4 w-4 shrink-0 text-[color:var(--medtrak-muted)]" />{filters.map((item) => <button key={item} onClick={() => setFilter(item)} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs ${filter === item ? 'bg-[color:var(--medtrak-accent)] text-white' : 'border border-[color:var(--medtrak-border)] text-[color:var(--medtrak-muted)]'}`}>{item}</button>)}</div>
      </div>

      <div className="mt-4 space-y-1">
        {visible.length === 0 && <div className="rounded-xl border border-dashed border-[color:var(--medtrak-border)] p-5 text-sm text-[color:var(--medtrak-muted)]">No recorded operational events match this view.</div>}
        {visible.map((item, index) => {
          const previous = visible[index - 1];
          const showDay = !previous || formatDay(previous.at) !== formatDay(item.at);
          return <div key={item.id}>{showDay && <div className="pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--medtrak-muted)]">{formatDay(item.at)}</div>}<button type="button" onClick={() => item.route && navigate(item.route)} className="flex w-full items-start gap-3 rounded-xl p-3 text-left transition hover:bg-white/[0.05]">
            <div className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${item.priority === 'critical' ? 'bg-rose-400' : item.priority === 'high' ? 'bg-amber-400' : 'bg-[color:var(--medtrak-accent)]'}`} />
            <div className="w-12 shrink-0 text-xs font-semibold text-[color:var(--medtrak-muted)]">{formatTime(item.at)}</div>
            <div className="min-w-0 flex-1"><div className="text-sm font-medium text-[color:var(--medtrak-text)]">{item.title}</div><div className="mt-0.5 truncate text-xs text-[color:var(--medtrak-muted)]">{item.module} · {item.detail}</div></div>
            <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-[color:var(--medtrak-muted)]" />
          </button></div>;
        })}
      </div>
    </section>
  );
}
