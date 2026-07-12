import { cx } from "@/config/medtrakTheme";

export default function PageHeader({
  eyebrow,
  title,
  description,
  icon: Icon,
  actions,
  meta,
  className = "",
}) {
  return (
    <header className={cx("mt-card rounded-3xl border p-5 shadow-xl", className)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {Icon && (
            <div className="mt-pill flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border">
              <Icon className="h-6 w-6 mt-accent" />
            </div>
          )}
          <div className="min-w-0">
            {eyebrow && (
              <div className="mt-pill mb-2 inline-flex rounded-full border px-3 py-1 text-xs font-semibold">
                {eyebrow}
              </div>
            )}
            <h1 className="text-2xl font-black tracking-tight mt-text-primary sm:text-3xl">{title}</h1>
            {description && <p className="mt-1 max-w-3xl text-sm leading-6 mt-text-secondary">{description}</p>}
            {meta && <div className="mt-3 flex flex-wrap gap-2">{meta}</div>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}
