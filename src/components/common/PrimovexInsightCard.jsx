import { cx } from "@/config/medtrakTheme";

export default function PrimovexInsightCard({
  eyebrow,
  title,
  body,
  icon: Icon,
  status,
  actions,
  children,
  className = "",
}) {
  return (
    <article className={cx("mt-ai-surface rounded-2xl border p-4", className)}>
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="mt-ai-badge flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border">
            <Icon className="h-4 w-4" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {eyebrow && <p className="mt-ai-kicker text-xs font-bold uppercase tracking-[0.16em]">{eyebrow}</p>}
            {status}
          </div>
          {title && <h3 className="mt-ai-heading mt-1 font-bold">{title}</h3>}
          {body && <p className="mt-ai-body mt-1 text-sm leading-6">{body}</p>}
          {children}
          {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
        </div>
      </div>
    </article>
  );
}
