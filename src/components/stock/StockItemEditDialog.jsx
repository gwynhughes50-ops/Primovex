import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { db } from "@/lib/firebase";
import useSiteSpaceNames from "@/hooks/useSiteSpaceNames";
import { buildFormOptions, matchOption, namesWithCurrent } from "@/lib/stockPickerOptions";
import { describeBatches, hasExplicitBatches } from "@/lib/stockBatches";
import { STOCK_CATEGORIES, getSubcategories, categoryLabel, subcategoryLabel, UNCATEGORISED_CATEGORY } from "@/data/stockCategories";
import { normalizeStockItemCategory, updateStockItem } from "@/services/stockService";

// The "Edit item" window for a stock item. Moved out of the Inventory page so the same editor opens from
// anywhere an item is listed (the Inventory page, Reports > Stock Levels and Expiry Report): one editor, one
// set of rules. Renders nothing without an item; onClose(true) is called after a save, onClose() on cancel.
export function formFromItem(item) {
  const resolvedCategory = normalizeStockItemCategory(item);
  return {
  name: item?.name ?? "",
  strength: item?.strength ?? "",
  form: item?.form ?? "",
  brand: item?.brand ?? "",
  barcode: item?.barcode ?? "",
  batch_number: item?.batch_number ?? "",
  expiry_date: item?.expiry_date ?? "",
  hasBatches: hasExplicitBatches(item),
  batchList: describeBatches(item),
  site: item?.site ?? "",
  location: item?.location ?? "",
  category: resolvedCategory.category,
  subcategory: resolvedCategory.subcategory,
  min_stock: typeof item?.min_stock === "number" ? item.min_stock : Number(item?.min_stock ?? 0) || 0,
  units_per_box: typeof item?.units_per_box === "number" ? item.units_per_box : Number(item?.units_per_box ?? 0) || 0,
  preferred_supplier_id: item?.preferred_supplier_id ?? "",
  preferred_supplier_name: item?.preferred_supplier_name ?? "",
  supplier_sku: item?.supplier_sku ?? "",
  order_quantity: typeof item?.order_quantity === "number" ? item.order_quantity : Number(item?.order_quantity ?? 1) || 1,
  lead_time_days: typeof item?.lead_time_days === "number" ? item.lead_time_days : Number(item?.lead_time_days ?? 0) || 0,
  };
}

