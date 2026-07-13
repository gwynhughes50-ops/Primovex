import { Check, ChevronDown, ChevronUp, RotateCcw, Settings2, X } from "lucide-react";
import { DASHBOARD_WIDGETS, defaultWidgetsForRole } from "@/dashboard/dashboardPreferences";

export default function DashboardCustomizer({ open, onClose, preferences, role, onChange, onSave, saving }) {
  if (!open) return null;
  const visible = new Set(preferences.visible);
  const orderedWidgets = preferences.order
    .map((id) => DASHBOARD_WIDGETS.find((widget) => widget.id === id))
    .filter(Boolean);

  function toggle(id) {
    const next = new Set(visible);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ ...preferences, visible: [...next] });
  }

  function move(id, direction) {
    const order = [...preferences.order];
    const index = order.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    onChange({ ...preferences, order });
  }

  function reset() {
    onChange({ ...preferences, visible: defaultWidgetsForRole(role) });
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Customise Home">
      <div className="max-h-[88vh] w-full max-w-2xl overflow-hidden rounded-t-3xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-panel)] text-[color:var(--medtrak-text)] shadow-2xl sm:rounded-3xl">
        <div className="flex items-start justify-between border-b border-[color:var(--medtrak-border)] p-5">
          <div>
            <div className="flex items-center gap-2 text-lg font-semibold"><Settings2 className="h-5 w-5 text-primary" /> Customise Home</div>
            <p className="mt-1 text-sm text-[color:var(--medtrak-muted)]">Choose what matters to you. Detailed information remains available in each module.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 hover:bg-[color:var(--medtrak-panel-soft)]" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>

        <div className="max-h-[62vh] space-y-2 overflow-y-auto p-5">
          {orderedWidgets.map((widget, index) => {
            const enabled = visible.has(widget.id);
            return (
              <div key={widget.id} className="flex items-center gap-3 rounded-2xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-panel-soft)] p-3">
                <button type="button" onClick={() => toggle(widget.id)} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${enabled ? "border-primary bg-primary text-primary-foreground" : "border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-bg)] text-[color:var(--medtrak-muted)]"}`} aria-pressed={enabled}>
                  {enabled && <Check className="h-4 w-4" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{widget.label}</div>
                  <div className="text-xs leading-5 text-[color:var(--medtrak-muted)]">{widget.description}</div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button type="button" onClick={() => move(widget.id, -1)} disabled={index === 0} className="rounded-lg border border-[color:var(--medtrak-border)] p-2 disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button>
                  <button type="button" onClick={() => move(widget.id, 1)} disabled={index === orderedWidgets.length - 1} className="rounded-lg border border-[color:var(--medtrak-border)] p-2 disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-3 border-t border-[color:var(--medtrak-border)] p-5 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={reset} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[color:var(--medtrak-border)] px-4 py-2.5 text-sm font-semibold"><RotateCcw className="h-4 w-4" /> Reset to role default</button>
          <button type="button" onClick={onSave} disabled={saving || preferences.visible.length === 0} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{saving ? "Saving…" : "Save dashboard"}</button>
        </div>
      </div>
    </div>
  );
}
