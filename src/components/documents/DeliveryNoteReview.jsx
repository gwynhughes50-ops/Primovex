import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { AlertTriangle, CheckCircle2, Loader2, PackageCheck, Search } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { isSafeSyntheticMode } from "@/config/platformMode";
import useStock from "@/hooks/useStock";
import { itemLabel } from "@/ai/stock/stockAsk";
import { bookDelivery, useDeliveryContext } from "@/modules/documents/deliveryService";
import { buildDeliveryReview, lineProblem, stockQuantity, toBook, tracksExpiry, ukDay } from "@/modules/documents/deliveryNote";

// Check a delivery note and book it into stock. Every row the reader found is shown with the words it came from; the person fixes anything wrong, leaves unticked what they do not want booked, ticks that
// they have checked the note, and only then is anything added to stock. A row is ticked for you only when the product is certain and the quantity is confirmed (see modules/documents/deliveryNote.js).
// Written with the theme's own colours so it reads the same on the desktop and on a phone.

const CARD = "rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-3 text-[var(--medtrak-text)]";
const FIELD = "mt-1 w-full rounded-lg border border-[var(--medtrak-border)] bg-transparent px-2.5 py-2 text-sm text-[var(--medtrak-text)] [&>option]:text-slate-900";
const BTN = "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[var(--medtrak-border)] px-3 text-sm font-semibold hover:bg-[color:color-mix(in_srgb,var(--medtrak-accent)_10%,transparent)] disabled:opacity-40";
const PRIMARY = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--medtrak-accent)] px-5 text-sm font-bold text-white disabled:opacity-40";
const HOW = {
  order: ["On the order", "bg-emerald-500/15 text-emerald-700"],
  code: ["Matched by its code", "bg-emerald-500/15 text-emerald-700"],
  barcode: ["Matched by its barcode", "bg-emerald-500/15 text-emerald-700"],
  name: ["Matched by its name: check it", "bg-amber-500/15 text-amber-700"],
  choose: ["Choose the item", "bg-amber-500/15 text-amber-700"],
  none: ["Not in your stock list", "bg-rose-500/15 text-rose-700"],
};

// find a stock item by typing part of its name, code or barcode
function ItemPicker({ items, onPick, label = "Find the stock item" }) {
  const [term, setTerm] = useState("");
  const found = useMemo(() => {
    const words = term.toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
    if (!words.length) return [];
    return items.filter((i) => !i.archived_at).filter((i) => { const hay = `${itemLabel(i)} ${i.brand || ""} ${i.barcode || ""} ${i.supplier_sku || ""}`.toLowerCase(); return words.every((w) => hay.includes(w)); }).slice(0, 8);
  }, [items, term]);
  return (
    <div className="mt-2">
      <label className="relative block"><Search className="pointer-events-none absolute left-2.5 top-3 h-4 w-4 text-[var(--medtrak-muted)]" aria-hidden="true" /><input className={`${FIELD} pl-8`} value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Type part of the name" aria-label={label} /></label>
      {found.length > 0 && <ul className="mt-1 divide-y divide-[var(--medtrak-border)] rounded-lg border border-[var(--medtrak-border)] text-sm">{found.map((i) => <li key={i.id}><button type="button" className="block w-full px-3 py-2 text-left hover:bg-[color:color-mix(in_srgb,var(--medtrak-accent)_10%,transparent)]" onClick={() => { onPick(i.id); setTerm(""); }}>{itemLabel(i)}{i.current_stock != null ? <span className="text-xs text-[var(--medtrak-muted)]"> · {i.current_stock} in stock</span> : null}</button></li>)}</ul>}
      {term.trim().length >= 2 && !found.length && <p className="mt-1 text-xs text-[var(--medtrak-muted)]">Nothing in your stock list matches. Add the product to stock first, then read the note again.</p>}
    </div>
  );
}

