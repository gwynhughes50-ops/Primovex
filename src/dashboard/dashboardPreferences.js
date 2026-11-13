import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { NEEDS_CATEGORIES } from "@/dashboard/needsYou";

// What the Dashboard shows (which widgets, in what order) and a few personal settings, saved on the person's own profile.
// The "Use stock" and "Customise" buttons live in the page header for everyone, so there is no separate quick-actions widget.

export const DASHBOARD_WIDGETS = [
  { id: "healthStrip", label: "Practice health", description: "One tile for each part of the practice: green leave it, amber look soon, red look now." },
  { id: "needsYou", label: "Needs you", description: "Everything waiting on you, most urgent first, each with a button that deals with it." },
  { id: "comingUp", label: "Coming up", description: "What is due after the urgent items, and time off, over the next few weeks." },
  { id: "inToday", label: "In today", description: "Who is on the reception rota today and who is off." },
  { id: "priorities", label: "Your inbox", description: "Today's priorities from your inbox: open, complete or snooze each one." },
  { id: "brief", label: "Morning brief", description: "Practice readiness and the most important operational message." },
  { id: "management", label: "MedAI overview", description: "MedAI's daily brief, insights and recommendations, and the health of governance cases. Much of it repeats Needs you in more words." },
  { id: "timeline", label: "What changed", description: "A compact timeline of recent operational events." },
  { id: "stockSummary", label: "Stock summary", description: "Total items, low-stock count and latest fridge reading." },
  { id: "issues", label: "Warnings", description: "Low stock, expiry and cold-chain exceptions." },
  { id: "stockActivity", label: "Recent stock activity", description: "The latest inventory movements." },
  { id: "quickNotes", label: "Quick notes", description: "Your open reminders and shared practice tasks." },
  { id: "whoIsWhere", label: "Who's where", description: "Last scanned location for each active staff member (NFC/BLE tap snapshot)." },
];

const ALL = DASHBOARD_WIDGETS.map((widget) => widget.id);
const LEADING = ["healthStrip", "needsYou", "comingUp", "inToday"];

// ---- personal settings ----
export const DEFAULT_SETTINGS = {
  layout: "sideBySide", // "sideBySide": Needs you on the left with Coming up and In today beside it; "stacked": one below another
  needsYouMax: 10, // 5, 10, 20, or 0 for all
  needsYouHide: [], // kinds of thing left out of Needs you
  comingUpDays: 14, // 7, 14 or 28
  comingUpHide: [], // "SAR", "Concern", "Off"
  healthHide: [], // areas left out of the health strip
};
export const SETTING_CHOICES = {
  layout: [["sideBySide", "Side by side"], ["stacked", "One below another"]],
  needsYouMax: [[5, "5"], [10, "10"], [20, "20"], [0, "All"]],
  comingUpDays: [[7, "1 week"], [14, "2 weeks"], [28, "4 weeks"]],
};
export const HEALTH_AREAS = [["governance", "Governance"], ["stock", "Stock"], ["coldchain", "Fridges"], ["compliance", "Compliance"], ["people", "People"]];

const pick = (value, choices, fallback) => (choices.some(([key]) => key === value) ? value : fallback);
const only = (list, allowed) => (Array.isArray(list) ? [...new Set(list.filter((item) => allowed.includes(item)))] : []);

export function normaliseSettings(settings) {
  const s = settings && typeof settings === "object" ? settings : {};
  return {
    layout: pick(s.layout, SETTING_CHOICES.layout, DEFAULT_SETTINGS.layout),
    needsYouMax: pick(s.needsYouMax, SETTING_CHOICES.needsYouMax, DEFAULT_SETTINGS.needsYouMax),
    needsYouHide: only(s.needsYouHide, NEEDS_CATEGORIES.map((c) => c.key)),
    comingUpDays: pick(s.comingUpDays, SETTING_CHOICES.comingUpDays, DEFAULT_SETTINGS.comingUpDays),
    comingUpHide: only(s.comingUpHide, ["SAR", "Concern", "Off"]),
    healthHide: only(s.healthHide, HEALTH_AREAS.map(([key]) => key)),
  };
}

export function defaultWidgetsForRole(role = "", homeType = "") {
  const value = String(role || "").toLowerCase();
  if (homeType === "manager" || (!homeType && (value.includes("practice manager") || value.includes("system admin")))) {
    return ["healthStrip", "needsYou", "comingUp", "inToday", "priorities", "whoIsWhere", "quickNotes"];
  }
  if (homeType === "clinical" || homeType === "clinical-lead" || (!homeType && (value.includes("nurse") || value.includes("healthcare") || value.includes("hca") || value.includes("practitioner")))) {
    return ["brief", "issues", "stockSummary", "quickNotes"];
  }
  if (homeType === "caretaker" || (!homeType && (value.includes("caretaker") || value.includes("facilities") || value.includes("cleaner")))) {
    return ["brief", "management", "timeline"];
  }
  return ["brief", "management", "issues", "quickNotes"];
}

function dedupe(ids) {
  return Array.from(new Set(ids));
}

export function normaliseDashboardPreferences(preferences, role, homeType = "") {
  const fallback = defaultWidgetsForRole(role, homeType);
  const orderSource = Array.isArray(preferences?.order) ? preferences.order : ALL;
  const settings = normaliseSettings(preferences?.settings);
  // dedupe() guards against a stale saved doc that already has a duplicate
  // id in it (e.g. from an earlier version of this function) — filtering for
  // validity alone doesn't remove duplicates that are already present.
  // Widgets the person has not met yet go in order, but the ones that answer "what needs me" lead, whatever layout was saved before they existed.
  const leading = LEADING.filter((id) => !orderSource.includes(id));
  const order = dedupe([...leading, ...orderSource.filter((id) => ALL.includes(id)), ...ALL.filter((id) => !orderSource.includes(id))]);

  if (!Array.isArray(preferences?.visible)) {
    return { visible: fallback, order, settings };
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

  return { visible: visible.length ? visible : fallback, order, settings };
}

export async function saveDashboardPreferences(uid, preferences) {
  if (!uid || String(uid).startsWith("synthetic-")) return;
  await updateDoc(doc(db, "users", uid), {
    dashboardPreferences: { ...preferences, settings: normaliseSettings(preferences?.settings) },
    dashboardPreferencesUpdatedAt: new Date().toISOString(),
  });
}
