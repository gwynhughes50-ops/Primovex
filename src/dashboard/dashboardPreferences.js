import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export const DASHBOARD_WIDGETS = [
  { id: "brief", label: "Morning brief", description: "Practice readiness and the most important operational message." },
  { id: "management", label: "Management overview", description: "Practice-wide priorities, concerns and operational health." },
  { id: "timeline", label: "What changed", description: "A compact timeline of recent operational events." },
  { id: "stockSummary", label: "Stock summary", description: "Total items, low-stock count and latest fridge reading." },
  { id: "issues", label: "Warnings", description: "Low stock, expiry and cold-chain exceptions." },
  { id: "stockActivity", label: "Recent stock activity", description: "The latest inventory movements." },
  { id: "quickActions", label: "Quick actions", description: "Theme and stock-use controls." },
];

const ALL = DASHBOARD_WIDGETS.map((widget) => widget.id);

export function defaultWidgetsForRole(role = "") {
  const value = String(role || "").toLowerCase();
  if (value.includes("practice manager") || value.includes("system admin")) {
    return ["brief", "management", "issues", "stockSummary", "quickActions"];
  }
  if (value.includes("nurse") || value.includes("healthcare") || value.includes("hca")) {
    return ["brief", "issues", "stockSummary", "quickActions"];
  }
  if (value.includes("caretaker") || value.includes("facilities") || value.includes("cleaner")) {
    return ["brief", "management", "timeline"];
  }
  return ["brief", "management", "issues", "quickActions"];
}

export function normaliseDashboardPreferences(preferences, role) {
  const fallback = defaultWidgetsForRole(role);
  const visible = Array.isArray(preferences?.visible)
    ? preferences.visible.filter((id) => ALL.includes(id))
    : fallback;
  const orderSource = Array.isArray(preferences?.order) ? preferences.order : ALL;
  const order = [...orderSource.filter((id) => ALL.includes(id)), ...ALL.filter((id) => !orderSource.includes(id))];
  return { visible: visible.length ? visible : fallback, order };
}

export async function saveDashboardPreferences(uid, preferences) {
  if (!uid || String(uid).startsWith("synthetic-")) return;
  await updateDoc(doc(db, "users", uid), {
    dashboardPreferences: preferences,
    dashboardPreferencesUpdatedAt: new Date().toISOString(),
  });
}
