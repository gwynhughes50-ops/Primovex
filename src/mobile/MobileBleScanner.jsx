import { useEffect, useRef, useState } from "react";
import { Bluetooth, CheckCircle2, ExternalLink, Radar, X } from "lucide-react";
import { bleHasPermission, nativeBleAvailable, onBleEvent, parseBleScannedUrl, parseIBeaconValue, requestBlePermission, startBleScan } from "@/modules/sense/services/bleService";
import { buildNfcUrl } from "@/modules/sense/services/nfcService";
import { findEquipmentByBleTag } from "@/modules/equipment/services/equipmentRegistry";
import { useSenseSession } from "@/contexts/SenseSessionContext";
import useSenseContext from "@/modules/sense/hooks/useSenseContext";

// Diagnostic-only frames (raw iBeacon / Eddystone-UID advertisements) are
// listed so a tag can be identified before it's configured to broadcast a
// Primovex Sense URL — this is the main tool for figuring out what a new
// tag's factory-default broadcast looks like.
export default function MobileBleScanner({ open, onClose }) {
  const { activate } = useSenseSession();
  const { state } = useSenseContext();
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState(null);
  const [nearby, setNearby] = useState([]);
  const nearbyRef = useRef([]);

  useEffect(() => {
    if (!open) return undefined;

    const supported = nativeBleAvailable();
    if (!supported) {
      setStatus("unsupported");
      setMessage("BLE scanning is only available in the installed Primovex Android app.");
      return undefined;
    }

    setStatus("scanning");
    setMessage("Looking for nearby Primovex BLE tags…");
    setResult(null);
    nearbyRef.current = [];
    setNearby([]);

    const unsubscribe = onBleEvent((detail) => {
      const { type, value } = detail;
      if (type === "scanned") {
        const parsed = parseBleScannedUrl(value);
        if (parsed) {
          setResult({ ...parsed, href: parsed.href });
          setStatus("found");
          setMessage("Primovex tag recognised.");
        }
        return;
      }
      if (type === "ibeacon") {
        const beacon = parseIBeaconValue(value);
        const match = beacon ? findEquipmentByBleTag(beacon.uuid, beacon.major, beacon.minor) : null;
        if (match) {
          setResult({ entityType: "asset", entityId: match.id, href: buildNfcUrl("asset", match.id) });
          setStatus("found");
          setMessage("Primovex tag recognised.");
          return;
        }
      }
      if (type === "ibeacon" || type === "eddystone-uid") {
        const entry = { key: `${type}:${value}`, type, value, seenAt: Date.now() };
        const next = [entry, ...nearbyRef.current.filter((row) => row.key !== entry.key)].slice(0, 8);
        nearbyRef.current = next;
        setNearby(next);
        return;
      }
      if (type === "permission-denied") {
        setStatus("permission-denied");
        setMessage("Bluetooth permission was denied. Enable it in Android Settings → Apps → Primovex → Permissions.");
        return;
      }
      if (type === "error") {
        setStatus("error");
        setMessage(value || "BLE scanning failed.");
      }
    });

    // Scanning is meant to already be running continuously in the background
    // (see MainActivity.kt's onResume) for the passive equipment-sighting
    // feature, so this sheet doesn't own a separate scan session — but if
    // that background scan never actually started for any reason (e.g.
    // permission was granted after the last resume), opening this sheet must
    // still make scanning happen, not just assume it's already active.
    // startBleScanInternal() early-returns if a scan is already running, so
    // calling it here is always safe. It must NOT be paired with a stop on
    // close, though — that's what previously killed background "last seen"
    // tracking the moment this sheet was dismissed.
    if (!bleHasPermission()) requestBlePermission();
    else startBleScan();

    return () => unsubscribe();
  }, [open]);

  async function openResult() {
    if (!result?.href) return;
    const space = result.entityType === "space" ? state.spaces.find((item) => item.id === result.entityId) : null;
    if (result.entityType === "space") {
      await activate({ id: result.entityId, name: space?.name || result.entityId, type: "space", source: "ble" });
    }
    window.location.assign(result.href);
  }

  if (!open) return null;

  return (
    <div className="pvx-mobile-sheet-backdrop backdrop-blur-sm" style={{ zIndex: 110 }} role="dialog" aria-modal="true" aria-labelledby="mobile-ble-title">
      <section className="pvx-mobile-sheet px-5 pt-4 text-[var(--medtrak-text)]">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[var(--medtrak-border)]" />
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-[var(--medtrak-accent)]">
              <Bluetooth className="h-4 w-4" /> Primovex Sense
            </div>
            <h2 id="mobile-ble-title" className="mt-1 text-xl font-bold">Scan BLE tag</h2>
            <p className="mt-1 text-sm text-[var(--medtrak-muted)]">Open a room or equipment passport by proximity, no tap needed.</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-2xl border border-[var(--medtrak-border)]" aria-label="Close BLE scanner">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 rounded-3xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-5 text-center">
          <div className={`mx-auto grid h-20 w-20 place-items-center rounded-full border-4 border-[color-mix(in_srgb,var(--medtrak-accent)_28%,var(--medtrak-border))] bg-[color-mix(in_srgb,var(--medtrak-accent)_12%,var(--medtrak-panel))] text-[var(--medtrak-accent)] ${status === "scanning" ? "animate-pulse" : ""}`}>
            {status === "found" ? <CheckCircle2 className="h-9 w-9" /> : <Radar className="h-9 w-9" />}
          </div>

          {status === "unsupported" ? (
            <>
              <p className="mt-4 font-bold">Not available here</p>
              <p className="mt-2 text-sm text-[var(--medtrak-muted)]">{message}</p>
            </>
          ) : status === "found" ? (
            <>
              <p className="mt-4 font-bold">Tag recognised</p>
              <p className="mt-1 text-sm text-[var(--medtrak-muted)]">{result?.entityType === "space" ? "Space / room" : "Equipment / asset"} · {result?.entityId}</p>
            </>
          ) : (
            <>
              <p className="mt-4 font-bold">{status === "scanning" ? "Scanning…" : "BLE scan"}</p>
              <p className="mt-2 text-sm text-[var(--medtrak-muted)]">{message}</p>
            </>
          )}
        </div>

        {(status === "error" || status === "permission-denied") && (
          <div className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700">{message}</div>
        )}

        {status === "scanning" && nearby.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]">Nearby BLE advertisements (not yet linked to a Primovex tag)</p>
            <div className="mt-2 space-y-1.5">
              {nearby.map((entry) => (
                <div key={entry.key} className="rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 py-2 text-left text-xs">
                  <span className="font-bold uppercase tracking-wide text-[var(--medtrak-accent)]">{entry.type}</span>
                  <span className="ml-2 break-all text-[var(--medtrak-muted)]">{entry.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 grid gap-2">
          {status === "found" && (
            <button type="button" onClick={openResult} className="rounded-2xl bg-[var(--medtrak-accent)] px-4 py-3.5 font-bold text-white">
              <ExternalLink className="mr-2 inline h-5 w-5" />Open in Primovex
            </button>
          )}
          <button type="button" onClick={onClose} className="rounded-2xl border border-[var(--medtrak-border)] px-4 py-3.5 font-bold">Cancel</button>
        </div>
      </section>
    </div>
  );
}
