// The one definition of "expired", "expiring soon", "out of stock" and "low
// stock" for stock items, used by the Alerts page, the stock cards, the phone,
// the Dashboard and the desktop corner pop-up. Before this each had its own
// copy, with different windows (14 vs 30 days), different treatment of an item
// expiring today, and different low-stock rules, so the same item could look
// fine on one screen and flagged on another.
//
// Pure (no Firebase, no React) so it can be tested. The practice's chosen
// "expiring soon" windows live in Firestore (settings/alerts, edited on the
// Alerts page); useExpirySettings keeps the current copy in this module so the
// helpers below can read it without every caller passing it around.

export const DEFAULT_EXPIRY_SOON_DAYS = 30;

// Keyed by the fixed taxonomy's main category id (src/data/stockCategories.js).
// 0 means "no override, use the practice-wide number".
export const DEFAULT_CATEGORY_THRESHOLDS = {
  medicines: 30,
  "emergency-equipment": 60,
  "clinical-consumables": 30,
  diagnostics: 30,
  laboratory: 30,
  "cold-chain": 30,
  "cleaning-infection-control": 0,
  "office-administration": 0,
  "equipment-assets": 0,
  "rooms-facilities": 0,
  "general-stores": 0,
  uncategorised: 0,
};

export const DEFAULT_EXPIRY_SETTINGS = {
  globalDays: DEFAULT_EXPIRY_SOON_DAYS,
  categoryDays: DEFAULT_CATEGORY_THRESHOLDS,
};

// From the settings/alerts document (global_expiry_days, category_expiry_days).
export function normaliseExpirySettings(data) {
  const raw = data?.global_expiry_days;
  const parsed = raw === undefined || raw === null || raw === "" ? NaN : Number(raw);
  const categories = data?.category_expiry_days;
  return {
    globalDays: Number.isFinite(parsed) ? Math.max(0, parsed) : DEFAULT_EXPIRY_SOON_DAYS,
    categoryDays: { ...DEFAULT_CATEGORY_THRESHOLDS, ...(categories && typeof categories === "object" ? categories : {}) },
  };
}

// ---- the current practice settings, shared across the app -----------------

let currentSettings = DEFAULT_EXPIRY_SETTINGS;
const listeners = new Set();

export const getExpirySettings = () => currentSettings;

export function setExpirySettings(next) {
  currentSettings = next || DEFAULT_EXPIRY_SETTINGS;
  listeners.forEach((listener) => listener());
}

export function subscribeExpirySettings(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ---- expiry ----------------------------------------------------------------

// Parses a plain "YYYY-MM-DD" date as local midnight (new Date("YYYY-MM-DD")
// is UTC and can land on the wrong day).
export function parseExpiryDate(value) {
  if (!value || typeof value !== "string") return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Whole days from today to the expiry date: 0 on the day itself, negative once
// it has passed.
export function daysUntilExpiry(item, now = new Date()) {
  const date = parseExpiryDate(item?.expiry_date);
  if (!date) return null;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((date.getTime() - start.getTime()) / 86400000);
}

// How many days before expiry counts as "expiring soon" for this category: the
// category's own number if it has one, otherwise the practice-wide number. 0
// for the practice-wide number turns "expiring soon" off.
export function expiryWindowDays(categoryId, settings = currentSettings) {
  const own = Number(settings?.categoryDays?.[categoryId]);
  if (Number.isFinite(own) && own > 0) return own;
  const global = Number(settings?.globalDays);
  return Number.isFinite(global) ? Math.max(0, global) : DEFAULT_EXPIRY_SOON_DAYS;
}

// "expired" (before today) | "soon" (today up to the window) | null. An item
// that expires today is still usable today, so it is "soon", not "expired".
export function expiryStatus(item, { categoryId, settings = currentSettings, now = new Date() } = {}) {
  const days = daysUntilExpiry(item, now);
  if (days === null) return null;
  if (days < 0) return "expired";
  const window = expiryWindowDays(categoryId, settings);
  return window > 0 && days <= window ? "soon" : null;
}

// ---- stock level -----------------------------------------------------------

// "out" (nothing left) | "low" (at or below its minimum) | null. An item with
// no minimum set is only flagged once it has run out.
export function stockLevelStatus(item) {
  const current = Number(item?.current_stock ?? 0);
  const min = Number(item?.min_stock ?? 0);
  if (!(current > 0)) return "out";
  return min > 0 && current <= min ? "low" : null;
}

// ---- per-item alerts -------------------------------------------------------

// The id an alert has on the Alerts page and in alert_resolutions, so a
// resolved alert stays resolved everywhere it is shown.
const ID_PREFIX = { expired: "expired-stock", soon: "expiring-stock", out: "outofstock-stock", low: "lowstock-stock" };
export function stockAlertId(state, itemId) {
  return `${ID_PREFIX[state]}-${itemId}`;
}

// Every alert one item raises right now (it can be both expired and out of stock).
export function stockAlertStates(item, { categoryId, settings, now } = {}) {
  const states = [];
  const expiry = expiryStatus(item, { categoryId, settings, now });
  if (expiry) states.push(expiry);
  const level = stockLevelStatus(item);
  if (level) states.push(level);
  return states.map((state) => ({ state, id: stockAlertId(state, item.id) }));
}

// Counts across a list of items. Archived items never alert. `resolved` is the
// alert_resolutions map (id -> anything): an alert someone has marked resolved
// is left out. `categoryOf(item)` gives the item's taxonomy category id.
export function summariseStockAlerts(items = [], { categoryOf = () => undefined, settings, now = new Date(), resolved = {} } = {}) {
  const alerts = [];
  const counts = { out: 0, low: 0, expired: 0, soon: 0 };
  for (const item of items) {
    if (!item || item.archived_at) continue;
    for (const alert of stockAlertStates(item, { categoryId: categoryOf(item), settings, now })) {
      if (resolved?.[alert.id]) continue;
      alerts.push({ ...alert, itemId: item.id });
      counts[alert.state] += 1;
    }
  }
  return { alerts, counts, total: alerts.length };
}
