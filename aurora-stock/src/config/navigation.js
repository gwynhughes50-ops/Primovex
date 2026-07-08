import { getIcon } from "@/config/medtrakIcons";
import { hasCapability } from "@/core/identity/capabilities";

const desktopNavigationConfig = [
  { to: "/dashboard", label: "Dashboard", iconKey: "dashboard", group: "core", capability: "dashboard.read" },
  { to: "/inventory", label: "Inventory", iconKey: "inventory", group: "inventory", capability: "inventory.read" },
  { to: "/reorder-centre", label: "Reorder Centre", iconKey: "reorder", group: "inventory", capability: "purchasing.read" },
  { to: "/purchasing", label: "Purchasing", iconKey: "purchasing", group: "purchasing", capability: "purchasing.read" },
  { to: "/suppliers", label: "Suppliers", iconKey: "suppliers", group: "purchasing", capability: "suppliers.read" },
  { to: "/governance/concerns", label: "Concerns", iconKey: "governance", group: "governance", capability: "governance.manageConcerns" },
  { to: "/governance/sars", label: "SARs", iconKey: "sar", group: "governance", capability: "governance.manageSars" },
  { to: "/practice-admin", label: "Practice Admin", iconKey: "practiceAdmin", group: "admin", capability: "practiceAdmin.read" },
  { to: "/alerts", label: "Operations", iconKey: "alerts", group: "operations", capability: "operations.read" },
  { to: "/connect", label: "Connect", iconKey: "connect", group: "operations", capability: "connect.view" },
  { to: "/temperature", label: "Temperature", iconKey: "temperature", group: "compliance", capability: "temperature.read" },
  { to: "/compliance", label: "Compliance", iconKey: "compliance", group: "compliance", capability: "compliance.read" },
  { to: "/help", label: "Help", iconKey: "help", group: "support" },
  { to: "/theme-lab", label: "Theme Lab", iconKey: "settings", group: "admin", capability: "theme.lab" },
  { to: "/security-centre", label: "Security", iconKey: "security", group: "admin", capability: "security.read" },
  { to: "/reports", label: "Reports", iconKey: "reports", group: "insight", capability: "reports.read" },
];

function hydrateNavigation(items) {
  return items.map((item) => ({
    ...item,
    icon: getIcon(item.iconKey),
  }));
}

function filterByCapabilities(items, capabilities = []) {
  return items.filter((item) => !item.capability || hasCapability(capabilities, item.capability));
}

export const desktopNavigation = hydrateNavigation(desktopNavigationConfig);

export function getDesktopNavigation({ isAdmin = false, capabilities = [] } = {}) {
  const items = [...desktopNavigationConfig];
  if (isAdmin) {
    items.splice(items.length - 1, 0, { to: "/admin", label: "Admin", iconKey: "admin", group: "admin", capability: "admin.access" });
  }
  return hydrateNavigation(filterByCapabilities(items, capabilities));
}

const mobileNavigationConfig = [
  { key: "home", label: "Home", iconKey: "home", capability: "mobile.access" },
  { key: "stock", label: "Stock", iconKey: "stock", capability: "inventory.read" },
  { key: "scan", label: "Scan", iconKey: "barcodeScan", primary: true, capability: "inventory.write" },
  { key: "connect", label: "Connect", iconKey: "connect", capability: "connect.view" },
  { key: "me", label: "Me", iconKey: "user", capability: "mobile.access" },
];

export function getMobileNavigation({ capabilities = [] } = {}) {
  return hydrateNavigation(filterByCapabilities(mobileNavigationConfig, capabilities));
}

export const mobileNavigation = hydrateNavigation(mobileNavigationConfig);
