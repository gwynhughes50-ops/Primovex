import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { AlertTriangle, CheckCircle2, ClipboardList, Plus, Printer, RotateCcw, X } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { ROLE_TEMPLATES } from "@/core/identity/capabilities";
import useStock from "@/hooks/useStock";
import { printHtmlDocument } from "@/lib/printHtmlDocument";
import { PLACE_STATUS, TAKE_STATUS, buildPlaces, reviewLines, reviewTotals, takeProgress, validateTake } from "@/modules/stocktake/stockTake";
import { stockTakeReportHtml } from "@/modules/stocktake/stockTakeReport";
import {
  applyReviewedLines, cancelTake, closeTake, createItemFromAddition, createStockTake, dismissAddition, reopenTake, resetPlace, sendForReview, useStockTake, useStockTakes,
} from "@/modules/stocktake/stockTakeService";

// Stock take (Inventory > Stock take): request a physical count for the team (they do it on their phones), watch
// it fill in, then review the differences and apply them. Nothing changes a stock figure until it is applied here.

const FIELD = "mt-1 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-300/60";
const LABEL = "block text-xs font-semibold uppercase tracking-wide text-slate-400";
const BTN = "inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm font-semibold text-slate-100 disabled:opacity-40";
const PRIMARY = "inline-flex items-center gap-1.5 rounded-lg bg-teal-500/90 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40";

