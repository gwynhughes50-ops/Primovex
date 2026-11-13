import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { fetchSarsToChase } from "@/modules/governance/services/sarReminderClient";

// Who has a bell, and for which SARs. Asked of the server once a person opens the app (and again after a reminder is sent or when a page asks),
// shared by everything that needs it so the menu, the SARs page and the phone make one request between them.
const shared = new Map(); // uid -> { at, promise }
const FRESH_MS = 2 * 60 * 1000;

function load(uid, force) {
  const hit = shared.get(uid);
  if (!force && hit && Date.now() - hit.at < FRESH_MS) return hit.promise;
  const promise = fetchSarsToChase();
  shared.set(uid, { at: Date.now(), promise });
  promise.catch(() => { if (shared.get(uid)?.promise === promise) shared.delete(uid); });
  return promise;
}

export function useSarsToChase({ enabled = true } = {}) {
  const { user, isSyntheticMode } = useAuth();
  const uid = user?.uid || "";
  const [state, setState] = useState({ canChase: false, rows: [], loading: !!enabled, error: "" });

  const reload = useCallback(async (force = true) => {
    if (!enabled || !uid || isSyntheticMode) { setState({ canChase: false, rows: [], loading: false, error: "" }); return; }
    try {
      const result = await load(uid, force);
      setState({ canChase: result.canChase, rows: result.rows, loading: false, error: "" });
    } catch (err) {
      console.warn("Could not load the SARs to chase.", err);
      setState({ canChase: false, rows: [], loading: false, error: "The list of SARs to chase could not be loaded." });
    }
  }, [enabled, uid, isSyntheticMode]);

  useEffect(() => { reload(false); }, [reload]);

  const byId = useMemo(() => new Map(state.rows.map((row) => [row.id, row])), [state.rows]);
  return { ...state, byId, reload };
}
