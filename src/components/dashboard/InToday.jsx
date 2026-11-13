import { Link } from "react-router-dom";
import HomeWidget from "@/smart-home/components/HomeWidget";
import { timeLabel } from "@/modules/rota/rotaModel";

// "In today": who is on the reception rota today (or the next working day at a weekend) and who is off. From the rota the coordinator builds.
export default function InToday({ today, seesRota }) {
  if (!seesRota) return null;
  const { hasWeek, on = [], off = [], people = 0, label = "today" } = today || {};
  const heading = label === "today" ? "In today" : `In ${label}`;
  return (
    <HomeWidget
      title={heading}
      description={hasWeek ? `${people} on the reception rota${off.length ? `, ${off.length} off` : ""}.` : undefined}
      action={<Link to="/reception-rota" className="text-xs font-bold text-[color:var(--medtrak-accent)] hover:underline">Open rota</Link>}
    >
      {!hasWeek ? (
        <p className="text-sm text-[color:var(--medtrak-text)]">No rota has been built for this week yet.</p>
      ) : (
        <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {on.map((p) => (
            <p key={`${p.shift}-${p.uid}`} className="flex items-baseline justify-between gap-3 text-sm text-[color:var(--medtrak-text)]">
              <span className="font-semibold">{p.name}</span>
              <span className="text-xs text-[color:var(--medtrak-muted)]">{p.shift} · {timeLabel(p.start)}–{timeLabel(p.end)}</span>
            </p>
          ))}
        </div>
      )}
      {off.length > 0 && (
        <p className="mt-3 border-t border-[color:var(--medtrak-border)] pt-2 text-sm text-[color:var(--medtrak-text)]">
          <span className="font-semibold">Off: </span>{off.map((o) => `${o.name} (${o.reason}${o.part ? ` ${o.part}` : ""})`).join(", ")}
        </p>
      )}
    </HomeWidget>
  );
}
