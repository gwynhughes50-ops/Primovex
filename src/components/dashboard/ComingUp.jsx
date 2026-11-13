import { Link } from "react-router-dom";
import { CalendarClock, ChevronRight } from "lucide-react";

// "Coming up": what is due after the urgent items in Needs you, and time off, in date order. Each line opens the place that holds it.
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const KIND = { SAR: "#2563eb", Concern: "#7c3aed", Off: "#0d9488" };

export default function ComingUp({ coming, days = 14 }) {
  const { items = [], more = 0 } = coming || {};
  return (
    <section className="rounded-3xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-panel-soft)] p-5 text-[color:var(--medtrak-text)] shadow-sm" aria-label="Coming up">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-black tracking-tight"><CalendarClock className="h-5 w-5 text-[color:var(--medtrak-accent)]" aria-hidden="true" />Coming up</h2>
        <span className="text-xs font-semibold text-[color:var(--medtrak-muted)]">next {days === 7 ? "week" : `${days / 7} weeks`}</span>
      </div>
      {items.length === 0 ? (
        <p className="py-3 text-sm text-[color:var(--medtrak-muted)]">Nothing else is due in that time.</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item) => {
            const d = new Date(`${item.iso}T12:00:00`);
            const colour = KIND[item.kind] || "#64748b";
            return (
              <li key={item.id}>
                <Link to={item.to} className="group flex items-center gap-3 rounded-xl p-1.5 transition hover:bg-[color:var(--medtrak-accent)]/8">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-center leading-none" style={{ background: `color-mix(in srgb, ${colour} 13%, transparent)`, color: colour }}>
                    <span><span className="block text-base font-black">{d.getDate()}</span><span className="block text-[9px] font-bold uppercase tracking-wider">{MONTH[d.getMonth()]}</span></span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{item.text}</span>
                    <span className="block truncate text-xs text-[color:var(--medtrak-muted)]">{item.when}{item.detail ? ` · ${item.detail}` : ""}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--medtrak-muted)] opacity-0 transition group-hover:opacity-100" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {more > 0 && <p className="mt-2 text-xs text-[color:var(--medtrak-muted)]">and {more} more after these.</p>}
    </section>
  );
}
