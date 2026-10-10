import { useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, ClipboardList, Lock, Plus, Search } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import useStock from "@/hooks/useStock";
import { claimPlace, createStockTake, reopenPlace, sendForReview, useStockTake, useStockTakes } from "@/modules/stocktake/stockTakeService";
import { PLACE_STATUS, TAKE_STATUS, buildPlaces, isAskedOf, placeAction, takeProgress } from "@/modules/stocktake/stockTake";
import MobileStockTakeCount from "./MobileStockTakeCount";

// Stock take on the phone: see the stock takes you are asked to help with, claim a room or cupboard, count it, and
// start one of your own. A manager requests and reviews on the desktop (Inventory > Stock take).

const FIELD = "min-h-12 w-full rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 text-base";

const dueText = (take) => (take.dueDate ? `Due ${take.dueDate.split("-").reverse().join("/")}` : "");

function Progress({ places }) {
  const p = takeProgress(places);
  return (
    <div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--medtrak-border)]"><div className="h-full rounded-full bg-[var(--medtrak-accent)]" style={{ width: `${p.percent}%` }} /></div>
      <p className="mt-1 text-xs font-semibold text-[var(--medtrak-muted)]">{p.done} of {p.total} places done{p.counting ? `, ${p.counting} being counted` : ""}{p.free ? `, ${p.free} free` : ""}</p>
    </div>
  );
}

function StartOwn({ items, actor, onCreated, onCancel }) {
  const places = useMemo(() => buildPlaces(items), [items]);
  const [search, setSearch] = useState("");
  const [chosen, setChosen] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const shown = places.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  const toggle = (key) => setChosen((c) => (c.includes(key) ? c.filter((k) => k !== key) : [...c, key]));
  const start = async () => {
    setBusy(true); setError("");
    try {
      const day = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      const id = await createStockTake({ title: `${actor.name.split(" ")[0] || "My"}'s stock take, ${day}`, places: places.filter((p) => chosen.includes(p.key)), mode: "self", creator: actor });
      onCreated(id);
    } catch (problem) { setError(problem?.message || "Could not start it."); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3">
      <button type="button" onClick={onCancel} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-[var(--medtrak-accent)]"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back</button>
      <h2 className="text-2xl font-bold">Start my own stock take</h2>
      <p className="text-sm text-[var(--medtrak-muted)]">Choose the rooms and cupboards you will count. When you've finished it goes to the manager, who checks the differences before any stock figure changes.</p>
      <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--medtrak-muted)]" aria-hidden="true" /><input className={`${FIELD} pl-10`} placeholder="Find a place" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Find a place" /></div>
      <ul className="space-y-1.5">
        {shown.map((p) => (
          <li key={p.key}>
            <label className={`flex min-h-14 items-center gap-3 rounded-2xl border px-4 ${chosen.includes(p.key) ? "border-[var(--medtrak-accent)] bg-[var(--medtrak-accent)]/10" : "border-[var(--medtrak-border)] bg-[var(--medtrak-panel)]"}`}>
              <input type="checkbox" className="h-5 w-5" checked={chosen.includes(p.key)} onChange={() => toggle(p.key)} />
              <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span><span className="shrink-0 text-xs text-[var(--medtrak-muted)]">{p.itemCount} item{p.itemCount === 1 ? "" : "s"}</span>
            </label>
          </li>
        ))}
      </ul>
      {error && <p className="text-sm font-semibold text-rose-700" role="alert">{error}</p>}
      <button type="button" disabled={!chosen.length || busy} onClick={start} className="min-h-14 w-full rounded-2xl bg-[var(--medtrak-accent)] text-base font-bold text-white disabled:opacity-40">{busy ? "Starting…" : `Start with ${chosen.length} place${chosen.length === 1 ? "" : "s"}`}</button>
    </div>
  );
}

