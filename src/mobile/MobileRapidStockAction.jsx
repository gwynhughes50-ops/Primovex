import { useState } from "react";
import { CheckCircle2, MapPin, Minus, Package, Plus, X } from "lucide-react";
import { formatProductSubtitle } from "@/utils/productDisplay";

function subtitle(item) {
  return formatProductSubtitle(item);
}

export default function MobileRapidStockAction({
  item,
  activeSpace,
  canWrite,
  busy,
  error,
  outcome,
  onUse,
  onClose,
  onMore,
}) {
  const [customQty, setCustomQty] = useState(1);
  const [showCustom, setShowCustom] = useState(false);
  const stock = Number(item?.current_stock || 0);

  if (!item) return null;

  const use = (qty) => {
    if (!busy && qty > 0 && qty <= stock) onUse(qty);
  };

  return (
    <div className="fixed inset-x-0 top-0 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-[85] flex items-end bg-black/50">
      <section className="max-h-[calc(100dvh-5.75rem-env(safe-area-inset-bottom))] w-full overflow-y-auto rounded-t-[2rem] border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-4 pb-4 pt-3 text-[var(--medtrak-text)] shadow-2xl">
        <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-[var(--medtrak-border)]" />
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.14em] text-[var(--medtrak-accent)]">
              <CheckCircle2 className="h-5 w-5 text-[var(--medtrak-success,#12b76a)]" /> Stock identified
            </p>
            <h2 className="mt-1 truncate text-2xl font-bold leading-tight">{item.name || "Unnamed item"}</h2>
            {subtitle(item) && <p className="mt-1 text-sm font-semibold text-[var(--medtrak-accent)]">{subtitle(item)}</p>}
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)]" aria-label="Close"><X className="h-5 w-5" /></button>
        </header>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2 rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-3">
            <Package className="h-5 w-5 text-[var(--medtrak-success,#12b76a)]" />
            <div><p className="text-xs text-[var(--medtrak-muted)]">Available</p><p className="text-xl font-bold">{stock}</p></div>
          </div>
          <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-3">
            <MapPin className="h-5 w-5 shrink-0 text-[var(--medtrak-accent)]" />
            <div className="min-w-0"><p className="text-xs text-[var(--medtrak-muted)]">Recorded at</p><p className="truncate font-bold">{activeSpace?.name || item.location || "Registered location"}</p></div>
          </div>
        </div>

        {!activeSpace && <p className="mt-2 text-xs text-[var(--medtrak-muted)]">No active Space. This use will retain the item’s registered location.</p>}

        {outcome ? (
          <div className="mt-4 rounded-2xl border border-green-500/30 bg-green-500/10 p-5 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
            <p className="mt-2 text-xl font-bold">Used {Math.abs(outcome.delta)}</p>
            <p className="text-sm text-[var(--medtrak-muted)]">{outcome.after} remaining · audit recorded</p>
          </div>
        ) : canWrite ? (
          <>
            <p className="mt-4 text-sm font-bold">How many are you taking?</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {[1, 2, 5].map((qty) => <button key={qty} type="button" disabled={busy || qty > stock} onClick={() => use(qty)} className="min-h-14 rounded-2xl bg-[var(--medtrak-accent)] px-3 py-3 text-lg font-bold text-white disabled:opacity-35">Use {qty}</button>)}
              <button type="button" disabled={busy} onClick={() => setShowCustom((value) => !value)} className="min-h-14 rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] px-3 py-3 text-lg font-bold">Other</button>
            </div>
            {showCustom && <div className="mt-3 rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-3">
              <div className="grid grid-cols-[3.25rem_1fr_3.25rem] gap-2">
                <button type="button" onClick={() => setCustomQty((value) => Math.max(1, Number(value || 1) - 1))} className="grid place-items-center rounded-xl border border-[var(--medtrak-border)]"><Minus className="h-5 w-5" /></button>
                <input type="number" inputMode="numeric" min="1" max={stock} value={customQty} onChange={(event) => setCustomQty(event.target.value)} className="w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 py-3 text-center text-lg font-bold" />
                <button type="button" onClick={() => setCustomQty((value) => Math.min(stock, Number(value || 0) + 1))} className="grid place-items-center rounded-xl border border-[var(--medtrak-border)]"><Plus className="h-5 w-5" /></button>
              </div>
              <button type="button" disabled={busy || Number(customQty) < 1 || Number(customQty) > stock} onClick={() => use(Number(customQty))} className="mt-2 w-full rounded-xl bg-[var(--medtrak-accent)] px-3 py-3 font-bold text-white disabled:opacity-40">{busy ? "Recording…" : `Use ${customQty}`}</button>
            </div>}
          </>
        ) : <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm font-semibold">Your role can view this item but cannot record stock use.</div>}

        {error && <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm font-semibold text-red-700">{error}</div>}
        {!outcome && <button type="button" onClick={onMore} className="mt-3 w-full rounded-xl border border-[var(--medtrak-border)] px-3 py-2.5 text-sm font-semibold">More inventory options</button>}
      </section>
    </div>
  );
}
