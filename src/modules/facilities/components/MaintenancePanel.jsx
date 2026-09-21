import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { loadFacilitiesState, saveFacilitiesState } from "@/modules/facilities/services/facilitiesStore";
import { formatWhen } from "@/components/compliance/complianceView";

const PRIORITY = {
  high: "bg-rose-500/15 text-rose-300",
  medium: "bg-amber-500/15 text-amber-300",
  low: "bg-slate-500/15 text-slate-300",
};

// Maintenance issues (moved here from Facilities): reported from a room's card
// and assigned to the caretaker, who marks them complete.
export default function MaintenancePanel() {
  const { displayName, user } = useAuth();
  const [state, setState] = useState(() => loadFacilitiesState());

  useEffect(() => {
    const refresh = () => setState(loadFacilitiesState());
    window.addEventListener("primovex:space-registry-changed", refresh);
    window.addEventListener("primovex:facilities-changed", refresh);
    return () => {
      window.removeEventListener("primovex:space-registry-changed", refresh);
      window.removeEventListener("primovex:facilities-changed", refresh);
    };
  }, []);

  const actor = displayName || user?.email || "Signed-in user";

  function closeIssue(issueId) {
    const issue = state.maintenance.find((item) => item.id === issueId);
    const nextMaintenance = state.maintenance.map((item) => (item.id === issueId ? { ...item, status: "closed", closedAt: new Date().toISOString(), closedBy: actor } : item));
    const roomHasOtherOpenIssues = nextMaintenance.some((item) => item.roomId === issue?.roomId && item.status !== "closed");
    const next = {
      ...state,
      maintenance: nextMaintenance,
      rooms: state.rooms.map((room) => (room.id === issue?.roomId && !roomHasOtherOpenIssues ? { ...room, status: "ready" } : room)),
    };
    setState(next);
    saveFacilitiesState(next);
  }

  return (
    <Card className="border border-white/10 bg-slate-900/70 p-4 shadow-lg backdrop-blur">
      <h2 className="text-sm font-semibold text-slate-100">Maintenance</h2>
      <p className="text-xs text-slate-500">Issues reported from room cards and assigned to the caretaker.</p>
      <div className="mt-4 space-y-3">
        {state.maintenance.length === 0 && <p className="text-sm text-slate-500">No maintenance issues.</p>}
        {state.maintenance.map((item) => {
          const room = state.rooms.find((r) => r.id === item.roomId);
          return (
            <div key={item.id} className="flex flex-col gap-3 rounded-xl border border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-100">{item.title}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${item.status === "closed" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>{item.status}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] capitalize ${PRIORITY[item.priority] || PRIORITY.low}`}>{item.priority}</span>
                </div>
                <div className="mt-1 text-sm text-slate-400">{room?.name || "Unknown room"} • Assigned to {item.assignedTo || "Caretaker"} • {formatWhen(item.reportedAt)}</div>
              </div>
              {item.status === "closed"
                ? <span className="text-sm text-emerald-300">Completed by {item.closedBy}</span>
                : <Button variant="outline" className="rounded-full border-white/10 bg-slate-900/40 text-xs text-slate-200 hover:bg-slate-900/60" onClick={() => closeIssue(item.id)}>Mark complete</Button>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
