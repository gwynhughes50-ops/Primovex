import { useEffect, useSyncExternalStore } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isSafeSyntheticMode } from "@/config/platformMode";
import {
  getExpirySettings,
  normaliseExpirySettings,
  setExpirySettings,
  subscribeExpirySettings,
} from "@/lib/stockAlerts";

// The practice's "expiring soon" windows (settings/alerts, edited on the Alerts
// page). One live subscription is shared by every component that calls this;
// it keeps the current values in src/lib/stockAlerts.js, so the expiry helpers
// work everywhere, and calling the hook makes a component re-render when the
// practice changes them. Before the first read arrives the defaults apply.
let users = 0;
let stop = null;

function start() {
  stop = onSnapshot(
    doc(db, "settings", "alerts"),
    (snap) => setExpirySettings(normaliseExpirySettings(snap.exists() ? snap.data() : {})),
    (error) => console.warn("Could not read the expiry settings; using the defaults.", error)
  );
}

export default function useExpirySettings() {
  useEffect(() => {
    users += 1;
    if (users === 1 && !isSafeSyntheticMode()) start();
    return () => {
      users -= 1;
      if (users === 0 && stop) {
        stop();
        stop = null;
      }
    };
  }, []);

  return useSyncExternalStore(subscribeExpirySettings, getExpirySettings, getExpirySettings);
}
