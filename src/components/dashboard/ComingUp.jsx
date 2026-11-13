import { Link } from "react-router-dom";
import HomeWidget from "@/smart-home/components/HomeWidget";

// "Coming up": the next fortnight in date order, one line each. Each line opens the place that holds it.
export default function ComingUp({ coming }) {
  const { items = [], more = 0 } = coming || {};
  return (
    <HomeWidget title="Coming up" description="The next two weeks.">
      {items.length === 0 ? (
        <p className="text-sm font-semibold text-[color:var(--medtrak-text)]">Nothing is due in the next two weeks.</p>
      ) : (
        <ul className="divide-y divide-[color:var(--medtrak-border)]">
          {items.map((item) => (
            <li key={item.id}>
              <Link to={item.to} className="flex items-baseline gap-3 py-2 hover:bg-[color:var(--medtrak-accent)]/5">
                <span className="w-24 shrink-0 text-xs font-bold uppercase tracking-wide text-[color:var(--medtrak-accent)]">{item.when}</span>
                <span className="min-w-0 flex-1 text-sm font-semibold text-[color:var(--medtrak-text)]">
                  {item.text}
                  {item.detail && <span className="ml-2 text-xs font-normal text-[color:var(--medtrak-muted)]">{item.detail}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {more > 0 && <p className="mt-2 text-xs text-[color:var(--medtrak-muted)]">and {more} more after these.</p>}
    </HomeWidget>
  );
}
