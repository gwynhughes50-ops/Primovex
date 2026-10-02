// Covers the shared stock-alert definitions (src/lib/stockAlerts.js): expiry
// windows, the expired/soon/out/low decisions, alert ids and the summary used
// by the Alerts page, the stock cards, the phone, the Dashboard and the desktop
// corner pop-up. (This script used to test a copy of the old 14-day logic.)
import assert from "node:assert/strict";
import {
  DEFAULT_CATEGORY_THRESHOLDS,
  DEFAULT_EXPIRY_SETTINGS,
  daysUntilExpiry,
  expiryStatus,
  expiryWindowDays,
  normaliseExpirySettings,
  parseExpiryDate,
  stockAlertId,
  stockAlertStates,
  stockLevelStatus,
  summariseStockAlerts,
} from "../src/lib/stockAlerts.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };

const NOW = new Date(2026, 9, 2, 10, 30); // 2 Oct 2026, mid-morning
const iso = (offsetDays) => {
  const d = new Date(2026, 9, 2 + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const meds = { categoryId: "medicines", now: NOW };

t("parseExpiryDate: valid YYYY-MM-DD is local midnight; junk is null", () => {
  const d = parseExpiryDate("2026-01-05");
  assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()], [2026, 0, 5, 0]);
  for (const bad of ["", null, undefined, "not-a-date", 5]) assert.equal(parseExpiryDate(bad), null);
});

t("daysUntilExpiry: today 0, tomorrow 1, yesterday -1, no date null", () => {
  assert.equal(daysUntilExpiry({ expiry_date: iso(0) }, NOW), 0);
  assert.equal(daysUntilExpiry({ expiry_date: iso(1) }, NOW), 1);
  assert.equal(daysUntilExpiry({ expiry_date: iso(-1) }, NOW), -1);
  assert.equal(daysUntilExpiry({}, NOW), null);
});

t("the default window is 30 days (not the old 14), and an item expiring today is 'soon', not 'expired'", () => {
  assert.equal(expiryStatus({ expiry_date: iso(0) }, meds), "soon");
  assert.equal(expiryStatus({ expiry_date: iso(30) }, meds), "soon");
  assert.equal(expiryStatus({ expiry_date: iso(31) }, meds), null);
  assert.equal(expiryStatus({ expiry_date: iso(-1) }, meds), "expired");
  assert.equal(expiryStatus({}, meds), null);
});

t("a category's own window wins; 0 means use the practice-wide number", () => {
  assert.equal(expiryWindowDays("emergency-equipment"), 60);
  assert.equal(expiryStatus({ expiry_date: iso(45) }, { categoryId: "emergency-equipment", now: NOW }), "soon");
  assert.equal(expiryStatus({ expiry_date: iso(45) }, { categoryId: "medicines", now: NOW }), null);
  assert.equal(expiryWindowDays("general-stores"), DEFAULT_EXPIRY_SETTINGS.globalDays); // 0 override -> global
  assert.equal(expiryWindowDays(undefined), 30);
});

t("settings read from the practice's settings/alerts document", () => {
  const s = normaliseExpirySettings({ global_expiry_days: 10, category_expiry_days: { medicines: 90 } });
  assert.equal(s.globalDays, 10);
  assert.equal(expiryWindowDays("medicines", s), 90);
  assert.equal(expiryWindowDays("diagnostics", s), 30); // default override still applies
  assert.equal(expiryWindowDays("general-stores", s), 10);
  assert.equal(expiryStatus({ expiry_date: iso(20) }, { categoryId: "general-stores", settings: s, now: NOW }), null);
});

t("missing or invalid settings fall back to the defaults", () => {
  for (const data of [undefined, null, {}, { global_expiry_days: "" }, { global_expiry_days: "abc" }]) {
    assert.equal(normaliseExpirySettings(data).globalDays, 30);
  }
  assert.deepEqual(normaliseExpirySettings({}).categoryDays, DEFAULT_CATEGORY_THRESHOLDS);
  assert.equal(normaliseExpirySettings({ global_expiry_days: -5 }).globalDays, 0);
});

