import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Minus, PackagePlus, Plus, ScanLine, Search, X } from "lucide-react";
import MobileBarcodeScanner from "@/components/ui/MobileBarcodeScanner";
import { findStockItemByBarcode } from "@/services/stockService";
import { addAddition, finishPlace, releasePlace, removeCount, saveCount } from "@/modules/stocktake/stockTakeService";
import { buildAddition, buildCount, expectedAt, itemLabel, itemsForPlace, uncounted, validateAddition } from "@/modules/stocktake/stockTake";
import MedicineNameField from "@/components/stock/MedicineNameField";
import { STOCK_CATEGORIES, UNCATEGORISED_CATEGORY, getSubcategories } from "@/data/stockCategories";
import { buildFormOptions, matchOption } from "@/lib/stockPickerOptions";

// Counting one place on the phone. The list shows what the place should hold by name only: the figure the system
// expects is never shown, so people count what is really there. Scan a barcode or search by name, enter the number,
// and anything not in the system can be added by hand for the manager to deal with.

const SCAN_ATTR = "data-stocktake-scan-button";
const FIELD = "min-h-12 w-full rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 text-base";

function Sheet({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[145] flex items-end bg-black/55">
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-[2rem] border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-xl font-bold leading-tight">{title}</h2>
          <button type="button" onClick={onClose} className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[var(--medtrak-border)]" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CountSheet({ item, place, existing, onSave, onRemove, onClose, onAddHere, busy, error }) {
  const [value, setValue] = useState(existing ? String(existing.counted) : "");
  const box = Number(item.units_per_box || 0);
  const number = value === "" ? null : Math.max(0, Math.floor(Number(value)));
  const step = (by) => setValue(String(Math.max(0, (number ?? 0) + by)));
  const listedHere = expectedAt(item, place) > 0;
  return (
    <Sheet title={itemLabel(item)} onClose={onClose}>
      <p className="text-sm text-[var(--medtrak-muted)]">How many are there in {place.name}?</p>
      {!listedHere && (
        <div className="mt-2 rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-900">
          <p className="font-semibold">This product is recorded {[item.site, item.location].filter(Boolean).length ? `in ${[item.site, item.location].filter(Boolean).join(" - ")}` : "somewhere else"}, not in {place.name}.</p>
          <p className="mt-1">If {place.name} holds its own supply, add it here as stock of its own. Otherwise count it as a find and the manager will see it.</p>
          <button type="button" onClick={onAddHere} className="mt-2 min-h-12 w-full rounded-2xl bg-[var(--medtrak-accent)] text-base font-bold text-white">Add it to {place.name}</button>
        </div>
      )}
      <div className="mt-4 grid grid-cols-[4rem_1fr_4rem] gap-2">
        <button type="button" onClick={() => step(-1)} className="grid min-h-16 place-items-center rounded-2xl border border-[var(--medtrak-border)]" aria-label="One fewer"><Minus className="h-6 w-6" /></button>
        <input type="number" inputMode="numeric" min="0" autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="0" aria-label="How many" className="min-h-16 w-full rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] text-center text-3xl font-bold" />
        <button type="button" onClick={() => step(1)} className="grid min-h-16 place-items-center rounded-2xl border border-[var(--medtrak-border)]" aria-label="One more"><Plus className="h-6 w-6" /></button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {box > 1 && <button type="button" onClick={() => step(box)} className="min-h-11 rounded-full border border-[var(--medtrak-accent)] px-4 text-sm font-bold text-[var(--medtrak-accent)]">+ a box ({box})</button>}
        <button type="button" onClick={() => setValue("0")} className="min-h-11 rounded-full border border-[var(--medtrak-border)] px-4 text-sm font-bold">None here (0)</button>
      </div>
      {error && <p className="mt-3 text-sm font-semibold text-rose-700" role="alert">{error}</p>}
      <button type="button" disabled={number === null || busy} onClick={() => onSave(number)} className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--medtrak-accent)] text-base font-bold text-white disabled:opacity-40"><Check className="h-5 w-5" /> {busy ? "Saving…" : "Save count"}</button>
      {existing && <button type="button" disabled={busy} onClick={onRemove} className="mt-2 min-h-11 w-full text-sm font-bold text-rose-700">Remove my count of this</button>}
    </Sheet>
  );
}

