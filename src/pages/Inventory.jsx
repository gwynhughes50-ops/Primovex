import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import MobileBarcodeScanner from "@/components/ui/MobileBarcodeScanner";
import PhotoCapture from "@/components/ui/PhotoCapture";

import StockMovementDialog from "@/components/stock/StockMovementDialog";
import StockHistoryDialog from "@/components/stock/StockHistoryDialog";
import ManualAddItemDialog from "@/components/stock/ManualAddItemDialog";
import StockItemEditDialog from "@/components/stock/StockItemEditDialog";

// NOTE: your project uses components/Inventory (capital I)
import EmergencyMonthlyChecklistTab from "@/components/Inventory/EmergencyMonthlyChecklistTab";
import AnaphylaxisBoxesTab from "@/components/Inventory/AnaphylaxisBoxesTab";

import useStock from "@/hooks/useStock";
import { unassignedQty } from "@/lib/stockLocations";
import useExpirySettings from "@/hooks/useExpirySettings";
import { stockLevelStatus } from "@/lib/stockAlerts";
import { describeBatches } from "@/lib/stockBatches";
import { purgeConfirmMatches, purgeConsequences } from "@/lib/stockPurge";
import { useAuth } from "@/contexts/AuthContext";
import { loadSpaceRegistry } from "@/modules/sense/services/sharedSpaceRegistry";
import { listEquipment } from "@/modules/equipment/services/equipmentRegistry";
import AssignLocationModal from "@/components/stock/AssignLocationModal";
import { STOCK_CATEGORIES, getSubcategories, categoryLabel, subcategoryLabel } from "@/data/stockCategories";
import { normalizeStockItemCategory, migrateStockItemCategoryIfNeeded, createReorderRequest, getExpiryStatus, daysUntilExpiry } from "@/services/stockService";
import { uploadStockItemPhoto, removeStockItemPhoto, deleteStockPhotoFile } from "@/services/stockPhotoService";

import { Search, Package, Pencil, History, Archive, Trash2, RotateCcw, MapPin, BellRing, ImageOff } from "lucide-react";

/* helpers */
// Same rule as the Alerts page, the phone and the pop-up (src/lib/stockAlerts.js).
const getStockBadge = (qty, min) =>
  stockLevelStatus({ current_stock: qty, min_stock: min })
    ? "mt-stock-badge mt-stock-badge-low"
    : "mt-stock-badge mt-stock-badge-ok";

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "px-3 py-2 rounded-xl text-sm border transition",
        active ? "mt-tab-active" : "mt-tab",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

// Robust archived detector (handles null/undefined/"")
function isArchivedItem(it) {
  const v = it?.archived_at;
  return v !== null && v !== undefined && v !== "";
}

function productSubtitle(item) {
  return [item?.strength, item?.form].filter(Boolean).join(" • ");
}

