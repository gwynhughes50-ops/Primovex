import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  ABSOLUTE_SESSION_MS,
  endDeviceSession,
  getDeviceId,
  startOrResumeDeviceSession,
  touchDeviceSession,
} from "@/services/deviceSessionService";

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const { user, displayName, signOut, isSyntheticMode } = useAuth();
  const [deviceSession, setDeviceSession] = useState(null);
  const [loading, setLoading] = useState(false);
  const expiryTimerRef = useRef(null);
  const touchTimerRef = useRef(0);

  const expireSession = useCallback(async (reason = "session_timeout") => {
    const deviceId = getDeviceId();
    try {
      await endDeviceSession(deviceId, reason);
    } finally {
      sessionStorage.clear();
      setDeviceSession(null);
      await signOut();
    }
  }, [signOut]);

  useEffect(() => {
    window.clearTimeout(expiryTimerRef.current);
    if (!user || isSyntheticMode) {
      setDeviceSession(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    startOrResumeDeviceSession({ user, displayName })
      .then((session) => {
        if (cancelled) return;
        setDeviceSession(session);
        const delay = Math.max(0, (session.expiresAtMs || Date.now() + ABSOLUTE_SESSION_MS) - Date.now());
        expiryTimerRef.current = window.setTimeout(() => expireSession("session_timeout"), delay);
      })
      .catch((error) => console.error("Unable to initialise Primovex device session", error))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
      window.clearTimeout(expiryTimerRef.current);
    };
  }, [user?.uid, displayName, isSyntheticMode, expireSession]);

  useEffect(() => {
    if (!deviceSession?.deviceId) return;
    const mark = () => {
      const now = Date.now();
      if (now - touchTimerRef.current < 60_000) return;
      touchTimerRef.current = now;
      touchDeviceSession(deviceSession.deviceId).catch(() => {});
    };
    const events = ["pointerdown", "keydown", "touchstart"];
    events.forEach((event) => window.addEventListener(event, mark, { passive: true }));
    return () => events.forEach((event) => window.removeEventListener(event, mark));
  }, [deviceSession?.deviceId]);

  const value = useMemo(() => ({
    deviceId: deviceSession?.deviceId || getDeviceId(),
    deviceSession,
    loading,
    expiresAtMs: deviceSession?.expiresAtMs || 0,
    endSession: expireSession,
    setDeviceSession,
  }), [deviceSession, loading, expireSession]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used inside SessionProvider");
  return context;
}
