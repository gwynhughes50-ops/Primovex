import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, Save, PackagePlus, CheckCircle2 } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { STOCK_CATEGORIES, UNCATEGORISED_CATEGORY, getSubcategories } from "@/data/stockCategories";
import useSiteSpaceNames from "@/hooks/useSiteSpaceNames";
import { buildFormOptions, matchOption, namesWithCurrent } from "@/lib/stockPickerOptions";
import { findSameProduct, receiveDefaults, stockAfterReceive, suggestStock, suggestionDetail } from "@/lib/stockSuggestions";
import { matchStockByScan, parseGs1 } from "@/lib/gs1";

const dmy = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || "") ? iso.split("-").reverse().join("/") : iso);
// A scanner "types" the code and presses Enter into whichever box has focus.
const looksLikeBarcode = (text) => Boolean(parseGs1(text)) || /^\d{8,14}$/.test(String(text || "").trim());

const selectCls = "mt-1 h-10 w-full rounded-xl border border-slate-700/70 bg-slate-900 px-3 text-sm";

const blankForm = (barcode = "", keep = {}) => ({
  name: "",
  strength: "",
  form: "",
  brand: "",
  barcode,
  category: UNCATEGORISED_CATEGORY,
  subcategory: "",
  site: keep.site || "",
  location: keep.location || "",
  batch_number: "",
  expiry_date: "",
  current_stock: 0,
  min_stock: 1,
  max_stock: 10,
  unit: "",
  units_per_box: "",
});

