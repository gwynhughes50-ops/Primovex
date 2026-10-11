import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { mirrorMaintenanceFromShared } from "@/modules/facilities/services/facilitiesStore";
import { useMaintenanceIssues } from "./maintenanceService";

// Keeps this device's copy of the maintenance issues (read by the Orb, room cards and the operations timeline) in step
// with the shared list, so every screen shows the same issues. Renders nothing.
export default function MaintenanceSync() {
  const { user, loading, isSyntheticMode, can } = useAuth();
  const allowed = !loading && Boolean(user) && !isSyntheticMode && (can("operations.read") || can("compliance.read"));
  const { list } = useMaintenanceIssues(allowed);
  useEffect(() => {
    if (allowed && list) mirrorMaintenanceFromShared(list);
  }, [allowed, list]);
  return null;
}
