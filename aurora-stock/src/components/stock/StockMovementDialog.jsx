// src/components/stock/StockMovementDialog.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Safe, dependency-light modal for stock movements.
 * Avoids relying on Dialog/Select components that may not exist in your project.
 *
 * Props:
 * - open (bool)
 * - onOpenChange (fn)
 * - item (object)
 * - mode ("use"|"receive")
 * - onConfirm ({ qty, reason, notes })
 */
export default function StockMovementDialog({
  open,
  onOpenChange,
  item,
  mode = "use",
  onConfirm,
}) {
  const [qtyRaw, setQtyRaw] = useState("1");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [brand, setBrand] = useState("");
  const [receiptBarcode, setReceiptBarcode] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const panelRef = useRef(null);
  const qtyRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setQtyRaw("1");
    setReason("");
    setNotes("");
    setBrand("");
    setReceiptBarcode("");
    setBatchNumber("");
    setExpiryDate("");
    const t = setTimeout(() => qtyRef.current?.focus(), 50);

    const onKey = (e) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  const qty = useMemo(() => {
    const n = Number(qtyRaw);
    if (!Number.isFinite(n)) return 1;
    return Math.max(1, Math.floor(n));
  }, [qtyRaw]);

  const current = Number(item?.current_stock ?? 0);
  const next = mode === "use" ? current - qty : current + qty;
  const title = mode === "use" ? "Use stock" : "Receive stock";

  if (!open) return null;

  const close = () => onOpenChange(false);

  const onBackdropMouseDown = (e) => {
    if (!panelRef.current) return;
    if (!panelRef.current.contains(e.target)) close();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={onBackdropMouseDown}
    >
      <div
        ref={panelRef}
        className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-950 text-slate-100 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-800">
          <div className="min-w-0">
            <div className="text-lg font-semibold text-slate-50">{title}</div>
            <div className="text-xs text-slate-400">Adjust quantity and confirm.</div>
          </div>
          <Button variant="ghost" onClick={close} className="rounded-full">
            ✕
          </Button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Item header */}
          <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-3">
  <div className="font-semibold text-white">{item?.name || "Item"}</div>
  {(item?.strength || item?.form) && (
    <div className="text-xs text-teal-200">{[item?.strength, item?.form].filter(Boolean).join(" • ")}</div>
  )}
  <div className="text-sm text-slate-200">Current stock: {current}</div>
</div>

          {/* Quantity */}
          <div>
            <label className="text-xs text-slate-300">Quantity</label>
            <div className="mt-1 flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800"
                onClick={() => setQtyRaw((v) => String(Math.max(1, Number(v || 1) - 1)))}
              >
                −
              </Button>

              <Input
                ref={qtyRef}
                type="number"
                min={1}
                value={qtyRaw}
                onChange={(e) => setQtyRaw(e.target.value)}
                onBlur={() => setQtyRaw(String(qty))}
                className="text-center bg-slate-900 border-slate-700 text-slate-100"
              />

              <Button
                type="button"
                variant="outline"
                className="border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800"
                onClick={() => setQtyRaw((v) => String(Math.max(1, Number(v || 1) + 1)))}
              >
                +
              </Button>
            </div>
          </div>

          {/* New stock level */}
          <div>
            <label className="text-xs text-slate-300">New stock level</label>
            <div className="mt-1 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-slate-50">
              {Number.isFinite(next) ? next : "—"}
            </div>
          </div>

          {mode === "receive" && (
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-cyan-200">Receipt details</p>
              <p className="mb-3 text-xs text-cyan-100/80">Barcode, batch and expiry belong to this delivery and may change next time.</p>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs text-slate-300">Brand</label>
                  <Input className="mt-1 bg-slate-900 border-slate-700 text-slate-100" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Optional" />
                </div>

                <div>
                  <label className="text-xs text-slate-300">Barcode received</label>
                  <Input className="mt-1 bg-slate-900 border-slate-700 text-slate-100" value={receiptBarcode} onChange={(e) => setReceiptBarcode(e.target.value)} placeholder="Optional" />
                </div>

                <div>
                  <label className="text-xs text-slate-300">Batch / lot</label>
                  <Input className="mt-1 bg-slate-900 border-slate-700 text-slate-100" value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} placeholder="Optional" />
                </div>

                <div>
                  <label className="text-xs text-slate-300">Expiry date</label>
                  <Input className="mt-1 bg-slate-900 border-slate-700 text-slate-100" type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {/* Reason */}
          <div>
            <label className="text-xs text-slate-300">Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            >
              <option value="" className="text-slate-100">
                Select reason…
              </option>
              <option value="routine">Routine use</option>
              <option value="expiry">Expired / damaged</option>
              <option value="audit">Stock audit</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs text-slate-300">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              placeholder="Add any notes…"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-800">
          <Button variant="outline" className="border-slate-700" onClick={close}>
            Cancel
          </Button>
          <Button
            className="bg-amber-400 text-slate-950 hover:bg-amber-300"
            onClick={() =>
              onConfirm?.({
                qty,
                reason,
                notes,
                brand,
                barcode: receiptBarcode,
                batch_number: batchNumber,
                expiry_date: expiryDate,
              })
            }
          >
            {mode === "use" ? "Use stock" : "Receive stock"}
          </Button>
        </div>
      </div>
    </div>
  );
}
