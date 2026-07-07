import { getIcon } from "@/config/medtrakIcons";

const desktopNavigationConfig = [
  { to: "/dashboard", label: "Dashboard", iconKey: "dashboard", group: "core" },
  { to: "/inventory", label: "Inventory", iconKey: "inventory", group: "inventory" },
  { to: "/reorder-centre", label: "Reorder Centre", iconKey: "reorder", group: "inventory" },
  { to: "/purchasing", label: "Purchasing", iconKey: "purchasing", group: "purchasing" },
  { to: "/suppliers", label: "Suppliers", iconKey: "suppliers", group: "purchasing" },
  { to: "/governance/sars", label: "SARs", iconKey: "sar", group: "governance" },
  { to: "/practice-admin", label: "Practice Admin", iconKey: "practiceAdmin", group: "admin" },
  { to: "/alerts", label: "Operations", iconKey: "alerts", group: "operations" },
  { to: "/connect", label: "Connect", iconKey: "connect", group: "operations" },
  { to: "/temperature", label: "Temperature", iconKey: "temperature", group: "compliance" },
  { to: "/compliance", label: "Compliance", iconKey: "compliance", group: "compliance" },
  { to: "/help", label: "Help", iconKey: "help", group: "support" },
  { to: "/theme-lab", label: "Theme Lab", iconKey: "settings", group: "admin" },
  { to: "/reports", label: "Reports", iconKey: "reports", group: "insight" },
];

function hydrateNavigation(items) {
  return items.map((item) => ({
    ...item,
    icon: getIcon(item.iconKey),
  }));
}

export const desktopNavigation = hydrateNavigation(desktopNavigationConfig);

export function getDesktopNavigation({ isAdmin = false } = {}) {
  const items = [...desktopNavigationConfig];
  if (isAdmin) {
    items.splice(items.length - 1, 0, { to: "/admin", label: "Admin", iconKey: "admin", group: "admin" });
  }
  return hydrateNavigation(items);
}

const mobileNavigationConfig = [
  { key: "home", label: "Home", iconKey: "home" },
  { key: "stock", label: "Stock", iconKey: "stock" },
  { key: "scan", label: "Scan", iconKey: "barcodeScan", primary: true },
  { key: "connect", label: "Connect", iconKey: "connect" },
  { key: "me", label: "Me", iconKey: "user" },
];

export const mobileNavigation = hydrateNavigation(mobileNavigationConfig);
