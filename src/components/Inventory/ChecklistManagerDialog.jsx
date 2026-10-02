import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { upsertParentDoc, deleteParentDoc, listActiveSites } from "@/lib/checklistsFirestore";
import { loadSpaceRegistry } from "@/modules/sense/services/sharedSpaceRegistry";
import { spaceNamesForSite } from "@/modules/sense/services/siteLink";
import {
  blankItem,
  fieldsFromStock,
  findStockForItem,
  resolveKitItem,
  nextItemId,
  normaliseItem,
  summariseItem,
  uniqueKitId,
} from "@/lib/checklistKitHelpers";

const inputCls =
  "w-full rounded-xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-bg)] px-3 py-2 text-sm text-[color:var(--medtrak-text)] outline-none focus:border-primary/60 focus:ring-2 focus:ring-ring";
const labelCls = "mb-1 block text-xs font-medium text-[color:var(--medtrak-muted)]";
const secondaryBtn =
  "rounded-xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-bg)] px-3 py-2 text-sm font-medium text-[color:var(--medtrak-text)] transition hover:bg-[color:color-mix(in_srgb,var(--medtrak-accent)_10%,var(--medtrak-panel))] disabled:cursor-not-allowed disabled:opacity-50";
const primaryBtn =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50";
const dangerBtn =
  "inline-flex items-center gap-1.5 rounded-xl border border-rose-500/40 px-3 py-1.5 text-sm font-medium text-rose-500 transition hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50";

