import React, { useMemo, useState } from "react";
import { upsertParentDoc, deleteParentDoc } from "@/lib/checklistsFirestore";

export default function ChecklistManagerDialog({
  open,
  onClose,
  parentCollection,
  existingIds,
  initialDoc,
  title,
  itemHasSection,
}) {
  const isEdit = Boolean(initialDoc?.id);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const [docId, setDocId] = useState(initialDoc?.id || "");
  const [name, setName] = useState(initialDoc?.name || "");
  const [site, setSite] = useState(initialDoc?.site || "");
  const [location, setLocation] = useState(initialDoc?.location || "");
  const [items, setItems] = useState(
    (initialDoc?.items || []).map((it) => ({
      id: it.id || "",
      section: it.section || "General",
      name: it.name || "",
      expectedQty: it.expectedQty ?? "",
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
      { id: `item_${prev.length + 1}`, section: "General", name: "", expectedQty: "", stock_barcode: "" },
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
        .map((it, idx) => ({
          id: String(it.id || "").trim() || `item_${idx + 1}`,
          ...(itemHasSection ? { section: String(it.section || "General").trim() || "General" } : {}),
          name: String(it.name || "").trim(),
          expectedQty: it.expectedQty === "" ? null : Number(it.expectedQty),
          stock_barcode: String(it.stock_barcode || "").trim() || null,
        }))
        .filter((it) => it.name);

      await upsertParentDoc(parentCollection, id, {
        name: name.trim(),
        site: site.trim() || null,
        location: location.trim() || null,
        frequency: "monthly",
        items: cleanItems,
      });

      onClose(true);
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
      onClose(true);
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
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-slate-100 font-semibold">{title}</div>
            <div className="text-xs text-slate-400">
              {isEdit ? "Edit existing set" : "Create a new set"} (admin only)
            </div>
          </div>
          <button
            type="button"
            onClick={() => onClose(false)}
            className="text-slate-300 hover:text-slate-100 text-sm"
          >
            Close
          </button>
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
              <input
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100"
                value={site}
                onChange={(e) => setSite(e.target.value)}
                placeholder="e.g. main_branch"
              />
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

          <div className="border border-slate-800 rounded-2xl overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-slate-900/40 text-xs text-slate-300">
              {itemHasSection ? <div className="col-span-2">Section</div> : null}
              <div className={itemHasSection ? "col-span-4" : "col-span-6"}>Name</div>
              <div className="col-span-2">Expected Qty</div>
              <div className="col-span-3">Stock barcode (optional)</div>
              <div className="col-span-1"></div>
            </div>

            {items.map((it, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 px-3 py-2 border-t border-slate-800/60">
                {itemHasSection ? (
                  <div className="col-span-12 sm:col-span-2">
                    <input
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100"
                      value={it.section}
                      onChange={(e) => setItem(idx, { section: e.target.value })}
                      placeholder="General"
                    />
                  </div>
                ) : null}

                <div className={itemHasSection ? "col-span-12 sm:col-span-4" : "col-span-12 sm:col-span-6"}>
                  <input
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100"
                    value={it.name}
                    onChange={(e) => setItem(idx, { name: e.target.value })}
                    placeholder="Item name"
                  />
                </div>

                <div className="col-span-6 sm:col-span-2">
                  <input
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100"
                    value={it.expectedQty}
                    onChange={(e) => setItem(idx, { expectedQty: e.target.value })}
                    placeholder="-"
                  />
                </div>

                <div className="col-span-6 sm:col-span-3">
                  <input
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100"
                    value={it.stock_barcode}
                    onChange={(e) => setItem(idx, { stock_barcode: e.target.value })}
                    placeholder="Match stock item barcode"
                  />
                </div>

                <div className="col-span-12 sm:col-span-1 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    className="text-xs text-rose-300 hover:text-rose-200"
                    title="Remove item"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>

          {err && <div className="text-sm text-rose-300">{err}</div>}

          <div className="flex items-center justify-between">
            <div>
              {isEdit ? (
                <button
                  type="button"
                  onClick={doDelete}
                  disabled={saving}
                  className="px-3 py-2 rounded-xl text-sm border border-rose-500/40 text-rose-200 hover:bg-rose-500/10 disabled:opacity-50"
                >
                  Delete set
                </button>
              ) : null}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onClose(false)}
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
