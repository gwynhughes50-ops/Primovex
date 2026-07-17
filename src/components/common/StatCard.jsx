export default function StatCard({ label, value, description, icon: Icon, trend, className = "" }) {
  return (
    <div className={`mt-card rounded-2xl border p-4 shadow-sm ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] mt-text-muted">{label}</p>
          <p className="mt-2 text-3xl font-black tracking-tight mt-text-primary">{value}</p>
        </div>
        {Icon && (
          <div className="mt-pill flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border">
            <Icon className="h-5 w-5 mt-accent" />
          </div>
        )}
      </div>
      {(description || trend) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          {trend && <span className="mt-pill rounded-full border px-2 py-0.5 text-xs font-semibold">{trend}</span>}
          {description && <span className="mt-text-secondary">{description}</span>}
        </div>
      )}
    </div>
  );
}
