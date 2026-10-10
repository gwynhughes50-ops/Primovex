import { useEffect, useState } from "react";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { CheckCircle2, ChevronRight, Nfc, QrCode, Thermometer, X } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { getQrImageUrl } from "@/lib/qrCode";
import { buildNfcUrl, nativeNfcAvailable, writeNfcUrl } from "@/modules/sense/services/nfcService";
import { canSetUpFridges } from "@/modules/temperature/fridgeSetup";
import { normaliseUnit } from "./fridgeCheck";

// Facilities > Practice spaces > Fridges: where the NFC tag for each fridge is written (the QR code is printed
// from Temperature > Fridges on the desktop, and can be shown here too). Only for the people who set fridges
// up: admins, the Practice Manager and the roles ticked for fridge alerts. A tag holds the fridge's own link,
// so tapping it opens that fridge's temperature check.
export default function MobileFridgeTags() {
  const { role, capabilities = [], isAdmin } = useAuth();
  const [units, setUnits] = useState([]);
  const [alertRoles, setAlertRoles] = useState([]);
  const [selected, setSelected] = useState(null);
  const [showQr, setShowQr] = useState(false);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const allowed = canSetUpFridges({ role, capabilities, isAdmin, alertRoles });

  useEffect(() => onSnapshot(collection(db, "temperature_units"), (snap) => setUnits(snap.docs.map((d) => normaliseUnit(d.id, d.data())).filter((u) => u.active).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))), () => setUnits([])), []);
  useEffect(() => onSnapshot(doc(db, "settings", "fridgeAlerts"), (snap) => { const roles = snap.exists() ? snap.data()?.roles : null; setAlertRoles(Array.isArray(roles) ? roles : []); }, () => setAlertRoles([])), []);

  if (!allowed || !units.length) return null;

  async function writeTag(unit) {
    if (!nativeNfcAvailable()) { setStatus("error"); setMessage("Writing a tag needs the installed Android app."); return; }
    setStatus("writing");
    setMessage("Hold a blank NFC tag to the back of the phone…");
    try {
      await writeNfcUrl(buildNfcUrl("fridge", unit.id));
      setStatus("success");
      setMessage(`Tag written for ${unit.name}. Stick it on the fridge and tap it to test.`);
    } catch (error) {
      setStatus("error");
      setMessage(error?.message || "Could not write the tag.");
    }
  }
  const open = (unit) => { setSelected(unit); setShowQr(false); setStatus("idle"); setMessage(""); };

  return (
    <>
      <section className="pvx-mobile-card">
        <div className="flex items-center gap-2"><Thermometer className="h-5 w-5 text-[var(--medtrak-accent)]" aria-hidden="true" /><h2 className="font-bold">Fridges</h2></div>
        <p className="mt-1 text-xs text-[var(--medtrak-muted)]">Set up the tag for each fridge. Tapping it, or scanning its QR code, opens that fridge's temperature check.</p>
        <div className="mt-2 space-y-2">
          {units.map((unit) => (
            <button key={unit.id} type="button" onClick={() => open(unit)} className="flex w-full items-center justify-between rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-2.5 text-left">
              <span><b className="block">{unit.name}</b><small className="text-[var(--medtrak-muted)]">Safe range {unit.range.min}°C to {unit.range.max}°C</small></span>
              <ChevronRight className="h-4 w-4 text-[var(--medtrak-muted)]" aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>

      {selected && (
        <div className="pvx-mobile-sheet-backdrop" style={{ zIndex: 130 }} role="dialog" aria-modal="true" aria-label={`Tag for ${selected.name}`}>
          <section className="pvx-mobile-sheet text-[var(--medtrak-text)]">
            <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-[var(--medtrak-border)]" />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[.14em] text-[var(--medtrak-accent)]">Fridge tag</p>
                <h2 className="mt-1 text-2xl font-bold">{selected.name}</h2>
                <p className="text-sm text-[var(--medtrak-muted)]">Safe range {selected.range.min}°C to {selected.range.max}°C</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[var(--medtrak-border)]" aria-label="Close"><X className="h-5 w-5" aria-hidden="true" /></button>
            </div>

            {message && <p className={`mt-4 rounded-xl border p-3 text-sm ${status === "error" ? "border-red-500/30 bg-red-500/10 text-red-700" : status === "success" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700" : "border-[var(--medtrak-border)] bg-[var(--medtrak-bg)]"}`} role={status === "error" ? "alert" : "status"}>{status === "success" && <CheckCircle2 className="mr-2 inline h-4 w-4" aria-hidden="true" />}{message}</p>}

            <button type="button" onClick={() => writeTag(selected)} disabled={status === "writing"} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--medtrak-accent)] px-4 font-bold text-white disabled:opacity-60"><Nfc className="h-5 w-5" aria-hidden="true" />{status === "writing" ? "Hold a blank tag…" : "Write this fridge to an NFC tag"}</button>
            <button type="button" onClick={() => setShowQr((v) => !v)} className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--medtrak-border)] px-4 font-bold"><QrCode className="h-5 w-5" aria-hidden="true" />{showQr ? "Hide the QR code" : "Show the QR code"}</button>
            {showQr && (
              <div className="mt-2 rounded-2xl border border-[var(--medtrak-border)] bg-white p-4 text-center text-slate-900">
                <img src={getQrImageUrl(buildNfcUrl("fridge", selected.id), 240)} alt={`QR code for ${selected.name}`} className="mx-auto h-56 w-56" />
                <p className="mt-2 font-bold">{selected.name}</p>
                <p className="text-xs text-slate-600">Scan to record the temperature</p>
              </div>
            )}
            <p className="mt-3 text-xs text-[var(--medtrak-muted)]">To print QR labels for every fridge at once, use Temperature, then Fridges, on the desktop app.</p>
          </section>
        </div>
      )}
    </>
  );
}
