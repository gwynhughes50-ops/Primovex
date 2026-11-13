import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export const DASHBOARD_WIDGETS = [
  { id: "healthStrip", label: "Practice health", description: "One tile for each part of the practice: green leave it, amber look soon, red look now." },
  { id: "needsYou", label: "Needs you", description: "Everything waiting on you, most urgent first, each with a button that deals with it." },
  { id: "comingUp", label: "Coming up", description: "SARs, concerns, certificates, COSHH reviews and time off in the next two weeks." },
  { id: "inToday", label: "In today", description: "Who is on the reception rota today and who is off." },
  { id: "brief", label: "Morning brief", description: "Practice readiness and the most important operational message." },
  { id: "management", label: "Management overview", description: "Practice-wide priorities, concerns and operational health." },
  { id: "timeline", label: "What changed", description: "A compact timeline of recent operational events." },
  { id: "stockSummary", label: "Stock summary", description: "Total items, low-stock count and latest fridge reading." },
  { id: "issues", label: "Warnings", description: "Low stock, expiry and cold-chain exceptions." },
  { id: "stockActivity", label: "Recent stock activity", description: "The latest inventory movements." },
  { id: "quickActions", label: "Quick actions", description: "Theme and stock-use controls." },
  { id: "quickNotes", label: "Quick notes", description: "Your open reminders and shared practice tasks." },
  { id: "whoIsWhere", label: "Who's where", description: "Last scanned location for each active staff member (NFC/BLE tap snapshot)." },
];

const ALL = DASHBOARD_WIDGETS.map((widget) => widget.id);
const LEADING = ["healthStrip", "needsYou", "comingUp", "inToday"];

export function defaultWidgetsForRole(role = "", homeType = "") {
  const value = String(role || "").toLowerCase();
  if (homeType === "manager" || (!homeType && (value.includes("practice manager") || value.includes("system admin")))) {
    return ["healthStrip", "needsYou", "comingUp", "inToday", "management", "whoIsWhere", "quickActions", "quickNotes"];
  }
  if (homeType === "clinical" || homeType === "clinical-lead" || (!homeType && (value.includes("nurse") || value.includes("healthcare") || value.includes("hca") || value.includes("practitioner")))) {
    return ["brief", "issues", "stockSummary", "quickActions", "quickNotes"];
  }
  if (homeType === "caretaker" || (!homeType && (value.includes("caretaker") || value.includes("facilities") || value.includes("cleaner")))) {
    return ["brief", "management", "timeline"];
  }
  return ["brief", "management", "issues", "quickActions", "quickNotes"];
}

function dedupe(ids) {
  return Array.from(new Set(ids));
}

export function normaliseDashboardPreferences(preferences, role, homeType = "") {
  const fallback = defaultWidgetsForRole(role, homeType);
  const orderSource = Array.isArray(preferences?.order) ? preferences.order : ALL;
  // dedupe() guards against a stale saved doc that already has a duplicate
  // id in it (e.g. from an earlier version of this function) — filtering for
  // validity alone doesn't remove duplicates that are already present.
  // widgets the person has not met yet go in order, but the two that answer "what needs me" lead, whatever layout was saved before they existed
  const leading = LEADING.filter((id) => !orderSource.includes(id));
  const order = dedupe([...leading, ...orderSource.filter((id) => ALL.includes(id)), ...ALL.filter((id) => !orderSource.includes(id))]);

  if (!Array.isArray(preferences?.visible)) {
    return { visible: fallback, order };
  }

  // Widgets that didn't exist when this user last saved their layout aren't
  // in their old order at all — surface those automatically if the role
  // default recommends them, same as `order` already does. Widgets the user
  // has actually seen before and explicitly hidden are left alone. Without
  // this, a brand-new widget can never appear for anyone who already has a
  // saved layout, no matter what their role's defaults say.
  const savedVisible = preferences.visible.filter((id) => ALL.includes(id));
  const newWidgetIds = ALL.filter((id) => !orderSource.includes(id));
  const visible = dedupe([...savedVisible, ...newWidgetIds.filter((id) => fallback.includes(id))]);

  return { visible: visible.length ? visible : fallback, order };
}

export async function saveDashboardPreferences(uid, preferences) {
  if (!uid || String(uid).startsWith("synthetic-")) return;
  await updateDoc(doc(db, "users", uid), {
    dashboardPreferences: preferences,
    dashboardPreferencesUpdatedAt: new Date().toISOString(),
  });
}
