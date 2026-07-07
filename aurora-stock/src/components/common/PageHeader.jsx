import { medtrakTheme, cx } from "@/config/medtrakTheme";

export default function PageHeader({ eyebrow, title, description, icon: Icon, actions, className = "" }) {
  return (
    <header className={cx(medtrakTheme.surface.elevated, "p-5", className)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          {Icon && (
            <div className="rounded-2xl border border-teal-400/30 bg-teal-400/10 p-3 text-teal-200">
              <Icon className="h-6 w-6" />
            </div>
          )}
          <div>
            {eyebrow && (
              <div className="mb-2 inline-flex rounded-full border border-teal-400/30 bg-teal-400/10 px-3 py-1 text-xs font-semibold text-teal-200">
                {eyebrow}
              </div>
            )}
            <h1 className="text-2xl font-black tracking-tight text-slate-50 sm:text-3xl">{title}</h1>
            {description && <p className="mt-1 max-w-2xl text-sm text-slate-400">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}
