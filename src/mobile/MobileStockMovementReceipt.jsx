import { CheckCircle2, RotateCcw, ShoppingCart, WifiOff, X } from "lucide-react";

export default function MobileStockMovementReceipt({ receipt, busy, onUndo, onReorder, onClose }) {
  if (!receipt) return null;

  const undone = receipt.status === "undone";
  const lowStock = Number(receipt.after) <= Number(receipt.item?.min_stock || 0);

  return (
    <aside className="fixed inset-x-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-[110] rounded-3xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-4 text-[var(--medtrak-text)] shadow-2xl" role="status" aria-live="polite">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-green-500/12 text-green-600">
          <CheckCircle2 className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">{undone ? "Stock use undone" : `Used ${receipt.qty} · ${receipt.item?.name || "Stock item"}`}</p>
          <p className="mt-0.5 text-sm text-[var(--medtrak-muted)]">
            {receipt.after} remaining · {receipt.spaceName || receipt.item?.location || "Registered location"}
          </p>
          <p className="mt-1 text-xs font-semibold text-green-700">Synced · audit entry recorded</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-full p-2" aria-label="Close receipt"><X className="h-4 w-4" /></button>
      </div>

      {!undone && <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" disabled={busy} onClick={onUndo} className="flex items-center justify-center gap-2 rounded-xl border border-[var(--medtrak-border)] px-3 py-2.5 font-bold disabled:opacity-45"><RotateCcw className="h-4 w-4" />{busy ? "Undoing…" : "Undo"}</button>
        {lowStock ? <button type="button" onClick={onReorder} className="flex items-center justify-center gap-2 rounded-xl bg-[var(--medtrak-accent)] px-3 py-2.5 font-bold text-white"><ShoppingCart className="h-4 w-4" />Reorder</button> : <button type="button" onClick={onClose} className="rounded-xl bg-[var(--medtrak-accent)] px-3 py-2.5 font-bold text-white">Done</button>}
      </div>}

      {receipt.error && <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm font-semibold text-red-700"><WifiOff className="mt-0.5 h-4 w-4 shrink-0" />{receipt.error}</div>}
    </aside>
  );
}