const STATUS_LABEL = { open: "Counting", review: "Ready to review", closed: "Finished", cancelled: "Cancelled" };
const STATUS_STYLE = { open: "border-teal-300/40 bg-teal-500/10 text-teal-200", review: "border-amber-400/40 bg-amber-500/10 text-amber-200", closed: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200", cancelled: "border-white/15 bg-white/5 text-slate-400" };
const KIND_LABEL = { difference: "Difference", unexpected: "Found, not recorded here", "not-counted": "Not counted", match: "Matched" };
const ukDate = (key) => (key ? key.split("-").reverse().join("/") : "");

function NewTake({ items, onCancel, onCreated }) {
  const { user, role } = useAuth();
  const creator = { uid: user?.uid || "", name: user?.displayName || user?.email || "Unknown" };
  const places = useMemo(() => buildPlaces(items), [items]);
  const [customRoles, setCustomRoles] = useState([]);
  useEffect(() => onSnapshot(collection(db, "roles"), (snap) => setCustomRoles(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setCustomRoles([])), []);
  // only roles that can take part are worth asking
  const roleChoices = useMemo(() => {
    const builtIn = Object.entries(ROLE_TEMPLATES).filter(([, caps]) => caps.includes("stocktake.count")).map(([name]) => name);
    const custom = customRoles.filter((r) => r.active !== false && (r.capabilities || []).includes("stocktake.count")).map((r) => r.name || r.id);
    return [...new Set([...builtIn, ...custom])];
  }, [customRoles]);
  const [title, setTitle] = useState(`Stock take, ${new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })}`);
  const [note, setNote] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [chosen, setChosen] = useState(() => places.map((p) => p.key));
  const [who, setWho] = useState("everyone");
  const [pickedRoles, setPickedRoles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const toggle = (list, setList, key) => setList(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);
  const picked = places.filter((p) => chosen.includes(p.key));

  async function submit() {
    const problems = validateTake({ title, places: picked, dueDate });
    if (problems.length) { setError(problems[0]); return; }
    if (who === "roles" && !pickedRoles.length) { setError("Choose which roles you are asking, or ask everyone."); return; }
    setBusy(true); setError("");
    try {
      const id = await createStockTake({ title, note, dueDate, places: picked, audience: who === "roles" ? { type: "roles", roles: pickedRoles } : { type: "everyone" }, mode: "requested", creator });
      onCreated(id);
    } catch (problem) { setError(problem?.message || "Could not start the stock take. Check you have permission."); } finally { setBusy(false); }
  }

  return (
    <section className="rounded-2xl border border-teal-300/30 bg-slate-900/80 p-4 shadow-lg">
      <div className="flex items-start justify-between"><h2 className="text-lg font-semibold text-slate-100">Request a stock take</h2><button type="button" onClick={onCancel} className="text-slate-400 hover:text-slate-200" aria-label="Close"><X className="h-5 w-5" /></button></div>
      <p className="mt-1 text-sm text-slate-400">The team count on their phones. They claim a room or cupboard, scan or search for each item and enter how many are there. They don't see what the system expects. You review the differences before any stock figure changes. (You are {role}.)</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className={`${LABEL} sm:col-span-2`}>Name<input className={FIELD} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className={LABEL}>Finish by<input type="date" className={FIELD} value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>
        <label className={`${LABEL} sm:col-span-3`}>Message to the team (optional)<input className={FIELD} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Please don't use stock from your room until it has been counted" /></label>
      </div>

      <fieldset className="mt-4">
        <legend className={LABEL}>Who is asked</legend>
        <div className="mt-1 flex flex-wrap gap-3 text-sm text-slate-200">
          <label className="flex items-center gap-2"><input type="radio" checked={who === "everyone"} onChange={() => setWho("everyone")} /> Everyone who can take part</label>
          <label className="flex items-center gap-2"><input type="radio" checked={who === "roles"} onChange={() => setWho("roles")} /> Only these roles</label>
        </div>
        {who === "roles" && <div className="mt-2 flex flex-wrap gap-2">{roleChoices.map((name) => <label key={name} className={`flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${pickedRoles.includes(name) ? "border-teal-300/60 bg-teal-500/15 text-teal-100" : "border-white/10 text-slate-300"}`}><input type="checkbox" checked={pickedRoles.includes(name)} onChange={() => toggle(pickedRoles, setPickedRoles, name)} /> {name}</label>)}</div>}
      </fieldset>

      <fieldset className="mt-4">
        <legend className={LABEL}>Places to count ({picked.length} of {places.length})</legend>
        <div className="mt-1 flex gap-2"><button type="button" className={BTN} onClick={() => setChosen(places.map((p) => p.key))}>All</button><button type="button" className={BTN} onClick={() => setChosen([])}>None</button></div>
        <div className="mt-2 grid max-h-72 gap-1 overflow-y-auto sm:grid-cols-2">
          {places.map((p) => (
            <label key={p.key} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-slate-200 hover:bg-white/5">
              <input type="checkbox" checked={chosen.includes(p.key)} onChange={() => toggle(chosen, setChosen, p.key)} />
              <span className="min-w-0 flex-1 truncate">{p.name}</span><span className="shrink-0 text-xs text-slate-500">{p.itemCount} item{p.itemCount === 1 ? "" : "s"}</span>
            </label>
          ))}
          {places.length === 0 && <p className="text-sm text-slate-400">No stock is recorded yet, so there is nothing to count.</p>}
        </div>
      </fieldset>
      {error && <p className="mt-3 text-sm text-rose-300" role="alert">{error}</p>}
      <div className="mt-4 flex gap-2"><button type="button" onClick={submit} disabled={busy} className={PRIMARY}>{busy ? "Starting…" : "Start the stock take"}</button><button type="button" onClick={onCancel} className={BTN}>Cancel</button></div>
    </section>
  );
}

function TakeDetail({ takeId, items }) {
  const { user } = useAuth();
  const actor = { uid: user?.uid || "", displayName: user?.displayName || user?.email || "Unknown", name: user?.displayName || user?.email || "Unknown" };
  const { take, places, counts, additions } = useStockTake(takeId);
  const [selected, setSelected] = useState([]);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const lines = useMemo(() => reviewLines({ places, counts, items }), [places, counts, items]);
  const totals = reviewTotals(lines);
  const applicable = lines.filter((l) => l.applicable);
  const chosen = applicable.filter((l) => selected.includes(l.id));
  const progress = takeProgress(places);

  if (take === undefined) return <p className="text-sm text-slate-400">Opening…</p>;
  if (take === null) return <p className="text-sm text-slate-400">That stock take isn't there any more.</p>;

  const run = async (work, done) => {
    setBusy(true); setError(""); setMessage("");
    try { await work(); if (done) setMessage(done); } catch (problem) { setError(problem?.message || "That didn't work. Check you have permission."); } finally { setBusy(false); setConfirming(false); }
  };
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const apply = () => run(async () => {
    const result = await applyReviewedLines(take, chosen, actor);
    setSelected((s) => s.filter((id) => !result.done.some((l) => l.id === id)));
    if (result.failed.length) throw new Error(`${result.done.length} applied. ${result.failed.length} could not be: ${result.failed.map((f) => `${f.line.itemLabel} (${f.message})`).join("; ")}`);
  }, `Applied ${chosen.length} change${chosen.length === 1 ? "" : "s"} to stock.`);
  const print = () => printHtmlDocument(stockTakeReportHtml({ take, places, lines, additions, totals, printedBy: actor.name }));
  const open = take.status === TAKE_STATUS.open;
  const review = take.status === TAKE_STATUS.review;
  const live = open || review;
  const newAdditions = additions.filter((a) => a.status === "new");

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-lg font-semibold text-slate-100">{take.title}</h2><p className="text-sm text-slate-400">Requested by {take.createdByName}{take.dueDate ? ` · finish by ${ukDate(take.dueDate)}` : ""}{take.audience?.type === "roles" ? ` · asked: ${take.audience.roles.join(", ")}` : take.mode === "self" ? " · started by the counter" : " · asked: everyone"}</p>{take.note && <p className="mt-1 text-sm text-slate-300">{take.note}</p>}</div>
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_STYLE[take.status]}`}>{STATUS_LABEL[take.status]}</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-teal-400" style={{ width: `${progress.percent}%` }} /></div>
        <p className="mt-1 text-xs text-slate-400">{progress.done} of {progress.total} places done · {progress.counting} being counted · {progress.free} not started</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {open && <button type="button" disabled={busy} onClick={() => run(() => sendForReview(take.id), "Moved to review. Places can't be claimed any more.")} className={BTN}>Stop counting and review</button>}
          {review && <button type="button" disabled={busy} onClick={() => run(() => reopenTake(take.id), "Reopened for counting.")} className={BTN}><RotateCcw className="h-4 w-4" aria-hidden="true" /> Reopen for counting</button>}
          {review && <button type="button" disabled={busy} onClick={() => run(() => closeTake(take.id, actor.name), "Stock take finished.")} className={PRIMARY}>Finish the stock take</button>}
          {live && <button type="button" disabled={busy} onClick={() => run(() => cancelTake(take.id, actor.name), "Cancelled. Nothing was changed.")} className={BTN}>Cancel it</button>}
          <button type="button" onClick={print} className={BTN}><Printer className="h-4 w-4" aria-hidden="true" /> Print results</button>
        </div>
        {message && <p className="mt-2 flex items-center gap-1 text-sm text-emerald-300" role="status"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> {message}</p>}
        {error && <p className="mt-2 text-sm text-rose-300" role="alert">{error}</p>}
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
        <h3 className="font-semibold text-slate-100">Places</h3>
        <ul className="mt-2 divide-y divide-white/5 text-sm">
          {places.map((place) => (
            <li key={place.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
              <span className="text-slate-200">{place.name}</span>
              <span className="flex items-center gap-2 text-slate-400">
                {place.status === PLACE_STATUS.done ? `Done by ${place.claimedByName || "?"}` : place.status === PLACE_STATUS.claimed ? `Being counted by ${place.claimedByName}` : "Not started"}
                {place.status === PLACE_STATUS.claimed && live && <button type="button" className="text-xs font-semibold text-teal-300 underline" onClick={() => run(() => resetPlace(take.id, place.id), "Place freed for someone else to take.")}>Free it up</button>}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h3 className="font-semibold text-slate-100">Differences to review</h3><p className="text-sm text-slate-400">{totals.differences} differ · {totals.unexpected} found where not recorded · {totals.notCounted} not counted · {totals.matched} matched · {totals.applied} applied. Only finished places can be applied.</p></div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={BTN} onClick={() => setSelected(applicable.filter((l) => l.kind === "difference").map((l) => l.id))}>Select differences</button>
            <button type="button" className={BTN} onClick={() => setSelected([])}>Clear</button>
          </div>
        </div>
        {lines.filter((l) => l.kind !== "match").length === 0 ? <p className="mt-3 text-sm text-slate-400">{counts.length ? "Everything counted so far matches the records." : "Nothing has been counted yet."}</p> : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-400"><tr><th className="py-1 pr-2" /><th className="py-1 pr-3">Place</th><th className="py-1 pr-3">Item</th><th className="py-1 pr-3 text-right">Counted</th><th className="py-1 pr-3 text-right">Recorded now</th><th className="py-1 pr-3 text-right">Change</th><th className="py-1 pr-3">Result</th><th className="py-1">By</th></tr></thead>
              <tbody className="divide-y divide-white/5 text-slate-200">
                {lines.filter((l) => l.kind !== "match").map((l) => (
                  <tr key={l.id} className={l.applied ? "opacity-50" : ""}>
                    <td className="py-1.5 pr-2">{l.applied ? <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-label="Applied" /> : <input type="checkbox" disabled={!l.applicable} checked={selected.includes(l.id)} onChange={() => toggle(l.id)} aria-label={`Select ${l.itemLabel}`} />}</td>
                    <td className="py-1.5 pr-3">{l.placeName}</td><td className="py-1.5 pr-3">{l.itemLabel}</td>
                    <td className="py-1.5 pr-3 text-right font-semibold">{l.counted === null ? "-" : l.counted}</td><td className="py-1.5 pr-3 text-right">{l.current}</td>
                    <td className={`py-1.5 pr-3 text-right font-semibold ${l.change < 0 ? "text-rose-300" : "text-emerald-300"}`}>{l.kind === "unexpected" ? "" : l.change > 0 ? `+${l.change}` : l.change}</td>
                    <td className="py-1.5 pr-3">{l.big && <AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-amber-300" aria-label="Large difference" />}{KIND_LABEL[l.kind]}{l.kind === "unexpected" && !l.applicable && !l.applied ? " (move it in Inventory)" : ""}{l.kind === "not-counted" && !l.applied ? " (apply only if it isn't there)" : ""}</td>
                    <td className="py-1.5 text-slate-400">{l.countedByName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!confirming
            ? <button type="button" disabled={!chosen.length || busy} onClick={() => setConfirming(true)} className={PRIMARY}>Apply {chosen.length} selected change{chosen.length === 1 ? "" : "s"} to stock</button>
            : <><span className="text-sm text-amber-200">This changes the recorded stock for {chosen.length} item{chosen.length === 1 ? "" : "s"} and is logged. Continue?</span><button type="button" disabled={busy} onClick={apply} className={PRIMARY}>{busy ? "Applying…" : "Yes, apply"}</button><button type="button" className={BTN} onClick={() => setConfirming(false)}>No</button></>}
        </div>
      </section>

      {additions.length > 0 && (
        <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
          <h3 className="font-semibold text-slate-100">Items found that aren't in the system ({newAdditions.length} waiting)</h3>
          <ul className="mt-2 divide-y divide-white/5 text-sm">
            {additions.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-slate-200"><strong>{a.name}</strong> × {a.quantity} in {a.placeName}{a.barcode ? ` · barcode ${a.barcode}` : ""}{a.expiryDate ? ` · expires ${ukDate(a.expiryDate)}` : ""}{a.note ? ` · ${a.note}` : ""} <span className="text-slate-500">found by {a.addedByName}</span></span>
                {a.status === "new"
                  ? <span className="flex gap-2"><button type="button" disabled={busy} className={BTN} onClick={() => run(() => createItemFromAddition(take, a, actor), `${a.name} added to stock. Complete its details in Inventory.`)}>Add to stock</button><button type="button" disabled={busy} className={BTN} onClick={() => run(() => dismissAddition(take.id, a.id, actor.name), "Dismissed.")}>Dismiss</button></span>
                  : <span className="text-slate-400">{a.status === "created" ? "Added to stock" : "Dismissed"}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default function StockTake() {
  const { can } = useAuth();
  const { allItems = [] } = useStock({ includeArchived: false });
  const { list, error } = useStockTakes(true);
  const [selectedId, setSelectedId] = useState("");
  const [creating, setCreating] = useState(false);
  const canManage = can("stocktake.manage");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-100"><ClipboardList className="h-6 w-6 text-teal-300" aria-hidden="true" /> Stock take</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">A physical count by the team on their phones. {canManage ? "Request one, watch it fill in, then review the differences and apply them. Nothing changes stock until you do." : "You can see how a stock take is going; the Practice Manager reviews and applies it."}</p>
        </div>
        {canManage && <button type="button" onClick={() => { setCreating(true); setSelectedId(""); }} className={PRIMARY}><Plus className="h-4 w-4" aria-hidden="true" /> Request a stock take</button>}
      </div>
      {error && <p className="text-sm text-rose-300" role="alert">{error}</p>}
      {creating && canManage && <NewTake items={allItems} onCancel={() => setCreating(false)} onCreated={(id) => { setCreating(false); setSelectedId(id); }} />}
      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <aside className="space-y-2">
          {list === null ? <p className="text-sm text-slate-400">Loading…</p> : list.length === 0 ? <p className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-slate-400">No stock takes yet.</p> : list.map((t) => (
            <button key={t.id} type="button" onClick={() => { setSelectedId(t.id); setCreating(false); }} className={`w-full rounded-xl border p-3 text-left ${selectedId === t.id ? "border-teal-300/60 bg-teal-500/10" : "border-white/10 bg-slate-900/60 hover:bg-white/5"}`}>
              <span className="block font-semibold text-slate-100">{t.title}</span>
              <span className="mt-1 flex items-center justify-between text-xs text-slate-400"><span>{t.createdByName}{t.dueDate ? ` · ${ukDate(t.dueDate)}` : ""}</span><span className={`rounded-full border px-2 py-0.5 font-semibold ${STATUS_STYLE[t.status]}`}>{STATUS_LABEL[t.status]}</span></span>
            </button>
          ))}
        </aside>
        <div>{selectedId ? <TakeDetail key={selectedId} takeId={selectedId} items={allItems} /> : !creating && <p className="text-sm text-slate-400">Choose a stock take to see how it is going.</p>}</div>
      </div>
    </div>
  );
}
