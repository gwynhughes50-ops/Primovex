import React, { useEffect, useMemo, useRef, useState } from "react";
import { collection, onSnapshot, query } from "firebase/firestore";
import { Barcode, Search, X } from "lucide-react";
import { db } from "@/lib/firebase";
import { applyStockMovement, useStockByBarcode } from "@/services/stockService";
import MobileBarcodeScanner from "@/components/ui/MobileBarcodeScanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function UseStockDialog({ open, onClose }) {
  const [mode, setMode] = useState("scan");
  const [barcode, setBarcode] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const barcodeRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const unsubscribe = onSnapshot(query(collection(db, "stock_items")), (snapshot) => {
      setItems(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });
    setTimeout(() => barcodeRef.current?.focus(), 50);
    return unsubscribe;
  }, [open]);

  useEffect(() => {
    if (!open) {
      setMode("scan"); setBarcode(""); setQuantity("1"); setSearch(""); setSelected(null); setMessage(null); setBusy(false);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items.slice(0, 20);
    return items.filter((item) => [item.name, item.barcode, item.site, item.location, item.category]
      .some((value) => String(value || "").toLowerCase().includes(term))).slice(0, 20);
  }, [items, search]);

  async function confirm() {
    const qty = Math.floor(Number(quantity));
    if (!Number.isFinite(qty) || qty < 1) return setMessage({ type: "error", text: "Quantity must be at least 1." });
    setBusy(true); setMessage(null);
    try {
      if (mode === "scan") {
        if (!barcode.trim()) throw new Error("Scan or enter a barcode first.");
        await useStockByBarcode({ barcode: barcode.trim(), qty });
      } else {
        if (!selected?.id) throw new Error("Select an item first.");
        await applyStockMovement(selected.id, { type: "use", qty, actor: null });
      }
      setMessage({ type: "ok", text: "Stock use recorded." });
      setBarcode(""); setSelected(null); setSearch(""); setQuantity("1");
      setTimeout(() => barcodeRef.current?.focus(), 50);
    } catch (error) {
      setMessage({ type: "error", text: String(error?.message || error) });
    } finally { setBusy(false); }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <section className="w-full max-w-md rounded-3xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-panel)] p-5 text-[color:var(--medtrak-text)] shadow-2xl">
        <header className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold">Use stock</h2><p className="text-sm text-[color:var(--medtrak-muted)]">Record an item by barcode or manual selection.</p></div><Button variant="ghost" onClick={onClose} disabled={busy}><X className="h-4 w-4" /></Button></header>
        <div className="mt-4 flex gap-2">
          <Button variant={mode === "scan" ? "default" : "outline"} onClick={() => setMode("scan")} className="rounded-full"><Barcode className="mr-2 h-4 w-4" />Scan</Button>
          <Button variant={mode === "manual" ? "default" : "outline"} onClick={() => setMode("manual")} className="rounded-full"><Search className="mr-2 h-4 w-4" />Manual</Button>
        </div>
        <div className="mt-4 space-y-3">
          {mode === "scan" ? <>
            <Input ref={barcodeRef} value={barcode} onChange={(event) => setBarcode(event.target.value)} placeholder="Scan barcode…" onKeyDown={(event) => event.key === "Enter" && confirm()} />
            <MobileBarcodeScanner onScan={(code) => { const value = String(code || "").trim(); setBarcode(value); const item = items.find((entry) => String(entry.barcode || "").trim() === value); setMessage(item ? { type: "ok", text: `Found: ${item.name || value}` } : { type: "error", text: `Barcode not found: ${value}` }); }} />
          </> : <>
            <Input value={search} onChange={(event) => { setSearch(event.target.value); setSelected(null); }} placeholder="Search item, site or location…" />
            <div className="max-h-56 overflow-auto rounded-2xl border border-[color:var(--medtrak-border)]">
              {filtered.map((item) => <button key={item.id} type="button" onClick={() => setSelected(item)} className={`w-full border-b border-[color:var(--medtrak-border)] px-3 py-2 text-left text-sm last:border-0 ${selected?.id === item.id ? "bg-[color:color-mix(in_srgb,var(--medtrak-accent)_14%,transparent)]" : ""}`}><span className="font-medium">{item.name || "Unnamed item"}</span><span className="block text-xs text-[color:var(--medtrak-muted)]">{item.site || "No site"}{item.location ? ` · ${item.location}` : ""} · Stock {Number(item.current_stock ?? 0)}</span></button>)}
            </div>
          </>}
          <label className="block text-xs font-semibold text-[color:var(--medtrak-muted)]">Quantity used<Input className="mt-1" type="number" min="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
          {message && <div className={`rounded-2xl border px-3 py-2 text-sm ${message.type === "error" ? "border-rose-500/30 bg-rose-500/10 text-rose-700" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"}`}>{message.text}</div>}
          <Button className="w-full rounded-xl bg-[color:var(--medtrak-accent)] text-white" disabled={busy} onClick={confirm}>{busy ? "Saving…" : "Confirm use"}</Button>
        </div>
      </section>
    </div>
  );
}
