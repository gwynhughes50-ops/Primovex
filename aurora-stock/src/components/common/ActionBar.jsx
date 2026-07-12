export default function ActionBar({ children, leading, className = "" }) {
  return (
    <div className={`mt-card flex flex-col gap-3 rounded-2xl border p-3 sm:flex-row sm:items-center sm:justify-between ${className}`}>
      {leading && <div className="min-w-0 mt-text-secondary">{leading}</div>}
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
