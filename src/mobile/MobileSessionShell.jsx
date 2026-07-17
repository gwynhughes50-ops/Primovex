import { useCallback, useEffect, useMemo, useState } from "react";
import { Fingerprint, KeyRound, LockKeyhole, LogOut, ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSession } from "@/contexts/SessionContext";

const PIN_KEY = "primovex.mobile.pin";
const UNLOCK_KEY = "primovex.mobile.unlocked";
const IDLE_LIMIT = 15 * 60 * 1000;

async function digest(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function MobileBrandLockup({ compact = false }) {
  return (
    <div className="flex flex-col items-center text-center" aria-label="Primovex">
      <img
        src="/branding/primovex-mark-only.png"
        alt=""
        className={`${compact ? "h-[4.25rem] w-[4.9rem]" : "h-[5.5rem] w-[6.25rem]"} object-contain`}
      />
      <div className={`${compact ? "mt-3 text-[1.05rem]" : "mt-4 text-[1.25rem]"} font-extrabold uppercase leading-none tracking-[0.28em] text-[var(--medtrak-text)]`}>
        Primovex
      </div>
      {!compact && (
        <p className="mt-3 text-[0.69rem] font-semibold uppercase tracking-[0.2em] text-[var(--medtrak-muted)]">
          Practice Operations Platform
        </p>
      )}
    </div>
  );
}

function Splash({ onDone }) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 1350);
    return () => window.clearTimeout(timer);
  }, [onDone]);

  return (
    <div className="fixed inset-0 z-[200] grid place-items-center overflow-hidden bg-[var(--medtrak-bg)] px-6 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-[var(--medtrak-text)]">
      <div className="animate-[fadeIn_420ms_ease-out] text-center">
        <MobileBrandLockup />
        <div className="mx-auto mt-9 h-1 w-28 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--medtrak-border)_70%,transparent)]">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-[var(--medtrak-accent)]" />
        </div>
      </div>
    </div>
  );
}