function TakeScreen({ takeId, items, actor, canManage, onBack, onCount }) {
  const { take, places, counts } = useStockTake(takeId);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (work, after) => { setBusy(true); setError(""); try { await work(); after?.(); } catch (problem) { setError(problem?.message || "That didn't work."); } finally { setBusy(false); } };

  if (take === undefined) return <p className="text-center text-sm text-[var(--medtrak-muted)]">Opening the stock take…</p>;
  if (take === null) return <><button type="button" onClick={onBack} className="min-h-11 text-sm font-bold text-[var(--medtrak-accent)]">Back</button><p>This stock take is no longer there.</p></>;

  const progress = takeProgress(places);
  const isOpen = take.status === TAKE_STATUS.open;
  const mineStarted = take.createdByUid === actor.uid;
  const allDone = places.length > 0 && progress.done === places.length;

  const tap = (place) => {
    const action = placeAction(place, actor.uid);
    if (action === "claim") return run(() => claimPlace(take.id, place.id, actor), () => onCount(place.id));
    if (action === "continue") return onCount(place.id);
    if (action === "reopen") return run(() => reopenPlace(take.id, place.id), () => onCount(place.id));
    return undefined;
  };
  const label = { claim: "Count this", continue: "Continue", busy: "", reopen: "Reopen", done: "" };

  return (
    <div className="space-y-3">
      <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-[var(--medtrak-accent)]"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Stock takes</button>
      <div>
        <h2 className="text-2xl font-bold leading-tight">{take.title}</h2>
        <p className="text-sm text-[var(--medtrak-muted)]">Asked by {take.createdByName || "the manager"}{dueText(take) ? ` · ${dueText(take)}` : ""}</p>
        {take.note && <p className="mt-1 rounded-xl bg-[var(--medtrak-panel)] p-3 text-sm">{take.note}</p>}
      </div>
      <Progress places={places} />
      {!isOpen && <p className="rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-3 text-sm font-semibold">{take.status === TAKE_STATUS.review ? "All counted. It is with the manager for review." : "This stock take is finished."}</p>}
      {error && <p className="text-sm font-semibold text-rose-700" role="alert">{error}</p>}
      <ul className="space-y-2">
        {places.map((place) => {
          const action = placeAction(place, actor.uid);
          const status = place.status === PLACE_STATUS.done ? `Done by ${place.claimedByName || "someone"}` : place.status === PLACE_STATUS.claimed ? `Being counted by ${place.claimedByUid === actor.uid ? "you" : place.claimedByName}` : "Free";
          const mine = place.claimedByUid === actor.uid;
          const n = counts.filter((c) => c.placeId === place.id).length;
          return (
            <li key={place.id} className={`rounded-2xl border p-4 ${place.status === PLACE_STATUS.done ? "border-emerald-400/40 bg-emerald-500/10" : mine ? "border-[var(--medtrak-accent)] bg-[var(--medtrak-panel)]" : "border-[var(--medtrak-border)] bg-[var(--medtrak-panel)]"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><p className="text-lg font-bold leading-tight">{place.name}</p><p className="text-sm text-[var(--medtrak-muted)]">{status}{n ? ` · ${n} counted` : ""}</p></div>
                {place.status === PLACE_STATUS.done && <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" aria-hidden="true" />}
                {action === "busy" && <Lock className="h-5 w-5 shrink-0 text-[var(--medtrak-muted)]" aria-hidden="true" />}
              </div>
              {isOpen && label[action] && <button type="button" disabled={busy} onClick={() => tap(place)} className="mt-3 min-h-12 w-full rounded-2xl bg-[var(--medtrak-accent)] font-bold text-white disabled:opacity-40">{label[action]}</button>}
            </li>
          );
        })}
      </ul>
      {isOpen && allDone && (mineStarted || canManage) && (
        <button type="button" disabled={busy} onClick={() => run(() => sendForReview(take.id), onBack)} className="min-h-14 w-full rounded-2xl border-2 border-[var(--medtrak-accent)] text-base font-bold text-[var(--medtrak-accent)] disabled:opacity-40">All places are done: send to the manager</button>
      )}
    </div>
  );
}

export default function MobileStockTake({ onClose }) {
  const { user, role, can } = useAuth();
  const actor = useMemo(() => ({ uid: user?.uid || "", name: user?.displayName || user?.email || "Unknown", displayName: user?.displayName || user?.email || "Unknown" }), [user]);
  const allowed = can("stocktake.count");
  const { allItems = [] } = useStock({ includeArchived: false });
  const { list, error } = useStockTakes(allowed);
  const [screen, setScreen] = useState({ name: "home" });
  const take = useStockTake(screen.takeId);

  const asked = useMemo(() => (list || []).filter((t) => isAskedOf(t, actor.uid, role)), [list, actor.uid, role]);
  const place = screen.placeId ? take.places.find((p) => p.id === screen.placeId) : null;

  let body;
  if (!allowed) body = <p className="rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-4 text-sm">Your role isn't set up to take part in a stock take. Ask the Practice Manager.</p>;
  else if (list === null) body = <p className="text-center text-sm text-[var(--medtrak-muted)]">Opening stock takes…</p>;
  else if (error) body = <p className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-4 text-sm font-semibold text-rose-700" role="alert">{error}</p>;
  else if (screen.name === "start") body = <StartOwn items={allItems} actor={actor} onCancel={() => setScreen({ name: "home" })} onCreated={(id) => setScreen({ name: "take", takeId: id })} />;
  else if (screen.name === "count" && place && take.take) body = <MobileStockTakeCount take={take.take} place={place} items={allItems} counts={take.counts} actor={actor} onBack={() => setScreen({ name: "take", takeId: screen.takeId })} />;
  else if (screen.name === "take" || screen.name === "count") body = <TakeScreen takeId={screen.takeId} items={allItems} actor={actor} canManage={can("stocktake.manage")} onBack={() => setScreen({ name: "home" })} onCount={(placeId) => setScreen({ name: "count", takeId: screen.takeId, placeId })} />;
  else body = (
    <div className="space-y-3">
      <h2 className="text-2xl font-bold">Stock take</h2>
      {asked.length === 0 ? <p className="rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-4 text-sm text-[var(--medtrak-muted)]">No stock take is waiting for you. You can start your own below.</p> : (
        <ul className="space-y-2">
          {asked.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => setScreen({ name: "take", takeId: t.id })} className="w-full rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-4 text-left active:opacity-80">
                <span className="block text-lg font-bold leading-tight">{t.title}</span>
                <span className="block text-sm text-[var(--medtrak-muted)]">{t.mode === "self" ? "Started by you" : `Asked by ${t.createdByName || "the manager"}`}{dueText(t) ? ` · ${dueText(t)}` : ""} · {t.placeCount} place{t.placeCount === 1 ? "" : "s"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={() => setScreen({ name: "start" })} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-[var(--medtrak-accent)] text-base font-bold text-[var(--medtrak-accent)]"><Plus className="h-5 w-5" aria-hidden="true" /> Start my own stock take</button>
      {can("stocktake.manage") && <p className="text-xs text-[var(--medtrak-muted)]">To request a stock take for the team, or to review the differences, use Inventory &gt; Stock take on the desktop.</p>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[140] overflow-y-auto bg-[var(--medtrak-bg)] text-[var(--medtrak-text)]">
      <div className="mx-auto w-full max-w-xl px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="mb-3 flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-[var(--medtrak-accent)]"><ClipboardList className="h-4 w-4" aria-hidden="true" /> Stock take</p>
          <button type="button" onClick={onClose} className="min-h-11 rounded-full border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-4 text-sm font-bold">Close</button>
        </header>
        {body}
      </div>
    </div>
  );
}
