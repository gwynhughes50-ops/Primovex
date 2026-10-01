import React, { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { upsertParentDoc, deleteParentDoc, listActiveSites } from "@/lib/checklistsFirestore";

// A plain text input that doubles as a live search against the practice's
// real stock items, by name or by barcode - typing shows matches below;
// scanning a barcode (a hardware scanner "types" the code then Enter) or
// pasting one that matches exactly selects it immediately. Used for both the
// Item name and Stock barcode fields below, since either one can drive the
// match - staff might know the name but not the barcode, or vice versa.
// Picking a match fills both fields together; nothing stops typing a name
// that isn't in stock at all (not every emergency drug is necessarily
// tracked as general stock).
function StockLookupInput({ value, placeholder, stockItems, onChange, onPick }) {
  const [open, setOpen] = useState(false);

  const query = String(value || "").trim().toLowerCase();
  const matches = useMemo(() => {
    if (!query) return [];
    return stockItems
      .filter((s) => String(s.name || "").toLowerCase().includes(query) || String(s.barcode || "").toLowerCase().includes(query))
      .slice(0, 6);
  }, [query, stockItems]);

  const exactBarcodeMatch = useMemo(
    () => stockItems.find((s) => String(s.barcode || "").trim().toLowerCase() === query && query),
    [query, stockItems]
  );

  return (
    <div className="relative">
      <input
        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && exactBarcodeMatch) {
            e.preventDefault();
            onPick(exactBarcodeMatch);
            setOpen(false);
          }
        }}
      />
      {open && matches.length > 0 && (
        <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 shadow-lg">
          {matches.map((s) => (
            <button
              key={s.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPick(s);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800"
            >
              <span className="truncate">{s.name}</span>
              <span className="shrink-0 font-mono text-slate-500">{s.barcode || "no barcode"}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ChecklistManagerDialog({
  open,
  onClose,
  onSaved,
  parentCollection,
  existingIds,
  initialDoc,
  title,
  itemHasSection,
  stockItems = [],
}) {
  const isEdit = Boolean(initialDoc?.id);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const [docId, setDocId] = useState(initialDoc?.id || "");
  const [name, setName] = useState(initialDoc?.name || "");
  const [site, setSite] = useState(initialDoc?.site || "");
  const [location, setLocation] = useState(initialDoc?.location || "");
  const [sites, setSites] = useState([]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    listActiveSites()
      .then((rows) => { if (active) setSites(rows); })
      .catch(() => { if (active) setSites([]); });
    return () => { active = false; };
  }, [open]);

  // The practice's real sites, plus the box's existing value if it doesn't
  // match one of them (an older free-text value, or a site since renamed/
  // deactivated) - so opening this dialog can never silently wipe it.
  const siteOptions = useMemo(() => {
    const names = sites.map((s) => s.name).filter(Boolean);
    if (site && !names.includes(site)) return [site, ...names];
    return names;
  }, [sites, site]);
  const [items, setItems] = useState(
    (initialDoc?.items || []).map((it) => ({
      id: it.id || "",
      section: it.section || "General",
      name: it.name || "",
      expectedQty: it.expectedQty ?? "",
      defaultBatch: it.defaultBatch ?? "",
      defaultExpiry: it.defaultExpiry ?? "",
      stock_barcode: it.stock_barcode ?? "",
    }))
  );

  const idTaken = useMemo(() => {
    const id = (docId || "").trim();
    if (!id) return false;
    if (isEdit && id === initialDoc.id) return false;
    return existingIds.includes(id);
  }, [docId, existingIds, isEdit, initialDoc]);

  function setItem(idx, patch) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function addItem() {
    setItems((prev) => [
      ...prev,
      { id: `item_${prev.length + 1}`, section: "General", name: "", expectedQty: "", defaultBatch: "", defaultExpiry: "", stock_barcode: "" },
    ]);
  }

  function removeItem(idx) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function save() {
    setErr("");
    const id = (docId || "").trim();
    if (!id) return setErr("ID is required (e.g. cmc_emergency_trolley).");
    if (idTaken) return setErr("That ID is already in use.");
    if (!name.trim()) return setErr("Name is required.");

    try {
      setSaving(true);

      const cleanItems = items
        .map((it, idx) => {
          const qty = String(it.expectedQty ?? "").trim();
          return {
            id: String(it.id || "").trim() || `item_${idx + 1}`,
            ...(itemHasSection ? { section: String(it.section || "General").trim() || "General" } : {}),
            name: String(it.name || "").trim(),
            // Free-text quantities ("x2", "?") are valid in the original seed
            // data - coercing them with Number() here used to silently turn
            // them into NaN the moment this dialog re-saved them. Keep a
            // clean numeric qty as a number, anything else as the typed text.
            expectedQty: qty === "" ? null : Number.isFinite(Number(qty)) ? Number(qty) : qty,
            defaultBatch: String(it.defaultBatch || "").trim() || null,
            defaultExpiry: String(it.defaultExpiry || "").trim() || null,
            stock_barcode: String(it.stock_barcode || "").trim() || null,
          };
        })
        .filter((it) => it.name);

      await upsertParentDoc(parentCollection, id, {
        name: name.trim(),
        site: site.trim() || null,
        location: location.trim() || null,
        frequency: "monthly",
        items: cleanItems,
      });

      onSaved?.(id);
      onClose?.();
    } catch (e) {
      console.error(e);
      setErr(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    if (!isEdit) return;
    const ok = window.confirm(
      "Delete this set? This removes the box/trolley definition. Past checks remain but will be orphaned."
    );
    if (!ok) return;

    try {
      setSaving(true);
      await deleteParentDoc(parentCollection, initialDoc.id);
      onSaved?.();
      onClose?.();
    } catch (e) {
      console.error(e);
      setErr(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3">
      <div className="w-full max-w-3xl bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-slate-100 font-semibold">{title}</div>
            <div className="text-xs text-slate-400">
              {isEdit ? "Edit existing set" : "Create a new set"} (admin only)
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {isEdit && (
              <button
                type="button"
                onClick={doDelete}
                disabled={saving}
                title="Delete this whole box/trolley"
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/40 px-3 py-1.5 text-sm text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" /> Delete set
              </button>
            )}
            <button
              type="button"
              onClick={() => onClose?.()}
              className="text-slate-300 hover:text-slate-100 text-sm"
            >
              Close
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-slate-400 mb-1">ID (slug) *</div>
              <input
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100"
                value={docId}
                onChange={(e) => setDocId(e.target.value)}
                placeholder="e.g. cmc_emergency_trolley"
                disabled={isEdit}
              />
              {idTaken && <div className="text-xs text-rose-300 mt-1">ID already exists.</div>}
            </div>

            <div>
              <div className="text-xs text-slate-400 mb-1">Name *</div>
              <input
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. CMC Emergency Trolley"
              />
            </div>

            <div>
              <div className="text-xs text-slate-400 mb-1">Site (optional)</div>
              <select
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100"
                value={site}
                onChange={(e) => setSite(e.target.value)}
              >
                <option value="">No site assigned</option>
                {siteOptions.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
              {sites.length === 0 && (
                <p className="mt-1 text-[11px] text-slate-500">No sites set up yet - add one under Practice Admin &gt; Sites.</p>
              )}
            </div>

            <div>
              <div className="text-xs text-slate-400 mb-1">Location (optional)</div>
              <input
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Treatment room"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-200 font-semibold">Contents</div>
            <button
              type="button"
              onClick={addItem}
              className="px-3 py-2 rounded-xl text-sm border bg-teal-600/20 border-teal-500/60 text-teal-100 hover:bg-teal-600/30"
            >
              Add item
            </button>
          </div>

          <div className="border border-slate-800 rounded-2xl divide-y divide-slate-800/60 overflow-hidden">
            {items.map((it, idx) => (
              <div key={idx} className="p-3 space-y-2">
                <div className="flex items-start gap-2">
                  {itemHasSection && (
                    <div className="w-28 shrink-0">
                      <div className="text-[10px] text-slate-500 mb-1">Section</div>
                      <input
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100"
                        value={it.section}
                        onChange={(e) => setItem(idx, { section: e.target.value })}
                        placeholder="General"
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-slate-500 mb-1">Item name - type to search stock, or scan/type a barcode</div>
                    <StockLookupInput
                      value={it.name}
                      placeholder="Item name"
                      stockItems={stockItems}
                      onChange={(value) => setItem(idx, { name: value })}
                      onPick={(stock) => setItem(idx, { name: stock.name, stock_barcode: stock.barcode || "" })}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    className="mt-5 inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-rose-500/40 px-2.5 py-2 text-xs font-medium text-rose-300 hover:bg-rose-500/10"
                    title="Remove this item from the kit"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div>
                    <div className="text-[10px] text-slate-500 mb-1">Expected qty</div>
                    <input
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100"
                      value={it.expectedQty}
                      onChange={(e) => setItem(idx, { expectedQty: e.target.value })}
                      placeholder="-"
                    />
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 mb-1">Default batch (optional)</div>
                    <input
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100"
                      value={it.defaultBatch}
                      onChange={(e) => setItem(idx, { defaultBatch: e.target.value })}
                      placeholder="e.g. L2301A"
                    />
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 mb-1">Default expiry (optional)</div>
                    <input
                      type="date"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100"
                      value={it.defaultExpiry}
                      onChange={(e) => setItem(idx, { defaultExpiry: e.target.value })}
                    />
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 mb-1">Stock barcode (optional) - scan or search</div>
                    <StockLookupInput
                      value={it.stock_barcode}
                      placeholder="Scan or type a barcode"
                      stockItems={stockItems}
                      onChange={(value) => setItem(idx, { stock_barcode: value })}
                      onPick={(stock) => setItem(idx, { name: it.name || stock.name, stock_barcode: stock.barcode || "" })}
                    />
                  </div>
                </div>
                <p className="text-[11px] text-slate-500">Type a name or scan a barcode in either field above to match it to a real stock item - picking a match fills both. Leave batch/expiry blank if this item doesn't need tracking (e.g. a spacer device) - staff can still enter them during a check if needed; they just won't be pre-filled.</p>
              </div>
            ))}
          </div>

          {err && <div className="text-sm text-rose-300">{err}</div>}

          <div className="flex items-center justify-end">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onClose?.()}
                className="px-3 py-2 rounded-xl text-sm border border-slate-700 text-slate-200 hover:bg-slate-900/40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="px-3 py-2 rounded-xl text-sm border bg-teal-600/20 border-teal-500/60 text-teal-100 hover:bg-teal-600/30 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>

          <div className="text-xs text-slate-500">
            Note: deleting a set removes the box/trolley definition. Existing monthly check records are not deleted.
          </div>
        </div>
      </div>
    </div>
  );
}
