import { useCallback, useEffect, useState } from "react";
import { KeyRound, LockKeyhole, LogOut, ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSession } from "@/contexts/SessionContext";
import { digest } from "@/lib/localPin";
import PrimovexLogo from "@/components/brand/PrimovexLogo";

const PIN_KEY = "primovex.desktop.pin";
const UNLOCK_KEY = "primovex.desktop.unlocked";
// Same 15-minute window as MobileSessionShell — left unattended, a practice
// PC is at least as exposed as a phone, arguably more so (it sits on a desk
// all day rather than staying on a person).
const IDLE_LIMIT = 15 * 60 * 1000;

// Desktop equivalent of MobileSessionShell — same idle-detection shape, but
// PIN-only (no biometric): WebAuthn platform-authenticator support inside
// the Tauri WebView2 host isn't as consistently available as Android's, so
// this keeps the unlock path simple and reliable rather than offering a
// fingerprint/face option that might not work on a given machine.
export default function DesktopSessionShell({ children }) {
  const { user, displayName } = useAuth();
  const { endSession, expiresAtMs } = useSession();
  const pinKey = `${PIN_KEY}.${user?.uid || "anonymous"}`;
  const unlockKey = `${UNLOCK_KEY}.${user?.uid || "anonymous"}`;

  const [locked, setLocked] = useState(() => sessionStorage.getItem(`${UNLOCK_KEY}.${user?.uid || "anonymous"}`) !== "yes");
  const [hasPin, setHasPin] = useState(() => Boolean(localStorage.getItem(pinKey)));
  const [mode, setMode] = useState(() => (hasPin ? "pin" : "set-pin"));
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [message, setMessage] = useState("");
  const [lastActivity, setLastActivity] = useState(Date.now());

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
    setHasPin(Boolean(localStorage.getItem(pinKey)));
    setMode(localStorage.getItem(pinKey) ? "pin" : "set-pin");
  }, [unlockKey, pinKey]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!locked && Date.now() - lastActivity >= IDLE_LIMIT) lock();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [lastActivity, lock, locked]);

  useEffect(() => {
    const mark = () => !locked && setLastActivity(Date.now());
    const events = ["pointerdown", "keydown", "scroll"];
    events.forEach((event) => window.addEventListener(event, mark, { passive: true }));
    return () => events.forEach((event) => window.removeEventListener(event, mark));
  }, [locked]);

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
    setHasPin(Boolean(localStorage.getItem(pinKey)));
    setPin("");
    setConfirmPin("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlockKey, pinKey]);

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
    setHasPin(true);
    unlock();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {children}
      {locked && (
        <div className="fixed inset-0 z-[190] flex items-center justify-center bg-slate-950/97 p-5 backdrop-blur">
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-2xl shadow-black/40">
            <div className="flex justify-center"><PrimovexLogo compact /></div>
            <h1 className="mt-6 text-center text-xl font-bold leading-tight text-white">Welcome back{displayName ? `, ${displayName.split(" ")[0]}` : ""}</h1>
            <p className="mt-1 text-center text-sm text-slate-400">Primovex locked itself after 15 minutes idle</p>

            {message && <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-center text-sm text-slate-200">{message}</div>}

            <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/60 p-5">
              <div className="flex items-center gap-2 font-bold text-white"><LockKeyhole className="h-5 w-5" /> {mode === "pin" ? "Enter PIN" : "Create a desktop PIN"}</div>
              <input type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="••••••" aria-label="Six-digit PIN" className="mt-4 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-4 text-center text-2xl tracking-[0.5em] text-white" />
              {mode === "set-pin" && <input type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))} placeholder="••••••" aria-label="Confirm six-digit PIN" className="mt-3 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-4 text-center text-lg tracking-[0.25em] text-white" />}
              <button type="button" onClick={mode === "pin" ? submitPin : savePin} className="mt-4 w-full rounded-2xl bg-teal-400 px-4 py-3 font-bold text-slate-950 hover:bg-teal-300">
                <span className="inline-flex items-center justify-center gap-2"><KeyRound className="h-4 w-4" /> Continue</span>
              </button>
            </div>

            <button type="button" onClick={() => endSession("manual_sign_out")} className="mt-5 flex w-full items-center justify-center gap-2 px-4 py-3 text-sm text-slate-400 hover:text-slate-200"><LogOut className="h-4 w-4" /> Sign out instead</button>
            <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-500"><ShieldCheck className="h-4 w-4" /> Protected desktop session</div>
          </div>
        </div>
      )}
      {!locked && <button type="button" onClick={lock} className="fixed right-4 top-4 z-[80] rounded-full border border-white/10 bg-slate-900/80 p-2.5 text-slate-300 hover:text-white" aria-label="Lock Primovex"><LockKeyhole className="h-4 w-4" /></button>}
    </div>
  );
}
