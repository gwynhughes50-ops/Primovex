// src/layout/Layout.jsx
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

import useNotifications from "@/hooks/useNotifications";
import PulseWidget from "@/components/pulse/PulseWidget";

import { Icons, resolveIcon } from "@/config/medtrakIcons";
import { getDesktopNavigation } from "@/config/navigation";
import { medtrakTheme } from "@/config/medtrakTheme";

export default function Layout() {
  const navigate = useNavigate();

  // ✅ From AuthContext
  const { user, displayName, role, isAdmin, loading } = useAuth();

  // ✅ Unread count (safe if not signed in)
  const { unreadCount } = useNotifications(user?.uid);

  const navItems = getDesktopNavigation({ isAdmin });
 
  async function handleSignOut() {
    try {
      await signOut(auth);
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
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" />
        <div className="absolute -top-40 -left-32 h-80 w-80 rounded-full bg-teal-500/10 blur-3xl" />
        <div className="absolute top-1/3 -right-24 h-72 w-72 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/4 h-64 w-64 rounded-full bg-violet-500/10 blur-3xl" />
      </div>

      <div className="mx-auto flex min-h-screen w-full max-w-[1800px] flex-col px-4 pb-10 pt-4 sm:px-6 lg:px-8">
        {/* header */}
        <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-400 via-emerald-400 to-cyan-500 shadow-[0_0_35px_rgba(34,211,238,0.6)]">
              <Icons.stock className="h-5 w-5 text-slate-950" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">MedTrak+</h1>
              <p className="text-xs text-slate-400 sm:text-sm">
                Operational intelligence for primary care.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* ✅ Notifications button now routes */}
            <NavLink to="/notifications">
              <Button variant="ghost" className="gap-2 rounded-full px-3 py-1.5 relative">
                <Icons.notifications className="h-4 w-4" />
                Notifications

                {!!unreadCount && unreadCount > 0 && (
                  <span className="ml-1 rounded-full bg-teal-500/20 px-2 py-0.5 text-[11px] text-teal-200">
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
                    className="gap-2 rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 px-3 py-1.5 text-slate-950 shadow-lg shadow-emerald-500/40"
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
                        isAdmin ? "bg-teal-500/15 text-teal-200" : "bg-slate-800/60 text-slate-200"
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
                        ? "bg-gradient-to-r from-teal-500 to-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/40"
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

