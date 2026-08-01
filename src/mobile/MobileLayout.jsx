import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
import MobileClinicalAssetReconciliation from "./MobileClinicalAssetReconciliation";
import MobileRapidStockAction from "./MobileRapidStockAction";
import MobileStockMovementReceipt from "./MobileStockMovementReceipt";
import { useAuth } from "@/contexts/AuthContext";
import { loadSpaceRegistry } from "@/modules/sense/services/sharedSpaceRegistry";
import { getOpenQuickNotes, subscribeQuickNotes } from "@/services/quickNotesService";
import { Camera, BellRing, Eye, Sparkles } from "lucide-react";
import ActiveSenseBanner from "@/modules/sense/components/ActiveSenseBanner";
import { useSenseSession } from "@/contexts/SenseSessionContext";
import MobileDeveloperIssueRecorder from "@/developer/MobileDeveloperIssueRecorder";
import "./mobileLayout.css";
import { formatProductSubtitle } from "@/utils/productDisplay";

import {
  findStockItemByBarcode,
  applyStockMovement,
  reverseStockUseMovement,
  createReorderRequest,
} from "@/services/stockService";

function productSubtitle(item) {
  return formatProductSubtitle(item);
}

export default function MobileLayout({ initialTab = "home" }) {
  const [scannedItem, setScannedItem] = useState(null);
  const [scanError, setScanError] = useState("");
  const [unknownBarcode, setUnknownBarcode] = useState("");
  const [useQty, setUseQty] = useState(1);
  const [useBusy, setUseBusy] = useState(false);
  const [useError, setUseError] = useState("");
  const [movementOutcome, setMovementOutcome] = useState(null);
  const [recentMovement, setRecentMovement] = useState(null);
  const [undoBusy, setUndoBusy] = useState(false);
  const [showStockMore, setShowStockMore] = useState(false);
  const [activeTab, setActiveTab] = useState(initialTab);
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
  const [reorderItem, setReorderItem] = useState(null);
  const [showReorderForm, setShowReorderForm] = useState(false);
  const [reorderQty, setReorderQty] = useState(1);
  const [reorderNote, setReorderNote] = useState("");

  const { allItems = [] } = useStock({ includeArchived: false });
  const location = useLocation();
  const navigate = useNavigate();
  const { open: openPrimovexAI, ask: askPrimovexAI } = usePrimovexAI();
  const { activeSenseSession, activate } = useSenseSession();
  const { role, user, displayName, can } = useAuth();
  const routedChecklistTab = location.pathname === '/inventory' ? new URLSearchParams(location.search).get('tab') : null;
  const showRoutedChecklist = routedChecklistTab === 'emergency' || routedChecklistTab === 'anaphylaxis';

  const handleBottomNavigation = (nextTab) => {
    if (showRoutedChecklist) navigate('/', { replace: true });
    setActiveTab(nextTab);
  };


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
        setActiveTab("temperature");
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
      setUseError("");
      setMovementOutcome(null);
      setShowStockMore(false);
      setScannedItem({ ...item, barcode: scannedCode });
    } catch {
      setUnknownBarcode(scannedCode);
      setScanError("");
    }
  };

  const handleUseStock = async (requestedQty = useQty) => {
    if (!scannedItem) return;

    const qty = Number(requestedQty);

    if (!Number.isFinite(qty) || qty <= 0) {
      setUseError("Enter a valid quantity.");
      return;
    }

    if (qty > Number(scannedItem.current_stock || 0)) {
      setUseError("There is not enough stock available for that quantity.");
      return;
    }

    if (!can("inventory.write")) {
      setUseError("Your role cannot record stock use.");
      return;
    }

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setUseError("You are offline. Nothing was changed. Reconnect and scan again so the stock audit remains reliable.");
      return;
    }

    try {
      setUseBusy(true);
      setUseError("");

      const result = await applyStockMovement(scannedItem.id, {
        type: "use",
        qty,
        reason: "mobile_barcode_use",
        source: "mobile-barcode",
        movementKind: "consumption",
        barcode: scannedItem.barcode || "",
        spaceId: activeSenseSession?.senseObjectId || "",
        spaceName: activeSenseSession?.senseObjectName || "",
        destinationSpaceId: activeSenseSession?.senseObjectId || "",
        destinationSpaceName: activeSenseSession?.senseObjectName || "",
        senseSessionId: activeSenseSession?.id || "",
        actor: { uid: user?.uid, displayName, email: user?.email, role },
      });

      const completedItem = { ...scannedItem, current_stock: result.after };
      const receipt = {
        id: result.movementId,
        movementId: result.movementId,
        item: completedItem,
        qty,
        after: result.after,
        spaceName: activeSenseSession?.senseObjectName || scannedItem.location || "",
        status: "synced",
      };
      setRecentMovement(receipt);
      setScannedItem(null);
      setMovementOutcome(null);
      setUseQty(1);
      window.setTimeout(() => {
        setRecentMovement((current) => current?.movementId === result.movementId ? null : current);
      }, 10000);
    } catch (err) {
      console.error(err);
      setUseError(err?.message || "Stock use could not be recorded. Nothing was changed.");
    } finally {
      setUseBusy(false);
    }
  };

  const handleUndoStockUse = async () => {
    if (!recentMovement || recentMovement.status === "undone") return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setRecentMovement((current) => ({ ...current, error: "You are offline. The original movement remains unchanged." }));
      return;
    }

    try {
      setUndoBusy(true);
      const result = await reverseStockUseMovement(recentMovement.item.id, recentMovement.movementId, {
        source: "mobile-undo",
        barcode: recentMovement.item.barcode || "",
        spaceId: activeSenseSession?.senseObjectId || "",
        spaceName: activeSenseSession?.senseObjectName || recentMovement.spaceName || "",
        senseSessionId: activeSenseSession?.id || "",
        actor: { uid: user?.uid, displayName, email: user?.email, role },
      });
      setRecentMovement((current) => ({ ...current, status: "undone", after: result.after, error: "" }));
      window.setTimeout(() => setRecentMovement(null), 2200);
    } catch (err) {
      console.error(err);
      setRecentMovement((current) => ({ ...current, error: err?.message || "Undo failed. The original movement remains recorded." }));
    } finally {
      setUndoBusy(false);
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
        reason: "mobile_receive",
        source: "mobile-barcode",
        barcode: scannedItem.barcode || "",
        spaceId: activeSenseSession?.senseObjectId || "",
        spaceName: activeSenseSession?.senseObjectName || "",
        senseSessionId: activeSenseSession?.id || "",
        actor: { uid: user?.uid, displayName, email: user?.email, role },
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
    const item = reorderItem || scannedItem;
    if (!item) return;

    try {
      setReorderBusy(true);

      await createReorderRequest({
        ...item,
        requested_qty: Number(reorderQty || 1),
        note: reorderNote || "",
      });

      alert("Reorder request created");

      setShowReorderForm(false);
      setReorderItem(null);
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
    <div className="pvx-mobile-shell min-h-[100dvh] bg-[var(--medtrak-bg)] text-[var(--medtrak-text)] pb-[var(--pvx-mobile-content-bottom)]">
      <ActiveSenseBanner />
      <MobileDeveloperIssueRecorder />
      {showRoutedChecklist ? (
        <MobileClinicalAssetReconciliation kind={routedChecklistTab} onExit={() => navigate('/', { replace: true })} />
      ) : (
      <>
      {activeTab === "home" && <RoleAdaptiveMobileHome onAction={handleRoleAction} />}
      {activeTab === "connect" ? (
        <MobileConnect />
      ) : activeTab === "temperature" ? (
        <MobileConnect onBack={() => setActiveTab("home")} />
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
      </>
      )}

      {showReorderForm && (
        <div className="fixed inset-0 z-[80] flex items-end bg-black/45">
          <div className="w-full rounded-t-3xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-5 text-[var(--medtrak-text)]">
            <h2 className="text-xl font-bold text-[var(--medtrak-text)]">Reorder Request</h2>

            <p className="mt-1 text-[var(--medtrak-muted)]">
              {(reorderItem || scannedItem)?.name}
              {productSubtitle(reorderItem || scannedItem) ? ` • ${productSubtitle(reorderItem || scannedItem)}` : ""}
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
              onClick={() => { setShowReorderForm(false); setReorderItem(null); }}
              className="mt-3 w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] px-3 py-3 text-[var(--medtrak-text)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <MobileRapidStockAction
        item={scannedItem}
        activeSpace={activeSenseSession ? { id: activeSenseSession.senseObjectId, name: activeSenseSession.senseObjectName } : null}
        canWrite={can("inventory.write")}
        busy={useBusy}
        error={useError}
        outcome={movementOutcome}
        onUse={handleUseStock}
        onClose={() => { setScannedItem(null); setUseError(""); setMovementOutcome(null); }}
        onMore={() => setShowStockMore(true)}
      />

      {showStockMore && scannedItem && (
        <div className="fixed inset-x-0 top-0 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-[90] flex items-end bg-black/55">
          <div className="w-full rounded-t-3xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-4 text-[var(--medtrak-text)]">
            <h2 className="text-lg font-bold">More inventory options</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={handleReceiveStock} disabled={!can("inventory.write") || useBusy} className="rounded-2xl border border-[var(--medtrak-border)] p-3 font-bold disabled:opacity-40">Receive 1</button>
              <button type="button" onClick={() => { setReorderQty(1); setReorderNote(""); setShowStockMore(false); setShowReorderForm(true); }} className="flex items-center justify-center gap-2 rounded-2xl border border-[var(--medtrak-border)] p-3 font-bold"><BellRing className="h-5 w-5" />Reorder</button>
              <button type="button" onClick={() => { setShowStockMore(false); setScannedItem(null); setActiveTab("stock"); }} className="flex items-center justify-center gap-2 rounded-2xl border border-[var(--medtrak-border)] p-3 font-bold"><Eye className="h-5 w-5" />Details</button>
              <button type="button" onClick={() => { setShowStockMore(false); askAboutScannedItem(); }} className="flex items-center justify-center gap-2 rounded-2xl border border-[var(--medtrak-border)] p-3 font-bold"><Sparkles className="h-5 w-5" />Ask Orb</button>
            </div>
            <button type="button" onClick={() => setShowStockMore(false)} className="mt-3 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[var(--medtrak-muted)]">Back</button>
          </div>
        </div>
      )}

      {unknownBarcode && (
        <div className="fixed inset-x-0 top-0 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-[72] flex items-end bg-black/45">
          <div className="max-h-full w-full overflow-y-auto rounded-t-3xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-5 text-[var(--medtrak-text)] shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--medtrak-warning,#f59e0b)]">Barcode not recognised</p>
            <h2 className="mt-1 text-xl font-bold">No matching stock item</h2>
            <p className="mt-2 text-sm text-[var(--medtrak-muted)]">Barcode {unknownBarcode} is not linked to an active inventory item.</p>
            <div className="mt-5 grid gap-2">
              <button type="button" onClick={() => { setSearchTerm(unknownBarcode); setUnknownBarcode(""); setShowSearch(true); }} className="w-full rounded-xl bg-[var(--medtrak-accent)] px-4 py-3 font-semibold text-white">Search inventory</button>
              <button type="button" onClick={() => { setUnknownBarcode(""); navigate(`/inventory?add=1&barcode=${encodeURIComponent(unknownBarcode)}`); }} className="w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] px-4 py-3 font-semibold">Add new item</button>
              <button type="button" onClick={() => { const barcode = unknownBarcode; setUnknownBarcode(""); setEscalationSeed({ domain: "inventory", title: `Unknown barcode ${barcode}` }); }} className="w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] px-4 py-3 font-semibold">Report unknown item</button>
              <button type="button" disabled className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--medtrak-border)] px-4 py-3 font-semibold text-[var(--medtrak-muted)] opacity-75"><Camera className="h-5 w-5" />Photograph with Orb Vision · planned</button>
              <p className="text-xs text-[var(--medtrak-muted)]">Primovex will never create stock or change a count from an unknown barcode without your confirmation.</p>
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

      <MobileStockMovementReceipt
        receipt={recentMovement}
        busy={undoBusy}
        onUndo={handleUndoStockUse}
        onReorder={() => {
          setReorderItem(recentMovement?.item || null);
          setReorderQty(1);
          setReorderNote("Created after mobile stock use reached minimum level.");
          setRecentMovement(null);
          setShowReorderForm(true);
        }}
        onClose={() => setRecentMovement(null)}
      />

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
        onNavigate={handleBottomNavigation}
        onOpenAI={() => setShowAIActionSheet(true)}
      />
    </div>
    </MobileSessionShell>
  );
}