// A plain text input that doubles as a live search against the practice's
// real stock items, by name or by barcode - typing shows matches below, and
// picking one fills the name and barcode together. A barcode typed or pasted
// in full (or sent by a hardware scanner acting as a keyboard) that matches
// exactly is selected on Enter. Nothing forces a match: an item that isn't
// tracked as general stock still saves as typed.
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
    () => (query ? stockItems.find((s) => String(s.barcode || "").trim().toLowerCase() === query) : null),
    [query, stockItems]
  );

  return (
    <div className="relative">
      <input
        className={inputCls}
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
        <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-panel)] shadow-lg">
          {matches.map((s) => (
            <button
              key={s.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPick(s);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs text-[color:var(--medtrak-text)] hover:bg-[color:color-mix(in_srgb,var(--medtrak-accent)_10%,var(--medtrak-panel))]"
            >
              <span className="truncate">{s.name}</span>
              <span className="shrink-0 font-mono text-[color:var(--medtrak-muted)]">{s.barcode || "no barcode"}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// The form for one item - used both to add a new item and to edit an
// existing one. Nothing here touches the box until "Add to box" / "Update
// item" is pressed, and nothing reaches the database until the box itself is
// saved.
function ItemEditor({ editor, itemHasSection, stockItems, onChange, onCommit, onCancel, innerRef }) {
  const { item, error, index } = editor;
  // Linked to a stock record, and set to follow it: batch and expiry are shown
  // from Inventory (live) and can't be typed over here; untick to set them by hand.
  const linkedStock = findStockForItem(item, stockItems);
  const shown = resolveKitItem(item, stockItems);
  const following = Boolean(linkedStock) && item.followStock !== false;
  function setFollow(on) {
    onChange(on ? { followStock: true } : { followStock: false, defaultBatch: shown.defaultBatch, defaultExpiry: shown.defaultExpiry });
  }
  return (
    <div ref={innerRef} className="space-y-3 border-l-4 border-primary/60 bg-[color:color-mix(in_srgb,var(--medtrak-accent)_6%,var(--medtrak-panel))] p-3">
      <div className="flex flex-wrap items-start gap-2">
        {itemHasSection && (
          <div className="w-32 shrink-0">
            <label className={labelCls}>Section</label>
            <input className={inputCls} value={item.section} onChange={(e) => onChange({ section: e.target.value })} placeholder="General" />
          </div>
        )}
        <div className="min-w-[200px] flex-1">
          <label className={labelCls}>Item name - start typing to find it in your stock</label>
          <StockLookupInput
            value={item.name}
            placeholder="Item name"
            stockItems={stockItems}
            onChange={(value) => onChange({ name: value, stock_item_id: "" })}
            onPick={(stock) => onChange(fieldsFromStock(stock))}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div>
          <label className={labelCls}>Expected qty</label>
          <input className={inputCls} value={item.expectedQty} onChange={(e) => onChange({ expectedQty: e.target.value })} placeholder="-" />
        </div>
        <div>
          <label className={labelCls}>Batch (optional)</label>
          <input className={`${inputCls} ${following ? "opacity-70" : ""}`} value={shown.defaultBatch} disabled={following} onChange={(e) => onChange({ defaultBatch: e.target.value })} placeholder="e.g. L2301A" />
        </div>
        <div>
          <label className={labelCls}>Expiry (optional)</label>
          <input type="date" className={`${inputCls} ${following ? "opacity-70" : ""}`} value={shown.defaultExpiry} disabled={following} onChange={(e) => onChange({ defaultExpiry: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>Barcode (if available)</label>
          <StockLookupInput
            value={item.stock_barcode}
            placeholder="Type barcode"
            stockItems={stockItems}
            onChange={(value) => onChange({ stock_barcode: value, stock_item_id: "" })}
            onPick={(stock) => onChange(fieldsFromStock(stock))}
          />
        </div>
      </div>

      {linkedStock ? (
        <label className="flex items-start gap-2 text-xs text-[color:var(--medtrak-text)]">
          <input type="checkbox" className="mt-0.5" checked={following} onChange={(e) => setFollow(e.target.checked)} />
          <span>
            Follow the batch and expiry in stock
            <span className="block text-[color:var(--medtrak-muted)]">
              {following
                ? "Updates automatically when you receive a new batch in Inventory. Untick if this box holds a different batch from your main stock."
                : "Using the batch and expiry typed here. Tick to follow the Inventory record again."}
            </span>
          </span>
        </label>
      ) : (
        stockItems.length > 0 && (
          <p className="text-xs text-[color:var(--medtrak-muted)]">
            Pick the item from your stock and its barcode, batch and expiry fill in from Inventory, and stay in step with it.
          </p>
        )
      )}

      {error && <p className="text-xs text-rose-500">{error}</p>}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={secondaryBtn}>Cancel</button>
        <button type="button" onClick={onCommit} className={primaryBtn}>{index === null ? "Add to box" : "Update item"}</button>
      </div>
    </div>
  );
}

function ChecklistManagerForm({
  onClose,
  onSaved,
  parentCollection,
  existingIds = [],
  initialDoc,
  title,
  itemHasSection,
  stockItems = [],
  entityLabel = "set",
}) {
  const isEdit = Boolean(initialDoc?.id);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const [name, setName] = useState(initialDoc?.name || "");
  const [site, setSite] = useState(initialDoc?.site || "");
  const [location, setLocation] = useState(initialDoc?.location || "");
  const [items, setItems] = useState(() => (initialDoc?.items || []).map(normaliseItem));
  const [initialJson] = useState(() => JSON.stringify({ name, site, location, items }));

  // One item is added or edited at a time: { index (null = a new item), item,
  // original, error }. null means no item form is open.
  const [editor, setEditor] = useState(null);
  const [filter, setFilter] = useState("");
  const [flashId, setFlashId] = useState(null);

  const [sites, setSites] = useState([]);
  const [spaces, setSpaces] = useState([]);

  const rowRefs = useRef(new Map());
  const editorRef = useRef(null);

  // A new box's ID is assigned from its name; an existing box keeps its own.
  const docId = isEdit ? initialDoc.id : uniqueKitId(name, existingIds);

  useEffect(() => {
    let active = true;
    listActiveSites()
      .then((rows) => { if (active) setSites(rows); })
      .catch(() => { if (active) setSites([]); });
    return () => { active = false; };
  }, []);

  // Location comes from the practice's real Spaces (Practice Admin > Spaces),
  // not free text. loadSpaceRegistry() is synchronous and local, kept fresh by
  // the app-wide sync, so there's no loading state to manage.
  useEffect(() => {
    const registry = loadSpaceRegistry();
    setSpaces((registry?.spaces || []).filter((s) => s.status !== "archived"));
  }, []);

  // The real sites/spaces, plus the box's existing value if it doesn't match
  // one of them (an older free-text value, or one since renamed) - so opening
  // this can never silently wipe it.
  const siteOptions = useMemo(() => {
    const names = sites.map((s) => s.name).filter(Boolean);
    return site && !names.includes(site) ? [site, ...names] : names;
  }, [sites, site]);
  // Narrowed to the chosen site's rooms (every room if that site isn't linked
  // to its rooms yet - see siteLink.js).
  const roomsForSite = (siteName) => spaceNamesForSite({ sites: loadSpaceRegistry().sites, spaces }, sites, siteName);
  const locationOptions = useMemo(() => {
    const names = roomsForSite(site);
    return location && !names.includes(location) ? [location, ...names] : names;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaces, sites, site, location]);

  const dirty =
    JSON.stringify({ name, site, location, items }) !== initialJson ||
    Boolean(editor && JSON.stringify(editor.item) !== editor.original);

  function requestClose() {
    if (dirty && !window.confirm("Discard your unsaved changes?")) return;
    onClose?.();
  }

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (editor) editorRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [editor?.index]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!flashId) return undefined;
    rowRefs.current.get(flashId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const timer = window.setTimeout(() => setFlashId(null), 2200);
    return () => window.clearTimeout(timer);
  }, [flashId]);

  function startAdd() {
    const item = blankItem();
    setEditor({ index: null, item, original: JSON.stringify(item), error: "" });
  }

  function startEdit(idx) {
    const item = { ...items[idx] };
    setEditor({ index: idx, item, original: JSON.stringify(item), error: "" });
  }

  function patchEditor(patch) {
    setEditor((prev) => (prev ? { ...prev, item: { ...prev.item, ...patch }, error: "" } : prev));
  }

  function commitEditor() {
    if (!editor) return;
    const draft = { ...editor.item, name: String(editor.item.name || "").trim() };
    if (!draft.name) {
      setEditor((prev) => ({ ...prev, error: "Enter an item name first." }));
      return;
    }
    if (editor.index === null) {
      const id = nextItemId(items);
      setFilter("");
      setItems((prev) => [...prev, { ...draft, id }]);
      setFlashId(id);
    } else {
      const id = items[editor.index].id;
      setItems((prev) => prev.map((it, i) => (i === editor.index ? { ...draft, id } : it)));
      setFlashId(id);
    }
    setEditor(null);
  }

  function deleteItem(idx) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function save() {
    setErr("");
    if (editor) return;
    if (!name.trim()) return setErr("Enter a name first.");

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
            // data - coercing them with Number() used to turn them into NaN.
            // Keep a clean number as a number, anything else as typed.
            expectedQty: qty === "" ? null : Number.isFinite(Number(qty)) ? Number(qty) : qty,
            defaultBatch: String(it.defaultBatch || "").trim() || null,
            defaultExpiry: String(it.defaultExpiry || "").trim() || null,
            stock_barcode: String(it.stock_barcode || "").trim() || null,
            stock_item_id: String(it.stock_item_id || "").trim() || null,
            followStock: it.followStock !== false,
          };
        })
        .filter((it) => it.name);

      await upsertParentDoc(parentCollection, docId, {
        name: name.trim(),
        site: site.trim() || null,
        location: location.trim() || null,
        frequency: "monthly",
        items: cleanItems,
      });

      onSaved?.(docId);
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
      `Delete this ${entityLabel}? This removes the ${entityLabel} and its list of contents. Past checks remain but will be orphaned.`
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

  const needle = filter.trim().toLowerCase();
  const visibleItems = items
    .map((it, idx) => ({ it, idx }))
    .filter(({ it }) => !needle || String(it.name || "").toLowerCase().includes(needle));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3">
      {/* The card has a fixed maximum height and its own scrolling body, with
          the header and the Save row pinned - a long item list used to push
          the header and Save off-screen with no way to reach them. */}
      <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-panel)] text-[color:var(--medtrak-text)] shadow-2xl">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[color:var(--medtrak-border)] px-4 py-3">
          <div className="min-w-0">
            <div className="truncate font-semibold">{title}</div>
            <div className="text-xs text-[color:var(--medtrak-muted)]">
              {isEdit ? `Edit ${entityLabel}` : `Add a new ${entityLabel}`} (admin only)
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {isEdit && (
              <button type="button" onClick={doDelete} disabled={saving} title={`Delete this whole ${entityLabel}`} className={dangerBtn}>
                <Trash2 className="h-4 w-4" /> Delete {entityLabel}
              </button>
            )}
            <button type="button" onClick={requestClose} className="text-sm text-[color:var(--medtrak-muted)] hover:text-[color:var(--medtrak-text)]">
              Close
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <label className={labelCls}>Name *</label>
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. CMC Emergency Trolley" />
              <p className="mt-1 text-[11px] text-[color:var(--medtrak-muted)]">
                {isEdit ? `ID: ${docId}` : name.trim() ? `Primovex will assign the ID: ${docId}` : "Primovex assigns the ID automatically from the name."}
              </p>
            </div>

            <div className="sm:col-span-1">
              <label className={labelCls}>Site (optional)</label>
              <select
                className={inputCls}
                value={site}
                onChange={(e) => {
                  const next = e.target.value;
                  setSite(next);
                  // Drop a Location that isn't one of this site's rooms.
                  if (location && !roomsForSite(next).includes(location)) setLocation("");
                }}
              >
                <option value="">No site assigned</option>
                {siteOptions.map((siteName) => <option key={siteName} value={siteName}>{siteName}</option>)}
              </select>
              {sites.length === 0 && <p className="mt-1 text-[11px] text-[color:var(--medtrak-muted)]">No sites set up yet - add one under Practice Admin &gt; Sites.</p>}
            </div>

            <div className="sm:col-span-2">
              <label className={labelCls}>Location (optional)</label>
              <select className={inputCls} value={location} onChange={(e) => setLocation(e.target.value)}>
                <option value="">No location set</option>
                {locationOptions.map((spaceName) => <option key={spaceName} value={spaceName}>{spaceName}</option>)}
              </select>
              {spaces.length === 0 && <p className="mt-1 text-[11px] text-[color:var(--medtrak-muted)]">No spaces set up yet - add one under Practice Admin &gt; Spaces.</p>}
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">Contents ({items.length})</div>
                <p className="text-[11px] text-[color:var(--medtrak-muted)]">
                  Add each item, then save the {entityLabel} at the bottom. Edit or delete an item at any time before saving.
                </p>
              </div>
              <button type="button" onClick={startAdd} disabled={Boolean(editor)} className={primaryBtn}>
                <Plus className="h-4 w-4" /> Add item
              </button>
            </div>

            {items.length > 10 && (
              <input
                className={`${inputCls} mt-3`}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={`Filter ${items.length} items by name...`}
              />
            )}

            <ul className="mt-3 divide-y divide-[color:var(--medtrak-border)] rounded-2xl border border-[color:var(--medtrak-border)]">
              {editor && editor.index === null && (
                <li className="first:rounded-t-2xl">
                  <ItemEditor
                    editor={editor}
                    itemHasSection={itemHasSection}
                    stockItems={stockItems}
                    onChange={patchEditor}
                    onCommit={commitEditor}
                    onCancel={() => setEditor(null)}
                    innerRef={editorRef}
                  />
                </li>
              )}

              {visibleItems.length === 0 && !editor && (
                <li className="px-3 py-6 text-center text-sm text-[color:var(--medtrak-muted)]">
                  {items.length === 0 ? `No items yet - use "Add item" to build the contents.` : "No items match that filter."}
                </li>
              )}

              {visibleItems.map(({ it, idx }) =>
                editor && editor.index === idx ? (
                  <li key={it.id || idx}>
                    <ItemEditor
                      editor={editor}
                      itemHasSection={itemHasSection}
                      stockItems={stockItems}
                      onChange={patchEditor}
                      onCommit={commitEditor}
                      onCancel={() => setEditor(null)}
                      innerRef={editorRef}
                    />
                  </li>
                ) : (
                  <li
                    key={it.id || idx}
                    ref={(el) => {
                      if (el) rowRefs.current.set(it.id, el);
                      else rowRefs.current.delete(it.id);
                    }}
                    className={`flex items-start justify-between gap-3 px-3 py-2.5 transition-colors last:rounded-b-2xl ${flashId === it.id ? "bg-primary/10" : ""}`}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {itemHasSection && (
                          <span className="rounded-full border border-[color:var(--medtrak-border)] px-2 py-0.5 text-[11px] text-[color:var(--medtrak-muted)]">
                            {it.section || "General"}
                          </span>
                        )}
                        <span className="text-sm font-semibold">{it.name}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-[color:var(--medtrak-muted)]">{summariseItem(resolveKitItem(it, stockItems))}{resolveKitItem(it, stockItems).fromStock ? " · from stock" : ""}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button type="button" onClick={() => startEdit(idx)} disabled={Boolean(editor)} className={`${secondaryBtn} inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs`} title="Edit this item">
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                      <button type="button" onClick={() => deleteItem(idx)} disabled={Boolean(editor)} className={`${dangerBtn} px-2.5 text-xs`} title="Remove this item from the list">
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </div>
                  </li>
                )
              )}
            </ul>
          </div>
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[color:var(--medtrak-border)] px-4 py-3">
          <div className="min-w-0 text-xs">
            {err ? (
              <span className="text-rose-500">{err}</span>
            ) : editor ? (
              <span className="text-[color:var(--medtrak-muted)]">Finish or cancel the item you're editing to save the {entityLabel}.</span>
            ) : dirty ? (
              <span className="text-amber-500">Unsaved changes</span>
            ) : (
              <span className="text-[color:var(--medtrak-muted)]">Changes aren't saved until you press Save {entityLabel}.</span>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={requestClose} className={secondaryBtn}>Cancel</button>
            <button type="button" onClick={save} disabled={saving || Boolean(editor)} className={primaryBtn}>
              {saving ? "Saving..." : `Save ${entityLabel}`}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

// The form is mounted fresh every time the dialog opens, so it always starts
// from the box being edited (or a blank one) - the previous version kept its
// state between openings and could show whatever was typed last time.
export default function ChecklistManagerDialog(props) {
  if (!props.open) return null;
  return <ChecklistManagerForm key={props.initialDoc?.id || "new"} {...props} />;
}
