import { NavLink } from "react-router-dom";
import { ChevronLeft, ChevronRight, LogOut } from "lucide-react";
import PrimovexLogo from "@/components/brand/PrimovexLogo";
import { Button } from "@/components/ui/button";
import { getVisibleRouteManifest, SIDEBAR_SECTIONS } from "@/config/routeManifest";
import { getIcon } from "@/config/medtrakIcons";

function SidebarLink({ item, collapsed }) {
  const Icon = getIcon(item.iconKey || "helpCircle");
  return (
    <NavLink to={item.path} end={item.path === "/dashboard"} title={collapsed ? item.label : undefined}>
      {({ isActive }) => (
        <div className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${isActive ? "bg-[var(--medtrak-accent)] text-white shadow-md" : "text-[var(--medtrak-text)] hover:bg-[var(--medtrak-accent)]/10"}`}>
          <Icon className="h-4.5 w-4.5 shrink-0" />
          {!collapsed && <span className="min-w-0 truncate">{item.label}</span>}
        </div>
      )}
    </NavLink>
  );
}

export default function DesktopSidebar({ collapsed, onToggle, isAdmin, capabilities, developer, displayName, role, onSignOut }) {
  const routes = getVisibleRouteManifest({ isAdmin, capabilities, developer });
  const standardSections = SIDEBAR_SECTIONS.map((section) => ({ ...section, items: routes.filter((item) => item.section === section.key) })).filter((section) => section.items.length);
  const developerItems = routes.filter((item) => item.section === "developer");

  return (
    <aside className={`relative sticky top-0 flex h-screen shrink-0 flex-col border-r border-[var(--medtrak-border)] bg-[var(--medtrak-panel)]/95 backdrop-blur transition-[width] duration-200 ${collapsed ? "w-[76px]" : "w-[292px]"}`}>
      <div className={`flex h-24 items-center border-b border-[var(--medtrak-border)] ${collapsed ? "justify-center px-3" : "px-5 pr-8"}`}>
        <div className={collapsed ? "grid place-items-center" : "min-w-0 flex-1 overflow-hidden"}>
          <PrimovexLogo compact={false} markOnly={collapsed} className={collapsed ? "h-10 w-10" : "max-h-16 w-full max-w-[236px] object-contain object-left"} />
        </div>
        <button onClick={onToggle} className="absolute -right-4 top-8 z-20 grid h-8 w-8 place-items-center rounded-full border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] text-[var(--medtrak-muted)] shadow-sm hover:text-[var(--medtrak-text)]" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {standardSections.map((section) => (
          <section key={section.key} className="mb-5">
            {!collapsed && <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--medtrak-muted)]">{section.label}</p>}
            <div className="space-y-1">{section.items.map((item) => <SidebarLink key={`${section.key}-${item.path}`} item={item} collapsed={collapsed} />)}</div>
          </section>
        ))}
        {!!developerItems.length && (
          <section className="border-t border-[var(--medtrak-border)] pt-4">
            {!collapsed && <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--medtrak-muted)]">Developer</p>}
            {developerItems.map((item) => <SidebarLink key={item.path} item={item} collapsed={collapsed} />)}
          </section>
        )}
      </nav>

      <div className="border-t border-[var(--medtrak-border)] p-3">
        {!collapsed && <div className="mb-3 rounded-xl bg-[var(--medtrak-bg)] p-3"><p className="truncate text-sm font-bold">{displayName || "Signed in"}</p><p className="truncate text-xs text-[var(--medtrak-muted)]">{isAdmin ? "System Admin" : role || "User"}</p></div>}
        <Button variant="ghost" onClick={onSignOut} className={`w-full gap-2 rounded-xl ${collapsed ? "px-0" : "justify-start"}`} title="Sign out"><LogOut className="h-4 w-4" />{!collapsed && "Sign out"}</Button>
      </div>
    </aside>
  );
}
