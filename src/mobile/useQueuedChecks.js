import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { deviceStorage, queueSize, refusedCount, retryRefused } from "@/modules/compliance/offlineChecks";
import { flushQueuedComplianceChecks } from "@/services/compliance/complianceQrService";

// Checks done with no signal wait on the phone; this sends them when there is one. It tries when the app opens, when the
// phone comes back online and once a minute while any are waiting, for the person signed in. `waiting` is how many are
// still on the phone, `refused` how many the server turned down (they stay, with the reason, until tried again).
export default function useQueuedChecks() {
  const { user } = useAuth();
  const uid = user?.uid || null;
  const [counts, setCounts] = useState(() => ({ waiting: queueSize(deviceStorage()), refused: refusedCount(deviceStorage()) }));
  const [sending, setSending] = useState(false);

  const refresh = useCallback(() => setCounts({ waiting: queueSize(deviceStorage()), refused: refusedCount(deviceStorage()) }), []);

  const sendNow = useCallback(async () => {
    if (!uid || queueSize(deviceStorage()) === 0) { refresh(); return null; }
    setSending(true);
    try {
      return await flushQueuedComplianceChecks();
    } catch (error) {
      console.warn("Could not send the waiting checks", error);
      return null;
    } finally {
      setSending(false);
      refresh();
    }
  }, [uid, refresh]);

  const tryAgain = useCallback(() => { retryRefused(deviceStorage()); refresh(); return sendNow(); }, [refresh, sendNow]);

  useEffect(() => {
    sendNow();
    const onOnline = () => sendNow();
    window.addEventListener("online", onOnline);
    const timer = window.setInterval(() => { refresh(); if (queueSize(deviceStorage()) > 0) sendNow(); }, 60000);
    return () => { window.removeEventListener("online", onOnline); window.clearInterval(timer); };
  }, [sendNow, refresh]);

  return { ...counts, sending, sendNow, tryAgain, refresh };
}
