import { useCallback, useEffect, useMemo, useState } from "react";
import { Fingerprint, Lock, LogOut, ShieldCheck, TimerReset, Zap } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";

const SESSION_STARTED_KEY = "medtrak_mobile_session_started_at";
const BIOMETRIC_CREDENTIAL_KEY = "medtrak_mobile_platform_credential";
const IDLE_LIMIT_MS = 10 * 60 * 1000;
const IDLE_WARNING_MS = 8 * 60 * 1000;

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }

  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function randomChallenge() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytes;
}

function bufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBuffer(value) {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`;
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
}

function supportsPlatformAuthenticator() {
  return Boolean(
    window.PublicKeyCredential &&
      navigator.credentials &&
      window.isSecureContext
  );
}

async function registerPlatformCredential(displayName, userId) {
  if (!supportsPlatformAuthenticator()) {
    throw new Error("Face ID / Touch ID is not available in this browser. Install MedTrak Mobile as a secure PWA or use a supported device.");
  }

  const uid = new TextEncoder().encode(userId || displayName || "medtrak-mobile-user");

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: randomChallenge(),
      rp: { name: "MedTrak Mobile" },
      user: {
        id: uid,
        name: displayName || "MedTrak Mobile User",
        displayName: displayName || "MedTrak Mobile User",
      },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "preferred",
      },
      timeout: 60000,
      attestation: "none",
    },
  });

  const payload = {
    id: credential.id,
    rawId: bufferToBase64Url(credential.rawId),
    displayName,
    createdAt: new Date().toISOString(),
  };

  localStorage.setItem(BIOMETRIC_CREDENTIAL_KEY, JSON.stringify(payload));
  return payload;
}

async function unlockWithPlatformCredential() {
  const saved = JSON.parse(localStorage.getItem(BIOMETRIC_CREDENTIAL_KEY) || "null");

  if (!saved?.rawId) {
    throw new Error("Quick unlock has not been enabled on this device yet.");
  }

  if (!supportsPlatformAuthenticator()) {
    throw new Error("Face ID / Touch ID is not available in this browser.");
  }

  await navigator.credentials.get({
    publicKey: {
      challenge: randomChallenge(),
      allowCredentials: [
        {
          id: base64UrlToBuffer(saved.rawId),
          type: "public-key",
          transports: ["internal"],
        },
      ],
      timeout: 60000,
      userVerification: "required",
    },
  });

  return true;
}

export default function MobileSessionShell({ children }) {
  const { user, displayName, signOut } = useAuth();
  const [now, setNow] = useState(Date.now());
  const [lastActivity, setLastActivity] = useState(Date.now());
  const [locked, setLocked] = useState(false);
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [biometricEnabled, setBiometricEnabled] = useState(() => Boolean(localStorage.getItem(BIOMETRIC_CREDENTIAL_KEY)));

  const sessionStartedAt = useMemo(() => {
    const existing = Number(sessionStorage.getItem(SESSION_STARTED_KEY));
    if (existing) return existing;

    const created = Date.now();
    sessionStorage.setItem(SESSION_STARTED_KEY, String(created));
    return created;
  }, []);

  const sessionLength = now - sessionStartedAt;
  const idleFor = now - lastActivity;
  const showWarning = !locked && idleFor >= IDLE_WARNING_MS;
  const timeToLock = Math.max(0, IDLE_LIMIT_MS - idleFor);

  const markActivity = useCallback(() => {
    if (!locked) {
      setLastActivity(Date.now());
    }
  }, [locked]);

  const lockSession = useCallback((reason = "MedTrak Mobile locked to save battery and protect the session.") => {
    setLocked(true);
    setMessage(reason);
    window.dispatchEvent(new CustomEvent("medtrak-mobile-lock"));
  }, []);

  const unlockSession = useCallback(() => {
    setLocked(false);
    setMessage("");
    setLastActivity(Date.now());
  }, []);

  const handleBiometricUnlock = async () => {
    setUnlockBusy(true);
    setMessage("");

    try {
      await unlockWithPlatformCredential();
      unlockSession();
    } catch (err) {
      setMessage(err?.message || "Unable to unlock with this device.");
    } finally {
      setUnlockBusy(false);
    }
  };

  const handleEnableBiometric = async () => {
    setBioBusy(true);
    setMessage("");

    try {
      await registerPlatformCredential(displayName || user?.email, user?.uid);
      setBiometricEnabled(true);
      setMessage("Quick unlock enabled on this device.");
    } catch (err) {
      setMessage(err?.message || "Unable to enable quick unlock on this device.");
    } finally {
      setBioBusy(false);
    }
  };

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!locked && idleFor >= IDLE_LIMIT_MS) {
      lockSession("Locked after 10 minutes of inactivity to save battery and protect practice data.");
    }
  }, [idleFor, lockSession, locked]);

  useEffect(() => {
    const events = ["touchstart", "click", "keydown", "scroll"];
    events.forEach((eventName) => window.addEventListener(eventName, markActivity, { passive: true }));

    return () => {
      events.forEach((eventName) => window.removeEventListener(eventName, markActivity));
    };
  }, [markActivity]);

  return (
    <div className="relative min-h-screen" aria-busy={locked ? "true" : "false"}>
      <div className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/95 px-4 py-2 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-teal-200">MedTrak Mobile</p>
            <p className="text-xs text-slate-400">Session {formatDuration(sessionLength)}</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={lockSession}
              className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200"
            >
              <Lock className="h-3.5 w-3.5" /> Lock
            </button>
            <button
              type="button"
              onClick={signOut}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-slate-900 text-slate-300"
              aria-label="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {showWarning && (
        <div className="fixed inset-x-3 top-14 z-[65] mx-auto max-w-md rounded-2xl border border-amber-400/30 bg-amber-500/15 p-3 text-sm text-amber-50 shadow-2xl shadow-black/30">
          <div className="flex items-start gap-2">
            <TimerReset className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-bold">Battery saver will lock soon</p>
              <p className="text-xs text-amber-100/80">No activity detected. Locking in {formatDuration(timeToLock)} unless you continue working.</p>
            </div>
          </div>
        </div>
      )}

      {children}

      {locked && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/95 p-5 backdrop-blur-md">
          <div className="w-full max-w-md rounded-[2rem] border border-teal-400/20 bg-slate-900/95 p-6 text-center shadow-2xl shadow-black/40">
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-full border border-teal-400/30 bg-teal-500/10 text-teal-100">
              <Fingerprint className="h-9 w-9" />
            </div>

            <p className="mt-5 text-xs font-black uppercase tracking-[0.3em] text-teal-200">MedTrak Mobile</p>
            <h1 className="mt-2 text-2xl font-black text-white">Secure mobile session</h1>
            <p className="mt-2 text-sm text-slate-400">
              Logged in for {formatDuration(sessionLength)}. Unlock quickly to continue, or sign out if this is a shared device.
            </p>

            {message && (
              <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/70 p-3 text-sm text-slate-200">
                {message}
              </div>
            )}

            <button
              type="button"
              onClick={handleBiometricUnlock}
              disabled={unlockBusy || !biometricEnabled}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-teal-400 px-4 py-4 text-sm font-black text-slate-950 shadow-lg shadow-teal-500/20 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              <Fingerprint className="h-5 w-5" />
              {unlockBusy ? "Checking device…" : "Unlock with Face / Touch ID"}
            </button>

            {!biometricEnabled && (
              <button
                type="button"
                onClick={handleEnableBiometric}
                disabled={bioBusy}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-100 disabled:opacity-60"
              >
                <ShieldCheck className="h-4 w-4" />
                {bioBusy ? "Enabling…" : "Enable quick unlock on this device"}
              </button>
            )}

            <button
              type="button"
              onClick={unlockSession}
              className="mt-3 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm font-semibold text-slate-200"
            >
              Continue this session
            </button>

            <button
              type="button"
              onClick={signOut}
              className="mt-3 w-full rounded-2xl px-4 py-3 text-sm font-semibold text-slate-500"
            >
              Sign out
            </button>

            <div className="mt-5 flex items-center justify-center gap-2 text-xs text-slate-500">
              <Zap className="h-3.5 w-3.5" /> Camera and live tasks pause while locked to conserve battery.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
