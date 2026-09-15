import { useMemo, useState } from "react";
import { MapPin, X } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { loadSpaceRegistry } from "@/modules/sense/services/sharedSpaceRegistry";
import { listEquipment } from "@/modules/equipment/services/equipmentRegistry";

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export default function AssignLocationModal({ open, onOpenChange, item, onAssign, onUnassign }) {
  const locations = useMemo(() => {
    const registry = loadSpaceRegistry();
    const spaces = (registry?.spaces || [])
      .filter((space) => space.status !== "archived")
      .map((space) => ({ id: space.spaceId || space.id, name: space.name, type: "space" }));
    const equipment = listEquipment().map((eq) => ({ id: eq.equipmentId || eq.id, name: eq.name, type: "asset" }));
    return { spaces, equipment };
  }, [open]);

  const allOptions = useMemo(() => [...locations.spaces, ...locations.equipment], [locations]);

  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!open || !item) return null;

  const itemLocations = Array.isArray(item.locations) ? item.locations : [];
  const assigned = itemLocations.reduce((sum, loc) => sum + toNumber(loc.quantity, 0), 0);
  const total = toNumber(item.current_stock, 0);
  const unassigned = Math.max(0, total - assigned);

  function close() {
    setSelectedLocationId("");
    setQuantity("1");
    setError("");
    onOpenChange(false);
  }

  async function submitAssign(event) {
    event.preventDefault();
    setError("");
    const selected = allOptions.find((option) => option.id === selectedLocationId);
    if (!selected) {
      setError("Choose a location.");
      return;
    }
    const qty = toNumber(quantity, 0);
    if (qty <= 0) {
      setError("Enter a quantity greater than 0.");
      return;
    }
    setBusy(true);
    try {
      await onAssign({ locationId: selected.id, locationName: selected.name, locationType: selected.type, quantity: qty });
      setSelectedLocationId("");
      setQuantity("1");
    } catch (err) {
      setError(err?.message || "Could not assign stock to this location.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUnassign(locationId, currentQty) {
    setError("");
    setBusy(true);
    try {
      await onUnassign(locationId, currentQty);
    } catch (err) {
      setError(err?.message || "Could not unassign stock from this location.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-slate-700/70 bg-slate-900/95 p-4 shadow-2xl text-slate-100">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold"><MapPin className="h-4 w-4 text-teal-300" /> Locations</p>
            <p className="text-xs text-slate-400">{item?.name || ""}</p>
          </div>
          <Button size="icon" variant="ghost" onClick={close} title="Close"><X className="h-4 w-4" /></Button>
        </div>

        <div className="rounded-xl border border-slate-700/70 bg-slate-950/40 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-300">Total stock</span>
            <span className="font-semibold">{total}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
            <span>Unassigned (not tied to a location)</span>
            <span>{unassigned}</span>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {itemLocations.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-700/70 p-3 text-center text-xs text-slate-400">Not yet assigned to any location.</p>
          ) : (
            itemLocations.map((loc) => (
              <div key={loc.locationId} className="flex items-center justify-between rounded-xl border border-slate-700/70 bg-slate-900/60 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-100">{loc.locationName}</p>
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">{loc.locationType === "asset" ? "Equipment" : "Room / Space"}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-semibold">{loc.quantity}</span>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => handleUnassign(loc.locationId, loc.quantity)}>Unassign</Button>
                </div>
              </div>
            ))
          )}
        </div>

        {error && <p className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-200">{error}</p>}

        <form onSubmit={submitAssign} className="mt-4 space-y-2 border-t border-slate-700/70 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Assign stock to a location</p>
          <select
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 [&>option]:bg-slate-900"
            value={selectedLocationId}
            onChange={(e) => setSelectedLocationId(e.target.value)}
            disabled={busy}
          >
            <option value="">Select a room or piece of equipment…</option>
            {locations.spaces.length > 0 && (
              <optgroup label="Rooms / Spaces">
                {locations.spaces.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
              </optgroup>
            )}
            {locations.equipment.length > 0 && (
              <optgroup label="Equipment">
                {locations.equipment.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
              </optgroup>
            )}
          </select>
          <div className="flex gap-2">
            <Input type="number" min="1" max={unassigned || undefined} value={quantity} onChange={(e) => setQuantity(e.target.value)} disabled={busy} placeholder="Quantity" className="flex-1" />
            <Button type="submit" disabled={busy || unassigned <= 0}>{busy ? "Saving…" : "Assign"}</Button>
          </div>
          {unassigned <= 0 && <p className="text-[11px] text-slate-500">All of this item's stock is already assigned to a location.</p>}
        </form>
      </div>
    </div>
  );
}
