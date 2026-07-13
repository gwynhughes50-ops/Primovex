import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import MobileLayout from "@/mobile/MobileLayout";
import SenseNfcOpen from "@/pages/SenseNfcOpen";
import MobileBootSplash from "@/mobile/auth/MobileBootSplash";
import MobileAccountLogin from "@/mobile/auth/MobileAccountLogin";
import FirstRunSetupGate from "@/setup/FirstRunSetupGate";

const MINIMUM_SPLASH_MS = 1200;

function MobileBootController() {
  const { user, loading } = useAuth();
  const [minimumSplashComplete, setMinimumSplashComplete] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setMinimumSplashComplete(true), MINIMUM_SPLASH_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (loading || !minimumSplashComplete) {
    return <MobileBootSplash message={loading ? "Checking your secure session" : "Preparing Primovex Mobile"} />;
  }

  return user ? <FirstRunSetupGate><MobileLayout /></FirstRunSetupGate> : <MobileAccountLogin />;
}

function MobileSenseRoute() {
  const { user, loading } = useAuth();
  if (loading) return <MobileBootSplash message="Opening Primovex Sense" />;
  if (!user) return <Navigate to="/" replace />;
  return <SenseNfcOpen />;
}

export default function MobileApp() {
  return (
    <Routes>
      <Route path="/sense/open/:entityType/:entityId" element={<MobileSenseRoute />} />
      <Route path="*" element={<MobileBootController />} />
    </Routes>
  );
}
