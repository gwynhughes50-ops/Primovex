import { Check, ChevronDown, ChevronUp, RotateCcw, Settings2, X } from "lucide-react";
import { DASHBOARD_WIDGETS, DEFAULT_SETTINGS, HEALTH_AREAS, SETTING_CHOICES, defaultWidgetsForRole, normaliseDashboardPreferences } from "@/dashboard/dashboardPreferences";
import { COMING_KINDS } from "@/dashboard/comingUp";
import { NEEDS_CATEGORIES } from "@/dashboard/needsYou";

// Customise Home: which widgets, in what order, and a few settings for how Needs you, Coming up and the health strip behave.
// Nothing is saved until "Save"; "Reset to the standard Home" puts back this role's widgets, their order and the settings.

const LINE = "border-[color:var(--medtrak-border)]";

function Segmented({ label, value, choices, onPick }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[color:var(--medtrak-muted)]">{label}</p>
      <div className={`inline-flex flex-wrap gap-1 rounded-xl border ${LINE} bg-[color:var(--medtrak-panel-soft)] p-1`} role="radiogroup" aria-label={label}>
        {choices.map(([key, text]) => (
          <button key={String(key)} type="button" role="radio" aria-checked={value === key} onClick={() => onPick(key)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${value === key ? "bg-[color:var(--medtrak-accent)] text-white shadow-sm" : "text-[color:var(--medtrak-text)] hover:bg-[color:var(--medtrak-accent)]/10"}`}>{text}</button>
        ))}
      </div>
    </div>
  );
}

// A row of on/off chips: ticked = shown
function Chips({ label, options, hidden, onChange }) {
  const toggle = (key) => onChange(hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key]);
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[color:var(--medtrak-muted)]">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map(([key, text]) => {
          const on = !hidden.includes(key);
          return (
            <button key={key} type="button" aria-pressed={on} onClick={() => toggle(key)} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold transition ${on ? "border-[color:var(--medtrak-accent)] bg-[color:var(--medtrak-accent)]/12 text-[color:var(--medtrak-text)]" : `${LINE} text-[color:var(--medtrak-muted)] line-through opacity-70`}`}>
              {on && <Check className="h-3.5 w-3.5 text-[color:var(--medtrak-accent)]" aria-hidden="true" />}{text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Group({ title, hint, children }) {
  return (
    <section className={`space-y-3 rounded-2xl border ${LINE} p-4`}>
      <div>
        <h3 className="text-sm font-bold">{title}</h3>
        {hint && <p className="text-xs text-[color:var(--medtrak-muted)]">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export default function DashboardCustomizer({ open, onClose, preferences, role, homeType = "", onChange, onSave, saving }) {
  if (!open) return null;
  const visible = new Set(preferences.visible);
  const settings = { ...DEFAULT_SETTINGS, ...(preferences.settings || {}) };
  const orderedWidgets = preferences.order
    .map((id) => DASHBOARD_WIDGETS.find((widget) => widget.id === id))
    .filter(Boolean);

  const setSetting = (patch) => onChange({ ...preferences, settings: { ...settings, ...patch } });

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
    onChange(normaliseDashboardPreferences({ visible: defaultWidgetsForRole(role, homeType), settings: DEFAULT_SETTINGS }, role, homeType));
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Customise Home">
      <div className={`flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border ${LINE} bg-[color:var(--medtrak-panel)] text-[color:var(--medtrak-text)] shadow-2xl sm:rounded-3xl`}>
        <div className={`flex items-start justify-between border-b ${LINE} p-5`}>
          <div>
            <div className="flex items-center gap-2 text-lg font-semibold"><Settings2 className="h-5 w-5 text-[color:var(--medtrak-accent)]" /> Customise Home</div>
            <p className="mt-1 text-sm text-[color:var(--medtrak-muted)]">Choose what matters to you. Detailed information remains available in each module.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 hover:bg-[color:var(--medtrak-panel-soft)]" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-5 overflow-y-auto p-5">
          <Group title="Layout" hint="How the main widgets sit on a wide screen. On a narrow screen they always stack.">
            <Segmented label="Arrangement" value={settings.layout} choices={SETTING_CHOICES.layout} onPick={(layout) => setSetting({ layout })} />
          </Group>

          {visible.has("needsYou") && (
            <Group title="Needs you" hint="Leave out anything you never deal with. The health strip still counts it.">
              <Segmented label="Show up to" value={settings.needsYouMax} choices={SETTING_CHOICES.needsYouMax} onPick={(needsYouMax) => setSetting({ needsYouMax })} />
              <Chips label="Include" options={NEEDS_CATEGORIES.map((c) => [c.key, c.label])} hidden={settings.needsYouHide} onChange={(needsYouHide) => setSetting({ needsYouHide })} />
            </Group>
          )}

          {visible.has("comingUp") && (
            <Group title="Coming up" hint="Shows what is due after the urgent items in Needs you, so nothing appears twice.">
              <Segmented label="Look ahead" value={settings.comingUpDays} choices={SETTING_CHOICES.comingUpDays} onPick={(comingUpDays) => setSetting({ comingUpDays })} />
              <Chips label="Include" options={COMING_KINDS.map((k) => [k.key, k.label])} hidden={settings.comingUpHide} onChange={(comingUpHide) => setSetting({ comingUpHide })} />
            </Group>
          )}

          {visible.has("healthStrip") && (
            <Group title="Practice health" hint="Which parts of the practice get a tile.">
              <Chips label="Show tiles for" options={HEALTH_AREAS} hidden={settings.healthHide} onChange={(healthHide) => setSetting({ healthHide })} />
            </Group>
          )}

          <Group title="Widgets" hint="Tick what to show and move it up or down.">
            <div className="space-y-2">
              {orderedWidgets.map((widget, index) => {
                const enabled = visible.has(widget.id);
                return (
                  <div key={widget.id} className={`flex items-center gap-3 rounded-2xl border ${LINE} bg-[color:var(--medtrak-panel-soft)] p-3`}>
                    <button type="button" onClick={() => toggle(widget.id)} aria-pressed={enabled} aria-label={`${enabled ? "Hide" : "Show"} ${widget.label}`} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${enabled ? "border-[color:var(--medtrak-accent)] bg-[color:var(--medtrak-accent)] text-white" : LINE}`}>
                      {enabled && <Check className="h-4 w-4" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{widget.label}</div>
                      <div className="text-xs leading-5 text-[color:var(--medtrak-muted)]">{widget.description}</div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button type="button" onClick={() => move(widget.id, -1)} disabled={index === 0} aria-label={`Move ${widget.label} up`} className={`rounded-lg border ${LINE} p-2 disabled:opacity-30`}><ChevronUp className="h-4 w-4" /></button>
                      <button type="button" onClick={() => move(widget.id, 1)} disabled={index === orderedWidgets.length - 1} aria-label={`Move ${widget.label} down`} className={`rounded-lg border ${LINE} p-2 disabled:opacity-30`}><ChevronDown className="h-4 w-4" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Group>
        </div>

        <div className={`flex flex-col gap-3 border-t ${LINE} p-5 sm:flex-row sm:items-center sm:justify-between`}>
          <button type="button" onClick={reset} className={`inline-flex items-center justify-center gap-2 rounded-xl border ${LINE} px-4 py-2.5 text-sm font-semibold`}><RotateCcw className="h-4 w-4" /> Reset to the standard Home</button>
          <button type="button" onClick={onSave} disabled={saving || preferences.visible.length === 0} className="rounded-xl bg-[color:var(--medtrak-accent)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
