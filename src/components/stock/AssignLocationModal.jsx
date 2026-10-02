import { useEffect, useMemo, useState } from "react";
import { MapPin, X, ArrowRight } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { loadSpaceRegistry } from "@/modules/sense/services/sharedSpaceRegistry";
import { listEquipment } from "@/modules/equipment/services/equipmentRegistry";
import { listEmergencyAssets, listAnaphylaxisBoxes } from "@/lib/checklistsFirestore";
import { kitLocationId, mainStoreName, toNumber, unassignedQty } from "@/lib/stockLocations";

const MAIN = "__main__";

const TYPE_LABEL = { asset: "Equipment", kit: "Kit", space: "Room / Space" };

// Where an item can be moved to: rooms, equipment, and the practice's
// emergency kits / anaphylaxis boxes. Moving stock into a kit is how "I took
// the adrenaline out of the store room and put it in the anaphylaxis box" is
// recorded - the store loses it and the kit gains it.
export default function AssignLocationModal({ open, onOpenChange, item, onTransfer, onUnassign }) {
  const [kits, setKits] = useState([]);

  const places = useMemo(() => {
    const registry = loadSpaceRegistry();
    const spaces = (registry?.spaces || [])
      .filter((space) => space.status !== "archived")
      .map((space) => ({ id: space.spaceId || space.id, name: space.name, type: "space" }));
    const equipment = listEquipment().map((eq) => ({ id: eq.equipmentId || eq.id, name: eq.name, type: "asset" }));
    return { spaces, equipment };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Kits live in Firestore; a failed load just leaves them out of the list.
  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    Promise.all([
      listEmergencyAssets().catch(() => []),
      listAnaphylaxisBoxes().catch(() => []),
    ]).then(([emergency, anaphylaxis]) => {
      if (!active) return;
      setKits([
        ...emergency.map((k) => ({ id: kitLocationId("emergency_assets", k.id), name: k.name || k.id, group: "Emergency kits" })),
        ...anaphylaxis.map((k) => ({ id: kitLocationId("anaphylaxis_boxes", k.id), name: k.name || k.id, group: "Anaphylaxis boxes" })),
      ]);
    });
    return () => { active = false; };
  }, [open]);

  const [fromId, setFromId] = useState(MAIN);
  const [toId, setToId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  if (!open || !item) return null;

  const itemLocations = Array.isArray(item.locations) ? item.locations : [];
  const total = toNumber(item.current_stock, 0);
  const inMain = unassignedQty(item);
  const mainName = mainStoreName(item);

  // Where it can be moved from: the main store (if any is left there) and each
  // place it's already recorded at.
  const fromOptions = [
    ...(inMain > 0 ? [{ id: MAIN, name: mainName, qty: inMain }] : []),
    ...itemLocations.map((loc) => ({ id: loc.locationId, name: loc.locationName, qty: toNumber(loc.quantity, 0) })),
  ];
  const effectiveFrom = fromOptions.some((o) => o.id === fromId) ? fromId : fromOptions[0]?.id || "";
  const fromQty = fromOptions.find((o) => o.id === effectiveFrom)?.qty || 0;

  const allDestinations = [
    ...places.spaces.map((p) => ({ ...p, group: "Rooms / Spaces" })),
    ...places.equipment.map((p) => ({ ...p, group: "Equipment" })),
    ...kits.map((k) => ({ ...k, type: "kit" })),
  ];
  const groups = [...new Set(allDestinations.map((d) => d.group))];

  function close() {
    setFromId(MAIN);
    setToId("");
    setQuantity("1");
    setError("");
    setDone("");
    onOpenChange(false);
  }

  async function submitMove(event) {
    event.preventDefault();
    setError("");
    setDone("");
    if (!effectiveFrom) {
      setError("There is no stock to move.");
      return;
    }
    if (!toId) {
      setError("Choose where it's going.");
      return;
    }
    const qty = toNumber(quantity, 0);
    if (qty <= 0) {
      setError("Enter a quantity greater than 0.");
      return;
    }
    const toMain = toId === MAIN;
    const destination = allDestinations.find((d) => d.id === toId);
    setBusy(true);
    try {
      await onTransfer({
        fromLocationId: effectiveFrom === MAIN ? null : effectiveFrom,
        toLocationId: toMain ? null : toId,
        toLocationName: toMain ? "" : destination?.name || "",
        toLocationType: toMain ? "space" : destination?.type || "space",
        quantity: qty,
      });
      const fromName = fromOptions.find((o) => o.id === effectiveFrom)?.name;
      setDone(`Moved ${qty} from ${fromName} to ${toMain ? mainName : destination?.name}.`);
      setToId("");
      setQuantity("1");
      setFromId(MAIN);
    } catch (err) {
      setError(err?.message || "Could not move this stock.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUnassign(locationId, currentQty) {
    setError("");
    setDone("");
    setBusy(true);
    try {
      await onUnassign(locationId, currentQty);
    } catch (err) {
      setError(err?.message || "Could not move this stock back to the main store.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col rounded-2xl border border-slate-700/70 bg-slate-900/95 p-4 text-slate-100 shadow-2xl">
        <div className="mb-3 flex shrink-0 items-start justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold"><MapPin className="h-4 w-4 text-teal-300" /> Where is it?</p>
            <p className="text-xs text-slate-400">{item?.name || ""}</p>
          </div>
          <Button size="icon" variant="ghost" onClick={close} title="Close"><X className="h-4 w-4" /></Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="rounded-xl border border-slate-700/70 bg-slate-950/40 p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-300">Total stock</span>
              <span className="font-semibold">{total}</span>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between rounded-xl border border-slate-700/70 bg-slate-900/60 px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-100">{mainName}</p>
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Main store</p>
              </div>
              <span className="shrink-0 font-semibold">{inMain}</span>
            </div>
            {itemLocations.map((loc) => (
              <div key={loc.locationId} className="flex items-center justify-between gap-2 rounded-xl border border-slate-700/70 bg-slate-900/60 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-100">{loc.locationName}</p>
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">{TYPE_LABEL[loc.locationType] || TYPE_LABEL.space}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-semibold">{loc.quantity}</span>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => { setFromId(loc.locationId); setDone(""); }}>Move</Button>
                  <Button size="sm" variant="ghost" disabled={busy} title="Put it all back in the main store" onClick={() => handleUnassign(loc.locationId, loc.quantity)}>Return</Button>
                </div>
              </div>
            ))}
          </div>

          {error && <p className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-200">{error}</p>}
          {done && <p className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-200">{done}</p>}

          <form onSubmit={submitMove} className="mt-4 space-y-2 border-t border-slate-700/70 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Move stock</p>

            <label className="block text-xs text-slate-400">From</label>
            <select
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 [&>option]:bg-slate-900"
              value={effectiveFrom}
              onChange={(e) => { setFromId(e.target.value); if (e.target.value === toId) setToId(""); }}
              disabled={busy || fromOptions.length === 0}
            >
              {fromOptions.length === 0 && <option value="">No stock to move</option>}
              {fromOptions.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.qty})</option>)}
            </select>

            <label className="flex items-center gap-1 pt-1 text-xs text-slate-400"><ArrowRight className="h-3 w-3" /> To</label>
            <select
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 [&>option]:bg-slate-900"
              value={toId}
              onChange={(e) => setToId(e.target.value)}
              disabled={busy || fromOptions.length === 0}
            >
              <option value="">Choose where it's going…</option>
              {effectiveFrom !== MAIN && <option value={MAIN}>{mainName} (main store)</option>}
              {groups.map((group) => (
                <optgroup key={group} label={group}>
                  {allDestinations.filter((d) => d.group === group && d.id !== effectiveFrom).map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            {kits.length === 0 && (
              <p className="text-[11px] text-slate-500">Emergency kits and anaphylaxis boxes appear here once they've been created.</p>
            )}

            <div className="flex gap-2 pt-1">
              <Input type="number" min="1" max={fromQty || undefined} value={quantity} onChange={(e) => setQuantity(e.target.value)} disabled={busy} placeholder="Quantity" className="flex-1" />
              <Button type="submit" disabled={busy || fromOptions.length === 0}>{busy ? "Moving…" : "Move"}</Button>
            </div>
            <p className="text-[11px] text-slate-500">The total stays the same - it's still in the practice - but the place it's counted against changes.</p>
          </form>
        </div>
      </div>
    </div>
  );
}
