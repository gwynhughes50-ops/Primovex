import { hasCapability } from "@/core/identity/capabilities";

export const ROUTE_MANIFEST = [
  { path: "/dashboard", label: "Dashboard", section: "core", iconKey: "dashboard", capability: "dashboard.read" },
  { path: "/spaces", label: "Spaces & Sense", section: "core", iconKey: "sense" },
  { path: "/spaces", label: "Sense", section: "core", iconKey: "sense", alias: true },
  { path: "/inventory", label: "Inventory", section: "core", iconKey: "inventory", capability: "inventory.read", children: ["Stock", "Emergency Drugs", "Anaphylaxis Boxes"] },
  { path: "/alerts", label: "Operations", section: "core", iconKey: "alerts", capability: "operations.read" },
  { path: "/governance/concerns", label: "Concerns", section: "core", iconKey: "governance", capability: "governance.manageConcerns" },
  { path: "/governance/sars", label: "SARs", section: "core", iconKey: "sar", capability: "governance.manageSars" },

  { path: "/reorder-centre", label: "Reorder Centre", section: "operations", iconKey: "reorder", capability: "purchasing.read", children: ["Pending", "Approved", "Ordered", "Rejected"] },
  { path: "/purchasing", label: "Purchasing", section: "operations", iconKey: "purchasing", capability: "purchasing.read", children: ["Basket", "Purchase Orders", "Deliveries", "Supplier Performance"] },
  { path: "/suppliers", label: "Suppliers", section: "operations", iconKey: "suppliers", capability: "suppliers.read" },
  { path: "/facilities", label: "Facilities", section: "operations", iconKey: "facilities", children: ["Overview", "Spaces", "Cleaning", "Equipment", "Maintenance"] },
  { path: "/compliance", label: "Compliance", section: "operations", iconKey: "compliance", capability: "compliance.read", children: ["QR / NFC Rounds", "Fire Checks", "Water Temperatures", "PAT Testing"] },

  { path: "/clinflow", label: "ClinFlow", section: "intelligence", iconKey: "clinflow", capability: "clinflow.read", children: ["Workflow", "NFWF", "QAIF", "Coding"] },
  { path: "/reports", label: "Reports", section: "intelligence", iconKey: "reports", capability: "reports.read", children: ["Stock Levels", "Expiry Report", "Transactions", "Temperature"] },

  { path: "/connect", label: "Connected Practice", section: "connected", iconKey: "connect", capability: "connect.view", children: ["Providers", "Device Onboarding", "Tuya", "Connectivity"] },
  { path: "/temperature", label: "Temperature", section: "connected", iconKey: "temperature", capability: "temperature.read", children: ["Monitoring", "Temperature Log", "Incidents"] },

  { path: "/practice-admin", label: "Practice Admin", section: "system", iconKey: "practiceAdmin", capability: "practiceAdmin.read", children: ["Overview", "Practice", "Sites", "Spaces", "Departments", "Roles", "Pulse", "Platform Mode"] },
  { path: "/admin", label: "Advanced Administration", section: "system", iconKey: "admin", capability: "admin.access", adminOnly: true, children: ["Overview", "Sites & Locations", "Users", "Add User", "Activity Log", "Notifications", "Roles & Permissions", "Danger Zone"] },
  { path: "/security-centre", label: "Security", section: "system", iconKey: "security", capability: "security.read" },
  { path: "/theme-lab", label: "Theme", section: "system", iconKey: "settings", capability: "theme.lab" },
  { path: "/notifications", label: "Notifications", section: "system", iconKey: "notifications", hiddenFromSidebar: true },
  { path: "/help", label: "Help", section: "system", iconKey: "help" },
  { path: "/developer-centre", label: "Developer", section: "developer", iconKey: "settings", developerOnly: true },
  { path: "/developer-mobile-preview", label: "Mobile Preview", section: "developer", developerOnly: true, supportRoute: true },
  { path: "/sense/open/:entityType/:entityId", label: "Sense direct open", section: "support", supportRoute: true },
  { path: "/setup", label: "First-run Setup", section: "support", supportRoute: true },
];

export const SIDEBAR_SECTIONS = [
  { key: "core", label: "Core" },
  { key: "operations", label: "Operations" },
  { key: "intelligence", label: "Intelligence" },
  { key: "connected", label: "Connected Practice" },
  { key: "system", label: "System" },
];

export function getVisibleRouteManifest({ isAdmin = false, capabilities = [], developer = false } = {}) {
  return ROUTE_MANIFEST.filter((route) => {
    if (route.alias || route.supportRoute || route.hiddenFromSidebar) return false;
    if (route.adminOnly && !isAdmin) return false;
    if (route.developerOnly && !developer) return false;
    return !route.capability || hasCapability(capabilities, route.capability);
  });
}

export function getRouteAuditRows({ isAdmin = false, capabilities = [], developer = false } = {}) {
  return ROUTE_MANIFEST.map((route) => ({
    ...route,
    accessible:
      (!route.adminOnly || isAdmin) &&
      (!route.developerOnly || developer) &&
      (!route.capability || hasCapability(capabilities, route.capability)),
  }));
}