export default function Inventory() {
  const location = useLocation();
  const initialBarcode = new URLSearchParams(location.search).get("barcode") || "";
  /* auth — Firestore-backed profile and capability source */
  const { user, profile, can, loading: authLoading } = useAuth();

  const actorUser = {
    uid: user?.uid || profile?.uid || null,
    displayName:
      profile?.displayName ||
      user?.displayName ||
      profile?.email ||
      user?.email ||
      "Unknown",
    email: profile?.email || user?.email || null,
  };

  const canWriteInventory = !authLoading && can("inventory.write");
  const canDeleteInventory = !authLoading && can("inventory.delete");
  // Permanent delete is a separate permission from archiving - only logins whose role has it see the button.
  const canPurgeInventory = !authLoading && can("inventory.purge");

  /* tabs */
  const [tab, setTab] = useState("stock"); // "stock" | "emergency" | "anaphylaxis"

  /* stock state */
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryTab, setCategoryTab] = useState("all");
  const [subcategoryFilter, setSubcategoryFilter] = useState("all");

  const [moveOpen, setMoveOpen] = useState(false);
  const [moveMode, setMoveMode] = useState("use");
  const [activeItem, setActiveItem] = useState(null);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItem, setHistoryItem] = useState(null);

  const [manualAddOpen, setManualAddOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (['stock', 'emergency', 'anaphylaxis'].includes(params.get('tab'))) setTab(params.get('tab'));
    // A message can open the list already searched for one item (?find=Tongue%20depressors)
    if (params.get("find")) setSearch(params.get("find"));
    if (params.get("add") === "1") {
      setManualAddOpen(true);
      const barcode = params.get("barcode");
      if (barcode) window.dispatchEvent(new CustomEvent("primovex:prefill-new-stock", { detail: { barcode } }));
    }
  }, [location.search]);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteItem, setDeleteItem] = useState(null);

  // the item being edited (the window is components/stock/StockItemEditDialog.jsx)
  const [editItem, setEditItem] = useState(null);

  /**
   * IMPORTANT:
   * We always subscribe to ALL (active + archived) and filter client-side,
   * so the toggle cannot get “stuck” due to a listener not re-subscribing.
   */
  // The practice's "expiring soon" windows (Alerts page settings); changing them re-renders the cards.
  const expirySettings = useExpirySettings();
  const { items, loading, error, archiveItem, restoreItem, receiveStock, useStockQty, addItem, updateItem, transferStock, unassignLocation, purgeItem } =
    useStock({ includeArchived: true });


  // Photos whose image failed to load show the placeholder instead of a broken-image icon.
  const [brokenPhotos, setBrokenPhotos] = useState({});
  const [locationsOpen, setLocationsOpen] = useState(false);
  const [locationsItem, setLocationsItem] = useState(null);
  const openLocations = (item) => {
    setLocationsItem(item);
    setLocationsOpen(true);
  };

  const [photoBusyId, setPhotoBusyId] = useState(null);
  const [photoError, setPhotoError] = useState({});

  async function handlePhotoCapture(item, dataUrl) {
    setPhotoBusyId(item.id);
    setPhotoError((prev) => ({ ...prev, [item.id]: "" }));
    try {
      await uploadStockItemPhoto(item, dataUrl);
    } catch (error) {
      console.error(error);
      setPhotoError((prev) => ({ ...prev, [item.id]: error?.message || "Could not save the photo. Try again." }));
    } finally {
      setPhotoBusyId(null);
    }
  }

  async function handleRemovePhoto(item) {
    setPhotoBusyId(item.id);
    setPhotoError((prev) => ({ ...prev, [item.id]: "" }));
    try {
      await removeStockItemPhoto(item);
    } catch (error) {
      console.error(error);
      setPhotoError((prev) => ({ ...prev, [item.id]: error?.message || "Could not remove the photo." }));
    } finally {
      setPhotoBusyId(null);
    }
  }

  const [reorderOpen, setReorderOpen] = useState(false);
  const [reorderItem, setReorderItem] = useState(null);
  const [reorderQty, setReorderQty] = useState(1);
  const [reorderNote, setReorderNote] = useState("");
  const [reorderBusy, setReorderBusy] = useState(false);
  const [reorderError, setReorderError] = useState("");
  const openReorder = (item) => {
    setReorderItem(item);
    setReorderQty(Math.max(1, Number(item?.order_quantity || 1)));
    setReorderNote("");
    setReorderError("");
    setReorderOpen(true);
  };
  const confirmReorder = async () => {
    if (!reorderItem) return;
    try {
      setReorderBusy(true);
      setReorderError("");
      await createReorderRequest(
        { ...reorderItem, requested_qty: Number(reorderQty || 1), note: reorderNote },
        actorUser
      );
      setReorderOpen(false);
      setReorderItem(null);
    } catch (err) {
      setReorderError(err?.message || "Failed to create reorder request.");
    } finally {
      setReorderBusy(false);
    }
  };

  /* Self-healing category migration: items created before the fixed
     taxonomy shipped (free text, or the old 6-value enum) get resolved to
     it on every read already (see normalizeStockItemCategory), but this
     also persists that resolved value once so it stops depending on the
     legacy-mapping guesswork on every future read/filter. Runs at most once
     per item per session (attemptedRef guards against re-firing while the
     write is still in flight) and only for staff who can actually write
     inventory. */
  const categoryMigrationAttemptedRef = useRef(new Set());
  useEffect(() => {
    if (!canWriteInventory) return;
    (items || []).forEach((item) => {
      if (!item?.id || categoryMigrationAttemptedRef.current.has(item.id)) return;
      categoryMigrationAttemptedRef.current.add(item.id);
      migrateStockItemCategoryIfNeeded(item).catch((err) => {
        console.error("Stock category migration failed for", item.id, err);
      });
    });
  }, [items, canWriteInventory]);

  const counts = useMemo(() => {
    const total = Array.isArray(items) ? items.length : 0;
    let archived = 0;
    let active = 0;
    (items || []).forEach((it) => {
      if (isArchivedItem(it)) archived += 1;
      else active += 1;
    });
    return { total, active, archived };
  }, [items]);

  /* category tabs reset the subcategory filter so it can't get stuck pointing
     at a subcategory that doesn't exist under the newly selected category */
  const selectCategoryTab = (id) => {
    setCategoryTab(id);
    setSubcategoryFilter("all");
  };

  const categoryCounts = useMemo(() => {
    const rows = Array.isArray(items) ? items : [];
    const base = showArchived ? rows : rows.filter((it) => !isArchivedItem(it));
    const counts = {};
    base.forEach((it) => {
      const resolved = normalizeStockItemCategory(it);
      counts[resolved.category] = (counts[resolved.category] || 0) + 1;
    });
    return counts;
  }, [items, showArchived]);

  const subcategoryCounts = useMemo(() => {
    if (categoryTab === "all") return {};
    const rows = Array.isArray(items) ? items : [];
    const base = showArchived ? rows : rows.filter((it) => !isArchivedItem(it));
    const counts = {};
    base.forEach((it) => {
      const resolved = normalizeStockItemCategory(it);
      if (resolved.category !== categoryTab) return;
      counts[resolved.subcategory] = (counts[resolved.subcategory] || 0) + 1;
    });
    return counts;
  }, [items, showArchived, categoryTab]);

  /* derived */
  const filtered = useMemo(() => {
    const rows = Array.isArray(items) ? items : [];
    let base = showArchived ? rows : rows.filter((it) => !isArchivedItem(it));

    if (categoryTab !== "all") {
      base = base.filter((it) => normalizeStockItemCategory(it).category === categoryTab);
    }
    if (subcategoryFilter !== "all") {
      base = base.filter((it) => normalizeStockItemCategory(it).subcategory === subcategoryFilter);
    }

    const q = search.trim().toLowerCase();
    if (!q) return base;

    return base.filter((it) => {
      const resolved = normalizeStockItemCategory(it);
      const name = String(it?.name || "").toLowerCase();
      const barcode = String(it?.barcode || "").toLowerCase();
      const strength = String(it?.strength || "").toLowerCase();
      const form = String(it?.form || "").toLowerCase();
      const productKey = String(it?.product_identity_key || "").toLowerCase();
      const site = String(it?.site || "").toLowerCase();
      const location = String(it?.location || "").toLowerCase();
      const category = String(it?.category || "").toLowerCase();
      const categoryLabelText = categoryLabel(resolved.category).toLowerCase();
      const subcategoryLabelText = subcategoryLabel(resolved.category, resolved.subcategory).toLowerCase();

      return (
        name.includes(q) ||
        barcode.includes(q) ||
        strength.includes(q) ||
        form.includes(q) ||
        productKey.includes(q) ||
        site.includes(q) ||
        location.includes(q) ||
        category.includes(q) ||
        categoryLabelText.includes(q) ||
        subcategoryLabelText.includes(q)
      );
    });
  }, [items, search, showArchived, categoryTab, subcategoryFilter]);
