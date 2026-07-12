import { cx } from "@/config/medtrakTheme";

export default function SectionCard({
  title,
  description,
  actions,
  children,
  className = "",
  contentClassName = "",
  as: Component = "section",
}) {
  return (
    <Component className={cx("mt-card rounded-2xl border p-4 shadow-lg", className)}>
      {(title || description || actions) && (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {title && <h2 className="text-lg font-bold mt-text-primary">{title}</h2>}
            {description && <p className="mt-1 max-w-3xl text-sm leading-6 mt-text-secondary">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      <div className={contentClassName}>{children}</div>
    </Component>
  );
}