export default function DeliveryNoteReview({ result, pdf = null, phone = false, onCancel, onAnother }) {
  const { user, displayName } = useAuth();
  const actor = useMemo(() => ({ uid: user?.uid || "", displayName: displayName || user?.email || "" }), [user, displayName]);
  const { allItems } = useStock();
  const items = allItems || [];
  const { orders, deliveries } = useDeliveryContext(true);
  const [suppliers, setSuppliers] = useState([]);
  const [chosenOrderId, setChosenOrderId] = useState("");
  const [edits, setEdits] = useState({});
  const [pickFor, setPickFor] = useState(-1);
  const [ack, setAck] = useState(false);
  const [ackRepeat, setAckRepeat] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);
  const demo = isSafeSyntheticMode();

  useEffect(() => {
    if (demo) return undefined;
    return onSnapshot(collection(db, "suppliers"), (snap) => setSuppliers(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setSuppliers([]));
  }, [demo]);

  const base = useMemo(() => buildDeliveryReview(result, { items, suppliers, orders, deliveries, chosenOrderId }), [result, items, suppliers, orders, deliveries, chosenOrderId]);
  const lines = useMemo(() => base.lines.map((l) => {
    const e = edits[l.index] || {};
    const itemId = e.itemId ?? l.itemId;
    return { ...l, ...e, itemId, how: e.itemId && e.itemId !== l.itemId ? "picked" : l.how };
  }), [base.lines, edits]);
  const review = useMemo(() => ({ ...base, lines }), [base, lines]);
  const ticked = toBook(review);
  const problems = ticked.map((l) => lineProblem(l)).filter(Boolean);
  const repeatBlocks = Boolean(base.previous) && !ackRepeat;
  const canBook = ticked.length > 0 && problems.length === 0 && ack && !repeatBlocks && !busy;
  const patch = (index, change) => setEdits((cur) => ({ ...cur, [index]: { ...(cur[index] || {}), ...change } }));
  const itemOf = (id) => items.find((i) => i.id === id) || null;
  // choosing the item by hand: the number is worked out again for that item (boxes into units where it counts in units), and the row is ticked, because the person has just decided what it is
  const pickItem = (l, id) => {
    const item = itemOf(id);
    const conv = stockQuantity({ quantity: l.noteQuantity, unit: l.unit }, item);
    patch(l.index, { itemId: id, quantity: l.noteQuantity === null ? l.quantity : conv.qty, converted: conv.converted, conversionNote: conv.note, expiryExpected: tracksExpiry(item), book: l.noteQuantity !== null });
    setPickFor(-1);
  };

  async function book() {
    setBusy(true); setError("");
    try { setDone(await bookDelivery({ review, pdf, actor })); } catch (failure) { setError(failure?.message || "That could not be booked in. Try again."); } finally { setBusy(false); }
  }

  if (done) {
    return (
      <div className={`${CARD} space-y-3`} role="status">
        <p className="flex items-center gap-2 font-bold text-emerald-700"><CheckCircle2 className="h-5 w-5" aria-hidden="true" /> {demo ? "Demo mode: nothing was booked in." : done.words}</p>
        {done.failed.length > 0 && <ul className="list-disc pl-5 text-sm text-rose-700">{done.failed.map((x) => <li key={x.index}>{x.description}: {x.reason}</li>)}</ul>}
        {done.problem && <p className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm font-semibold">{done.problem}</p>}
        {done.after && !done.after.complete && done.after.outstanding.length > 0 && <p className="text-sm text-[var(--medtrak-muted)]">Still to come on the order: {done.after.outstanding.map((o) => `${o.itemName} (${o.outstanding})`).join(", ")}.</p>}
        {done.after?.over?.length > 0 && <p className="text-sm font-semibold text-amber-700">More than ordered: {done.after.over.map((o) => `${o.itemName} (ordered ${o.ordered}, received ${o.received})`).join(", ")}.</p>}
        {done.after?.extras?.length > 0 && <p className="text-sm text-[var(--medtrak-muted)]">Not on the order: {done.after.extras.map((x) => x.description).join(", ")}.</p>}
        <button type="button" className={BTN} onClick={onAnother}>Read another delivery note</button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <section className={CARD} aria-label="The delivery note">
        <p className="flex items-center gap-2 font-bold"><PackageCheck className="h-5 w-5 text-[var(--medtrak-accent)]" aria-hidden="true" /> Delivery note {base.noteNumber || "(no number read)"}</p>
        <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
          <div><dt className="inline text-[var(--medtrak-muted)]">From: </dt><dd className="inline font-semibold">{base.supplierName || "Not read"}</dd>{base.supplierRead ? <span className="ml-1 text-xs text-[var(--medtrak-muted)]">{base.supplier ? "(on your supplier list)" : "(not on your supplier list)"}</span> : null}</div>
          <div><dt className="inline text-[var(--medtrak-muted)]">Date: </dt><dd className="inline font-semibold">{base.deliveryDate ? ukDay(base.deliveryDate) : "Not read"}</dd></div>
          <div className="sm:col-span-2"><dt className="inline text-[var(--medtrak-muted)]">Order number on the note: </dt><dd className="inline font-semibold">{base.orderReference || "None"}</dd></div>
        </dl>
        <div className="mt-3">
          <label className="block text-xs font-bold">Purchase order this is for
            <select className={FIELD} value={base.order?.id || (base.orders.length > 1 ? "" : "none")} onChange={(e) => setChosenOrderId(e.target.value)}>
              {!base.order && base.orders.length > 1 && <option value="">Choose the order…</option>}
              {base.orders.map((o) => <option key={o.id} value={o.id}>{o.po_number || o.id} · {o.supplier_name || "supplier"} · {o.status === "part_delivered" ? "part delivered" : "awaiting delivery"}</option>)}
              {base.order && !base.orders.some((o) => o.id === base.order.id) && <option value={base.order.id}>{base.order.po_number || base.order.id}</option>}
              <option value="none">No order: just add it to stock</option>
            </select>
          </label>
          <p className="mt-1 text-xs text-[var(--medtrak-muted)]">{base.orderStatus === "exact" ? "Found by the order number on the note." : base.orderStatus === "likely" ? "The only open order for this supplier: check it is the right one." : base.orderStatus === "chosen" ? "The order you chose." : base.orderStatus === "choose" ? "More than one order fits: choose the right one." : "No open order was found. The stock can still be added."}</p>
        </div>
      </section>

      {base.previous && (
        <section className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-3 text-sm" role="alert">
          <p className="flex items-center gap-2 font-bold text-rose-700"><AlertTriangle className="h-4 w-4" aria-hidden="true" /> This delivery note has already been booked in{base.previous.created_by?.displayName ? ` by ${base.previous.created_by.displayName}` : ""}.</p>
          <p className="mt-1">Booking it again would count the same stock twice. Nothing is ticked for you.</p>
          <label className="mt-2 flex items-center gap-2 font-semibold"><input type="checkbox" checked={ackRepeat} onChange={(e) => setAckRepeat(e.target.checked)} className="h-4 w-4" /> I know it was booked in before, and this is a different delivery</label>
        </section>
      )}

      {base.warnings.map((w) => <p key={w} className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-2.5 text-sm">{w}</p>)}

      <ul className="space-y-2" aria-label="Rows on the delivery note">
        {lines.map((l) => {
          const item = itemOf(l.itemId);
          const [howText, howTone] = HOW[l.how] || (l.how === "picked" ? ["Chosen by you", "bg-sky-500/15 text-sky-700"] : HOW.none);
          const poLine = base.order && l.orderLineIndex >= 0 ? base.order.items?.[l.orderLineIndex] : null;
          const problem = l.book ? lineProblem(l) : "";
          return (
            <li key={l.index} className={`${CARD} ${l.book ? "ring-1 ring-[var(--medtrak-accent)]" : ""}`}>
              <div className="flex items-start gap-3">
                <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={l.book} onChange={(e) => patch(l.index, { book: e.target.checked })} aria-label={`Book in ${l.description}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2"><p className="font-semibold">{l.description}{l.code ? <span className="font-normal text-[var(--medtrak-muted)]"> · {l.code}</span> : null}</p><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${howTone}`}>{howText}</span></div>
                  {l.evidence ? <p className="mt-0.5 break-words font-mono text-[11px] text-[var(--medtrak-muted)]">On the note: {l.evidence}</p> : <p className="mt-0.5 text-xs text-amber-700">This row could not be found word for word on the page: check it against the note.</p>}

                  <div className="mt-2 text-sm">
                    {item ? <p><span className="text-[var(--medtrak-muted)]">Goes to: </span><span className="font-semibold">{itemLabel(item)}</span> <button type="button" className="text-xs font-semibold underline" onClick={() => setPickFor(pickFor === l.index ? -1 : l.index)}>Change</button></p> : <p className="font-semibold text-rose-700">No stock item chosen yet.</p>}
                    {!item && l.candidates?.length > 0 && <div className="mt-1 flex flex-wrap gap-1.5">{l.candidates.map((c) => <button key={c.id} type="button" className={BTN} onClick={() => pickItem(l, c.id)}>{itemLabel(c)}</button>)}</div>}
                    {(!item || pickFor === l.index) && <ItemPicker items={items} onPick={(id) => pickItem(l, id)} />}
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <label className="text-xs font-bold">How many arrived
                      <input className={FIELD} type="number" inputMode="decimal" min="0" step="any" value={l.quantity} onChange={(e) => patch(l.index, { quantity: e.target.value })} />
                    </label>
                    <label className="text-xs font-bold">Batch
                      <input className={FIELD} value={l.batch} maxLength={40} onChange={(e) => patch(l.index, { batch: e.target.value })} placeholder="None" />
                    </label>
                    <label className="col-span-2 text-xs font-bold sm:col-span-2">Expiry date
                      <input className={FIELD} type="date" value={l.expiry} onChange={(e) => patch(l.index, { expiry: e.target.value })} />
                    </label>
                  </div>
                  <div className="mt-1 space-y-0.5 text-xs text-[var(--medtrak-muted)]">
                    {l.noteQuantity !== null && <p>The note says {l.noteQuantity}{l.unit ? ` ${l.unit}` : ""}{l.verified?.quantity ? "" : ". The number could not be confirmed on the page: check it."}</p>}
                    {l.converted && <p className="font-semibold text-amber-700">Worked out for stock: {l.conversionNote}. Change it if your stock counts it differently.</p>}
                    {l.expiryExpected && !l.expiry && <p className="font-semibold text-amber-700">This product normally has an expiry date and the note gave none: add it if it is on the pack.</p>}
                    {poLine && <p>Ordered {poLine.approved_qty ?? poLine.requested_qty}, received so far {poLine.received_qty || 0}.</p>}
                    {base.order && !poLine && l.itemId && <p>Not on the purchase order.</p>}
                  </div>
                  {problem && <p className="mt-1 text-sm font-semibold text-rose-700" role="alert">{problem}</p>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {!lines.length && <p className={CARD}>No product rows were found on this note.</p>}

      <section className={`${CARD} space-y-2`}>
        <label className="flex items-start gap-2 text-sm font-semibold"><input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I have checked these rows against the delivery note</label>
        {error && <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-2.5 text-sm font-semibold text-rose-700" role="alert">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={PRIMARY} disabled={!canBook} onClick={book}>{busy ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Booking in…</> : `Book ${ticked.length} product${ticked.length === 1 ? "" : "s"} into stock`}</button>
          <button type="button" className={BTN} onClick={onCancel} disabled={busy}>Cancel</button>
        </div>
        {!canBook && !busy && <p className="text-xs text-[var(--medtrak-muted)]">{!ticked.length ? "Tick the rows to book in." : problems.length ? "Fix the rows marked in red." : repeatBlocks ? "Say this is a different delivery, above." : "Tick that you have checked the rows."}</p>}
        {demo && <p className="text-xs font-semibold text-amber-700">Demo mode: nothing is saved or added to stock.</p>}
      </section>
    </div>
  );
}
