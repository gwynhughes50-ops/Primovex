import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useOrbStatus } from "@/orb/OrbStatusContext";
import { useSarsToChase } from "@/modules/governance/useSarsToChase";
import { useClaims } from "@/modules/mileage/mileageService";
import { STATUS as MILEAGE } from "@/modules/mileage/mileage";
import { useSheets } from "@/modules/timesheets/timesheetFlowService";
import { STATE } from "@/modules/timesheets/timesheet";
import { subscribeRequests } from "@/modules/rota/rotaTeamService";
import { buildHealth, buildNeedsYou } from "@/dashboard/needsYou";

// Gathers what is waiting on this person from the places that already know (nothing new is read for this: the Orb's status, the SAR list the
// reminder bell uses, mileage claims, the rota's requests and timesheets), and hands it to buildNeedsYou.
export function useNeedsYou(enabled = true) {
  const { user, can } = useAuth();
  const uid = user?.uid || "";
  const orb = useOrbStatus();
  const chase = useSarsToChase({ enabled });
  const claims = useClaims({ scope: "approve", enabled });
  const canManageSheets = can("timesheets.manage");
  const sheets = useSheets(canManageSheets ? "all" : "managed", enabled);
  const seesRota = can("rota.read") || can("rota.manage");
  const [requests, setRequests] = useState(null);
  useEffect(() => {
    if (!enabled || !seesRota) { setRequests([]); return undefined; }
    return subscribeRequests((rows) => setRequests(rows || []), () => setRequests([]));
  }, [seesRota, enabled]);

  return useMemo(() => {
    const mileage = (claims.list || []).filter((c) => c.status === MILEAGE.submitted && c.uid !== uid);
    const rota = (requests || []).filter((r) => r.status === "awaiting_coordinator");
    const sheetsWaiting = (sheets.list || []).filter((t) => t.state === STATE.submitted && t.uid !== uid && (t.managerUid === uid || (!t.managerUid && canManageSheets))).length;
    const rows = buildNeedsYou({
      signals: orb.signals || [],
      sarRows: chase.canChase ? chase.rows : null,
      mileage, rota, sheetsWaiting,
      messages: (orb.chips || []).find((c) => c.key === "messages") ? Number((orb.chips.find((c) => c.key === "messages").label.match(/\d+/) || [0])[0]) : 0,
    });
    const areas = [...(orb.scope?.areas || []), ...(mileage.length || rota.length || sheetsWaiting || seesRota || canManageSheets ? ["people"] : [])];
    return { rows, tiles: buildHealth({ areas, rows }), ready: !!orb.ready && (!seesRota || requests !== null), reloadSars: chase.reload };
  }, [orb.signals, orb.chips, orb.scope, orb.ready, chase.canChase, chase.rows, claims.list, sheets.list, requests, uid, canManageSheets, seesRota]);
}
