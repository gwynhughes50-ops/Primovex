import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { writeAuditEvent } from "@/core/identity/auditService";
import { endUsageSession, startUsageTracking, trackUsagePath } from "@/services/usageService";

// A password sign-in writes its own audit entry; anything older than this was a
// session the person already had.
const FRESH_SIGN_IN_MS = 2 * 60 * 1000;

// Renders nothing. Starts reporting where a signed-in person is in the app, and
// for how long, so administrators can review sign-ins and activity.
export default function UsageTracker() {
  const { user, isSyntheticMode } = useAuth();
  const { pathname } = useLocation();
  const uid = !isSyntheticMode ? user?.uid : null;

  useEffect(() => {
    if (uid) {
      const started = startUsageTracking(uid);
      // Staying signed in means no password is typed, so the sign-in entry never
      // appears. Record the app being opened with an existing session instead.
      const lastSignIn = Date.parse(user?.metadata?.lastSignInTime || "");
      const resumed = started && Number.isFinite(lastSignIn) && Date.now() - lastSignIn > FRESH_SIGN_IN_MS;
      if (resumed) {
        writeAuditEvent({
          action: "auth.session.resumed",
          module: "security",
          targetType: "user_session",
          targetId: uid,
          summary: "App opened with an existing sign-in (no password entered).",
          classification: "security",
          disclosureLevel: "restricted",
        }).catch(() => {});
      }
    } else endUsageSession("closed"); // signed out some other way; nothing to report if already ended
  }, [uid]);

  useEffect(() => {
    if (uid) trackUsagePath(pathname);
  }, [uid, pathname]);

  return null;
}
