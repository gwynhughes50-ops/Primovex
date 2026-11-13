import { Link } from "react-router-dom";

// One small tile per area, coloured by the worst thing in it: green leave it, amber look soon, red look now. Tapping a tile opens the area.
const COLOUR = { green: "#10b981", amber: "#d97706", red: "#e11d48" };
const ROUTE = { governance: "/governance/sars", stock: "/inventory", coldchain: "/temperature", compliance: "/compliance", people: "/my-timesheet" };

export default function HealthStrip({ tiles }) {
  if (!tiles?.length) return null;
  return (
    <section aria-label="How each part of the practice is" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {tiles.map((tile) => (
        <Link key={tile.area} to={ROUTE[tile.area] || "/dashboard"} className="rounded-2xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-panel-soft)] p-3 text-[color:var(--medtrak-text)] shadow-sm hover:bg-[color:var(--medtrak-accent)]/10" style={{ borderLeft: `5px solid ${COLOUR[tile.level]}` }}>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--medtrak-muted)]">{tile.label}</p>
          <p className="mt-1 truncate text-sm font-bold" title={tile.text}>{tile.text}</p>
        </Link>
      ))}
    </section>
  );
}
