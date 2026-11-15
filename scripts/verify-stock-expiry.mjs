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
  RESOLVED_HOLD_DAYS,
  resolutionApplies,
  resolutionDetails,
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

const daysAgo = (days, from = NOW) => new Date(from.getTime() - days * 86400000);

t("resolutionDetails: remembers the expiry date for an expiry alert and the stock level for a stock alert", () => {
  assert.deepEqual(resolutionDetails("expired", { expiry_date: iso(-2), current_stock: 5 }), { kind: "expired", expiry_at_resolve: iso(-2), stock_at_resolve: null });
  assert.deepEqual(resolutionDetails("soon", { expiry_date: iso(10) }), { kind: "soon", expiry_at_resolve: iso(10), stock_at_resolve: null });
  assert.deepEqual(resolutionDetails("low", { current_stock: 2, min_stock: 3 }), { kind: "low", expiry_at_resolve: "", stock_at_resolve: 2 });
  assert.deepEqual(resolutionDetails("out", { current_stock: 0 }), { kind: "out", expiry_at_resolve: "", stock_at_resolve: 0 });
});

t("a fresh resolution hides the alert; none at all does not", () => {
  const item = { id: "a", expiry_date: iso(-2), current_stock: 5 };
  const made = { ...resolutionDetails("expired", item), resolved_at: daysAgo(1) };
  assert.equal(resolutionApplies(made, "expired", item, NOW), true);
  assert.equal(resolutionApplies(undefined, "expired", item, NOW), false);
  assert.equal(resolutionApplies(null, "low", item, NOW), false);
});

t("an expiry alert comes back when the item has a different expiry date (a new batch)", () => {
  const made = { kind: "expired", expiry_at_resolve: iso(-40), stock_at_resolve: null, resolved_at: daysAgo(10) };
  assert.equal(resolutionApplies(made, "expired", { expiry_date: iso(-40) }, NOW), true);
  assert.equal(resolutionApplies(made, "expired", { expiry_date: iso(-2) }, NOW), false);
  const soon = { kind: "soon", expiry_at_resolve: iso(10), stock_at_resolve: null, resolved_at: daysAgo(2) };
  assert.equal(resolutionApplies(soon, "soon", { expiry_date: iso(10) }, NOW), true);
  assert.equal(resolutionApplies(soon, "soon", { expiry_date: iso(20) }, NOW), false);
});

t("a stock alert comes back once the stock has gone up since it was resolved", () => {
  const made = { kind: "low", expiry_at_resolve: "", stock_at_resolve: 2, resolved_at: daysAgo(3) };
  assert.equal(resolutionApplies(made, "low", { current_stock: 2 }, NOW), true, "still the same");
  assert.equal(resolutionApplies(made, "low", { current_stock: 1 }, NOW), true, "used a little more: still being dealt with");
  assert.equal(resolutionApplies(made, "low", { current_stock: 3 }, NOW), false, "restocked: a new problem if it runs low again");
  const out = { kind: "out", expiry_at_resolve: "", stock_at_resolve: 0, resolved_at: daysAgo(3) };
  assert.equal(resolutionApplies(out, "out", { current_stock: 0 }, NOW), true);
  assert.equal(resolutionApplies(out, "out", { current_stock: 4 }, NOW), false);
});

t("any resolution lapses after the hold period, so a problem that is still there is shown again", () => {
  assert.equal(RESOLVED_HOLD_DAYS, 30);
  const item = { expiry_date: iso(-2), current_stock: 2 };
  assert.equal(resolutionApplies({ ...resolutionDetails("expired", item), resolved_at: daysAgo(29) }, "expired", item, NOW), true);
  assert.equal(resolutionApplies({ ...resolutionDetails("expired", item), resolved_at: daysAgo(30) }, "expired", item, NOW), false);
  assert.equal(resolutionApplies({ ...resolutionDetails("low", item), resolved_at: daysAgo(45) }, "low", item, NOW), false);
});

t("resolutions made before the details were saved: the time limit applies, and an expired one stops applying for a later expiry date", () => {
  assert.equal(resolutionApplies({ resolved_at: daysAgo(5) }, "low", { current_stock: 9 }, NOW), true);
  assert.equal(resolutionApplies({ resolved_at: daysAgo(40) }, "low", { current_stock: 1 }, NOW), false);
  assert.equal(resolutionApplies({ resolved_at: daysAgo(3) }, "expired", { expiry_date: iso(-9) }, NOW), true, "expired before it was resolved: same batch");
  assert.equal(resolutionApplies({ resolved_at: daysAgo(10) }, "expired", { expiry_date: iso(-2) }, NOW), false, "expired after it was resolved: a different batch");
  assert.equal(resolutionApplies(true, "low", { current_stock: 1 }, NOW), true, "a bare true (the old pop-up map) still hides it");
  assert.equal(resolutionApplies({ resolved_at: { toDate: () => daysAgo(40) } }, "low", { current_stock: 1 }, NOW), false, "a Firestore timestamp works");
  assert.equal(resolutionApplies({ resolved_at: null }, "low", { current_stock: 1 }, NOW), true, "a timestamp still being written counts as just now");
});

t("summariseStockAlerts: a resolved alert that has come back is counted again", () => {
  const stock = [{ id: "d", current_stock: 6, min_stock: 3 }, { id: "x", current_stock: 2, min_stock: 3 }, { id: "a", expiry_date: iso(-2), current_stock: 5, min_stock: 1 }];
  const resolved = {
    "lowstock-stock-d": { kind: "low", expiry_at_resolve: "", stock_at_resolve: 1, resolved_at: daysAgo(2) },   // restocked to 6, then...
    "lowstock-stock-x": { kind: "low", expiry_at_resolve: "", stock_at_resolve: 2, resolved_at: daysAgo(2) },   // same as when resolved
    "expired-stock-a": { kind: "expired", expiry_at_resolve: iso(-40), stock_at_resolve: null, resolved_at: daysAgo(2) }, // a different expiry date now
  };
  const r = summariseStockAlerts(stock, { categoryOf: () => "medicines", now: NOW, resolved });
  assert.deepEqual(r.alerts.map((a) => a.id), ["expired-stock-a"], "the changed expiry is back; the unchanged low one stays hidden; d is not low any more");
});

console.log(`\n${n} passed`);
