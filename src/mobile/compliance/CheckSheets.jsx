import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Droplets, Thermometer, X, XCircle } from "lucide-react";
import { getAssetTypeConfig } from "@/services/compliance/complianceQrService";
import { playBeep } from "@/utils/beep";

// The two "one job" screens a check opens into once a tag has been tapped.
// Who did it, and when, is never asked for: the service stamps it.

function assetTitle(asset) {
  return [asset?.assetCode, asset?.label].filter(Boolean).join(" • ") || "Compliance asset";
}

function SheetFrame({ asset, eyebrow, onCancel, children }) {
  const config = getAssetTypeConfig(asset?.assetType);
  return (
    <div className="fixed inset-0 z-[200] flex items-end bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-[2rem] border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-[var(--medtrak-text)] shadow-2xl">
        <div className="mx-auto max-w-md">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--medtrak-accent)]">{eyebrow}</p>
              <h2 className="mt-1 text-2xl font-bold">{assetTitle(asset)}</h2>
              <p className="mt-1 text-sm text-[var(--medtrak-muted)]">{asset?.location || "No location"} • {config.label}</p>
            </div>
            <button type="button" onClick={onCancel} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--medtrak-border)] text-[var(--medtrak-muted)]">
              <X className="h-5 w-5" />
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

const NOTES_CLASS = "mt-4 w-full rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-4 py-3 text-sm text-[var(--medtrak-text)] outline-none";

// ---------------------------------------------------------------------------
// Temperature check. For a water outlet the phone first counts down while the
// water runs, and keeps the temperature box locked until that ends; then the
// person types the reading, says whether the outlet was flushed, and adds any
// notes. The countdown runs off the clock, not a tick count, so a locked
// screen or a backgrounded app doesn't stretch it.
// ---------------------------------------------------------------------------
const RING_LENGTH = 2 * Math.PI * 54;

