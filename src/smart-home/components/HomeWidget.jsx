import React from "react";
import { Card } from "@/components/ui/card";

export default function HomeWidget({ title, description, action, icon: Icon, children, className = "" }) {
  return (
    <Card className={`rounded-2xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-panel-soft)] p-4 text-[color:var(--medtrak-text)] shadow-sm ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            {title && <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--medtrak-muted)]">{title}</p>}
            {description && <p className="mt-1 text-sm text-[color:var(--medtrak-muted)]">{description}</p>}
          </div>
          {action || (Icon ? <Icon className="h-4 w-4 text-[color:var(--medtrak-accent)]" /> : null)}
        </div>
      )}
      {children}
    </Card>
  );
}
