export default function EmptyState({
  title = "Nothing here yet",
  description,
  icon: Icon,
  action,
  compact = false,
}) {
  return (
    <div className={`mt-card rounded-2xl border text-center ${compact ? "p-4" : "p-6"}`}>
      {Icon && (
        <div className="mt-pill mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border">
          <Icon className="h-6 w-6 mt-accent" />
        </div>
      )}
      <h3 className="font-bold mt-text-primary">{title}</h3>
      {description && <p className="mx-auto mt-1 max-w-xl text-sm leading-6 mt-text-secondary">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