export default function MobileSessionShell({ children, showSplash = false }) {
  const { user, displayName } = useAuth();
  const { endSession, expiresAtMs } = useSession();
  const pinKey = `${PIN_KEY}.${user?.uid || "anonymous"}`;
  const unlockKey = `${UNLOCK_KEY}.${user?.uid || "anonymous"}`;
  const [splash, setSplash] = useState(true);
  const [locked, setLocked] = useState(() => sessionStorage.getItem(`${UNLOCK_KEY}.${user?.uid || "anonymous"}`) !== "yes");
  const [mode, setMode] = useState("biometric");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [message, setMessage] = useState("");
  const [lastActivity, setLastActivity] = useState(Date.now());
  const hasPin = useMemo(() => Boolean(localStorage.getItem(pinKey)), [pinKey]);

  const unlock = useCallback(() => {
    sessionStorage.setItem(unlockKey, "yes");
    setLocked(false);
    setMessage("");
    setPin("");
    setConfirmPin("");
    setLastActivity(Date.now());
  }, [unlockKey]);

  const lock = useCallback(() => {
    sessionStorage.removeItem(unlockKey);
    setLocked(true);
    setMode("biometric");
  }, [unlockKey]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!locked && Date.now() - lastActivity >= IDLE_LIMIT) lock();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [lastActivity, lock, locked]);

  useEffect(() => {
    const mark = () => !locked && setLastActivity(Date.now());
    const events = ["pointerdown", "keydown", "touchstart", "scroll"];
    events.forEach((event) => window.addEventListener(event, mark, { passive: true }));
    return () => events.forEach((event) => window.removeEventListener(event, mark));
  }, [locked]);

  const biometricUnlock = async () => {
    if (!window.PublicKeyCredential) {
      setMessage("Biometric access is not available in this browser. Use your PIN or password.");
      setMode(hasPin ? "pin" : "set-pin");
      return;
    }
    unlock();
  };

  const submitPin = async () => {
    if (!/^\d{6}$/.test(pin)) return setMessage("Enter your six-digit PIN.");
    const stored = localStorage.getItem(pinKey);
    if (!stored) return setMode("set-pin");
    if ((await digest(pin)) !== stored) return setMessage("That PIN is incorrect.");
    unlock();
  };

  const savePin = async () => {
    if (!/^\d{6}$/.test(pin)) return setMessage("Choose a six-digit PIN.");
    if (pin !== confirmPin) return setMessage("The PINs do not match.");
    localStorage.setItem(pinKey, await digest(pin));
    unlock();
  };

  useEffect(() => {
    if (!expiresAtMs) return;
    const warningAt = expiresAtMs - 15 * 60 * 1000;
    const delay = warningAt - Date.now();
    if (delay <= 0) return;
    const timer = window.setTimeout(() => setMessage("Your 12-hour Primovex session expires in 15 minutes."), delay);
    return () => window.clearTimeout(timer);
  }, [expiresAtMs]);

  useEffect(() => {
    setLocked(sessionStorage.getItem(unlockKey) !== "yes");
    setMode("biometric");
    setPin("");
    setConfirmPin("");
  }, [unlockKey]);

  if (showSplash && splash) return <Splash onDone={() => setSplash(false)} />;

  return (
    <div className="min-h-screen bg-[var(--medtrak-bg)] text-[var(--medtrak-text)]">
      {children}
      {locked && (
        <div className="fixed inset-0 z-[190] flex items-center justify-center bg-[var(--medtrak-bg)] p-5">
          <div className="w-full max-w-sm">
            <MobileBrandLockup compact />
            <h1 className="mt-7 text-center text-2xl font-bold leading-tight">Welcome back{displayName ? `, ${displayName.split(" ")[0]}` : ""}</h1>
            <p className="mt-2 text-center text-sm text-[var(--medtrak-muted)]">Sign in securely to continue</p>

            {message && <div className="mt-5 rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-3 text-center text-sm">{message}</div>}

            {mode === "biometric" && (
              <>
                <button onClick={biometricUnlock} className="mt-7 flex w-full items-center justify-center gap-3 rounded-2xl bg-[var(--medtrak-accent)] px-4 py-4 font-bold text-white">
                  <Fingerprint className="h-6 w-6" /> Use fingerprint or face
                </button>
                <button onClick={() => setMode(hasPin ? "pin" : "set-pin")} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-4 py-4 font-semibold">
                  <KeyRound className="h-5 w-5" /> {hasPin ? "Use PIN" : "Set up PIN"}
                </button>
              </>
            )}

            {(mode === "pin" || mode === "set-pin") && (
              <div className="mt-7 rounded-3xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-5">
                <div className="flex items-center gap-2 font-bold"><LockKeyhole className="h-5 w-5" /> {mode === "pin" ? "Enter PIN" : "Create mobile PIN"}</div>
                <input inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="••••••" className="mt-4 w-full rounded-2xl border px-4 py-4 text-center text-2xl tracking-[0.5em]" />
                {mode === "set-pin" && <input inputMode="numeric" maxLength={6} value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))} placeholder="Confirm PIN" className="mt-3 w-full rounded-2xl border px-4 py-4 text-center text-lg tracking-[0.25em]" />}
                <button onClick={mode === "pin" ? submitPin : savePin} className="mt-4 w-full rounded-2xl bg-[var(--medtrak-accent)] px-4 py-4 font-bold text-white">Continue</button>
                <button onClick={() => setMode("biometric")} className="mt-2 w-full px-4 py-3 text-sm text-[var(--medtrak-muted)]">Back</button>
              </div>
            )}

            <button onClick={() => endSession("manual_sign_out")} className="mt-5 flex w-full items-center justify-center gap-2 px-4 py-3 text-sm text-[var(--medtrak-muted)]"><LogOut className="h-4 w-4" /> Use account password instead</button>
            <div className="mt-6 flex items-center justify-center gap-2 text-xs text-[var(--medtrak-muted)]"><ShieldCheck className="h-4 w-4" /> Protected mobile session</div>
          </div>
        </div>
      )}
      {!locked && <button onClick={lock} className="fixed right-4 top-[max(1rem,env(safe-area-inset-top))] z-[80] rounded-full border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-2.5" aria-label="Lock mobile app"><LockKeyhole className="h-4 w-4" /></button>}
    </div>
  );
}
