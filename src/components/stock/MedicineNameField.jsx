import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen } from "lucide-react";
import useMedicineList from "@/hooks/useMedicineList";
import { searchMedicines } from "@/lib/medicineLookup";

// An item's name: start typing and pick from the NHS dm+d list (a brand fills in the brand too), or just keep what was
// typed for anything not in the list (gloves, syringes, a product with its own name). `onPick({ name, brand })` is called
// for a choice from the list; `onChange(text)` for every keystroke. Styled with the theme's variables so it suits both the
// desktop and the phone.
export default function MedicineNameField({ value, onChange, onPick, className = "", placeholder = "Start typing, e.g. adrenaline", id, autoFocus = false, inputRef }) {
  const data = useMedicineList(true);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const localRef = useRef(null);
  const ref = inputRef || localRef;
  const results = useMemo(() => (open ? searchMedicines(data, value) : []), [open, data, value]);
  useEffect(() => setHighlight(0), [value]);

  function choose(result) {
    onPick?.({ name: result.name, brand: result.brand || "" });
    setOpen(false);
  }

  function onKeyDown(event) {
    if (!results.length) return;
    if (event.key === "ArrowDown") { event.preventDefault(); setHighlight((h) => Math.min(h + 1, results.length - 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
    else if (event.key === "Enter" && results[highlight]) { event.preventDefault(); choose(results[highlight]); }
    else if (event.key === "Escape") setOpen(false);
  }

  return (
    <div className="relative">
      <input
        id={id}
        ref={ref}
        autoFocus={autoFocus}
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        className={className}
        onChange={(event) => { onChange?.(event.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={results.length > 0}
        aria-autocomplete="list"
      />
      {results.length > 0 && (
        <div role="listbox" aria-label="NHS dm+d medicine names" className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] text-[var(--medtrak-text)] shadow-xl">
          <p className="flex items-center gap-1.5 px-3 pt-2 text-[11px] uppercase tracking-wide text-[var(--medtrak-muted)]"><BookOpen className="h-3 w-3" aria-hidden="true" /> NHS dm+d list: pick one, or keep typing</p>
          {results.map((result, index) => (
            <button
              key={`${result.name}|${result.brand}`}
              type="button"
              role="option"
              aria-selected={index === highlight}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(result)}
              className={`flex min-h-10 w-full items-center px-3 py-2 text-left text-sm hover:bg-black/5 ${index === highlight ? "bg-black/5" : ""}`}
            >
              <span className="min-w-0 truncate">{result.label}</span>
              {result.kind === "brand" && <span className="ml-2 shrink-0 text-[10px] uppercase text-[var(--medtrak-muted)]">brand</span>}
            </button>
          ))}
          <p className="px-3 pb-2 pt-1 text-[11px] text-[var(--medtrak-muted)]">Not a medicine, or not in the list? Keep what you typed.</p>
        </div>
      )}
    </div>
  );
}
