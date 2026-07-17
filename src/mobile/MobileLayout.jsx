import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import useStock from "@/hooks/useStock";

import MobileHome from "./MobileHome";
import MobileBottomNav from "./MobileBottomNav";
import MobileBarcodeScanner from "@/components/ui/MobileBarcodeScanner";
import MobileConnect from "./MobileConnect";
import MobileCompliance from "./MobileCompliance";
import MobileSessionShell from "./MobileSessionShell";
import AskPrimovexPanel from "@/ai/components/AskPrimovexPanel";
import usePrimovexAI from "@/ai/hooks/usePrimovexAI";
import OperationalEscalationSheet from "./OperationalEscalationSheet";
import MobileNfcScanner from "./MobileNfcScanner";
import QuickNotesSheet from "./QuickNotesSheet";
import MobileAIActionSheet from "./MobileAIActionSheet";
import MobileSenseSpaces from "./MobileSenseSpaces";
import RoleAdaptiveMobileHome from "./RoleAdaptiveMobileHome";
import { useAuth } from "@/contexts/AuthContext";
import { loadSpaceRegistry } from "@/modules/sense/services/sharedSpaceRegistry";
import { getOpenQuickNotes, subscribeQuickNotes } from "@/services/quickNotesService";
import { Barcode, BellRing, CheckCircle2, Eye, MapPin, Minus, Package, Plus, Sparkles, X } from "lucide-react";
import ActiveSenseBanner from "@/modules/sense/components/ActiveSenseBanner";
import { useSenseSession } from "@/contexts/SenseSessionContext";
import MobileDeveloperIssueRecorder from "@/developer/MobileDeveloperIssueRecorder";
import "./mobileLayout.css";

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
  const [unknownBarcode, setUnknownBarcode] = useState("");
  const [useQty, setUseQty] = useState(1);
  const [useBusy, setUseBusy] = useState(false);
  const [activeTab, setActiveTab] = useState("home");
  const [escalationSeed, setEscalationSeed] = useState(null);
  const [showNfcScanner, setShowNfcScanner] = useState(false);
  const [spaceScanError, setSpaceScanError] = useState("");
  const [showQuickNotes, setShowQuickNotes] = useState(false);
  const [showAIActionSheet, setShowAIActionSheet] = useState(false);
  const [quickNotes, setQuickNotes] = useState(() => getOpenQuickNotes());
  useEffect(() => subscribeQuickNotes((notes) => setQuickNotes(notes.filter((note) => note.status !== "completed"))), []);

  const [searchTerm, setSearchTerm] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const [reorderBusy, setReorderBusy] = useState(false);
  const [showReorderForm, setShowReorderForm] = useState(false);
  const [reorderQty, setReorderQty] = useState(1);
  const [reorderNote, setReorderNote] = useState("");

  const { allItems = [] } = useStock({ includeArchived: false });
  const navigate = useNavigate();
  const { open: openPrimovexAI, ask: askPrimovexAI } = usePrimovexAI();
  const { activeSenseSession, activate } = useSenseSession();
  const { role, user } = useAuth();


  const handleSpaceCodeScan = async (rawCode) => {
    const code = String(rawCode || "").trim();
    if (!code) return;
    setSpaceScanError("");

    let spaceId = code;
    try {
      const url = new URL(code, window.location.origin);
      const match = url.pathname.match(/^\/sense\/open\/space\/([^/]+)\/?$/i);
      if (match) spaceId = decodeURIComponent(match[1]);
    } catch {}

    const registry = loadSpaceRegistry();
    const space = registry.spaces.find((item) =>
      [item.id, item.spaceId, item.qrCode, item.nfcTagId, item.slug].filter(Boolean).some((value) => String(value).toLowerCase() === spaceId.toLowerCase())
    );

    if (!space) {
      setSpaceScanError("This code is not linked to a Primovex Space yet.");
      return;
    }

    await activate({ id: space.spaceId || space.id, name: space.name, type: "space", source: "qr-barcode" });
    setActiveTab("sense");
  };

  const openSpaceScanner = () => {
    setSpaceScanError("");
    document.querySelector("[data-mobile-space-scan-button]")?.click();
  };

  const handleRoleAction = async (action) => {
    switch (action) {
      case "scan-stock":
        document.querySelector("[data-mobile-scan-button]")?.click();
        break;
      case "scan-room":
        openSpaceScanner();
        break;
      case "room":
        setActiveTab("sense");
        break;
      case "stock":
        setActiveTab("stock");
        break;
      case "temperature":
        navigate("/temperature");
        break;
      case "checks":
        setActiveTab("compliance");
        break;
      case "clean":
        setActiveTab("facilities");
        break;
      case "issue":
        setEscalationSeed({ senseObjectId: activeSenseSession?.senseObjectId, location: activeSenseSession?.senseObjectName });
        break;
      case "orb":
        setShowAIActionSheet(true);
        break;
      default:
        break;
    }
  };

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
      setUnknownBarcode(scannedCode);
      setScanError("");
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

  const scanAgain = () => {
    setUnknownBarcode("");
    setScanError("");
    setTimeout(() => document.querySelector("[data-mobile-scan-button]")?.click(), 80);
  };

  const askAboutScannedItem = async () => {
    if (!scannedItem) return;
    const label = [scannedItem.name, productSubtitle(scannedItem)].filter(Boolean).join(" • ");
    setScannedItem(null);
    openPrimovexAI();
    await askPrimovexAI(`Tell me about the stock position for ${label}. Current stock is ${scannedItem.current_stock ?? 0}.`);
  };

  return (
    <MobileSessionShell>
    <div className="min-h-[100dvh] bg-[var(--medtrak-bg)] text-[var(--medtrak-text)] pb-[var(--pvx-mobile-content-bottom)]">
      <ActiveSenseBanner />
      <MobileDeveloperIssueRecorder />
      {activeTab === "home" && <RoleAdaptiveMobileHome onAction={handleRoleAction} />}
      {activeTab === "connect" ? (
        <MobileConnect />
      ) : activeTab === "compliance" ? (
        <MobileCompliance />
      ) : activeTab === "sense" ? (
        <MobileSenseSpaces onScan={() => setShowNfcScanner(true)} />
      ) : activeTab === "home" ? null : (
        <MobileHome
          mode={activeTab}
          onNavigate={setActiveTab}
          onScan={() => document.querySelector("[data-mobile-scan-button]")?.click()}
          onSearch={() => setShowSearch(true)}
          onRaiseIssue={(seed) => setEscalationSeed(seed || {})}
          onScanNfc={() => setShowNfcScanner(true)}
          onQuickNote={() => setShowQuickNotes(true)}
          quickNoteCount={quickNotes.length}
          onSelectItem={(item) => {
            setUseQty(1);
            setScanError("");
            setScannedItem(item);
          }}
        />
      )}

      {showReorderForm && (
        <div className="fixed inset-0 z-[80] flex items-end bg-black/45">
          <div className="w-full rounded-t-3xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-5 text-[var(--medtrak-text)]">
            <h2 className="text-xl font-bold text-[var(--medtrak-text)]">Reorder Request</h2>

            <p className="mt-1 text-[var(--medtrak-muted)]">
              {scannedItem?.name}
              {productSubtitle(scannedItem) ? ` • ${productSubtitle(scannedItem)}` : ""}
            </p>

            <div className="mt-4">
              <label className="mb-1 block text-sm text-[var(--medtrak-muted)]">
                Quantity Required
              </label>

              <input
                type="number"
                min="1"
                value={reorderQty}
                onChange={(e) => setReorderQty(e.target.value)}
                className="w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] px-3 py-3 text-[var(--medtrak-text)]"
              />
            </div>

            <div className="mt-4">
              <label className="mb-1 block text-sm text-[var(--medtrak-muted)]">Note</label>

              <textarea
                value={reorderNote}
                onChange={(e) => setReorderNote(e.target.value)}
                rows={3}
                placeholder="Optional note..."
                className="w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] px-3 py-3 text-[var(--medtrak-text)]"
              />
            </div>

            <button
              type="button"
              onClick={handleRequestReorder}
              disabled={reorderBusy}
              className="mt-4 w-full rounded-xl bg-[var(--medtrak-accent)] px-3 py-3 font-semibold text-white disabled:opacity-50"
            >
              {reorderBusy ? "Creating..." : "Submit Request"}
            </button>

            <button
              type="button"
              onClick={() => setShowReorderForm(false)}
              className="mt-3 w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] px-3 py-3 text-[var(--medtrak-text)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {scannedItem && (
        <div className="fixed inset-x-0 top-0 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-[85] flex items-end bg-black/45">
          <section className="max-h-[calc(100dvh-6rem-env(safe-area-inset-bottom))] w-full overflow-y-auto rounded-t-[2rem] border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-5 pb-5 pt-3 text-[var(--medtrak-text)] shadow-2xl">
            <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-[var(--medtrak-border)]" />
            <header className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.14em] text-[var(--medtrak-accent)]">
                  <CheckCircle2 className="h-5 w-5 text-[var(--medtrak-success,#12b76a)]" /> Item found
                </p>
                <h2 className="mt-2 text-[clamp(1.75rem,7vw,2.25rem)] font-bold leading-tight text-[var(--medtrak-text)]">
                  {scannedItem.name || "Unnamed item"}
                </h2>
                {productSubtitle(scannedItem) && <p className="mt-1 text-sm font-semibold text-[var(--medtrak-accent)]">{productSubtitle(scannedItem)}</p>}
              </div>
              <button type="button" onClick={() => setScannedItem(null)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)]" aria-label="Close item actions"><X className="h-5 w-5" /></button>
            </header>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-[color-mix(in_srgb,var(--medtrak-success,#12b76a)_22%,var(--medtrak-border))] bg-[color-mix(in_srgb,var(--medtrak-success,#12b76a)_7%,var(--medtrak-panel))] p-3">
                <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--medtrak-success,#12b76a)_12%,var(--medtrak-panel))] text-[var(--medtrak-success,#12b76a)]"><Package className="h-5 w-5" /></span><div><p className="text-xs font-semibold text-[var(--medtrak-muted)]">Stock</p><p className="text-2xl font-bold text-[var(--medtrak-success,#12b76a)]">{scannedItem.current_stock ?? 0}</p><p className="text-xs text-[var(--medtrak-muted)]">in stock</p></div></div>
              </div>
              <div className="rounded-2xl border border-[color-mix(in_srgb,var(--medtrak-accent)_22%,var(--medtrak-border))] bg-[color-mix(in_srgb,var(--medtrak-accent)_7%,var(--medtrak-panel))] p-3">
                <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--medtrak-accent)_12%,var(--medtrak-panel))] text-[var(--medtrak-accent)]"><MapPin className="h-5 w-5" /></span><div><p className="text-xs font-semibold text-[var(--medtrak-muted)]">Location</p><p className="text-xl font-bold text-[var(--medtrak-accent)]">{scannedItem.location || "Not set"}</p></div></div>
              </div>
            </div>

            {Number(scannedItem.current_stock || 0) <= Number(scannedItem.min_stock || 0) && (
              <div className="mt-3 rounded-xl border border-[color-mix(in_srgb,var(--medtrak-danger,#b42318)_30%,transparent)] bg-[color-mix(in_srgb,var(--medtrak-danger,#b42318)_8%,var(--medtrak-panel))] px-3 py-2 text-sm font-semibold text-[var(--medtrak-danger,#b42318)]">Low stock warning{scannedItem.min_stock !== undefined ? ` • Minimum ${scannedItem.min_stock}` : ""}</div>
            )}

            {scannedItem.barcode && <div className="mt-3 flex items-center gap-3 rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] px-4 py-3"><Barcode className="h-5 w-5 text-[var(--medtrak-muted)]" /><div><p className="text-xs font-semibold text-[var(--medtrak-muted)]">Barcode</p><p className="font-medium">{scannedItem.barcode}</p></div></div>}

            <div className="mt-4">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--medtrak-muted)]">Quantity</label>
              <div className="grid grid-cols-[3.25rem_1fr_3.25rem] gap-2">
                <button type="button" onClick={() => setUseQty((value) => Math.max(1, Number(value || 1) - 1))} className="grid place-items-center rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)]" aria-label="Decrease quantity"><Minus className="h-5 w-5" /></button>
                <input type="number" min="1" value={useQty} onChange={(e) => setUseQty(e.target.value)} className="w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] px-3 py-3 text-center text-lg font-semibold text-[var(--medtrak-text)]" />
                <button type="button" onClick={() => setUseQty((value) => Number(value || 0) + 1)} className="grid place-items-center rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)]" aria-label="Increase quantity"><Plus className="h-5 w-5" /></button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={handleUseStock} disabled={useBusy} className="rounded-2xl bg-[var(--medtrak-accent)] px-3 py-3 font-bold text-white disabled:opacity-50">{useBusy ? "Updating..." : "Use Stock"}</button>
              <button type="button" onClick={handleReceiveStock} disabled={useBusy} className="rounded-2xl border border-[color-mix(in_srgb,var(--medtrak-accent)_35%,var(--medtrak-border))] bg-[color-mix(in_srgb,var(--medtrak-accent)_7%,var(--medtrak-panel))] px-3 py-3 font-bold text-[var(--medtrak-accent)] disabled:opacity-50">{useBusy ? "Updating..." : "Receive Stock"}</button>
            </div>

            <button type="button" onClick={() => { setReorderQty(1); setReorderNote(""); setShowReorderForm(true); }} disabled={reorderBusy} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-[color-mix(in_srgb,var(--medtrak-warning,#f59e0b)_32%,var(--medtrak-border))] bg-[color-mix(in_srgb,var(--medtrak-warning,#f59e0b)_8%,var(--medtrak-panel))] px-3 py-3 font-semibold disabled:opacity-50"><BellRing className="h-5 w-5 text-[var(--medtrak-warning,#f59e0b)]" />Request Reorder</button>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => { setScannedItem(null); setActiveTab("stock"); }} className="flex items-center justify-center gap-2 rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] px-3 py-3 font-semibold"><Eye className="h-5 w-5" />View Details</button>
              <button type="button" onClick={askAboutScannedItem} className="flex items-center justify-center gap-2 rounded-2xl border border-[color-mix(in_srgb,var(--medtrak-accent)_32%,var(--medtrak-border))] bg-[color-mix(in_srgb,var(--medtrak-accent)_10%,var(--medtrak-panel))] px-3 py-3 font-semibold text-[var(--medtrak-accent)]"><Sparkles className="h-5 w-5" />Ask Primovex AI</button>
            </div>
          </section>
        </div>
      )}

      {unknownBarcode && (
        <div className="fixed inset-0 z-[72] flex items-end bg-black/45">
          <div className="w-full rounded-t-3xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-5 text-[var(--medtrak-text)] shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--medtrak-warning,#f59e0b)]">Barcode not recognised</p>
            <h2 className="mt-1 text-xl font-bold">No matching stock item</h2>
            <p className="mt-2 text-sm text-[var(--medtrak-muted)]">Barcode {unknownBarcode} is not linked to an active inventory item.</p>
            <div className="mt-5 grid gap-2">
              <button type="button" onClick={() => { setSearchTerm(unknownBarcode); setUnknownBarcode(""); setShowSearch(true); }} className="w-full rounded-xl bg-[var(--medtrak-accent)] px-4 py-3 font-semibold text-white">Search inventory</button>
              <button type="button" onClick={() => { setUnknownBarcode(""); navigate(`/inventory?add=1&barcode=${encodeURIComponent(unknownBarcode)}`); }} className="w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] px-4 py-3 font-semibold">Add new item</button>
              <button type="button" onClick={scanAgain} className="w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] px-4 py-3 font-semibold">Scan again</button>
              <button type="button" onClick={() => setUnknownBarcode("")} className="w-full rounded-xl px-4 py-3 text-sm text-[var(--medtrak-muted)]">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {scanError && (
        <div className="fixed inset-x-4 bottom-24 z-[70] rounded-2xl border border-[color-mix(in_srgb,var(--medtrak-danger,#b42318)_30%,transparent)] bg-[var(--medtrak-panel)] p-4 text-sm text-[var(--medtrak-danger,#b42318)]">
          {scanError}
        </div>
      )}

      {showSearch && (
        <div className="pvx-mobile-sheet-backdrop z-[95]">
          <section className="pvx-mobile-sheet text-[var(--medtrak-text)]">
          <div className="mx-auto max-w-xl">
            <h2 className="mb-4 text-xl font-bold text-[var(--medtrak-text)]">Search Stock</h2>

            <input
              autoFocus
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, barcode, category..."
              className="w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-4 py-3 text-[var(--medtrak-text)]"
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
                  className="w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-3 text-left"
                >
                  <div className="font-semibold text-[var(--medtrak-text)]">{item.name}</div>
                  {productSubtitle(item) && (
                    <div className="text-xs text-[var(--medtrak-accent)]">{productSubtitle(item)}</div>
                  )}

                  <div className="text-sm text-[var(--medtrak-muted)]">
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
              className="mt-4 w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-4 py-3 text-[var(--medtrak-text)]"
            >
              Close
            </button>
          </div>
          </section>
        </div>
      )}

      <OperationalEscalationSheet open={escalationSeed !== null} seed={escalationSeed || {}} onClose={() => setEscalationSeed(null)} />

      <MobileNfcScanner open={showNfcScanner} onClose={() => setShowNfcScanner(false)} />

      <QuickNotesSheet open={showQuickNotes} onClose={() => setShowQuickNotes(false)} />

      <MobileAIActionSheet
        open={showAIActionSheet}
        reminderCount={quickNotes.length}
        onClose={() => setShowAIActionSheet(false)}
        onAsk={() => { setShowAIActionSheet(false); openPrimovexAI(); }}
        onQuickNote={() => { setShowAIActionSheet(false); setShowQuickNotes(true); }}
        onFindStock={() => { setShowAIActionSheet(false); setActiveTab("stock"); setShowSearch(true); }}
        onPracticeSummary={async () => { setShowAIActionSheet(false); openPrimovexAI(); await askPrimovexAI("Give me a concise practice operations summary for today, including outstanding work and anything needing attention."); }}
      />

      <MobileBarcodeScanner onScan={handleMobileScan} />
      <MobileBarcodeScanner
        onScan={handleSpaceCodeScan}
        triggerAttribute="data-mobile-space-scan-button"
        title="Scan room or space"
        helper="Scan the Primovex QR code or barcode on the room tag. NFC remains available too."
      />

      {spaceScanError && (
        <div className="fixed inset-x-4 bottom-[calc(var(--pvx-mobile-content-bottom)+.5rem)] z-[120] rounded-2xl border border-red-500/30 bg-[var(--medtrak-panel)] p-4 text-sm text-red-700 shadow-xl">
          {spaceScanError}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => { setSpaceScanError(""); setShowNfcScanner(true); }} className="rounded-xl bg-[var(--medtrak-accent)] px-3 py-2 font-bold text-white">Try NFC</button>
            <button type="button" onClick={() => setSpaceScanError("")} className="rounded-xl border border-[var(--medtrak-border)] px-3 py-2 font-bold">Close</button>
          </div>
        </div>
      )}

      <AskPrimovexPanel variant="mobile" />

      <MobileBottomNav
        activeKey={activeTab === "sense" ? "facilities" : activeTab}
        onNavigate={setActiveTab}
        onOpenAI={() => setShowAIActionSheet(true)}
      />
    </div>
    </MobileSessionShell>
  );
}