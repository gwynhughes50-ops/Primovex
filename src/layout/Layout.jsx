import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import useNotifications from "@/hooks/useNotifications";
import PulseWidget from "@/components/pulse/PulseWidget";
import PlatformModeBanner from "@/components/platform/PlatformModeBanner";
import AskPrimovexPanel from "@/ai/components/AskPrimovexPanel";
import DesktopSidebar from "@/components/navigation/DesktopSidebar";
import LegacyDesktopLayout from "@/layout/LegacyDesktopLayout";
import { Icons } from "@/config/medtrakIcons";
import { medtrakTheme } from "@/config/medtrakTheme";
import { developerAccessAllowed } from "@/developer/developerAccess";

const SIDEBAR_KEY = "primovex.desktopSidebar.collapsed";
const LEGACY_NAV_KEY = "primovex.desktopNavigation.legacy";

export default function Layout() {
  const navigate = useNavigate();
  const { user, displayName, role, isAdmin, capabilities, loading, signOut } = useAuth();
  const { unreadCount } = useNotifications(user?.uid);
  const showDeveloperCentre = developerAccessAllowed(role);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_KEY) === "true");
  const [legacyNavigation, setLegacyNavigation] = useState(() => localStorage.getItem(LEGACY_NAV_KEY) === "true");

  useEffect(() => localStorage.setItem(SIDEBAR_KEY, String(collapsed)), [collapsed]);
  useEffect(() => {
    const handleMode = (event) => {
      const legacy = Boolean(event.detail?.legacy);
      localStorage.setItem(LEGACY_NAV_KEY, String(legacy));
      setLegacyNavigation(legacy);
    };
    window.addEventListener("primovex:navigation-mode", handleMode);
    return () => window.removeEventListener("primovex:navigation-mode", handleMode);
  }, []);

  async function handleSignOut() {
    try {
      await signOut();
      navigate("/login", { replace: true });
    } catch (error) {
      console.error("Sign out failed:", error);
    }
  }

  const signedInLabel = displayName || user?.email || "Signed in";

  if (legacyNavigation) return <LegacyDesktopLayout />;

  return (
    <div className={`min-h-screen ${medtrakTheme.app.background}`}>
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-[#020617] via-[#081B33] to-[#020617]" />
        <div className="absolute -top-40 -left-32 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute top-1/3 -right-24 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />
      </div>

      <div className="flex min-h-screen w-full">
        <DesktopSidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed((value) => !value)}
          isAdmin={isAdmin}
          capabilities={capabilities}
          developer={showDeveloperCentre}
          displayName={signedInLabel}
          role={role}
          onSignOut={handleSignOut}
        />

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex min-h-20 items-center justify-between border-b border-[var(--medtrak-border)] bg-[var(--medtrak-bg)]/88 px-5 backdrop-blur-xl lg:px-8">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--medtrak-accent)]">Primovex operations platform</p>
              <p className="mt-1 text-sm text-[var(--medtrak-muted)]">Connected practice intelligence</p>
            </div>
            <div className="flex items-center gap-2">
              <NavLink to="/notifications">
                <Button variant="ghost" className="relative gap-2 rounded-full px-3 py-1.5">
                  <Icons.notifications className="h-4 w-4" />
                  <span className="hidden md:inline">Notifications</span>
                  {!!unreadCount && unreadCount > 0 && <span className="mt-notification-badge ml-1 rounded-full border px-2 py-0.5 text-[11px] font-bold">{unreadCount}</span>}
                </Button>
              </NavLink>
              {!loading && user && <div className="hidden xl:block text-right"><p className="text-sm font-semibold">{signedInLabel}</p><p className="text-xs text-[var(--medtrak-muted)]">{isAdmin ? "System Admin" : role}</p></div>}
            </div>
          </header>

          <div className="px-4 py-4 sm:px-6 lg:px-8">
            <PlatformModeBanner compact />
            <main className="mx-auto mt-5 w-full max-w-[1600px]"><Outlet /></main>
          </div>
        </div>
      </div>

      <PulseWidget />
      <AskPrimovexPanel />
    </div>
  );
}