export default function StockItemEditDialog({ item, items = [], onClose }) {
  const [editForm, setEditForm] = useState(() => formFromItem(item || {}));
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [suppliers, setSuppliers] = useState([]);

  // another item opened in the same window starts from its own details
  useEffect(() => { setEditForm(formFromItem(item || {})); setEditError(""); }, [item?.id]);

  useEffect(() => {
    const qSuppliers = query(collection(db, "suppliers"));
    return onSnapshot(
      qSuppliers,
      (snap) => setSuppliers(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((supplier) => supplier.active !== false)),
      (err) => { console.error("Supplier subscription failed:", err); setSuppliers([]); }
    );
  }, []);

  // Form / Site / Location are picked, not typed: sites and spaces from Practice Admin, forms from the
  // standard list plus whatever stock already uses.
  const { siteNames: editSiteNames, spaceNames: editSpaceNames, spaceNamesFor: editSpaceNamesFor, loaded: editNamesLoaded } = useSiteSpaceNames(true);
  const existingForms = useMemo(() => (items || []).map((i) => i?.form).filter(Boolean), [items]);
  const editFormOptions = useMemo(() => buildFormOptions(existingForms, editForm.form), [existingForms, editForm.form]);
  const editSiteOptions = namesWithCurrent(editSiteNames, editForm.site);
  const editLocationOptions = namesWithCurrent(editSpaceNamesFor(editForm.site), editForm.location);

  const saveEdit = async () => {
    if (!item) return;

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
        setEditError('Please choose a Site (a single building, not "Both sites").');
        return;
      }

      if (!location) {
        setEditError("Please choose a Location (room/cupboard).");
        return;
      }

      const payload = {
        name,
        strength,
        form,
        brand: (editForm.brand || "").trim(),
        barcode: (editForm.barcode || "").trim(),
        // With real batches, the item's batch/expiry are worked out from them
        // (receiving and using stock), so they are not overwritten from here.
        ...(editForm.hasBatches
          ? {}
          : { batch_number: (editForm.batch_number || "").trim(), expiry_date: editForm.expiry_date || "" }),
        site,
        location,
        category: (editForm.category || "").trim() || UNCATEGORISED_CATEGORY,
        subcategory: (editForm.subcategory || "").trim(),
        min_stock: Number(editForm.min_stock) || 0,
        units_per_box: Number(editForm.units_per_box) || 0,
        preferred_supplier_id: editForm.preferred_supplier_id || "",
        preferred_supplier_name: editForm.preferred_supplier_name || "",
        supplier_sku: (editForm.supplier_sku || "").trim(),
        order_quantity: Number(editForm.order_quantity) || 1,
        lead_time_days: Number(editForm.lead_time_days) || 0,
      };

      await updateStockItem(item.id, payload);

      onClose(true);
    } catch (err) {
      console.error("Edit save failed:", err);
      setEditError(err?.message || String(err));
    } finally {
      setEditSaving(false);
    }
  };

  if (!item) return null;

  return (
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
                <select
                  value={matchOption(editFormOptions, editForm.form)}
                  onChange={(e) => setEditForm((f) => ({ ...f, form: e.target.value }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                >
                  <option value="">Select a form</option>
                  {editFormOptions.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
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

            {editForm.hasBatches ? (
              <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Batches in stock</p>
                <ul className="mt-2 space-y-1 text-sm text-slate-200">
                  {(editForm.batchList || []).map((b) => <li key={b.key}>{b.label}</li>)}
                </ul>
                <p className="mt-2 text-[11px] text-slate-500">
                  Batches are set by receiving and using stock - stock is used from the soonest-expiring batch first.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-slate-400 mb-1">Batch number</p>
                  <Input
                    value={editForm.batch_number}
                    onChange={(e) => setEditForm((f) => ({ ...f, batch_number: e.target.value }))}
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-1">Expiry date</p>
                  <Input
                    type="date"
                    value={editForm.expiry_date}
                    onChange={(e) => setEditForm((f) => ({ ...f, expiry_date: e.target.value }))}
                  />
                </div>
                <p className="col-span-2 -mt-1 text-[11px] text-slate-500">
                  The next delivery you receive becomes this item's first tracked batch.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-slate-400 mb-1">Site (building) *</p>
                <select
                  value={editForm.site}
                  onChange={(e) => {
                    // Location narrows to this site's rooms; drop one that isn't in it.
                    const site = e.target.value;
                    setEditForm((f) => ({ ...f, site, location: editSpaceNamesFor(site).includes(f.location) ? f.location : "" }));
                  }}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                >
                  <option value="">{editNamesLoaded && editSiteOptions.length === 0 ? "No sites set up" : "Select a site"}</option>
                  {editSiteOptions.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              </div>

              <div>
                <p className="text-xs text-slate-400 mb-1">Room / Location *</p>
                <select
                  value={editForm.location}
                  onChange={(e) => setEditForm((f) => ({ ...f, location: e.target.value }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                >
                  <option value="">{editSpaceNames.length === 0 ? "No spaces set up" : "Select a location"}</option>
                  {editLocationOptions.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-slate-400 mb-1">Category</p>
                <select
                  value={editForm.category}
                  onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value, subcategory: "" }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                >
                  {STOCK_CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.icon} {cat.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <p className="text-xs text-slate-400 mb-1">Subcategory</p>
                <select
                  value={editForm.subcategory}
                  onChange={(e) => setEditForm((f) => ({ ...f, subcategory: e.target.value }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                >
                  <option value="">Select a subcategory</option>
                  {getSubcategories(editForm.category).map((sub) => (
                    <option key={sub.id} value={sub.id}>{sub.label}</option>
                  ))}
                </select>
              </div>
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

            <div>
              <p className="text-xs text-slate-400 mb-1">Units per box</p>
              <Input
                type="number"
                min={0}
                value={editForm.units_per_box}
                onChange={(e) => setEditForm((f) => ({ ...f, units_per_box: e.target.value }))}
                placeholder="Optional, e.g. 100"
              />
              <p className="mt-1 text-[11px] text-slate-500">Lets staff take a full box in one tap when using stock.</p>
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
              onClick={() => onClose()}
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
  );
}
