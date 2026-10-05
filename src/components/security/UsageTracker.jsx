import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { endUsageSession, startUsageTracking, trackUsagePath } from "@/services/usageService";

// Renders nothing. Starts reporting where a signed-in person is in the app, and
// for how long, so administrators can review sign-ins and activity.
export default function UsageTracker() {
  const { user, isSyntheticMode } = useAuth();
  const { pathname } = useLocation();
  const uid = !isSyntheticMode ? user?.uid : null;

  useEffect(() => {
    if (uid) startUsageTracking(uid);
    else endUsageSession("closed"); // signed out some other way; nothing to report if already ended
  }, [uid]);

  useEffect(() => {
    if (uid) trackUsagePath(pathname);
  }, [uid, pathname]);

  return null;
}
