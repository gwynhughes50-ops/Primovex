import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import MobileLayout from "@/mobile/MobileLayout";
import MobileSessionShell from "@/mobile/MobileSessionShell";
import MobileGovernanceConcerns from "@/mobile/MobileGovernanceConcerns";
import SenseNfcOpen from "@/pages/SenseNfcOpen";
import MobileBootSplash from "@/mobile/auth/MobileBootSplash";
import MobileAccountLogin from "@/mobile/auth/MobileAccountLogin";
import FirstRunSetupGate from "@/setup/FirstRunSetupGate";

const MINIMUM_SPLASH_MS = 1200;

// mobile.access is granted to every role's template except ReadOnly (a
// desktop-reporting-only role) — this is the one place that actually
// enforces it; until now it was defined but never checked anywhere.
function MobileAccessDenied() {
  const { signOut } = useAuth();
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-slate-950 p-6 text-center text-slate-100">
      <p className="text-lg font-semibold">Mobile access isn't enabled for this account</p>
      <p className="max-w-sm text-sm text-slate-400">Your role doesn't include mobile access. Use the Primovex desktop app, or ask an admin to grant it if this looks wrong.</p>
      <button type="button" onClick={signOut} className="rounded-full bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700">Sign out</button>
    </div>
  );
}

function MobileBootController({ initialTab = "home" }) {
  const { user, loading, can } = useAuth();
  const [minimumSplashComplete, setMinimumSplashComplete] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setMinimumSplashComplete(true), MINIMUM_SPLASH_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (loading || !minimumSplashComplete) {
    return <MobileBootSplash message={loading ? "Checking your secure session" : "Preparing Primovex Mobile"} />;
  }

  if (!user) return <MobileAccountLogin />;
  if (!can("mobile.access")) return <MobileAccessDenied />;
  return <FirstRunSetupGate><MobileLayout initialTab={initialTab} /></FirstRunSetupGate>;
}

function MobileSenseRoute() {
  const { user, loading, can } = useAuth();
  if (loading) return <MobileBootSplash message="Opening Primovex Sense" />;
  // Keep the deep-link route in place while the user signs in. Once Firebase
  // restores the session this component opens the intended room automatically.
  if (!user) return <MobileAccountLogin />;
  if (!can("mobile.access")) return <MobileAccessDenied />;
  return <SenseNfcOpen />;
}

function MobileGovernanceConcernsRoute() {
  const { user, loading, can } = useAuth();
  if (loading) return <MobileBootSplash message="Opening Concerns" />;
  if (!user) return <MobileAccountLogin />;
  if (!can("mobile.access")) return <MobileAccessDenied />;
  // Wrapped in the same session lock as the rest of the app — this carries
  // real patient governance data (EMIS numbers, complaint details), reached
  // by a normal nav action rather than a physical NFC tap, so it should not
  // bypass the PIN/biometric gate the way a tag scan is allowed to.
  return <MobileSessionShell><MobileGovernanceConcerns /></MobileSessionShell>;
}

export default function MobileApp() {
  return (
    <Routes>
      <Route path="/sense/open/:entityType/:entityId" element={<MobileSenseRoute />} />
      <Route path="/governance/concerns" element={<MobileGovernanceConcernsRoute />} />
      <Route path="/spaces" element={<MobileBootController initialTab="sense" />} />
      <Route path="/dashboard" element={<MobileBootController initialTab="home" />} />
      <Route path="*" element={<MobileBootController />} />
    </Routes>
  );
}
