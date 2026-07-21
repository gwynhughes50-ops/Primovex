import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ExternalLink, Nfc, Smartphone, X } from "lucide-react";
import { isInstalledAndroidApp, nfcSetupStatus, nfcSupported, scanNfcOnce } from "@/modules/sense/services/nfcService";
import { useSenseSession } from "@/contexts/SenseSessionContext";
import useSenseContext from "@/modules/sense/hooks/useSenseContext";

function parsePrimovexSenseUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    const match = url.pathname.match(/^\/sense\/open\/(space|asset)\/([^/]+)\/?$/i);
    if (!match) return null;
    return {
      entityType: match[1].toLowerCase(),
      entityId: decodeURIComponent(match[2]),
      href: `${url.pathname}${url.search}${url.hash}`,
    };
  } catch {
    return null;
  }
}

export default function MobileNfcScanner({ open, onClose }) {
  const { activate } = useSenseSession();
  const { state } = useSenseContext();
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState(null);
  const controllerRef = useRef(null);

  useEffect(() => {
    if (!open) {
      controllerRef.current?.abort();
      controllerRef.current = null;
      setStatus("idle");
      setMessage("");
      setResult(null);
    }
    return () => controllerRef.current?.abort();
  }, [open]);

  async function beginScan() {
    if (!nfcSupported()) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setStatus("scanning");
    setMessage("Hold the top of your phone close to the Primovex NFC tag.");
    setResult(null);

    try {
      const scan = await scanNfcOnce({ signal: controller.signal });
      const parsed = parsePrimovexSenseUrl(scan.url);
      if (!parsed) throw new Error("This is not a recognised Primovex Sense tag.");
      setResult({ ...parsed, serialNumber: scan.serialNumber || "" });
      setStatus("found");
      setMessage("Primovex tag recognised.");
    } catch (error) {
      if (controller.signal.aborted) return;
      setStatus("error");
      setMessage(error?.message || "The NFC tag could not be read.");
    }
  }

  async function openResult() {
    if (!result?.href) return;
    const space = result.entityType === "space"
      ? state.spaces.find((item) => item.id === result.entityId)
      : null;
    if (result.entityType === "space") {
      await activate({
        id: result.entityId,
        name: space?.name || result.entityId,
        type: "space",
        source: "nfc",
      });
    }
    window.location.assign(result.href);
  }

  if (!open) return null;

  const supported = nfcSupported();
  const setup = nfcSetupStatus();
  const installedAndroid = isInstalledAndroidApp();

  return (
    <div className="pvx-mobile-sheet-backdrop backdrop-blur-sm" style={{ zIndex: 110 }} role="dialog" aria-modal="true" aria-labelledby="mobile-nfc-title">
      <section className="pvx-mobile-sheet px-5 pt-4 text-[var(--medtrak-text)]">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[var(--medtrak-border)]" />
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-[var(--medtrak-accent)]">
              <Nfc className="h-4 w-4" /> Primovex Sense
            </div>
            <h2 id="mobile-nfc-title" className="mt-1 text-xl font-bold">Scan NFC tag</h2>
            <p className="mt-1 text-sm text-[var(--medtrak-muted)]">Open a room or equipment passport without searching.</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-2xl border border-[var(--medtrak-border)]" aria-label="Close NFC scanner">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 rounded-3xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-5 text-center">
          <div className={`mx-auto grid h-20 w-20 place-items-center rounded-full border-4 border-[color-mix(in_srgb,var(--medtrak-accent)_28%,var(--medtrak-border))] bg-[color-mix(in_srgb,var(--medtrak-accent)_12%,var(--medtrak-panel))] text-[var(--medtrak-accent)] ${status === "scanning" ? "animate-pulse" : ""}`}>
            {status === "found" ? <CheckCircle2 className="h-9 w-9" /> : <Smartphone className="h-9 w-9" />}
          </div>

          {!supported ? (
            <>
              <p className="mt-4 font-bold">{installedAndroid ? "NFC is ready for tap-to-open" : "Tap the physical tag instead"}</p>
              <p className="mt-2 text-sm text-[var(--medtrak-muted)]">{installedAndroid ? "Close this panel, hold the top of your Galaxy near the programmed tag, then tap the Android notification to open the correct Primovex Space or Asset." : "Active NFC scanning is not available here. Hold your phone near the tag and use the system notification to open Primovex."}</p>
              <p className="mt-3 text-xs font-bold uppercase tracking-wide text-[var(--medtrak-accent)]">Mode: {setup.label}</p>
            </>
          ) : status === "found" ? (
            <>
              <p className="mt-4 font-bold">Tag recognised</p>
              <p className="mt-1 text-sm text-[var(--medtrak-muted)]">{result?.entityType === "space" ? "Space / room" : "Equipment / asset"} · {result?.entityId}</p>
            </>
          ) : (
            <>
              <p className="mt-4 font-bold">{status === "scanning" ? "Ready to scan" : "Start a secure NFC scan"}</p>
              <p className="mt-2 text-sm text-[var(--medtrak-muted)]">{message || "Keep Primovex open, then bring the phone within a few centimetres of the tag."}</p>
            </>
          )}
        </div>

        {status === "error" && <div className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700">{message}</div>}

        <div className="mt-4 grid gap-2">
          {supported && status !== "found" && (
            <button type="button" onClick={beginScan} disabled={status === "scanning"} className="rounded-2xl bg-[var(--medtrak-accent)] px-4 py-3.5 font-bold text-white disabled:opacity-60">
              <Nfc className="mr-2 inline h-5 w-5" />{status === "scanning" ? "Waiting for tag…" : "Start NFC scan"}
            </button>
          )}
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