// Putting a delivery on the system. Type a few letters of the product and
// Primovex suggests the ones it already knows (every stock item, archived ones
// too): pick one and it asks only for how many, the batch and the expiry, and
// adds them to that item. A product it doesn't know is added as a new item, as
// before. Adding a product that's already at that place is stopped (it would
// make a second copy) and offers to receive into the existing one. The dialog
// stays open after each item so a whole delivery can be put on in a row.
export default function ManualAddItemDialog({
  open,
  onOpenChange,
  onCreate,
  onReceive,
  items = [],
  initialBarcode = "",
  existingForms = [],
}) {
  const scrollRef = useRef(null);
  const nameRef = useRef(null);
  const qtyRef = useRef(null);
  const { siteNames, spaceNames, spaceNamesFor, loaded } = useSiteSpaceNames(open);

  const [form, setForm] = useState(() => blankForm(initialBarcode));
  const [mode, setMode] = useState("new"); // "new" | "receive"
  const [target, setTarget] = useState(null);
  const [recv, setRecv] = useState({ qty: "1", batch_number: "", expiry_date: "", barcode: "" });
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [scanText, setScanText] = useState("");
  const [scanNote, setScanNote] = useState("");

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => scrollRef.current?.scrollTo?.({ top: 0 }), 0);
    setForm(blankForm(initialBarcode));
    setMode("new");
    setTarget(null);
    setSuggestOpen(false);
    setError("");
    setDone("");
    setScanText("");
    setScanNote("");
  }, [open, initialBarcode]);

  // A practice with one site/space doesn't need to choose: fill it in.
  useEffect(() => {
    if (!open) return;
    setForm((p) => {
      const site = !p.site && siteNames.length === 1 ? siteNames[0] : p.site;
      const rooms = spaceNamesFor(site);
      return { ...p, site, location: !p.location && rooms.length === 1 ? rooms[0] : p.location };
    });
  }, [open, siteNames, spaceNamesFor]);

  useEffect(() => {
    if (mode === "receive") window.setTimeout(() => qtyRef.current?.select?.(), 30);
  }, [mode, target]);

  const suggestions = useMemo(
    () => (mode === "new" && suggestOpen ? suggestStock(items, form.name) : []),
    [mode, suggestOpen, items, form.name]
  );
  useEffect(() => setHighlight(0), [form.name]);

  if (!open) return null;

  const formOptions = buildFormOptions(existingForms, form.form);
  const siteOptions = namesWithCurrent(siteNames, form.site);
  const locationOptions = namesWithCurrent(spaceNamesFor(form.site), form.location);

  // The same product already at this place: adding it again would duplicate it.
  const duplicate = mode === "new" ? findSameProduct(items, form) : null;
  const canSave = form.name.trim().length > 0 && !duplicate && !busy;

  function chooseExisting(item, details = {}) {
    const defaults = receiveDefaults(item);
    setTarget(item);
    setRecv({
      ...defaults,
      // What the box's own barcodes said about this delivery, when scanned.
      batch_number: details.lot || "",
      expiry_date: details.expiry || "",
      qty: details.count ? String(details.count) : defaults.qty,
      barcode: !item.barcode && details.gtin ? details.gtin : "",
    });
    setMode("receive");
    setSuggestOpen(false);
    setError("");
    setDone("");
  }

  // A scanned barcode - from the box, the single pack, or the second barcode
  // that carries the expiry, lot and quantity. Finds the product whichever pack
  // barcode it is, and fills in whatever the scan says about the delivery.
  function handleScan(raw) {
    const text = String(raw || "").trim();
    if (!text) return;
    setError("");
    setDone("");
    const { item, via, details } = matchStockByScan(items, text);
    const bits = [];
    if (details.lot) bits.push(`batch ${details.lot}`);
    if (details.expiry) bits.push(`expiry ${dmy(details.expiry)}`);
    if (details.count) bits.push(`quantity ${details.count}`);
    const tail = bits.length ? ` - ${bits.join(", ")}` : "";

    if (item) {
      chooseExisting(item, details);
      setScanNote(`Found ${item.name}${via === "other-pack" ? " (the same product's other pack barcode)" : ""}${tail}.`);
    } else if (details.gtin) {
      setForm((p) => ({
        ...p,
        barcode: details.gtin,
        batch_number: details.lot ?? p.batch_number,
        expiry_date: details.expiry ?? p.expiry_date,
        current_stock: details.count ?? p.current_stock,
      }));
      setMode("new");
      setTarget(null);
      setScanNote(`This product isn't on file yet${tail}. Type its name below to add it.`);
      window.setTimeout(() => nameRef.current?.focus(), 30);
    } else if (bits.length) {
      if (mode === "receive") {
        setRecv((p) => ({ ...p, batch_number: details.lot ?? p.batch_number, expiry_date: details.expiry ?? p.expiry_date, qty: details.count ? String(details.count) : p.qty }));
        setScanNote(`Filled in${tail}.`);
      } else {
        setForm((p) => ({ ...p, batch_number: details.lot ?? p.batch_number, expiry_date: details.expiry ?? p.expiry_date, current_stock: details.count ?? p.current_stock }));
        setScanNote(`Read${tail}. Now scan the product barcode too, or pick the product by name.`);
      }
    } else {
      setForm((p) => ({ ...p, barcode: text }));
      setMode("new");
      setTarget(null);
      setScanNote("That barcode isn't on file. Type the product's name below to add it.");
      window.setTimeout(() => nameRef.current?.focus(), 30);
    }
  }

  // Ready for the next item in the delivery: same site and room, everything else blank.
  function readyForNext(message) {
    setForm((p) => blankForm("", { site: p.site, location: p.location }));
    setMode("new");
    setTarget(null);
    setError("");
    setDone(message);
    setScanText("");
    setScanNote("");
    window.setTimeout(() => {
      scrollRef.current?.scrollTo?.({ top: 0 });
      nameRef.current?.focus();
    }, 30);
  }

  async function submitReceive(event) {
    event?.preventDefault();
    const qty = Math.floor(Number(recv.qty));
    if (!(qty > 0)) {
      setError("Enter how many were delivered.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onReceive(target, {
        qty,
        batch_number: recv.batch_number.trim(),
        expiry_date: recv.expiry_date,
        barcode: recv.barcode.trim(),
      });
      readyForNext(`Received ${qty} × ${target.name}.`);
    } catch (err) {
      setError(err?.message || "Could not receive this item. Nothing has been changed.");
    } finally {
      setBusy(false);
    }
  }

  async function submitCreate() {
    if (!canSave) return;
    setBusy(true);
    setError("");
    try {
      await onCreate({
        ...form,
        current_stock: Number(form.current_stock || 0),
        min_stock: Number(form.min_stock || 0),
        max_stock: Number(form.max_stock || 0),
        units_per_box: Number(form.units_per_box || 0),
      });
      readyForNext(`Added ${form.name.trim()}.`);
    } catch (err) {
      setError(err?.message || "Could not add this item. Nothing has been changed.");
    } finally {
      setBusy(false);
    }
  }

  function onNameKeyDown(event) {
    // A scanner pointed at the name box: treat a barcode + Enter as a scan.
    if (event.key === "Enter" && looksLikeBarcode(form.name)) {
      event.preventDefault();
      const scanned = form.name;
      setForm((p) => ({ ...p, name: "" }));
      setSuggestOpen(false);
      handleScan(scanned);
      return;
    }
    if (!suggestions.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      chooseExisting(suggestions[highlight] || suggestions[0]);
    } else if (event.key === "Escape") {
      event.stopPropagation();
      setSuggestOpen(false);
    }
  }

  const receiving = mode === "receive" && target;
  const addedSomething = Boolean(done);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-slate-700/70 bg-slate-900/95 text-slate-100 shadow-2xl sm:rounded-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-800/80 bg-slate-900/95 px-4 py-3">
          <p className="text-sm font-semibold">{receiving ? "Receive stock" : "Add item"}</p>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-slate-200 hover:bg-[color:color-mix(in_srgb,var(--medtrak-accent)_14%,transparent)]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div ref={scrollRef} className="grid flex-1 gap-3 overflow-y-auto overscroll-contain px-4 py-3 sm:grid-cols-2">
          {done && (
            <p role="status" className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-200 sm:col-span-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" /> {done} Add the next item below, or press Done.
            </p>
          )}

          <div className="sm:col-span-2">
            <label className="text-xs text-slate-400">Scan the delivery barcode (box or pack)</label>
            <Input
              className="mt-1"
              autoComplete="off"
              value={scanText}
              placeholder="Scan here - or skip this and type the name below"
              onChange={(e) => setScanText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                const scanned = scanText;
                setScanText("");
                handleScan(scanned);
              }}
            />
            {scanNote && <p role="status" className="mt-1 text-[11px] text-teal-200">{scanNote}</p>}
          </div>

          {receiving ? (
            <form id="receive-form" onSubmit={submitReceive} className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3 sm:col-span-2">
                <p className="font-semibold text-white">{target.name}</p>
                <p className="text-xs text-teal-200">{suggestionDetail(target)}</p>
                {target.archived_at && (
                  <p className="mt-1 text-xs text-amber-300">This item was archived. Receiving stock brings it back.</p>
                )}
              </div>

              <div>
                <label className="text-xs text-slate-400">How many delivered *</label>
                <Input
                  ref={qtyRef}
                  className="mt-1"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={recv.qty}
                  onChange={(e) => setRecv((p) => ({ ...p, qty: e.target.value }))}
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  {Number(target.current_stock) || 0} now → {stockAfterReceive(target, recv.qty)} after receiving
                </p>
              </div>

              <div>
                <label className="text-xs text-slate-400">Batch number</label>
                <Input className="mt-1" value={recv.batch_number} onChange={(e) => setRecv((p) => ({ ...p, batch_number: e.target.value }))} />
              </div>

              <div>
                <label className="text-xs text-slate-400">Expiry date</label>
                <Input className="mt-1" type="date" value={recv.expiry_date} onChange={(e) => setRecv((p) => ({ ...p, expiry_date: e.target.value }))} />
              </div>

              {!target.barcode && (
                <div>
                  <label className="text-xs text-slate-400">Barcode (none recorded yet)</label>
                  <Input className="mt-1" value={recv.barcode} onChange={(e) => setRecv((p) => ({ ...p, barcode: e.target.value }))} placeholder="Type barcode if available" />
                </div>
              )}

              <button
                type="button"
                className="text-left text-xs text-slate-400 underline sm:col-span-2"
                onClick={() => { setMode("new"); setTarget(null); setError(""); window.setTimeout(() => nameRef.current?.focus(), 30); }}
              >
                Not this item? Add it as a new item instead.
              </button>
            </form>
          ) : (
            <>
              <div className="relative sm:col-span-2">
                <label className="text-xs text-slate-400">Name *</label>
                <Input
                  ref={nameRef}
                  className="mt-1"
                  autoComplete="off"
                  value={form.name}
                  placeholder="Start typing - e.g. eclipse"
                  onChange={(e) => { setForm((p) => ({ ...p, name: e.target.value })); setSuggestOpen(true); }}
                  onFocus={() => setSuggestOpen(true)}
                  onBlur={() => window.setTimeout(() => setSuggestOpen(false), 150)}
                  onKeyDown={onNameKeyDown}
                />
                {suggestions.length > 0 && (
                  <div role="listbox" aria-label="Products already on file" className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 shadow-xl">
                    <p className="px-3 pt-2 text-[11px] uppercase tracking-wide text-slate-500">Already on file - pick one to receive it</p>
                    {suggestions.map((item, index) => (
                      <button
                        key={item.id}
                        type="button"
                        role="option"
                        aria-selected={index === highlight}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => chooseExisting(item)}
                        className={`flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-[color:color-mix(in_srgb,var(--medtrak-accent)_14%,transparent)] ${index === highlight ? "bg-slate-800" : ""}`}
                      >
                        <PackagePlus className="mt-0.5 h-4 w-4 shrink-0 text-teal-300" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-white">{item.name}</span>
                          <span className="block truncate text-xs text-slate-400">{suggestionDetail(item)}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {duplicate && (
                  <div role="alert" className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-100">
                    {duplicate.name} is already in stock at {[duplicate.site, duplicate.location].filter(Boolean).join(" - ") || "this place"}. Adding it again would make a second copy.{" "}
                    <button type="button" className="font-semibold underline" onClick={() => chooseExisting(duplicate)}>Receive into it instead</button>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs text-slate-400">Strength</label>
                <Input className="mt-1" value={form.strength} onChange={(e) => setForm((p) => ({ ...p, strength: e.target.value }))} placeholder="e.g. 500 mg" />
              </div>

              <div>
                <label className="text-xs text-slate-400">Form</label>
                <select className={selectCls} value={matchOption(formOptions, form.form)} onChange={(e) => setForm((p) => ({ ...p, form: e.target.value }))}>
                  <option value="">Select a form</option>
                  {formOptions.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400">Brand</label>
                <Input className="mt-1" value={form.brand} onChange={(e) => setForm((p) => ({ ...p, brand: e.target.value }))} placeholder="Optional" />
              </div>

              <div>
                <label className="text-xs text-slate-400">Barcode</label>
                <Input className="mt-1" value={form.barcode} onChange={(e) => setForm((p) => ({ ...p, barcode: e.target.value }))} />
              </div>

              <div>
                <label className="text-xs text-slate-400">Category</label>
                <select
                  className="mt-1 h-10 w-full rounded-xl border border-slate-700/70 bg-slate-900 px-3 text-sm"
                  value={form.category}
                  onChange={(e) => setForm((p) => ({ ...p, category: e.target.value, subcategory: "" }))}
                >
                  {STOCK_CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.icon} {cat.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400">Subcategory</label>
                <select
                  className="mt-1 h-10 w-full rounded-xl border border-slate-700/70 bg-slate-900 px-3 text-sm"
                  value={form.subcategory}
                  onChange={(e) => setForm((p) => ({ ...p, subcategory: e.target.value }))}
                >
                  <option value="">Select a subcategory</option>
                  {getSubcategories(form.category).map((sub) => (
                    <option key={sub.id} value={sub.id}>{sub.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400">Site</label>
                <select
                  className={selectCls}
                  value={form.site}
                  onChange={(e) => {
                    // The Location list narrows to this site's rooms; drop a location that isn't one of them.
                    const site = e.target.value;
                    setForm((p) => ({ ...p, site, location: spaceNamesFor(site).includes(p.location) ? p.location : "" }));
                  }}
                >
                  <option value="">{loaded && siteOptions.length === 0 ? "No sites set up" : "Select a site"}</option>
                  {siteOptions.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400">Location</label>
                <select className={selectCls} value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}>
                  <option value="">{spaceNames.length === 0 ? "No spaces set up" : "Select a location"}</option>
                  {locationOptions.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
                {loaded && (siteOptions.length === 0 || spaceNames.length === 0) && (
                  <p className="mt-1 text-[11px] text-slate-500">Sites and spaces are added in Practice Admin.</p>
                )}
              </div>

              <div className="sm:col-span-2 rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-3 text-xs text-cyan-100">
                Product identity is name + strength + form. Barcode, batch and expiry are receipt details and may change each order.
              </div>

              <div>
                <label className="text-xs text-slate-400">Batch number</label>
                <Input className="mt-1" value={form.batch_number} onChange={(e) => setForm((p) => ({ ...p, batch_number: e.target.value }))} />
              </div>

              <div>
                <label className="text-xs text-slate-400">Expiry date</label>
                <Input className="mt-1" type="date" value={form.expiry_date} onChange={(e) => setForm((p) => ({ ...p, expiry_date: e.target.value }))} />
              </div>

              <div>
                <label className="text-xs text-slate-400">Current stock</label>
                <Input className="mt-1" type="number" value={form.current_stock} onChange={(e) => setForm((p) => ({ ...p, current_stock: e.target.value }))} />
              </div>

              <div>
                <label className="text-xs text-slate-400">Min stock</label>
                <Input className="mt-1" type="number" value={form.min_stock} onChange={(e) => setForm((p) => ({ ...p, min_stock: e.target.value }))} />
              </div>

              <div>
                <label className="text-xs text-slate-400">Max stock</label>
                <Input className="mt-1" type="number" value={form.max_stock} onChange={(e) => setForm((p) => ({ ...p, max_stock: e.target.value }))} />
              </div>

              <div>
                <label className="text-xs text-slate-400">Unit</label>
                <Input className="mt-1" value={form.unit} onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))} />
              </div>

              <div>
                <label className="text-xs text-slate-400">Units per box</label>
                <Input
                  className="mt-1"
                  type="number"
                  min={0}
                  value={form.units_per_box}
                  onChange={(e) => setForm((p) => ({ ...p, units_per_box: e.target.value }))}
                  placeholder="Optional, e.g. 100"
                />
              </div>
            </>
          )}

          {error && (
            <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-200 sm:col-span-2">{error}</p>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-800/80 bg-slate-900/95 px-4 py-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {addedSomething ? "Done" : "Cancel"}
          </Button>
          {receiving ? (
            <Button className="gap-2" type="submit" form="receive-form" disabled={busy || !(Math.floor(Number(recv.qty)) > 0)}>
              <PackagePlus className="h-4 w-4" />
              {busy ? "Receiving…" : `Receive ${Math.floor(Number(recv.qty)) > 0 ? Math.floor(Number(recv.qty)) : ""}`.trim()}
            </Button>
          ) : (
            <Button className="gap-2" disabled={!canSave} onClick={submitCreate}>
              <Save className="h-4 w-4" />
              {busy ? "Adding…" : "Create"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
