import { medtrakTheme, cx } from "@/config/medtrakTheme";

export default function SectionCard({ title, description, actions, children, className = "" }) {
  return (
    <section className={cx(medtrakTheme.surface.base, "p-4", className)}>
      {(title || description || actions) && (
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            {title && <h2 className="text-lg font-bold text-slate-50">{title}</h2>}
            {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
