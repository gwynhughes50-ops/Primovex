import { Link } from "react-router-dom";
import { ClipboardCheck, Package, ShieldCheck, Thermometer, Users } from "lucide-react";

// One tile per area, coloured by the worst thing in it: green leave it, amber look soon, red look now. Tapping a tile opens the area.
// The tile says how many; "Needs you" below says what.
const COLOUR = { green: "#10b981", amber: "#d97706", red: "#e11d48" };
const ROUTE = { governance: "/governance/sars", stock: "/inventory", coldchain: "/temperature", compliance: "/compliance", people: "/my-timesheet" };
const ICON = { governance: ShieldCheck, stock: Package, coldchain: Thermometer, compliance: ClipboardCheck, people: Users };

export default function HealthStrip({ tiles }) {
  if (!tiles?.length) return null;
  return (
    <section aria-label="How each part of the practice is" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {tiles.map((tile) => {
        const colour = COLOUR[tile.level];
        const Icon = ICON[tile.area] || ShieldCheck;
        return (
          <Link
            key={tile.area}
            to={ROUTE[tile.area] || "/dashboard"}
            className="group relative flex items-center gap-3 overflow-hidden rounded-2xl border border-[color:var(--medtrak-border)] p-3.5 text-[color:var(--medtrak-text)] shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            style={{ background: `color-mix(in srgb, ${colour} 9%, var(--medtrak-panel-soft))` }}
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: `color-mix(in srgb, ${colour} 20%, transparent)`, color: colour }}>
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-[color:var(--medtrak-muted)]">{tile.label}</span>
              <span className="block truncate text-sm font-bold" title={tile.text}>{tile.text}</span>
            </span>
            <span className="absolute inset-x-0 bottom-0 h-1" style={{ background: colour, opacity: tile.level === "green" ? 0.55 : 1 }} aria-hidden="true" />
          </Link>
        );
      })}
    </section>
  );
}
