import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import MobileBarcodeScanner from "@/components/ui/MobileBarcodeScanner";
import PhotoCapture from "@/components/ui/PhotoCapture";

import StockMovementDialog from "@/components/stock/StockMovementDialog";
import StockHistoryDialog from "@/components/stock/StockHistoryDialog";
import ManualAddItemDialog from "@/components/stock/ManualAddItemDialog";

// NOTE: your project uses components/Inventory (capital I)
import EmergencyMonthlyChecklistTab from "@/components/Inventory/EmergencyMonthlyChecklistTab";
import AnaphylaxisBoxesTab from "@/components/Inventory/AnaphylaxisBoxesTab";

import useStock from "@/hooks/useStock";
import { getRole, canArchive, canEdit, canMoveStock } from "@/auth/permissions";
import { auth, db } from "@/lib/firebase";
import { collection, onSnapshot, query } from "firebase/firestore";

import { Search, Package, Pencil, History, Trash2, Archive, RotateCcw } from "lucide-react";

/* helpers */
const getStockBadge = (qty, min) => {
  const q = Number(qty ?? 0);
  const m = Number(min ?? 0);
  return q <= m ? "bg-rose-500/20 text-rose-300" : "bg-emerald-500/20 text-emerald-300";
};

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "px-3 py-2 rounded-xl text-sm border transition",
        active
          ? "bg-teal-600/20 border-teal-500/60 text-teal-100"
          : "bg-slate-900/30 border-slate-800 text-slate-200 hover:bg-slate-900/50",
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
  /* auth */
  const user = auth.currentUser ?? null;

  const actorUser = {
    uid: user?.uid || null,
    displayName: user?.displayName || user?.name || "Unknown",
    email: user?.email || null,
  };

  let role = "staff";
  try {
    role = getRole(user) || "staff";
  } catch {
    role = "staff";
  }

  /* tabs */
  const [tab, setTab] = useState("stock"); // "stock" | "emergency" | "anaphylaxis"

  /* stock state */
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");

  const [moveOpen, setMoveOpen] = useState(false);
  const [moveMode, setMoveMode] = useState("use");
  const [activeItem, setActiveItem] = useState(null);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItem, setHistoryItem] = useState(null);

  const [manualAddOpen, setManualAddOpen] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteItem, setDeleteItem] = useState(null);

  // edit modal state
  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [editForm, setEditForm] = useState({
    name: "",
    strength: "",
    form: "",
    brand: "",
    barcode: "",
    site: "",
    location: "",
    category: "",
    min_stock: 0,
    preferred_supplier_id: "",
    preferred_supplier_name: "",
    supplier_sku: "",
    order_quantity: 1,
    lead_time_days: 0,
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [suppliers, setSuppliers] = useState([]);

  /**
   * IMPORTANT:
   * We always subscribe to ALL (active + archived) and filter client-side,
   * so the toggle cannot get “stuck” due to a listener not re-subscribing.
   */
  const { items, loading, error, archiveItem, restoreItem, receiveStock, useStockQty, addItem, updateItem } =
    useStock({ includeArchived: true });

  useEffect(() => {
    const qSuppliers = query(collection(db, "suppliers"));

    const unsub = onSnapshot(
      qSuppliers,
      (snap) => {
        const rows = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        setSuppliers(rows.filter((supplier) => supplier.active !== false));
      },
      (err) => {
        console.error("Supplier subscription failed:", err);
        setSuppliers([]);
      }
    );

    return () => unsub();
  }, []);

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

  /* derived */
  const filtered = useMemo(() => {
    const rows = Array.isArray(items) ? items : [];
    const base = showArchived ? rows : rows.filter((it) => !isArchivedItem(it));

    const q = search.trim().toLowerCase();
    if (!q) return base;

    return base.filter((it) => {
      const name = String(it?.name || "").toLowerCase();
      const barcode = String(it?.barcode || "").toLowerCase();
      const strength = String(it?.strength || "").toLowerCase();
      const form = String(it?.form || "").toLowerCase();
      const productKey = String(it?.product_identity_key || "").toLowerCase();
      const site = String(it?.site || "").toLowerCase();
      const location = String(it?.location || "").toLowerCase();
      const category = String(it?.category || "").toLowerCase();

      return (
        name.includes(q) ||
        barcode.includes(q) ||
        strength.includes(q) ||
        form.includes(q) ||
        productKey.includes(q) ||
        site.includes(q) ||
        location.includes(q) ||
        category.includes(q)
      );
    });
  }, [items, search, showArchived]);
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
    if (!canArchive(role)) return;
    setDeleteItem(item);
    setDeleteOpen(true);
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
    if (!canEdit(role)) return;
    setEditItem(item);
    setEditForm({
      name: item?.name ?? "",
      strength: item?.strength ?? "",
      form: item?.form ?? "",
      brand: item?.brand ?? "",
      barcode: item?.barcode ?? "",
      site: item?.site ?? "",
      location: item?.location ?? "",
      category: item?.category ?? "",
      min_stock: typeof item?.min_stock === "number" ? item.min_stock : Number(item?.min_stock ?? 0) || 0,
      preferred_supplier_id: item?.preferred_supplier_id ?? "",
      preferred_supplier_name: item?.preferred_supplier_name ?? "",
      supplier_sku: item?.supplier_sku ?? "",
      order_quantity: typeof item?.order_quantity === "number" ? item.order_quantity : Number(item?.order_quantity ?? 1) || 1,
      lead_time_days: typeof item?.lead_time_days === "number" ? item.lead_time_days : Number(item?.lead_time_days ?? 0) || 0,
    });
    setEditError("");
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!editItem) return;

    setEditError("");
    setEditSaving(true);

    try {
      const name = (editForm.name || "").trim();
      const strength = (editForm.strength || "").trim();
      const form = (editForm.form || "").trim();
      const site = (editForm.site || "").trim();
      const location = (editForm.location || "").trim();

      if (!name) {
        setEditError("Item name cannot be empty.");
        return;
      }

      if (!site || site.toLowerCase() === "both sites") {
        setEditError('Please enter a valid building name in Site (not "Both sites").');
        return;
      }

      if (!location) {
        setEditError("Location is required (room/cupboard).");
        return;
      }

      const payload = {
        name,
        strength,
        form,
        brand: (editForm.brand || "").trim(),
        barcode: (editForm.barcode || "").trim(),
        site,
        location,
        category: (editForm.category || "").trim(),
        min_stock: Number(editForm.min_stock) || 0,
        preferred_supplier_id: editForm.preferred_supplier_id || "",
        preferred_supplier_name: editForm.preferred_supplier_name || "",
        supplier_sku: (editForm.supplier_sku || "").trim(),
        order_quantity: Number(editForm.order_quantity) || 1,
        lead_time_days: Number(editForm.lead_time_days) || 0,
      };

      await updateItem(editItem.id, payload, { actor: actorUser });

      setEditOpen(false);
      setEditItem(null);
    } catch (err) {
      console.error("Edit save failed:", err);
      setEditError(err?.message || String(err));
    } finally {
      setEditSaving(false);
    }
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

              <Button onClick={() => setManualAddOpen(true)}>Add item</Button>

              <MobileBarcodeScanner onScan={handleBarcodeScan} />
            </div>

            {/* Debug / status line (helps confirm toggle is actually switching) */}
            <div className="mt-2 text-[11px] text-slate-400 flex flex-wrap gap-2">
              <span className="rounded-full border border-slate-800/70 bg-slate-900/40 px-2 py-0.5">
                Mode: {showArchived ? "Showing archived" : "Hiding archived"}
              </span>
              <span className="rounded-full border border-slate-800/70 bg-slate-900/40 px-2 py-0.5">
                Total: {counts.total}
              </span>
              <span className="rounded-full border border-slate-800/70 bg-slate-900/40 px-2 py-0.5">
                Active: {counts.active}
              </span>
              <span className="rounded-full border border-slate-800/70 bg-slate-900/40 px-2 py-0.5">
                Archived: {counts.archived}
              </span>
              <span className="rounded-full border border-slate-800/70 bg-slate-900/40 px-2 py-0.5">
                Showing: {filtered.length}
              </span>
            </div>
          </div>

          {loading && <p className="text-slate-400">Loading inventory...</p>}
          {error && <p className="text-rose-400">{String(error)}</p>}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((item) => {
              const archived = isArchivedItem(item);
              const handleBarcodeScan = (code) => {
                const scannedCode = String(code || "").trim();
                if (!scannedCode) return;
              
                setSearch(scannedCode);
              
                const match = (items || []).find(
                  (it) => String(it?.barcode || "").trim() === scannedCode
                );
              
                if (match && !isArchivedItem(match)) {
                  setActiveItem(match);
                  setMoveMode("use");
                  setMoveOpen(true);
                }
              };

              return (
                <Card
                  key={item.id}
                  className={`p-4 rounded-2xl border ${
                    archived ? "bg-slate-900/40 text-slate-400" : "bg-slate-900/90 text-slate-100"
                  }`}
                >
                  <div className="flex justify-between gap-3">
                    <div className="min-w-0">
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

                      {(item.category || item.min_stock !== undefined) && (
                        <p className="mt-1 text-[11px] text-slate-400 truncate">
                          {item.category ? `${item.category}` : ""}
                          {item.category && item.min_stock !== undefined ? " - " : ""}
                          {item.min_stock !== undefined ? `Min: ${item.min_stock}` : ""}
                        </p>
                      )}

                      {item.preferred_supplier_name && (
                        <p className="mt-1 text-[11px] text-cyan-300 truncate">
                          Supplier: {item.preferred_supplier_name}
                          {item.supplier_sku ? ` - SKU: ${item.supplier_sku}` : ""}
                        </p>
                      )}
                    </div>

                    <span
                      className={`shrink-0 px-2 py-0.5 text-xs rounded-full ${getStockBadge(
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
                      <Button variant="outline" onClick={() => openUse(item)} disabled={!canMoveStock(role)}>
                        - Use
                      </Button>
                      <Button onClick={() => openReceive(item)} disabled={!canMoveStock(role)}>
                        + Receive
                      </Button>
                    </div>
                  )}

                  <div className="mt-3 flex justify-between items-center">
                    <PhotoCapture
                      buttonLabel="Photo"
                      onCapture={(img) => updateItem(item.id, { photo_url: img }, { actor: actorUser })}
                    />

                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openHistory(item)} title="History">
                        <History className="h-4 w-4" />
                      </Button>

                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEdit(item)}
                        disabled={!canEdit(role)}
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>

                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openDelete(item)}
                        disabled={!canArchive(role)}
                        title="Archive (via confirm)"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>

                      {!archived ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => archiveItem(item.id, actorUser)}
                          title="Archive"
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
                    </div>
                  </div>

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
          <ManualAddItemDialog open={manualAddOpen} onOpenChange={setManualAddOpen} onCreate={addItem} />

          <>
            {editOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                <div className="bg-slate-900 p-4 rounded-2xl max-w-md w-full border border-slate-800">
                  <p className="font-semibold text-slate-100">Edit item</p>

                  <div className="mt-4 space-y-3">
                    <div>
                      <p className="text-xs text-slate-400 mb-1">Item name *</p>
                      <Input
                        value={editForm.name}
                        onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="e.g. Syringe 10ml"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <p className="text-xs text-slate-400 mb-1">Strength</p>
                        <Input
                          value={editForm.strength}
                          onChange={(e) => setEditForm((f) => ({ ...f, strength: e.target.value }))}
                          placeholder="e.g. 500mg"
                        />
                      </div>

                      <div>
                        <p className="text-xs text-slate-400 mb-1">Form</p>
                        <Input
                          value={editForm.form}
                          onChange={(e) => setEditForm((f) => ({ ...f, form: e.target.value }))}
                          placeholder="e.g. tablets"
                        />
                      </div>

                      <div>
                        <p className="text-xs text-slate-400 mb-1">Brand</p>
                        <Input
                          value={editForm.brand}
                          onChange={(e) => setEditForm((f) => ({ ...f, brand: e.target.value }))}
                          placeholder="Optional"
                        />
                      </div>
                    </div>

                    <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-3 text-xs text-cyan-100">
                      Product identity is based on name, strength and form. Barcode, batch and expiry may change with each delivery.
                    </div>

                    <div>
                      <p className="text-xs text-slate-400 mb-1">Barcode</p>
                      <Input
                        value={editForm.barcode}
                        onChange={(e) => setEditForm((f) => ({ ...f, barcode: e.target.value }))}
                        placeholder="Optional"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-slate-400 mb-1">Site (building) *</p>
                        <Input
                          value={editForm.site}
                          onChange={(e) => setEditForm((f) => ({ ...f, site: e.target.value }))}
                          placeholder="e.g. main_branch"
                        />
                      </div>

                      <div>
                        <p className="text-xs text-slate-400 mb-1">Room / Location *</p>
                        <Input
                          value={editForm.location}
                          onChange={(e) => setEditForm((f) => ({ ...f, location: e.target.value }))}
                          placeholder="e.g. Room D90"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-slate-400 mb-1">Category</p>
                        <Input
                          value={editForm.category}
                          onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}
                          placeholder="e.g. Dressings"
                        />
                      </div>

                      <div>
                        <p className="text-xs text-slate-400 mb-1">Min stock</p>
                        <Input
                          type="number"
                          value={editForm.min_stock}
                          onChange={(e) => setEditForm((f) => ({ ...f, min_stock: e.target.value }))}
                          placeholder="0"
                        />
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-3">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-cyan-300">
                        Supplier Information
                      </p>

                      <div>
                        <p className="text-xs text-slate-400 mb-1">Preferred supplier</p>
                        <select
                          value={editForm.preferred_supplier_id}
                          onChange={(e) => {
                            const supplier = suppliers.find((row) => row.id === e.target.value);

                            setEditForm((f) => ({
                              ...f,
                              preferred_supplier_id: supplier?.id || "",
                              preferred_supplier_name: supplier?.name || "",
                              lead_time_days: supplier?.lead_time_days ?? f.lead_time_days ?? 0,
                            }));
                          }}
                          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                        >
                          <option value="">No preferred supplier</option>
                          {suppliers.map((supplier) => (
                            <option key={supplier.id} value={supplier.id}>
                              {supplier.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-3">
                        <div>
                          <p className="text-xs text-slate-400 mb-1">Supplier SKU</p>
                          <Input
                            value={editForm.supplier_sku}
                            onChange={(e) => setEditForm((f) => ({ ...f, supplier_sku: e.target.value }))}
                            placeholder="e.g. GLV-2218"
                          />
                        </div>

                        <div>
                          <p className="text-xs text-slate-400 mb-1">Order qty</p>
                          <Input
                            type="number"
                            min="1"
                            value={editForm.order_quantity}
                            onChange={(e) => setEditForm((f) => ({ ...f, order_quantity: e.target.value }))}
                            placeholder="1"
                          />
                        </div>

                        <div>
                          <p className="text-xs text-slate-400 mb-1">Lead time</p>
                          <Input
                            type="number"
                            min="0"
                            value={editForm.lead_time_days}
                            onChange={(e) => setEditForm((f) => ({ ...f, lead_time_days: e.target.value }))}
                            placeholder="0"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {editError && <p className="mt-3 text-sm text-rose-300">{editError}</p>}

                  <div className="mt-5 flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditOpen(false);
                        setEditItem(null);
                        setEditError("");
                        setEditSaving(false);
                      }}
                    >
                      Cancel
                    </Button>

                    <Button
                      onClick={saveEdit}
                      disabled={
                        editSaving ||
                        !editForm.name?.trim() ||
                        !editForm.site?.trim() ||
                        editForm.site?.trim().toLowerCase() === "both sites" ||
                        !editForm.location?.trim()
                      }
                    >
                      {editSaving ? "Saving..." : "Save changes"}
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
