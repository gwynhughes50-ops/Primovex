import { useMemo, useState } from "react";
import useStock from "@/hooks/useStock";

import MobileHome from "./MobileHome";
import MobileBottomNav from "./MobileBottomNav";
import MobileBarcodeScanner from "@/components/ui/MobileBarcodeScanner";
import MobileConnect from "./MobileConnect";
import MobileCompliance from "./MobileCompliance";
import MobileSessionShell from "./MobileSessionShell";
import AskPrimovexPanel from "@/ai/components/AskPrimovexPanel";
import OperationalEscalationSheet from "./OperationalEscalationSheet";
import MobileNfcScanner from "./MobileNfcScanner";

import {
  findStockItemByBarcode,
  applyStockMovement,
  createReorderRequest,
} from "@/services/stockService";

function productSubtitle(item) {
  return [item?.strength, item?.form].filter(Boolean).join(" • ");
}

export default function MobileLayout() {
  const [scannedItem, setScannedItem] = useState(null);
  const [scanError, setScanError] = useState("");
  const [useQty, setUseQty] = useState(1);
  const [useBusy, setUseBusy] = useState(false);
  const [activeTab, setActiveTab] = useState("home");
  const [escalationSeed, setEscalationSeed] = useState(null);
  const [showNfcScanner, setShowNfcScanner] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const [reorderBusy, setReorderBusy] = useState(false);
  const [showReorderForm, setShowReorderForm] = useState(false);
  const [reorderQty, setReorderQty] = useState(1);
  const [reorderNote, setReorderNote] = useState("");

  const { allItems = [] } = useStock({ includeArchived: false });

  const manualResults = useMemo(() => {
    const q = String(searchTerm || "").trim().toLowerCase();
    if (!q) return [];

    return allItems
      .filter((item) =>
        String(item.name || "").toLowerCase().includes(q) ||
        String(item.strength || "").toLowerCase().includes(q) ||
        String(item.form || "").toLowerCase().includes(q) ||
        String(item.product_identity_key || "").toLowerCase().includes(q) ||
        String(item.barcode || "").toLowerCase().includes(q) ||
        String(item.location || "").toLowerCase().includes(q) ||
        String(item.category || "").toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [allItems, searchTerm]);

  const handleMobileScan = async (code) => {
    const scannedCode = String(code || "").trim();
    if (!scannedCode) return;

    setScanError("");
    setScannedItem(null);

    try {
      const item = await findStockItemByBarcode(scannedCode);
      setUseQty(1);
      setScannedItem({ ...item, barcode: scannedCode });
    } catch {
      setScanError("Item not found. Try searching manually.");
      setShowSearch(true);
    }
  };

  const handleUseStock = async () => {
    if (!scannedItem) return;

    const qty = Number(useQty);

    if (!Number.isFinite(qty) || qty <= 0) {
      alert("Please enter a valid quantity");
      return;
    }

    if (qty > Number(scannedItem.current_stock || 0)) {
      alert("You cannot use more stock than is currently available");
      return;
    }

    try {
      setUseBusy(true);

      await applyStockMovement(scannedItem.id, {
        type: "use",
        qty,
        actor: null,
      });

      alert(`Used ${qty} item(s)`);
      setScannedItem(null);
      setUseQty(1);
    } catch (err) {
      console.error(err);
      alert("Failed to update stock");
    } finally {
      setUseBusy(false);
    }
  };

  const handleReceiveStock = async () => {
    if (!scannedItem) return;

    const qty = Number(useQty);

    if (!Number.isFinite(qty) || qty <= 0) {
      alert("Please enter a valid quantity");
      return;
    }

    try {
      setUseBusy(true);

      await applyStockMovement(scannedItem.id, {
        type: "receive",
        qty,
        actor: null,
      });

      alert(`Received ${qty} item(s)`);
      setScannedItem(null);
      setUseQty(1);
    } catch (err) {
      console.error(err);
      alert("Failed to update stock");
    } finally {
      setUseBusy(false);
    }
  };

  const handleRequestReorder = async () => {
    if (!scannedItem) return;

    try {
      setReorderBusy(true);

      await createReorderRequest({
        ...scannedItem,
        requested_qty: Number(reorderQty || 1),
        note: reorderNote || "",
      });

      alert("Reorder request created");

      setShowReorderForm(false);
      setReorderQty(1);
      setReorderNote("");
    } catch (err) {
      console.error(err);
      alert("Failed to create reorder request");
    } finally {
      setReorderBusy(false);
    }
  };

  return (
    <MobileSessionShell>
    <div className="min-h-screen bg-[var(--medtrak-bg)] text-[var(--medtrak-text)] pb-20">
      {activeTab === "connect" ? (
        <MobileConnect />
      ) : activeTab === "compliance" ? (
        <MobileCompliance />
      ) : (
        <MobileHome
          mode={activeTab}
          onNavigate={setActiveTab}
          onScan={() => document.querySelector("[data-mobile-scan-button]")?.click()}
          onSearch={() => setShowSearch(true)}
          onRaiseIssue={(seed) => setEscalationSeed(seed || {})}
          onScanNfc={() => setShowNfcScanner(true)}
          onSelectItem={(item) => {
            setUseQty(1);
            setScanError("");
            setScannedItem(item);
          }}
        />
      )}

      {showReorderForm && (
        <div className="fixed inset-0 z-[80] flex items-end bg-black/50">
          <div className="w-full rounded-t-3xl border border-amber-500/30 bg-slate-950 p-5">
            <h2 className="text-xl font-bold text-white">Reorder Request</h2>

            <p className="mt-1 text-slate-400">
              {scannedItem?.name}
              {productSubtitle(scannedItem) ? ` • ${productSubtitle(scannedItem)}` : ""}
            </p>

            <div className="mt-4">
              <label className="mb-1 block text-sm text-slate-300">
                Quantity Required
              </label>

              <input
                type="number"
                min="1"
                value={reorderQty}
                onChange={(e) => setReorderQty(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-white"
              />
            </div>

            <div className="mt-4">
              <label className="mb-1 block text-sm text-slate-300">Note</label>

              <textarea
                value={reorderNote}
                onChange={(e) => setReorderNote(e.target.value)}
                rows={3}
                placeholder="Optional note..."
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-white"
              />
            </div>

            <button
              type="button"
              onClick={handleRequestReorder}
              disabled={reorderBusy}
              className="mt-4 w-full rounded-xl bg-amber-500 px-3 py-3 font-semibold text-slate-950 disabled:opacity-50"
            >
              {reorderBusy ? "Creating..." : "Submit Request"}
            </button>

            <button
              type="button"
              onClick={() => setShowReorderForm(false)}
              className="mt-3 w-full rounded-xl bg-slate-800 px-3 py-3 text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {scannedItem && (
        <div className="fixed inset-0 z-[70] flex items-end bg-black/50">
          <div className="w-full rounded-t-3xl border border-teal-400/30 bg-slate-950 p-5 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-300">
              Item found
            </p>

            <p className="mt-1 text-xl font-bold text-white">
              {scannedItem.name || "Unnamed item"}
            </p>

            {productSubtitle(scannedItem) && (
              <p className="mt-1 text-sm font-semibold text-teal-200">
                {productSubtitle(scannedItem)}
              </p>
            )}

            <p className="mt-2 text-sm text-slate-300">
              Stock: {scannedItem.current_stock ?? 0}
              {scannedItem.location ? ` • ${scannedItem.location}` : ""}
            </p>

            {Number(scannedItem.current_stock || 0) <=
              Number(scannedItem.min_stock || 0) && (
              <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-200">
                ⚠ Low Stock Warning
                {scannedItem.min_stock !== undefined && (
                  <span className="ml-1 font-normal text-rose-100">
                    Min: {scannedItem.min_stock}
                  </span>
                )}
              </div>
            )}

            {scannedItem.barcode && (
              <p className="mt-1 text-xs text-slate-500">
                Barcode: {scannedItem.barcode}
              </p>
            )}

            <div className="mt-4">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Quantity
              </label>

              <input
                type="number"
                min="1"
                value={useQty}
                onChange={(e) => setUseQty(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-white"
              />
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleUseStock}
                disabled={useBusy}
                className="rounded-xl bg-teal-400 px-3 py-3 text-sm font-bold text-slate-950 disabled:opacity-50"
              >
                {useBusy ? "Updating..." : "Use Stock"}
              </button>

              <button
                type="button"
                onClick={handleReceiveStock}
                disabled={useBusy}
                className="rounded-xl border border-slate-700 px-3 py-3 text-sm text-white disabled:opacity-50"
              >
                {useBusy ? "Updating..." : "Receive"}
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setReorderQty(1);
                setReorderNote("");
                setShowReorderForm(true);
              }}
              disabled={reorderBusy}
              className="mt-3 w-full rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-sm font-semibold text-amber-200 disabled:opacity-50"
            >
              Request Reorder
            </button>

            <button
              type="button"
              onClick={() => setScannedItem(null)}
              className="mt-3 w-full rounded-xl bg-slate-800 px-3 py-3 text-sm text-slate-200"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {scanError && (
        <div className="fixed inset-x-4 bottom-24 z-[70] rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">
          {scanError}
        </div>
      )}

      {showSearch && (
        <div className="fixed inset-0 z-[75] bg-slate-950 p-4">
          <div className="mx-auto max-w-xl">
            <h2 className="mb-4 text-xl font-bold text-white">Search Stock</h2>

            <input
              autoFocus
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, barcode, category..."
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
            />

            <div className="mt-4 space-y-2">
              {manualResults.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setScannedItem(item);
                    setShowSearch(false);
                    setSearchTerm("");
                    setScanError("");
                  }}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-left"
                >
                  <div className="font-semibold text-white">{item.name}</div>
                  {productSubtitle(item) && (
                    <div className="text-xs text-teal-200">{productSubtitle(item)}</div>
                  )}

                  <div className="text-sm text-slate-400">
                    Stock: {item.current_stock ?? 0}
                    {item.location ? ` • ${item.location}` : ""}
                  </div>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                setShowSearch(false);
                setSearchTerm("");
              }}
              className="mt-4 w-full rounded-xl bg-slate-800 px-4 py-3 text-white"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <OperationalEscalationSheet open={escalationSeed !== null} seed={escalationSeed || {}} onClose={() => setEscalationSeed(null)} />

      <MobileNfcScanner open={showNfcScanner} onClose={() => setShowNfcScanner(false)} />

      <MobileBarcodeScanner onScan={handleMobileScan} />

      <AskPrimovexPanel variant="mobile" />

      <MobileBottomNav
        activeKey={activeTab}
        onNavigate={setActiveTab}
      />
    </div>
    </MobileSessionShell>
  );
}