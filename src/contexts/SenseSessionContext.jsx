import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSession } from "@/contexts/SessionContext";
import { updateDeviceSenseContext } from "@/services/deviceSessionService";
import {
  activateSenseObject,
  closeSenseSession,
  getActiveSenseSession,
} from "@/modules/sense/services/senseSessionService";

const SenseSessionContext = createContext(null);

export function SenseSessionProvider({ children }) {
  const { user, displayName } = useAuth();
  const { deviceId, deviceSession } = useSession();
  const [activeSenseSession, setActiveSenseSession] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user?.uid || !deviceId) {
      setActiveSenseSession(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getActiveSenseSession({ userId: user.uid, deviceId })
      .then((session) => !cancelled && setActiveSenseSession(session))
      .catch((error) => console.error("Unable to restore Sense session", error))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [user?.uid, deviceId]);

  const activate = useCallback(async ({ id, name, type = "space", source = "nfc" }) => {
    setLoading(true);
    try {
      const next = await activateSenseObject({
        user,
        displayName,
        deviceId,
        currentSession: activeSenseSession,
        senseObjectId: id,
        senseObjectName: name || id,
        senseObjectType: type,
        source,
      });
      setActiveSenseSession(next);
      await updateDeviceSenseContext(deviceId, {
        sessionId: next.id,
        senseObjectId: next.senseObjectId,
        senseObjectName: next.senseObjectName,
      });
      return next;
    } finally {
      setLoading(false);
    }
  }, [user, displayName, deviceId, activeSenseSession]);

  const clear = useCallback(async (reason = "manual_clear") => {
    if (activeSenseSession?.id) await closeSenseSession(activeSenseSession.id, reason);
    setActiveSenseSession(null);
    await updateDeviceSenseContext(deviceId, {});
  }, [activeSenseSession?.id, deviceId]);

  useEffect(() => {
    if (!deviceSession || deviceSession.status !== "active") setActiveSenseSession(null);
  }, [deviceSession]);

  const value = useMemo(() => ({ activeSenseSession, activate, clear, loading }), [activeSenseSession, activate, clear, loading]);
  return <SenseSessionContext.Provider value={value}>{children}</SenseSessionContext.Provider>;
}

export function useSenseSession() {
  const context = useContext(SenseSessionContext);
  if (!context) throw new Error("useSenseSession must be used inside SenseSessionProvider");
  return context;
}
