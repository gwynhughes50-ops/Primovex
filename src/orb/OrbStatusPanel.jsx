import { ChevronRight } from "lucide-react";
import { AREAS } from "@/modules/orbStatus/orbStatus";

export const LEVEL_COLOUR = { green: "#2fbf7a", amber: "#e9a23b", red: "#df5a5f" };

// What the Orb's colour means for this person, in words: the headline, then each thing that needs attention with
// where to go. `onGo(signal)` takes them there. Nothing is shown when there is nothing to say and `quietWhenGreen`.
export default function OrbStatusPanel({ status, onGo, quietWhenGreen = false, limit = 6 }) {
  if (!status || (quietWhenGreen && status.level === "green")) return null;
  const shown = status.signals.slice(0, limit);
  const more = status.signals.length - shown.length;
  return (
    <section aria-label="What needs attention" className="rounded-2xl border p-3" style={{ borderColor: `${LEVEL_COLOUR[status.level]}66` }}>
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: LEVEL_COLOUR[status.level] }} aria-hidden="true" />
        <p className="text-sm font-bold">{status.headline}</p>
      </div>
      {status.level === "green" ? <p className="mt-1 text-xs opacity-70">Nothing of yours is overdue or has failed.</p> : (
        <ul className="mt-2 space-y-1">
          {shown.map((signal) => (
            <li key={signal.key}>
              <button type="button" onClick={() => onGo?.(signal)} className="flex min-h-9 w-full items-center gap-2 rounded-xl px-2 text-left text-sm hover:bg-black/5">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: LEVEL_COLOUR[signal.level] }} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{signal.label}</span>
                  <span className="block truncate text-xs opacity-70">{signal.detail || AREAS[signal.area]}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
              </button>
            </li>
          ))}
          {more > 0 && <li className="px-2 text-xs opacity-70">and {more} more</li>}
        </ul>
      )}
    </section>
  );
}