t("a practice-wide window of 0 turns 'expiring soon' off but never hides 'expired'", () => {
  const off = normaliseExpirySettings({ global_expiry_days: 0, category_expiry_days: { medicines: 0 } });
  assert.equal(expiryStatus({ expiry_date: iso(3) }, { categoryId: "medicines", settings: off, now: NOW }), null);
  assert.equal(expiryStatus({ expiry_date: iso(-3) }, { categoryId: "medicines", settings: off, now: NOW }), "expired");
});

t("stockLevelStatus: out / low / fine, matching the stock card badge", () => {
  assert.equal(stockLevelStatus({ current_stock: 0, min_stock: 5 }), "out");
  assert.equal(stockLevelStatus({ current_stock: 0 }), "out");           // no minimum set, still out
  assert.equal(stockLevelStatus({ current_stock: -2, min_stock: 1 }), "out");
  assert.equal(stockLevelStatus({ current_stock: 3, min_stock: 5 }), "low");
  assert.equal(stockLevelStatus({ current_stock: 5, min_stock: 5 }), "low"); // at the minimum counts
  assert.equal(stockLevelStatus({ current_stock: 6, min_stock: 5 }), null);
  assert.equal(stockLevelStatus({ current_stock: 4 }), null);               // no minimum, plenty
  assert.equal(stockLevelStatus({ current_stock: "7", min_stock: "7" }), "low"); // numbers stored as text
});

t("alert ids match the ones the Alerts page and alert_resolutions use", () => {
  assert.equal(stockAlertId("expired", "abc"), "expired-stock-abc");
  assert.equal(stockAlertId("soon", "abc"), "expiring-stock-abc");
  assert.equal(stockAlertId("out", "abc"), "outofstock-stock-abc");
  assert.equal(stockAlertId("low", "abc"), "lowstock-stock-abc");
});

t("one item can raise both an expiry and a stock alert", () => {
  const states = stockAlertStates({ id: "x", expiry_date: iso(-1), current_stock: 0, min_stock: 2 }, meds);
  assert.deepEqual(states.map((s) => s.state), ["expired", "out"]);
});

const items = [
  { id: "a", expiry_date: iso(-2), current_stock: 5, min_stock: 1 },              // expired
  { id: "b", expiry_date: iso(10), current_stock: 5, min_stock: 1 },              // soon
  { id: "c", current_stock: 0, min_stock: 3 },                                    // out
  { id: "d", current_stock: 2, min_stock: 3 },                                    // low
  { id: "e", current_stock: 9, min_stock: 3, expiry_date: iso(200) },             // fine
  { id: "f", archived_at: "2026-01-01", expiry_date: iso(-9), current_stock: 0 }, // archived: ignored
];

t("summariseStockAlerts: counts each kind, ignores archived and fine items", () => {
  const r = summariseStockAlerts(items, { categoryOf: () => "medicines", now: NOW });
  assert.deepEqual(r.counts, { out: 1, low: 1, expired: 1, soon: 1 });
  assert.equal(r.total, 4);
  assert.deepEqual(r.alerts.map((a) => a.id).sort(), ["expired-stock-a", "expiring-stock-b", "lowstock-stock-d", "outofstock-stock-c"]);
});

t("summariseStockAlerts: alerts someone has already resolved are left out", () => {
  const r = summariseStockAlerts(items, { categoryOf: () => "medicines", now: NOW, resolved: { "expired-stock-a": { by: "x" }, "lowstock-stock-d": true } });
  assert.deepEqual(r.counts, { out: 1, low: 0, expired: 0, soon: 1 });
});

t("summariseStockAlerts: an empty or missing list is zero", () => {
  assert.equal(summariseStockAlerts([]).total, 0);
  assert.equal(summariseStockAlerts(undefined).total, 0);
});

console.log(`\n${n} passed`);
