import { X } from "lucide-react";
import { SE_STAGES, SE_HARM_LEVELS, stageLabel } from "../seModel";

// Small building blocks shared by the significant events screens (phone and desktop use the same
// ones, so a bottom sheet on a phone becomes a centred panel on a computer).

export const FIELD = "mt-1 w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 py-2.5 text-sm font-normal normal-case text-[var(--medtrak-text)]";
export const LABEL = "block space-y-1 text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]";
export const PRIMARY = "rounded-xl bg-[var(--medtrak-accent)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50";
export const SECONDARY = "rounded-xl border border-[var(--medtrak-border)] px-4 py-2.5 text-sm font-semibold disabled:opacity-50";
export const CARD = "rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-3.5";

export function Sheet({ title, eyebrow, subtitle, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <section className={`max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-5 pb-6 pt-4 text-[var(--medtrak-text)] shadow-2xl sm:rounded-3xl ${wide ? "sm:max-w-4xl" : "sm:max-w-2xl"}`}>
        <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-[var(--medtrak-border)] sm:hidden" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {eyebrow && <p className="text-xs font-bold uppercase tracking-[.14em] text-[var(--medtrak-accent)]">{eyebrow}</p>}
            <h2 className="mt-1 text-xl font-bold">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-[var(--medtrak-muted)]">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-[var(--medtrak-border)]" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </section>
    </div>
  );
}

export function SectionTitle({ children, aside }) {
  return (
    <div className="mt-5 flex items-center justify-between gap-2">
      <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]">{children}</h3>
      {aside}
    </div>
  );
}

export function ErrorText({ children }) {
  return children ? <p className="mt-2 rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-600">{children}</p> : null;
}

export function Pill({ tone = "plain", children }) {
  const tones = {
    plain: "bg-[var(--medtrak-bg)] text-[var(--medtrak-text)]",
    good: "bg-emerald-500/10 text-emerald-600",
    warn: "bg-amber-500/10 text-amber-600",
    bad: "bg-rose-500/10 text-rose-600",
  };
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${tones[tone]}`}>{children}</span>;
}

export function harmTone(harm) {
  if (harm === "severe") return "bad";
  if (harm === "moderate") return "warn";
  return "plain";
}

export function HarmPill({ harm }) {
  const level = SE_HARM_LEVELS.find((h) => h.key === harm) || SE_HARM_LEVELS[0];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold" style={{ borderColor: level.color, background: `${level.color}22` }}>
      <span className="h-2 w-2 rounded-full" style={{ background: level.color }} aria-hidden="true" />{level.label}
    </span>
  );
}

export function StagePill({ status }) {
  return <Pill tone={status === "closed" ? "good" : "plain"}>{stageLabel(status)}</Pill>;
}

export function StageProgress({ status }) {
  const current = Math.max(0, SE_STAGES.findIndex((s) => s.key === status));
  return (
    <ol className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-6" aria-label="Stage">
      {SE_STAGES.map((stage, index) => (
        <li key={stage.key} className={`rounded-lg border px-2 py-1.5 text-center text-[10px] font-bold uppercase tracking-wide ${index < current ? "border-teal-400/30 bg-teal-500/10 text-teal-700" : index === current ? "border-[var(--medtrak-accent)] bg-[var(--medtrak-accent)] text-white" : "border-[var(--medtrak-border)] text-[var(--medtrak-muted)]"}`}>
          {stage.label}
        </li>
      ))}
    </ol>
  );
}

// A list of people with ticks: used to pick reviewers, who was involved and who attended.
export function PeoplePicker({ people, selectedIds, onChange, disabledIds = [], emptyText = "No staff to choose from." }) {
  if (!people.length) return <p className="text-sm text-[var(--medtrak-muted)]">{emptyText}</p>;
  const toggle = (id) => onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  return (
    <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-[var(--medtrak-border)] p-1.5">
      {people.map((person) => (
        <label key={person.id} className={`flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm ${disabledIds.includes(person.id) ? "opacity-50" : ""}`}>
          <input type="checkbox" className="h-4 w-4" disabled={disabledIds.includes(person.id)} checked={selectedIds.includes(person.id) || disabledIds.includes(person.id)} onChange={() => toggle(person.id)} />
          <span className="font-semibold">{person.label}</span>
          <span className="text-xs text-[var(--medtrak-muted)]">{person.role}</span>
        </label>
      ))}
    </div>
  );
}
