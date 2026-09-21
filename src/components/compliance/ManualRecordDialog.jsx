import React, { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { getAssetTypeConfig, isFlushableAsset, recordComplianceCheck } from "@/services/compliance/complianceQrService";
import { localDateInput, localTimeInput } from "./complianceView";

const REASONS = [
  "Forgot to tap the tag",
  "Tag damaged or missing",
  "No phone available",
  "Other",
];

const FIELD = "w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none [&>option]:bg-slate-900";

// The way to put a check on record when the phone route wasn't possible. It is
// saved like any other check, but marked as entered by hand, with who entered
// it and why, and the date and time it really happened.
export default function ManualRecordDialog({ assets, onClose, onSaved }) {
  const { user, displayName } = useAuth();
  const [assetId, setAssetId] = useState("");
  const [date, setDate] = useState(localDateInput());
  const [time, setTime] = useState(localTimeInput());
  const [status, setStatus] = useState("pass");
  const [tempC, setTempC] = useState("");
  const [flushed, setFlushed] = useState(false);
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState(REASONS[0]);
  const [reasonOther, setReasonOther] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const asset = useMemo(() => assets.find((a) => a.id === assetId) || null, [assets, assetId]);
  const isTemperature = asset?.checkMode === "temperature";
  const sorted = useMemo(
    () => [...assets].sort((a, b) => String(a.assetCode || "").localeCompare(String(b.assetCode || ""), undefined, { numeric: true })),
    [assets]
  );

  async function save() {
    setError("");
    if (!asset) return setError("Choose what was checked.");
    const performedAt = new Date(`${date}T${time || "00:00"}`);
    if (Number.isNaN(performedAt.getTime())) return setError("Enter the date and time it was done.");
    if (performedAt.getTime() > Date.now() + 60_000) return setError("The date and time can't be in the future.");
    if (isTemperature && (tempC === "" || !Number.isFinite(Number(tempC)))) return setError("Enter the temperature.");
    const why = reason === "Other" ? reasonOther.trim() : reason;
    if (!why) return setError("Say why this is being entered by hand.");

    setBusy(true);
    try {
      await recordComplianceCheck(asset, {
        status,
        tempC,
        flushed: isFlushableAsset(asset) ? flushed : undefined,
        notes,
        performedAt,
        manualReason: why,
        source: "manual_desktop",
        identificationMethod: "manual_desktop",
        actor: { uid: user?.uid || null, email: user?.email || null, displayName: displayName || user?.email || "Unknown user" },
      });
      onSaved?.(asset);
      onClose();
    } catch (err) {
      console.error(err);
      setError("Could not save the record. Check your connection and permissions.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-slate-900/95 p-5 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-100">Add a record by hand</h3>
            <p className="mt-1 text-xs text-slate-400">For a check that couldn't be done with the phone. It is saved with your name and marked as entered by hand.</p>
          </div>
          <button type="button" className="text-slate-400 hover:text-slate-200" onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block text-xs font-semibold text-slate-300">What was checked
            <select className={`${FIELD} mt-1`} value={assetId} onChange={(e) => setAssetId(e.target.value)}>
              <option value="">Choose a fire point, outlet or asset</option>
              {sorted.map((a) => <option key={a.id} value={a.id}>{[a.assetCode, a.label].filter(Boolean).join(" • ")} ({getAssetTypeConfig(a.assetType).label})</option>)}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-semibold text-slate-300">Date it was done
              <Input type="date" className="mt-1" value={date} max={localDateInput()} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="block text-xs font-semibold text-slate-300">Time
              <Input type="time" className="mt-1" value={time} onChange={(e) => setTime(e.target.value)} />
            </label>
          </div>

          {isTemperature ? (
            <label className="block text-xs font-semibold text-slate-300">Temperature °C {asset?.minTempC != null && <span className="font-normal text-slate-500">(range {asset.minTempC} to {asset.maxTempC})</span>}
              <Input type="number" step="0.1" className="mt-1" value={tempC} onChange={(e) => setTempC(e.target.value)} />
            </label>
          ) : (
            <div>
              <span className="block text-xs font-semibold text-slate-300">Result</span>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setStatus("pass")} className={`rounded-xl px-3 py-2 text-sm font-bold ${status === "pass" ? "bg-emerald-500 text-white" : "border border-white/10 text-slate-300"}`}>PASS</button>
                <button type="button" onClick={() => setStatus("fail")} className={`rounded-xl px-3 py-2 text-sm font-bold ${status === "fail" ? "bg-rose-600 text-white" : "border border-white/10 text-slate-300"}`}>FAIL</button>
              </div>
            </div>
          )}

          {asset && isFlushableAsset(asset) && (
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input type="checkbox" checked={flushed} onChange={(e) => setFlushed(e.target.checked)} /> Outlet flushed
            </label>
          )}

          <label className="block text-xs font-semibold text-slate-300">Notes / issues (optional)
            <textarea className={`${FIELD} mt-1`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>

          <label className="block text-xs font-semibold text-slate-300">Why is this being entered by hand?
            <select className={`${FIELD} mt-1`} value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          {reason === "Other" && <Input placeholder="Reason" value={reasonOther} onChange={(e) => setReasonOther(e.target.value)} maxLength={160} />}
        </div>

        {error && <p className="mt-3 text-sm text-rose-300" role="alert">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" className="rounded-full border-white/10 bg-slate-900/40 text-xs text-slate-200 hover:bg-slate-900/60" onClick={onClose}>Cancel</Button>
          <Button className="rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 text-xs text-slate-950" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save record"}</Button>
        </div>
      </div>
    </div>
  );
}