export function TemperatureCheckSheet({ asset, seconds = 0, showFlushed = false, busy, onSubmit, onCancel }) {
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [finishedAt, setFinishedAt] = useState(() => (seconds > 0 ? null : Date.now()));
  const [tempC, setTempC] = useState("");
  const [flushed, setFlushed] = useState(false);
  const [notes, setNotes] = useState("");
  const tempRef = useRef(null);

  const endsAt = startedAt + seconds * 1000;
  const counting = finishedAt === null;
  const remainingMs = counting ? Math.max(0, endsAt - now) : 0;

  useEffect(() => {
    if (!counting) return undefined;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= endsAt) {
        window.clearInterval(timer);
        setFinishedAt(current);
        playBeep(3);
        try { navigator.vibrate?.([200, 100, 200]); } catch { /* not supported */ }
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [counting, endsAt]);

  // Keep the screen awake while the water runs, so the timer stays in view.
  useEffect(() => {
    if (!counting) return undefined;
    let lock = null;
    navigator.wakeLock?.request?.("screen").then((l) => { lock = l; }).catch(() => {});
    return () => { lock?.release?.().catch(() => {}); };
  }, [counting]);

  useEffect(() => {
    if (!counting) tempRef.current?.focus();
  }, [counting]);

  const min = asset?.minTempC ?? getAssetTypeConfig(asset?.assetType).minTempC;
  const max = asset?.maxTempC ?? getAssetTypeConfig(asset?.assetType).maxTempC;
  const parsed = tempC === "" ? null : Number(tempC);
  const hasTemp = parsed !== null && Number.isFinite(parsed);
  const inRange = hasTemp && (min === null || min === undefined || parsed >= Number(min)) && (max === null || max === undefined || parsed <= Number(max));

  const secondsLeft = Math.ceil(remainingMs / 1000);
  const progress = seconds > 0 ? Math.min(1, (seconds * 1000 - remainingMs) / (seconds * 1000)) : 1;

  function save() {
    onSubmit({
      tempC,
      flushed: showFlushed ? flushed : undefined,
      notes,
      countdown: seconds > 0 ? { seconds, startedAt: new Date(startedAt).toISOString(), completedAt: new Date(finishedAt).toISOString() } : null,
    });
  }

  return (
    <SheetFrame asset={asset} eyebrow={seconds > 0 ? "Water check" : "Temperature check"} onCancel={onCancel}>
      {counting ? (
        <div className="mt-6 text-center">
          <div className="relative mx-auto h-44 w-44">
            <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden="true">
              <circle cx="60" cy="60" r="54" fill="none" stroke="var(--medtrak-border)" strokeWidth="8" />
              <circle cx="60" cy="60" r="54" fill="none" stroke="var(--medtrak-accent)" strokeWidth="8" strokeLinecap="round" strokeDasharray={RING_LENGTH} strokeDashoffset={RING_LENGTH * (1 - progress)} style={{ transition: "stroke-dashoffset 0.25s linear" }} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center" role="timer" aria-live="off">
              <Droplets className="mb-1 h-6 w-6 text-[var(--medtrak-accent)]" />
              <span className="text-5xl font-bold tabular-nums">{secondsLeft}</span>
              <span className="text-xs text-[var(--medtrak-muted)]">seconds</span>
            </div>
          </div>
          <p className="mt-5 text-lg font-bold">Run the water now</p>
          <p className="mt-1 text-sm text-[var(--medtrak-muted)]">The temperature box unlocks when the timer ends.</p>
        </div>
      ) : (
        <div className="mt-5">
          <label htmlFor="temp-input" className="text-xs font-semibold uppercase tracking-wide text-[var(--medtrak-muted)]">Temperature °C</label>
          <div className={`mt-2 flex items-center gap-3 rounded-[1.5rem] border px-4 py-3 ${hasTemp ? (inRange ? "border-emerald-500/50 bg-emerald-500/10" : "border-rose-500/50 bg-rose-500/10") : "border-[var(--medtrak-border)] bg-[var(--medtrak-panel)]"}`}>
            <Thermometer className="h-6 w-6 text-[var(--medtrak-accent)]" />
            <input
              id="temp-input"
              ref={tempRef}
              type="number"
              inputMode="decimal"
              step="0.1"
              value={tempC}
              onChange={(e) => setTempC(e.target.value)}
              placeholder="e.g. 55.2"
              className="w-full bg-transparent text-3xl font-bold outline-none"
            />
          </div>
          <p className="mt-2 text-xs text-[var(--medtrak-muted)]">
            Range {min ?? "—"}°C to {max ?? "—"}°C
            {hasTemp && <span className={`ml-2 font-bold ${inRange ? "text-emerald-600" : "text-rose-600"}`}>{inRange ? "In range" : "Outside range"}</span>}
          </p>

          {showFlushed && (
            <button
              type="button"
              onClick={() => setFlushed((v) => !v)}
              aria-pressed={flushed}
              className={`mt-4 flex w-full items-center justify-between rounded-2xl border px-4 py-4 text-left ${flushed ? "border-emerald-500/50 bg-emerald-500/10" : "border-[var(--medtrak-border)] bg-[var(--medtrak-panel)]"}`}
            >
              <span>
                <span className="block font-bold">Outlet flushed</span>
                <span className="block text-xs text-[var(--medtrak-muted)]">Tap to tick if you flushed it</span>
              </span>
              <span className={`grid h-8 w-8 place-items-center rounded-full ${flushed ? "bg-emerald-500 text-white" : "border border-[var(--medtrak-border)]"}`}>
                {flushed && <CheckCircle2 className="h-5 w-5" />}
              </span>
            </button>
          )}

          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notes / issues (optional)" className={NOTES_CLASS} />
          <button
            type="button"
            onClick={save}
            disabled={busy || !hasTemp}
            className="mt-4 w-full rounded-[1.5rem] bg-[var(--medtrak-accent)] px-4 py-4 text-lg font-bold text-white disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      )}
      <button type="button" onClick={onCancel} className="mt-3 w-full rounded-2xl border border-[var(--medtrak-border)] px-4 py-3 text-[var(--medtrak-muted)]">Cancel</button>
    </SheetFrame>
  );
}

// ---------------------------------------------------------------------------
// Pass / fail check (fire call points, fire doors, AED, emergency kit).
// PASS saves straight away. FAIL asks once for a note about the fault, then
// saves; it can be saved without one.
// ---------------------------------------------------------------------------
export function PassFailSheet({ asset, eyebrow = "Check", busy, onSubmit, onCancel }) {
  const [notes, setNotes] = useState("");
  const [askedForNote, setAskedForNote] = useState(false);
  const notesRef = useRef(null);

  function fail() {
    if (!notes.trim() && !askedForNote) {
      setAskedForNote(true);
      notesRef.current?.focus();
      return;
    }
    onSubmit({ status: "fail", notes });
  }

  return (
    <SheetFrame asset={asset} eyebrow={eyebrow} onCancel={onCancel}>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <button type="button" onClick={() => onSubmit({ status: "pass", notes })} disabled={busy} className="rounded-[1.5rem] bg-emerald-500 px-4 py-8 text-center text-2xl font-bold text-white disabled:opacity-50">
          <CheckCircle2 className="mx-auto mb-2 h-10 w-10" />
          PASS
        </button>
        <button type="button" onClick={fail} disabled={busy} className="rounded-[1.5rem] bg-rose-600 px-4 py-8 text-center text-2xl font-bold text-white disabled:opacity-50">
          <XCircle className="mx-auto mb-2 h-10 w-10" />
          FAIL
        </button>
      </div>
      <textarea
        ref={notesRef}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
        placeholder="Notes / issues (optional)"
        className={`${NOTES_CLASS} ${askedForNote ? "border-rose-500/60" : ""}`}
      />
      {askedForNote && <p className="mt-2 text-sm text-rose-600">Add a note about the fault if you can, then tap FAIL again. Tapping FAIL with no note saves it as it is.</p>}
      <button type="button" onClick={onCancel} className="mt-3 w-full rounded-2xl border border-[var(--medtrak-border)] px-4 py-3 text-[var(--medtrak-muted)]">Cancel</button>
    </SheetFrame>
  );
}
