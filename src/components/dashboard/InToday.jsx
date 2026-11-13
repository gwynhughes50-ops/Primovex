import { Link } from "react-router-dom";
import { Users } from "lucide-react";
import { initials, personColour } from "@/components/rota/rotaStyle";
import { timeLabel } from "@/modules/rota/rotaModel";

// "In today": who is on the reception rota today (or the next working day at a weekend) and who is off. From the rota the coordinator builds.
export default function InToday({ today, seesRota }) {
  if (!seesRota) return null;
  const { hasWeek, on = [], off = [], people = 0, label = "today" } = today || {};
  return (
    <section className="rounded-3xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-panel-soft)] p-5 text-[color:var(--medtrak-text)] shadow-sm" aria-label={label === "today" ? "In today" : `In ${label}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-black tracking-tight"><Users className="h-5 w-5 text-[color:var(--medtrak-accent)]" aria-hidden="true" />{label === "today" ? "In today" : `In ${label}`}</h2>
        <Link to="/reception-rota" className="text-xs font-bold text-[color:var(--medtrak-accent)] hover:underline">Open rota</Link>
      </div>
      {!hasWeek ? (
        <p className="py-2 text-sm text-[color:var(--medtrak-muted)]">No rota has been built for this week yet.</p>
      ) : (
        <>
          <p className="mb-2 text-xs font-semibold text-[color:var(--medtrak-muted)]">{people} on reception{off.length ? `, ${off.length} off` : ""}</p>
          <ul className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            {on.map((p) => (
              <li key={`${p.shift}-${p.uid}`} className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: personColour(p.uid) }} aria-hidden="true">{initials(p.name)}</span>
                <span className="min-w-0 leading-tight">
                  <span className="block truncate text-sm font-bold">{p.name}</span>
                  <span className="block truncate text-[11px] text-[color:var(--medtrak-muted)]">{p.shift} · {timeLabel(p.start)}–{timeLabel(p.end)}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {off.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[color:var(--medtrak-border)] pt-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--medtrak-muted)]">Off</span>
          {off.map((o) => (
            <span key={`${o.uid}-${o.name}`} className="rounded-full border border-[color:var(--medtrak-border)] px-2.5 py-0.5 text-xs font-semibold">{o.name}<span className="font-normal text-[color:var(--medtrak-muted)]"> · {o.reason}{o.part ? ` ${o.part}` : ""}</span></span>
          ))}
        </div>
      )}
    </section>
  );
}
