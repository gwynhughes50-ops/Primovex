export default function EmptyState({ title = "Nothing here yet", description, icon: Icon, action }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-6 text-center">
      {Icon && (
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900 text-slate-300">
          <Icon className="h-6 w-6" />
        </div>
      )}
      <h3 className="font-bold text-slate-100">{title}</h3>
      {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
