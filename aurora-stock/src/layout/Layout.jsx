// src/layout/Layout.jsx
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import useNotifications from "@/hooks/useNotifications";
import PulseWidget from "@/components/pulse/PulseWidget";
import PlatformModeBanner from "@/components/platform/PlatformModeBanner";
import PrimovexLogo from "@/components/brand/PrimovexLogo";

import { Icons, resolveIcon } from "@/config/medtrakIcons";
import { getDesktopNavigation } from "@/config/navigation";
import { medtrakTheme } from "@/config/medtrakTheme";

export default function Layout() {
  const navigate = useNavigate();

  // ✅ From AuthContext
  const { user, displayName, role, isAdmin, capabilities, loading, signOut } = useAuth();

  // ✅ Unread count (safe if not signed in)
  const { unreadCount } = useNotifications(user?.uid);

  const navItems = getDesktopNavigation({ isAdmin, capabilities });
 
  async function handleSignOut() {
    try {
      await signOut();
      navigate("/login", { replace: true });
    } catch (e) {
      console.error("Sign out failed:", e);
    }
  }

  const signedInLabel = displayName || user?.email || "Signed in";

  return (
    <div className={`min-h-screen ${medtrakTheme.app.background}`}>
      {/* background glow */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-[#020617] via-[#081B33] to-[#020617]" />
        <div className="absolute -top-40 -left-32 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute top-1/3 -right-24 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/4 h-64 w-64 rounded-full bg-violet-500/10 blur-3xl" />
      </div>

      <div className="mx-auto flex min-h-screen w-full max-w-[1800px] flex-col px-4 pb-10 pt-4 sm:px-6 lg:px-8">
        {/* header */}
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <PrimovexLogo compact className="drop-shadow-[0_8px_24px_rgba(37,99,235,0.2)]" />

          <div className="flex items-center gap-2">
            {/* ✅ Notifications button now routes */}
            <NavLink to="/notifications">
              <Button variant="ghost" className="gap-2 rounded-full px-3 py-1.5 relative">
                <Icons.notifications className="h-4 w-4" />
                Notifications

                {!!unreadCount && unreadCount > 0 && (
                  <span className="ml-1 rounded-full bg-violet-500/20 px-2 py-0.5 text-[11px] text-violet-100">
                    {unreadCount}
                  </span>
                )}
              </Button>
            </NavLink>

            {/* ✅ While auth is loading, don’t flicker */}
            {loading ? null : !user ? (
              <>
                <NavLink to="/login">
                  <Button variant="ghost" className="gap-2 rounded-full px-3 py-1.5">
                    <Icons.login className="h-4 w-4" />
                    Sign in
                  </Button>
                </NavLink>

                <NavLink to="/register">
                  <Button
                    variant="default"
                    className="gap-2 rounded-full bg-gradient-to-r from-[#2563EB] via-[#6D4DFF] to-[#00B8F0] px-3 py-1.5 text-white shadow-lg shadow-violet-500/25"
                  >
                    <Icons.userPlus className="h-4 w-4" />
                    Register
                  </Button>
                </NavLink>
              </>
            ) : (
              <>
                <div className="hidden sm:flex items-center gap-2 rounded-full border border-slate-800/70 bg-slate-900/40 px-3 py-1.5 text-xs text-slate-200">
                  <span className="text-slate-400">Signed in:</span>
                  <span className="font-medium">{signedInLabel}</span>

                  {role && (
                    <span
                      className={`ml-1 rounded-full px-2 py-0.5 ${
                        isAdmin ? "bg-violet-500/15 text-violet-100" : "bg-slate-800/60 text-slate-200"
                      }`}
                      title={role}
                    >
                      {isAdmin ? "System Admin" : role}
                    </span>
                  )}
                </div>

                <Button variant="ghost" className="gap-2 rounded-full px-3 py-1.5" onClick={handleSignOut}>
                  <Icons.logout className="h-4 w-4" />
                  Sign out
                </Button>
              </>
            )}
          </div>
        </header>

        <PlatformModeBanner compact />

        {/* nav */}
        <nav className="mb-5 flex flex-wrap gap-2">
          {navItems.map((item) => {
            const Icon = resolveIcon(item.icon, "helpCircle");
            return (
              <NavLink key={item.to} to={item.to} end={item.to !== "/reports"}>
                {({ isActive }) => (
                  <Button
                    variant={isActive ? "default" : "ghost"}
                    className={`gap-2 rounded-full px-3 py-1.5 text-xs ${
                      isActive
                        ? "bg-gradient-to-r from-[#2563EB] via-[#6D4DFF] to-[#00B8F0] text-white shadow-lg shadow-violet-500/25"
                        : "text-slate-200"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {item.label}
                  </Button>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* page content */}
        <main className="flex-1">
          <Outlet />
        </main>
      </div>

      <PulseWidget />
    </div>
  );
}

