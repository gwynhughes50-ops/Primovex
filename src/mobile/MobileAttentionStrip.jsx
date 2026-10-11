import { CircleCheck, TriangleAlert } from "lucide-react";
import { useOrbStatus } from "@/orb/OrbStatusContext";

const TONES = {
  critical: "border-rose-400/40 bg-rose-500/10 text-rose-700",
  warning: "border-amber-400/40 bg-amber-500/10 text-amber-700",
  info: "border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] text-[var(--medtrak-text)]",
  ok: "border-emerald-400/40 bg-emerald-500/10 text-emerald-700",
};

// "What needs attention" at the top of a manager's or partner's phone: only what this person is allowed to see.
export default function MobileAttentionStrip({ onAction }) {
  const { chips } = useOrbStatus();

  return (
    <section aria-label="What needs attention" className="flex flex-wrap gap-2">
      {chips.map((chip) => {
        const Icon = chip.tone === "ok" ? CircleCheck : TriangleAlert;
        const content = <><Icon className="h-4 w-4 shrink-0" aria-hidden="true" /><span>{chip.label}</span></>;
        const className = `inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm font-bold ${TONES[chip.tone]}`;
        return chip.action
          ? <button key={chip.key} type="button" className={className} onClick={() => onAction?.(chip.action)}>{content}</button>
          : <p key={chip.key} className={className}>{content}</p>;
      })}
    </section>
  );
}