// A product not in the system: everything needed to create it as stock. The name comes from the NHS dm+d list or is typed in
// by hand; the site and room are the place being counted. The manager checks it, then it becomes a stock item with the
// number counted.
function AdditionSheet({ place, barcode, prefill = null, items = [], onSave, onClose, onScan, busy, error }) {
  const [form, setForm] = useState({ name: prefill?.name || "", brand: prefill?.brand || "", strength: prefill?.strength || "", form: prefill?.form || "", barcode: barcode || "", category: prefill?.category || "", subcategory: prefill?.subcategory || "", quantity: "1", expiryDate: "", batchNumber: "", note: "" });
  const [problems, setProblems] = useState([]);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  // a barcode scanned while this sheet is open fills the box
  useEffect(() => { if (barcode) set({ barcode }); }, [barcode]);
  const formOptions = useMemo(() => buildFormOptions(items.map((i) => i.form), form.form), [items, form.form]);
  const subcategories = useMemo(() => (form.category ? getSubcategories(form.category) : []), [form.category]);
  const save = () => {
    const found = validateAddition(form);
    setProblems(found);
    if (!found.length) onSave({ ...form, category: form.category || UNCATEGORISED_CATEGORY });
  };
  return (
    <Sheet title="Add an item that isn't in the system" onClose={onClose}>
      <p className="text-sm text-[var(--medtrak-muted)]">Search for it first. Fill in what you can: this goes to the manager, who creates it as a stock item with the number you counted. It does not change any stock figure by itself.</p>
      <p className="mt-2 rounded-xl bg-black/5 px-3 py-2 text-sm"><b>Where:</b> {place.name}</p>
      <div className="mt-3 space-y-3">
        <div className="text-sm font-bold">What is it?
          <MedicineNameField value={form.name} onChange={(name) => set({ name })} onPick={({ name, brand }) => set({ name, brand: brand || form.brand })} className={FIELD} placeholder="Type a name, e.g. adrenaline, or gloves" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-bold">Strength<input className={FIELD} value={form.strength} onChange={(e) => set({ strength: e.target.value })} placeholder="e.g. 500 mg" /></label>
          <label className="block text-sm font-bold">Form
            <select className={FIELD} value={matchOption(formOptions, form.form)} onChange={(e) => set({ form: e.target.value })}>
              <option value="">Choose</option>
              {formOptions.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        </div>
        <label className="block text-sm font-bold">Brand (if any)<input className={FIELD} value={form.brand} onChange={(e) => set({ brand: e.target.value })} /></label>
        <div className="text-sm font-bold">Barcode (if it has one)
          <div className="flex gap-2">
            <input className={FIELD} value={form.barcode} onChange={(e) => set({ barcode: e.target.value })} inputMode="numeric" />
            <button type="button" onClick={onScan} className="grid min-h-12 w-14 shrink-0 place-items-center rounded-2xl border border-[var(--medtrak-border)]" aria-label="Scan the barcode"><ScanLine className="h-5 w-5" /></button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-bold">Category
            <select className={FIELD} value={form.category} onChange={(e) => set({ category: e.target.value, subcategory: "" })}>
              <option value="">Not sure</option>
              {STOCK_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
          <label className="block text-sm font-bold">Subcategory
            <select className={FIELD} value={form.subcategory} disabled={!subcategories.length} onChange={(e) => set({ subcategory: e.target.value })}>
              <option value="">{subcategories.length ? "Choose" : "Pick a category first"}</option>
              {subcategories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
        </div>
        <label className="block text-sm font-bold">How many are there?<input className={FIELD} type="number" inputMode="numeric" min="1" value={form.quantity} onChange={(e) => set({ quantity: e.target.value })} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-bold">Expiry date<input className={FIELD} type="date" value={form.expiryDate} onChange={(e) => set({ expiryDate: e.target.value })} /></label>
          <label className="block text-sm font-bold">Batch number<input className={FIELD} value={form.batchNumber} onChange={(e) => set({ batchNumber: e.target.value })} /></label>
        </div>
        <label className="block text-sm font-bold">Anything the manager should know<input className={FIELD} value={form.note} onChange={(e) => set({ note: e.target.value })} /></label>
      </div>
      {problems.length > 0 && <ul className="mt-3 list-disc rounded-xl border border-rose-400/40 bg-rose-500/10 p-3 pl-7 text-sm font-semibold text-rose-700" role="alert">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
      {error && <p className="mt-3 text-sm font-semibold text-rose-700" role="alert">{error}</p>}
      <button type="button" disabled={busy} onClick={save} className="mt-4 min-h-14 w-full rounded-2xl bg-[var(--medtrak-accent)] text-base font-bold text-white disabled:opacity-40">{busy ? "Sending…" : "Send to the manager"}</button>
    </Sheet>
  );
}

export default function MobileStockTakeCount({ take, place, items, counts, actor, onBack }) {
  const [search, setSearch] = useState("");
  const [sheet, setSheet] = useState(null); // { type: "count", item } | { type: "add", barcode } | { type: "finish" }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const mine = useMemo(() => counts.filter((c) => c.placeId === place.id), [counts, place.id]);
  const listed = useMemo(() => itemsForPlace(items, place), [items, place]);
  const byItem = useMemo(() => new Map(mine.map((c) => [c.itemId, c])), [mine]);
  const left = useMemo(() => uncounted(items, place, mine), [items, place, mine]);
  const extras = mine.filter((c) => !listed.some((i) => i.id === c.itemId));
  const found = useMemo(() => {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return items.filter((i) => !i.archived_at && words.every((w) => `${itemLabel(i)} ${i.barcode || ""}`.toLowerCase().includes(w))).slice(0, 8);
  }, [items, search]);

  const run = async (work, after) => {
    setBusy(true); setError("");
    try { await work(); after?.(); } catch (problem) { setError(problem?.message || "That didn't save. Check your connection and try again."); } finally { setBusy(false); }
  };

  const addScanRef = useRef(false);
  const scanned = async (code) => {
    setError(""); setNotice("");
    if (addScanRef.current) { addScanRef.current = false; setSheet((s) => (s?.type === "add" ? { ...s, barcode: code } : s)); return; }
    try {
      const item = await findStockItemByBarcode(code);
      setSheet({ type: "count", item });
    } catch {
      setSheet({ type: "add", barcode: code });
    }
  };

  const open = (item) => { setSearch(""); setError(""); setNotice(""); setSheet({ type: "count", item }); };
  const saveItem = (item, number) => run(
    () => saveCount(take.id, buildCount({ place, item, counted: number, source: "scan", actor })),
    () => { setNotice(`${itemLabel(item)}: ${number} counted.`); setSheet(null); },
  );
  const finish = () => run(() => finishPlace(take.id, place.id), onBack);

  return (
    <div className="space-y-3">
      <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-[var(--medtrak-accent)]"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Places</button>
      <div>
        <p className="text-xs font-bold uppercase tracking-[.14em] text-[var(--medtrak-muted)]">Counting</p>
        <h2 className="text-2xl font-bold leading-tight">{place.name}</h2>
        <p className="text-sm text-[var(--medtrak-muted)]">{listed.length - left.length} of {listed.length} listed items counted{extras.length ? `, ${extras.length} extra` : ""}. The numbers the system expects are hidden so you count what is really there.</p>
      </div>

      <button type="button" onClick={() => document.querySelector(`[${SCAN_ATTR}]`)?.click()} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--medtrak-accent)] text-base font-bold text-white"><ScanLine className="h-5 w-5" aria-hidden="true" /> Scan a barcode</button>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--medtrak-muted)]" aria-hidden="true" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Or search by name" aria-label="Search for an item" className={`${FIELD} pl-10`} />
      </div>
      {found.length > 0 && (
        <ul className="space-y-1.5 rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-2">
          {found.map((item) => <li key={item.id}><button type="button" onClick={() => open(item)} className="min-h-12 w-full rounded-xl px-3 text-left text-base font-semibold active:bg-[var(--medtrak-bg)]">{itemLabel(item)}</button></li>)}
        </ul>
      )}
      {search && found.length === 0 && <p className="text-sm text-[var(--medtrak-muted)]">Nothing by that name. If it really isn't in the system, use "Add an item that isn't in the system" below.</p>}

      {notice && <p className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-700" role="status">{notice}</p>}
      {error && !sheet && <p className="text-sm font-semibold text-rose-700" role="alert">{error}</p>}

      <section aria-label="Items to count">
        <h3 className="mb-1.5 text-xs font-bold uppercase tracking-[.14em] text-[var(--medtrak-muted)]">Should be here</h3>
        {listed.length === 0 ? <p className="text-sm text-[var(--medtrak-muted)]">Nothing is recorded here yet. Scan each product you find, or use "Add an item" below to enter it.</p> : (
          <ul className="space-y-1.5">
            {listed.map((item) => {
              const c = byItem.get(item.id);
              return (
                <li key={item.id}>
                  <button type="button" onClick={() => open(item)} className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border px-4 text-left ${c ? "border-emerald-400/40 bg-emerald-500/10" : "border-[var(--medtrak-border)] bg-[var(--medtrak-panel)]"}`}>
                    <span className="min-w-0 truncate text-base font-semibold">{itemLabel(item)}</span>
                    <span className={`shrink-0 text-sm font-bold ${c ? "text-emerald-700" : "text-[var(--medtrak-muted)]"}`}>{c ? `${c.counted} counted` : "Not counted"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {extras.length > 0 && (
        <section aria-label="Also found here">
          <h3 className="mb-1.5 text-xs font-bold uppercase tracking-[.14em] text-[var(--medtrak-muted)]">Also found here</h3>
          <ul className="space-y-1.5">
            {extras.map((c) => {
              const item = items.find((i) => i.id === c.itemId);
              return (
                <li key={c.id}>
                  <button type="button" disabled={!item} onClick={() => item && open(item)} className="flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 text-left">
                    <span className="min-w-0 truncate text-base font-semibold">{c.itemLabel}</span><span className="shrink-0 text-sm font-bold text-amber-800">{c.counted} counted</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <button type="button" onClick={() => setSheet({ type: "add", barcode: "" })} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] text-base font-bold"><PackagePlus className="h-5 w-5" aria-hidden="true" /> Add an item that isn't in the system</button>

      <div className="grid grid-cols-2 gap-2 pt-2">
        <button type="button" disabled={busy} onClick={() => run(() => releasePlace(take.id, place.id), onBack)} className="min-h-12 rounded-2xl border border-[var(--medtrak-border)] text-sm font-bold disabled:opacity-40">Give this place back</button>
        <button type="button" disabled={busy} onClick={() => (left.length ? setSheet({ type: "finish" }) : finish())} className="min-h-12 rounded-2xl bg-[var(--medtrak-accent)] text-sm font-bold text-white disabled:opacity-40">Finish this place</button>
      </div>

      {sheet?.type === "count" && (
        <CountSheet item={sheet.item} place={place} existing={byItem.get(sheet.item.id)} busy={busy} error={error}
          onAddHere={() => { const it = sheet.item; setError(""); setSheet({ type: "add", barcode: it.barcode || "", prefill: { name: it.name, brand: it.brand, strength: it.strength, form: it.form, category: it.category, subcategory: it.subcategory } }); }}
          onClose={() => { setSheet(null); setError(""); }} onSave={(number) => saveItem(sheet.item, number)}
          onRemove={() => run(() => removeCount(take.id, byItem.get(sheet.item.id).id), () => setSheet(null))} />
      )}
      {sheet?.type === "add" && (
        <AdditionSheet place={place} barcode={sheet.barcode} prefill={sheet.prefill} items={items} onScan={() => { addScanRef.current = true; document.querySelector(`[${SCAN_ATTR}]`)?.click(); }} busy={busy} error={error} onClose={() => { setSheet(null); setError(""); }}
          onSave={(form) => run(() => addAddition(take.id, buildAddition({ place, ...form, actor })), () => { setNotice(`${form.name} sent to the manager.`); setSheet(null); })} />
      )}
      {sheet?.type === "finish" && (
        <Sheet title="Some items aren't counted" onClose={() => setSheet(null)}>
          <p className="text-sm">{left.length} item{left.length === 1 ? "" : "s"} on the list for {place.name} {left.length === 1 ? "has" : "have"} not been counted:</p>
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm font-semibold">{left.slice(0, 8).map((i) => <li key={i.id}>{itemLabel(i)}</li>)}{left.length > 8 && <li>and {left.length - 8} more</li>}</ul>
          <p className="mt-2 text-sm text-[var(--medtrak-muted)]">If they aren't here, go back and count them as 0. If you finish now they go to the manager as "not counted".</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setSheet(null)} className="min-h-12 rounded-2xl border border-[var(--medtrak-border)] font-bold">Go back</button>
            <button type="button" disabled={busy} onClick={finish} className="min-h-12 rounded-2xl bg-[var(--medtrak-accent)] font-bold text-white disabled:opacity-40">Finish anyway</button>
          </div>
        </Sheet>
      )}

      <MobileBarcodeScanner onScan={scanned} triggerAttribute={SCAN_ATTR} title={`Scan in ${place.name}`} helper="Point the camera at the product barcode. You can type it in if it won't scan." />
    </div>
  );
}
