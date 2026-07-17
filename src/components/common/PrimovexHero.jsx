import { cx } from "@/config/medtrakTheme";

export default function PrimovexHero({
  eyebrow,
  title,
  description,
  icon: Icon,
  actions,
  aside,
  className = "",
}) {
  return (
    <header className={cx("mt-hero rounded-[2rem] border p-6 shadow-xl", className)}>
      <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          {eyebrow && (
            <div className="mt-hero-badge inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]">
              {Icon && <Icon className="h-3.5 w-3.5" />}
              {eyebrow}
            </div>
          )}
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white" data-preserve-colour>
            {title}
          </h1>
          {description && (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/80" data-preserve-colour>
              {description}
            </p>
          )}
          {actions && <div className="mt-5 flex flex-wrap gap-2">{actions}</div>}
        </div>
        {aside && <div className="mt-hero-aside shrink-0 rounded-3xl border p-4">{aside}</div>}
      </div>
    </header>
  );
}