const handleBarcodeScan = (code) => {
  const scannedCode = String(code || "").trim();

  if (!scannedCode) return;

  console.log("Scanned barcode:", scannedCode);

  setSearch(scannedCode);

  const match = (items || []).find(
    (item) => String(item?.barcode || "").trim() === scannedCode
  );

  if (match && !isArchivedItem(match)) {
    console.log("Matched item:", match);

    setActiveItem(match);
    setMoveMode("use");
    setMoveOpen(true);
  } else {
    console.log("No matching active item found");
  }
};
  /* handlers */
  const openDelete = (item) => {
    if (!canDeleteInventory) return;
    setDeleteItem(item);
    setDeleteOpen(true);
  };

  // Permanent delete: typed-name confirmation, then the record, its barcode
  // entry and its photo file go. Rules enforce inventory.purge as well, so the
  // button being hidden is a convenience, not the protection.
  const [purgeTarget, setPurgeTarget] = useState(null);
  const [purgeText, setPurgeText] = useState("");
  const [purgeBusy, setPurgeBusy] = useState(false);
  const [purgeError, setPurgeError] = useState("");

  const openPurge = (item) => {
    if (!canPurgeInventory) return;
    setPurgeTarget(item);
    setPurgeText("");
    setPurgeError("");
  };

  const closePurge = () => {
    if (purgeBusy) return;
    setPurgeTarget(null);
    setPurgeText("");
    setPurgeError("");
  };

  const confirmPurge = async () => {
    if (!purgeTarget || !purgeConfirmMatches(purgeText, purgeTarget.name)) return;
    setPurgeBusy(true);
    setPurgeError("");
    try {
      const removed = await purgeItem(purgeTarget.id);
      await deleteStockPhotoFile(removed?.photo_path || purgeTarget.photo_path);
      setPurgeTarget(null);
      setPurgeText("");
    } catch (err) {
      console.error("Permanent delete failed:", err);
      setPurgeError(err?.code === "permission-denied"
        ? "Your login doesn't have permission to permanently delete stock items."
        : err?.message || "Could not delete this item. Nothing has been changed.");
    } finally {
      setPurgeBusy(false);
    }
  };

  // Receiving a delivery from the Add item dialog: pick a remembered product,
  // say how many / the batch / the expiry. An archived item is brought back first.
  const receiveDelivery = async (item, details) => {
    if (!canWriteInventory) throw new Error("Your login can't receive stock.");
    if (item.archived_at) await restoreItem(item.id, actorUser);
    await receiveStock(item.id, details.qty, {
      actor: actorUser,
      reason: "delivery",
      batch_number: details.batch_number,
      expiry_date: details.expiry_date,
      barcode: details.barcode,
      supplier_id: item.preferred_supplier_id || "",
      supplier_name: item.preferred_supplier_name || "",
    });
  };

  const confirmDelete = async () => {
    if (!deleteItem) return;
    await archiveItem(deleteItem.id, actorUser);
    setDeleteOpen(false);
    setDeleteItem(null);
  };

  const openUse = (item) => {
    setActiveItem(item);
    setMoveMode("use");
    setMoveOpen(true);
  };

  const openReceive = (item) => {
    setActiveItem(item);
    setMoveMode("receive");
    setMoveOpen(true);
  };

  const openHistory = (item) => {
    setHistoryItem(item);
    setHistoryOpen(true);
  };

  const openEdit = (item) => {
    if (!canWriteInventory) return;
    setEditItem(item);
  };

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        <TabButton active={tab === "stock"} onClick={() => setTab("stock")}>
          Stock
        </TabButton>
        <TabButton active={tab === "emergency"} onClick={() => setTab("emergency")}>
          Emergency Drugs & Equipment (Monthly)
        </TabButton>
        <TabButton active={tab === "anaphylaxis"} onClick={() => setTab("anaphylaxis")}>
          Anaphylaxis Emergency Boxes
        </TabButton>
      </div>

      {/* STOCK TAB */}
      {tab === "stock" && (
        <>
          <div className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur p-3 rounded-2xl border border-slate-800/60">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search inventory... (name, barcode, site, room)"
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <Button
                variant="ghost"
                onClick={() => setShowArchived((v) => !v)}
                title="Toggle archived visibility"
              >
                {showArchived ? "Hide archived" : "Show archived"}
              </Button>

              <Button onClick={() => setManualAddOpen(true)} disabled={!canWriteInventory}>Add item</Button>

              <MobileBarcodeScanner onScan={handleBarcodeScan} />
            </div>

            <div className="mt-2 text-[11px] text-slate-400 flex flex-wrap gap-2">
              <span className="rounded-full border border-slate-800/70 bg-slate-900/40 px-2 py-0.5">
                {counts.active} active{counts.archived ? ` · ${counts.archived} archived` : ""}
              </span>
              {filtered.length !== counts.total && (
                <span className="rounded-full border border-slate-800/70 bg-slate-900/40 px-2 py-0.5">
                  Showing {filtered.length}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => selectCategoryTab("all")}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                categoryTab === "all" ? "border-teal-400/50 bg-teal-500/15 text-teal-100" : "border-slate-800 bg-slate-900/60 text-slate-300"
              }`}
            >
              All categories ({Object.values(categoryCounts).reduce((sum, n) => sum + n, 0)})
            </button>
            {STOCK_CATEGORIES.filter((cat) => categoryCounts[cat.id]).map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => selectCategoryTab(cat.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                  categoryTab === cat.id ? "border-teal-400/50 bg-teal-500/15 text-teal-100" : "border-slate-800 bg-slate-900/60 text-slate-300"
                }`}
              >
                {cat.icon} {cat.label} ({categoryCounts[cat.id]})
              </button>
            ))}
          </div>

          {categoryTab !== "all" && Object.keys(subcategoryCounts).length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSubcategoryFilter("all")}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition ${
                  subcategoryFilter === "all" ? "border-teal-400/40 bg-teal-500/10 text-teal-100" : "border-slate-800/70 bg-slate-900/40 text-slate-400"
                }`}
              >
                All subcategories
              </button>
              {getSubcategories(categoryTab).filter((sub) => subcategoryCounts[sub.id]).map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => setSubcategoryFilter(sub.id)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition ${
                    subcategoryFilter === sub.id ? "border-teal-400/40 bg-teal-500/10 text-teal-100" : "border-slate-800/70 bg-slate-900/40 text-slate-400"
                  }`}
                >
                  {sub.label} ({subcategoryCounts[sub.id]})
                </button>
              ))}
            </div>
          )}

          {loading && <p className="text-slate-400">Loading inventory...</p>}
          {error && <p className="text-rose-400">{String(error)}</p>}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((item) => {
              const archived = isArchivedItem(item);

              return (
                <Card
                  key={item.id}
                  className={`p-4 rounded-2xl border ${
                    archived ? "bg-slate-900/40 text-slate-400" : "bg-slate-900/90 text-slate-100"
                  }`}
                >
                  <div className="flex justify-between gap-3">
                    {item.photo_url && !brokenPhotos[item.photo_url] ? (
                      <img
                        src={item.photo_url}
                        alt=""
                        onError={() => setBrokenPhotos((prev) => ({ ...prev, [item.photo_url]: true }))}
                        className="h-14 w-14 shrink-0 rounded-xl border border-slate-700 object-cover"
                      />
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-700 text-slate-600">
                        <ImageOff className="h-5 w-5" />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate">{item.name}</p>

                      {productSubtitle(item) && (
                        <p className="text-xs text-teal-200 truncate">{productSubtitle(item)}</p>
                      )}

                      {item.barcode && <p className="text-xs text-slate-400 truncate">Barcode: {item.barcode}</p>}

                      {(item.site || item.location) && (
                        <p className="mt-1 text-xs text-slate-300 flex items-center gap-1 truncate">
                          <Package className="h-3 w-3 opacity-70" />
                          <span className="truncate">
                            {item.site || "-"}
                            {item.location ? ` - ${item.location}` : ""}
                          </span>
                        </p>
                      )}

                      {Array.isArray(item.locations) && item.locations.length > 0 && (
                        <p className="mt-1 text-[11px] text-teal-200/90">
                          In store {unassignedQty(item)}
                          {item.locations.map((loc) => ` · ${loc.locationName} ${loc.quantity}`).join("")}
                        </p>
                      )}

                      <p className="mt-1 text-[11px] text-slate-400 truncate">
                        {(() => {
                          const resolved = normalizeStockItemCategory(item);
                          const label = subcategoryLabel(resolved.category, resolved.subcategory) || categoryLabel(resolved.category);
                          return `${categoryLabel(resolved.category)}${label && label !== categoryLabel(resolved.category) ? ` › ${label}` : ""}`;
                        })()}
                        {item.min_stock !== undefined ? ` - Min: ${item.min_stock}` : ""}
                        {Number(item.units_per_box) > 0 ? ` - Box: ${item.units_per_box}` : ""}
                      </p>

                      {item.preferred_supplier_name && (
                        <p className="mt-1 text-[11px] text-cyan-300 truncate">
                          Supplier: {item.preferred_supplier_name}
                          {item.supplier_sku ? ` - SKU: ${item.supplier_sku}` : ""}
                        </p>
                      )}

                      {(() => {
                        const batches = describeBatches(item);
                        if (batches.length < 2) return null;
                        return (
                          <p className="mt-1 text-[11px] text-slate-400" title={batches.map((b) => b.label).join("\n")}>
                            {batches.length} batches:{" "}
                            {batches.map((b) => `${b.batch_number || "no batch no."}${b.expiry_date ? ` (exp ${b.expiry_date.split("-").reverse().join("/")})` : ""} ×${b.quantity}`).join(" · ")}
                          </p>
                        );
                      })()}

                      {item.expiry_date && (() => {
                        const status = getExpiryStatus(item, new Date(), expirySettings);
                        const days = daysUntilExpiry(item);
                        return (
                          <p className={`mt-1 text-[11px] font-semibold truncate ${status === "expired" ? "text-rose-400" : status === "soon" ? "text-amber-300" : "text-slate-500"}`}>
                            {status === "expired"
                              ? `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`
                              : status === "soon"
                                ? `Expires in ${days} day${days === 1 ? "" : "s"} (${item.expiry_date})`
                                : `Expires ${item.expiry_date}`}
                          </p>
                        );
                      })()}
                    </div>

                    <span
                      className={`shrink-0 inline-flex min-h-7 min-w-8 items-center justify-center rounded-full border px-2 py-1 text-xs font-bold leading-none ${getStockBadge(
                        item.current_stock,
                        item.min_stock
                      )}`}
                      title={`Current stock: ${item.current_stock}`}
                    >
                      {item.current_stock}
                    </span>
                  </div>

                  {!archived && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button variant="outline" onClick={() => openUse(item)} disabled={!canWriteInventory}>
                        - Use
                      </Button>
                      <Button onClick={() => openReceive(item)} disabled={!canWriteInventory}>
                        + Receive
                      </Button>
                    </div>
                  )}

                  {!archived && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        onClick={() => openLocations(item)}
                        disabled={!canWriteInventory}
                      >
                        <MapPin className="mr-2 h-4 w-4" />
                        Locations{Array.isArray(item.locations) && item.locations.length > 0 ? ` (${item.locations.length})` : ""}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => openReorder(item)}
                        disabled={!canWriteInventory}
                      >
                        <BellRing className="mr-2 h-4 w-4" />
                        Reorder
                      </Button>
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <PhotoCapture
                        buttonLabel={item.photo_url ? "Replace" : "Photo"}
                        onCapture={(img) => handlePhotoCapture(item, img)}
                        disabled={!canWriteInventory || photoBusyId === item.id}
                      />
                      {item.photo_url && (
                        <Button
                          variant="ghost"
                          className="text-xs px-3 py-2 text-rose-300 hover:text-rose-200"
                          onClick={() => handleRemovePhoto(item)}
                          disabled={!canWriteInventory || photoBusyId === item.id}
                        >
                          Remove
                        </Button>
                      )}
                      {photoBusyId === item.id && <span className="text-xs text-slate-400">Saving…</span>}
                    </div>

                    <div className="ml-auto flex shrink-0 gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openHistory(item)} title="History">
                        <History className="h-4 w-4" />
                      </Button>

                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEdit(item)}
                        disabled={!canWriteInventory}
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>

                      {!archived ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openDelete(item)}
                          disabled={!canDeleteInventory}
                          title="Archive (asks first)"
                        >
                          <Archive className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => restoreItem(item.id, actorUser)}
                          title="Restore"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}

                      {canPurgeInventory && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-rose-400 hover:text-rose-300"
                          onClick={() => openPurge(item)}
                          title="Delete permanently"
                          aria-label={`Delete ${item.name} permanently`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {photoError[item.id] && <p className="mt-2 text-xs text-rose-400">{photoError[item.id]}</p>}

                  {archived && <div className="mt-3 text-xs text-slate-500">Archived</div>}
                </Card>
              );
            })}
          </div>

          <StockMovementDialog
            open={moveOpen}
            onOpenChange={setMoveOpen}
            item={activeItem}
            mode={moveMode}
            onConfirm={async ({ qty, reason, notes, brand, barcode, batch_number, expiry_date }) => {
              if (!activeItem) return;
              if (moveMode === "receive") {
                await receiveStock(activeItem.id, qty, {
                  actor: actorUser,
                  reason,
                  notes,
                  brand,
                  barcode,
                  batch_number,
                  expiry_date,
                  supplier_id: activeItem?.preferred_supplier_id || "",
                  supplier_name: activeItem?.preferred_supplier_name || "",
                });
              } else {
                await useStockQty(activeItem.id, qty, { actor: actorUser, reason, notes });
              }
            }}
          />

          <StockHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} item={historyItem} />
          <ManualAddItemDialog open={manualAddOpen} onOpenChange={setManualAddOpen} onCreate={addItem} onReceive={receiveDelivery} items={items || []} initialBarcode={initialBarcode} existingForms={existingForms} />

          <AssignLocationModal
            open={locationsOpen}
            onOpenChange={setLocationsOpen}
            item={(items || []).find((i) => i.id === locationsItem?.id) || locationsItem}
            onTransfer={(move) => transferStock(locationsItem.id, move, { actor: actorUser })}
            onUnassign={(locationId, quantity) => unassignLocation(locationsItem.id, locationId, quantity, { actor: actorUser })}
          />

          <>
            {editItem && <StockItemEditDialog item={editItem} items={items || []} onClose={() => setEditItem(null)} />}

            {reorderOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                <div className="bg-slate-900 p-4 rounded-2xl max-w-sm w-full border border-slate-800">
                  <p className="font-semibold text-slate-50">Request reorder</p>
                  <p className="text-sm text-slate-400 mt-1">
                    Raise a reorder request for <strong>{reorderItem?.name}</strong>.
                  </p>

                  <div className="mt-3 space-y-3">
                    <div>
                      <label className="text-xs text-slate-400">Quantity</label>
                      <Input
                        type="number"
                        min={1}
                        value={reorderQty}
                        onChange={(e) => setReorderQty(e.target.value)}
                        className="mt-1 bg-slate-950/40 border-slate-800/70 text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400">Note (optional)</label>
                      <Input
                        value={reorderNote}
                        onChange={(e) => setReorderNote(e.target.value)}
                        placeholder="e.g. urgent, low ahead of clinic"
                        className="mt-1 bg-slate-950/40 border-slate-800/70 text-slate-100"
                      />
                    </div>
                  </div>

                  {reorderError && (
                    <div className="mt-3 rounded-xl border border-rose-500/25 bg-rose-500/10 p-2 text-xs text-rose-100">
                      {reorderError}
                    </div>
                  )}

                  <div className="mt-4 flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setReorderOpen(false);
                        setReorderItem(null);
                      }}
                      disabled={reorderBusy}
                    >
                      Cancel
                    </Button>
                    <Button onClick={confirmReorder} disabled={reorderBusy || !Number(reorderQty) || Number(reorderQty) <= 0}>
                      {reorderBusy ? "Requesting..." : "Request reorder"}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {deleteOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                <div className="bg-slate-900 p-4 rounded-2xl max-w-sm w-full border border-slate-800">
                  <p className="font-semibold text-rose-300">Archive item?</p>
                  <p className="text-sm text-slate-400 mt-1">
                    You are about to archive <strong>{deleteItem?.name}</strong>.
                  </p>

                  <div className="mt-4 flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setDeleteOpen(false);
                        setDeleteItem(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button className="bg-rose-500" onClick={confirmDelete}>
                      Yes, archive
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {purgeTarget && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Delete item permanently">
                <div className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-rose-500/40 bg-slate-900 p-4">
                  <p className="font-semibold text-rose-300">Delete permanently?</p>
                  <p className="mt-1 text-sm text-slate-300">
                    You are about to permanently delete <strong>{purgeTarget.name}</strong>. This cannot be undone.
                  </p>
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-400">
                    {purgeConsequences(purgeTarget).map((line) => <li key={line}>{line}</li>)}
                  </ul>

                  <label className="mt-4 block text-xs text-slate-400">
                    Type the item's name to confirm
                    <Input
                      className="mt-1"
                      value={purgeText}
                      onChange={(e) => setPurgeText(e.target.value)}
                      placeholder={purgeTarget.name}
                      autoFocus
                      disabled={purgeBusy}
                    />
                  </label>

                  {purgeError && <p className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-200">{purgeError}</p>}

                  <div className="mt-4 flex justify-end gap-2">
                    <Button variant="outline" onClick={closePurge} disabled={purgeBusy}>Cancel</Button>
                    <Button
                      className="bg-rose-600 text-white hover:bg-rose-500"
                      onClick={confirmPurge}
                      disabled={purgeBusy || !purgeConfirmMatches(purgeText, purgeTarget.name)}
                    >
                      {purgeBusy ? "Deleting…" : "Delete permanently"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </>
        </>
      )}

      {/* EMERGENCY TAB */}
      {tab === "emergency" && (
        <div className="bg-slate-950/50 border border-slate-800/60 rounded-2xl p-3 sm:p-4">
          <EmergencyMonthlyChecklistTab />
        </div>
      )}

      {/* ANAPHYLAXIS TAB */}
      {tab === "anaphylaxis" && (
        <div className="bg-slate-950/50 border border-slate-800/60 rounded-2xl p-3 sm:p-4">
          <AnaphylaxisBoxesTab />
        </div>
      )}
    </div>
  );
}
