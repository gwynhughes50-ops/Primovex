import assert from "node:assert/strict";
import * as R from "../src/desktop/alerts/alertRules.js";
import { summariseStockAlerts } from "../src/lib/stockAlerts.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };

// Wednesday 2026-09-23 10:00 local
const at = (day, h = 10, m = 0) => new Date(2026, 8, day, h, m, 0).getTime();
const NOW = at(23);
const ts = (ms) => ({ toDate: () => new Date(ms) }); // Firestore Timestamp shape
const day = (offset) => ts(new Date(2026, 8, 23 + offset, 15, 0).getTime());

// ---- SAR state
t("SAR: past due date is overdue", () => assert.equal(R.sarAlertState({ status: "in_progress", dueDate: day(-1) }, NOW), "overdue"));
t("SAR: due today is due soon (not overdue)", () => assert.equal(R.sarAlertState({ status: "new", dueDate: day(0) }, NOW), "soon"));
t("SAR: 2 days out is due soon, 3 days out is nothing", () => {
  assert.equal(R.sarAlertState({ status: "new", dueDate: day(2) }, NOW), "soon");
  assert.equal(R.sarAlertState({ status: "new", dueDate: day(3) }, NOW), null);
});
t("SAR: completed / archived never alert even if long overdue", () => {
  assert.equal(R.sarAlertState({ status: "completed", dueDate: day(-30) }, NOW), null);
  assert.equal(R.sarAlertState({ status: "archived", dueDate: day(-30) }, NOW), null);
});
t("SAR: no due date, or unreadable, is ignored", () => {
  assert.equal(R.sarAlertState({ status: "new" }, NOW), null);
  assert.equal(R.sarAlertState({ status: "new", dueDate: "not a date" }, NOW), null);
});
t("SAR: accepts due_date and plain ISO strings", () => {
  assert.equal(R.sarAlertState({ status: "new", due_date: new Date(2026, 8, 20).toISOString() }, NOW), "overdue");
});

// ---- concern state
const c = (o) => ({ status: "investigation", acknowledgedAt: ts(NOW), finalResponseDueAt: day(20), ...o });
t("concern: final response passed is overdue", () => assert.equal(R.concernAlertState(c({ finalResponseDueAt: day(-2) }), NOW), "overdue"));
t("concern: unacknowledged and acknowledgement date passed is overdue", () =>
  assert.equal(R.concernAlertState(c({ status: "received", acknowledgedAt: null, acknowledgementDueAt: day(-1) }), NOW), "overdue"));
t("concern: acknowledged ignores an old acknowledgement date", () =>
  assert.equal(R.concernAlertState(c({ acknowledgementDueAt: day(-9) }), NOW), null));
t("concern: early-resolution date only counts while in early resolution", () => {
  assert.equal(R.concernAlertState(c({ status: "early_resolution", earlyResolutionDueAt: day(-1) }), NOW), "overdue");
  assert.equal(R.concernAlertState(c({ status: "investigation", earlyResolutionDueAt: day(-1) }), NOW), null);
});
t("concern: most urgent deadline wins", () =>
  assert.equal(R.concernAlertState(c({ status: "early_resolution", earlyResolutionDueAt: day(1), finalResponseDueAt: day(-1) }), NOW), "overdue"));
t("concern: closed / archived never alert", () => {
  assert.equal(R.concernAlertState(c({ status: "closed", finalResponseDueAt: day(-5) }), NOW), null);
  assert.equal(R.concernAlertState(c({ status: "archived", finalResponseDueAt: day(-5) }), NOW), null);
});
t("concern: due within 2 days is due soon", () => assert.equal(R.concernAlertState(c({ finalResponseDueAt: day(2) }), NOW), "soon"));

// ---- summary + message
const sars = [
  { id: "s1", status: "in_progress", dueDate: day(-3) },
  { id: "s2", status: "new", dueDate: day(-1) },
  { id: "s3", status: "new", dueDate: day(1) },
  { id: "s4", status: "new", dueDate: day(30) },
  { id: "s5", status: "completed", dueDate: day(-10) },
];
const concerns = [c({ id: "c1", finalResponseDueAt: day(-1) }), c({ id: "c2", finalResponseDueAt: day(40) })];
const both = R.summariseDueItems({ sars, concerns, now: NOW });
t("summary counts the right things", () => {
  assert.deepEqual(both.counts, { sarOverdue: 2, sarSoon: 1, concernOverdue: 1, concernSoon: 0, stockExpired: 0, stockOut: 0, stockSoon: 0, stockLow: 0, notificationUrgent: 0, notificationNew: 0 });
  assert.equal(both.total, 4);
  assert.deepEqual(both.keys.sort(), ["concern:c1:overdue", "sar:s1:overdue", "sar:s2:overdue", "sar:s3:soon"]);
});
t("summary: passing no rows for a team the person is not in gives nothing for it", () => {
  const onlySars = R.summariseDueItems({ sars, concerns: [], now: NOW });
  assert.equal(onlySars.counts.concernOverdue, 0);
  assert.equal(onlySars.total, 3);
});
t("message matches the agreed wording and carries counts only", () => {
  const p = R.buildAlertPayload({ displayName: "Liz Jones", counts: both.counts });
  assert.equal(p.title, "Hi Liz, you have overdue items");
  assert.deepEqual(p.lines.map((l) => l.text), ["1 concern overdue", "2 SARs overdue", "1 SAR due within 2 days"]);
  assert.deepEqual(p.lines.map((l) => l.tone), ["danger", "danger", "warning"]);
  assert.ok(!JSON.stringify(p).match(/s1|s2|c1|CN-|SAR-/));
});
t("message: singular / no-name / due-soon only", () => {
  const p = R.buildAlertPayload({ displayName: "", counts: { sarOverdue: 0, sarSoon: 1, concernOverdue: 0, concernSoon: 0 } });
  assert.equal(p.title, "Hi, you have items due soon");
  assert.deepEqual(p.lines.map((l) => l.text), ["1 SAR due within 2 days"]);
});
t("open target: concerns only -> concerns page, otherwise SARs", () => {
  assert.equal(R.buildAlertPayload({ displayName: "A", counts: { sarOverdue: 0, sarSoon: 0, concernOverdue: 1, concernSoon: 0 } }).openPath, "/governance/concerns");
  assert.equal(R.buildAlertPayload({ displayName: "A", counts: both.counts }).openPath, "/governance/sars");
});

// ---- when to show
const E = R.EMPTY_ALERT_STATE;
const H = 3600 * 1000;
t("first time: shows", () => assert.equal(R.shouldShowAlert({ summary: both, state: E, now: NOW }), true));
t("nothing due: never shows", () => assert.equal(R.shouldShowAlert({ summary: R.summariseDueItems({ now: NOW }), state: E, now: NOW }), false));
t("after being shown: quiet for the hour, then returns", () => {
  const shown = R.afterShown(E, both, NOW);
  assert.equal(R.shouldShowAlert({ summary: both, state: shown, now: NOW + 59 * 60000 }), false);
  assert.equal(R.shouldShowAlert({ summary: both, state: shown, now: NOW + H }), true);
});
t("snooze: quiet until it ends, then returns straight away", () => {
  const snoozed = R.afterSnooze(R.afterShown(E, both, NOW), "snooze_1h", NOW + 10000);
  assert.equal(R.shouldShowAlert({ summary: both, state: snoozed, now: NOW + 30 * 60000 }), false);
  assert.equal(R.shouldShowAlert({ summary: both, state: snoozed, now: NOW + H + 10001 }), true);
});
t("snooze wins over a newly overdue item", () => {
  const snoozed = R.afterSnooze(R.afterShown(E, both, NOW), "snooze_1h", NOW);
  const more = R.summariseDueItems({ sars: [...sars, { id: "s9", status: "new", dueDate: day(-1) }], concerns, now: NOW });
  assert.equal(R.shouldShowAlert({ summary: more, state: snoozed, now: NOW + 20 * 60000 }), false);
});
t("snooze options: 1h, later today (3h), tomorrow 9am", () => {
  assert.equal(R.snoozeUntil("snooze_1h", NOW), NOW + H);
  assert.equal(R.snoozeUntil("snooze_later", NOW), NOW + 3 * H);
  assert.equal(R.snoozeUntil("snooze_tomorrow", NOW), new Date(2026, 8, 24, 9, 0).getTime());
  assert.equal(R.snoozeUntil("nonsense", NOW), null);
  assert.equal(R.afterSnooze(E, "nonsense", NOW), E);
});
t("dismiss: stays quiet, even after the hour", () => {
  const d = R.afterDismiss(R.afterShown(E, both, NOW), both);
  assert.equal(R.shouldShowAlert({ summary: both, state: d, now: NOW + 5 * H }), false);
});
t("dismiss: an item completing does not bring it back", () => {
  const d = R.afterDismiss(R.afterShown(E, both, NOW), both);
  const fewer = R.summariseDueItems({ sars: sars.slice(1), concerns, now: NOW });
  assert.equal(R.shouldShowAlert({ summary: fewer, state: d, now: NOW + 5 * H }), false);
});
t("dismiss: a NEW overdue item brings it back (after the 5 min gap)", () => {
  const d = R.afterDismiss(R.afterShown(E, both, NOW), both);
  const more = R.summariseDueItems({ sars: [...sars, { id: "s9", status: "new", dueDate: day(-1) }], concerns, now: NOW });
  assert.equal(R.shouldShowAlert({ summary: more, state: d, now: NOW + 2 * 60000 }), false);
  assert.equal(R.shouldShowAlert({ summary: more, state: d, now: NOW + 6 * 60000 }), true);
});
t("dismiss: due-soon item turning overdue counts as new", () => {
  const before = R.summariseDueItems({ sars: [{ id: "x", status: "new", dueDate: day(0) }], now: NOW });
  const d = R.afterDismiss(R.afterShown(E, before, NOW), before);
  const tomorrow = at(24);
  const after = R.summariseDueItems({ sars: [{ id: "x", status: "new", dueDate: day(0) }], now: at(25) });
  assert.equal(after.counts.sarOverdue, 1);
  assert.equal(R.shouldShowAlert({ summary: after, state: d, now: at(25) }), true);
  void tomorrow;
});
t("not dismissed, new item within the hour: shows once past 5 minutes", () => {
  const shown = R.afterShown(E, R.summariseDueItems({ sars: sars.slice(0, 1), now: NOW }), NOW);
  assert.equal(R.shouldShowAlert({ summary: both, state: shown, now: NOW + 2 * 60000 }), false);
  assert.equal(R.shouldShowAlert({ summary: both, state: shown, now: NOW + 6 * 60000 }), true);
});
t("a shrinking list does not re-trigger inside the hour", () => {
  const shown = R.afterShown(E, both, NOW);
  const fewer = R.summariseDueItems({ sars: sars.slice(0, 1), now: NOW });
  assert.equal(R.shouldShowAlert({ summary: fewer, state: shown, now: NOW + 10 * 60000 }), false);
});
t("working hours: weekdays 08:00-18:00 only", () => {
  assert.equal(R.isWithinAlertHours(at(23, 7, 59)), false);
  assert.equal(R.isWithinAlertHours(at(23, 8, 0)), true);
  assert.equal(R.isWithinAlertHours(at(23, 17, 59)), true);
  assert.equal(R.isWithinAlertHours(at(23, 18, 0)), false);
  assert.equal(R.isWithinAlertHours(at(26, 10)), false); // Saturday
  assert.equal(R.isWithinAlertHours(at(27, 10)), false); // Sunday
  assert.equal(R.shouldShowAlert({ summary: both, state: E, now: at(23, 20) }), false);
});
t("state storage: round trip, per person, corrupt data safe, on/off switch", () => {
  const store = new Map();
  const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  R.saveAlertState("u1", R.afterDismiss(E, both), storage);
  assert.equal(R.loadAlertState("u1", storage).dismissedKeys.length, 4);
  assert.equal(R.loadAlertState("u2", storage).dismissedKeys.length, 0);
  store.set("primovex.desktopAlerts.state.u1", "{broken");
  assert.deepEqual(R.loadAlertState("u1", storage), E);
  assert.equal(R.isDesktopAlertsEnabled("u1", storage), true);
  R.setDesktopAlertsEnabled("u1", false, storage);
  assert.equal(R.isDesktopAlertsEnabled("u1", storage), false);
  assert.equal(R.isDesktopAlertsEnabled("u2", storage), true);
  R.setDesktopAlertsEnabled("u1", true, storage);
  assert.equal(R.isDesktopAlertsEnabled("u1", storage), true);
});
// ---- login reminder (signed-out screen) ------------------------------------
t("daysSinceLogin: null when never recorded", () => assert.equal(R.daysSinceLogin(null, NOW), null));
t("daysSinceLogin: 0 for today, whole days otherwise", () => {
  assert.equal(R.daysSinceLogin(NOW - 3 * 3600 * 1000, NOW), 0);
  assert.equal(R.daysSinceLogin(NOW - 2 * 86400000, NOW), 2);
  assert.equal(R.daysSinceLogin(NOW - 2.9 * 86400000, NOW), 2);
});
t("buildLoginReminderPayload: generic wording under the staleness threshold", () => {
  const p0 = R.buildLoginReminderPayload({ days: null });
  assert.equal(p0.title, "Still there?");
  const p1 = R.buildLoginReminderPayload({ days: 1 });
  assert.equal(p1.title, "Still there?");
});
t("buildLoginReminderPayload: names the day count once stale", () => {
  const p = R.buildLoginReminderPayload({ days: 5 });
  assert.equal(p.title, "It's been a while");
  assert.deepEqual(p.lines, [{ tone: "warning", text: "5 days since anyone signed in on this PC" }]);
});
t("recordLoginTimestamp / readLastLoginAt: round trip, corrupt/missing data safe", () => {
  const store = new Map();
  const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  assert.equal(R.readLastLoginAt(storage), null);
  R.recordLoginTimestamp(NOW, storage);
  assert.equal(R.readLastLoginAt(storage), NOW);
  store.set("primovex.lastLoginAt", "not-a-number");
  assert.equal(R.readLastLoginAt(storage), null);
});
t("login reminder shares the same show/repeat/snooze engine as SAR/concern alerts", () => {
  const summary = R.LOGIN_REMINDER_SUMMARY;
  assert.equal(R.shouldShowAlert({ summary, state: E, now: NOW }), true);
  const shown = R.afterShown(E, summary, NOW);
  assert.equal(R.shouldShowAlert({ summary, state: shown, now: NOW + 59 * 60000 }), false);
  assert.equal(R.shouldShowAlert({ summary, state: shown, now: NOW + H }), true);
  const snoozed = R.afterSnooze(shown, "snooze_1h", NOW);
  assert.equal(R.shouldShowAlert({ summary, state: snoozed, now: NOW + 30 * 60000 }), false);
  assert.equal(R.shouldShowAlert({ summary, state: snoozed, now: NOW + H + 1 }), true);
});

// ---- stock (expired / expiring / out / low), for everyone who can view inventory
const stockList = [
  { id: "expired-stock-a", state: "expired" },
  { id: "outofstock-stock-b", state: "out" },
  { id: "expiring-stock-c", state: "soon" },
  { id: "lowstock-stock-d", state: "low" },
  { id: "lowstock-stock-e", state: "low" },
];
t("stock only: counted by kind, keyed per item and state, with no governance rows", () => {
  const s = R.summariseDueItems({ stock: stockList, now: NOW });
  assert.deepEqual(s.counts, { sarOverdue: 0, sarSoon: 0, concernOverdue: 0, concernSoon: 0, stockExpired: 1, stockOut: 1, stockSoon: 1, stockLow: 2, notificationUrgent: 0, notificationNew: 0 });
  assert.equal(s.total, 5);
  assert.deepEqual(s.keys.sort(), ["stock:expired-stock-a", "stock:expiring-stock-c", "stock:lowstock-stock-d", "stock:lowstock-stock-e", "stock:outofstock-stock-b"]);
});
t("stock: junk entries are ignored", () => {
  const s = R.summariseDueItems({ stock: [null, {}, { id: "x", state: "weird" }, { state: "low" }, { id: "ok", state: "low" }], now: NOW });
  assert.equal(s.total, 1);
});
t("stock message: counts only, the most urgent first, no item ids", () => {
  const s = R.summariseDueItems({ stock: stockList, now: NOW });
  const p = R.buildAlertPayload({ displayName: "Liz Jones", counts: s.counts });
  assert.equal(p.title, "Hi Liz, some items need attention now");
  assert.deepEqual(p.lines.map((l) => l.text), ["1 stock item expired", "1 item out of stock", "1 item expiring soon", "2 items low on stock"]);
  assert.deepEqual(p.lines.map((l) => l.tone), ["danger", "danger", "warning", "warning"]);
  assert.ok(!JSON.stringify(p).match(/stock-a|stock-b|expired-stock/));
  assert.equal(p.openPath, "/alerts");
});
t("stock: only low/expiring (nothing urgent) is the gentler 'soon' wording", () => {
  const p = R.buildAlertPayload({ displayName: "", counts: { stockSoon: 2, stockLow: 1 } });
  assert.equal(p.title, "Hi, some items need attention soon");
  assert.deepEqual(p.lines.map((l) => l.text), ["2 items expiring soon", "1 item low on stock"]);
});
t("stock + governance together: shared lines in urgency order, capped to what the window fits", () => {
  const counts = { sarOverdue: 2, sarSoon: 1, concernOverdue: 1, concernSoon: 1, stockExpired: 3, stockOut: 1, stockSoon: 4, stockLow: 5 };
  const p = R.buildAlertPayload({ displayName: "A", counts });
  assert.equal(p.lines.length, R.MAX_ALERT_LINES);
  assert.deepEqual(p.lines.slice(0, 3).map((l) => l.text), ["1 concern overdue", "2 SARs overdue", "3 stock items expired"]);
  assert.equal(p.lines[3].text, "and 5 more to look at");
  assert.equal(p.lines[3].tone, "danger"); // an out-of-stock line is among the hidden ones
  assert.equal(p.title, "Hi A, some items need attention now");
});
t("which page opens: stock-led -> Alerts; governance-led stays as before", () => {
  assert.equal(R.buildAlertPayload({ displayName: "A", counts: { sarOverdue: 1, stockLow: 1 } }).openPath, "/governance/sars");
  assert.equal(R.buildAlertPayload({ displayName: "A", counts: { concernOverdue: 1, stockLow: 1 } }).openPath, "/governance/concerns");
  assert.equal(R.buildAlertPayload({ displayName: "A", counts: { sarSoon: 1, stockExpired: 2 } }).openPath, "/alerts");
});
t("governance-only wording is unchanged when stock counts are absent", () => {
  const p = R.buildAlertPayload({ displayName: "Liz", counts: { sarOverdue: 1, sarSoon: 0, concernOverdue: 0, concernSoon: 0 } });
  assert.equal(p.title, "Hi Liz, you have overdue items");
  assert.deepEqual(p.lines.map((l) => l.text), ["1 SAR overdue"]);
});
t("stock alerts use the same show/snooze/dismiss engine: dismiss hides them until a NEW one appears", () => {
  const first = R.summariseDueItems({ stock: stockList, now: NOW });
  const shown = R.afterDismiss(E, first);
  assert.equal(R.shouldShowAlert({ summary: first, state: shown, now: NOW }), false);
  const more = R.summariseDueItems({ stock: [...stockList, { id: "outofstock-stock-z", state: "out" }], now: NOW });
  assert.equal(R.shouldShowAlert({ summary: more, state: shown, now: NOW }), true);
});
t("an item moving from low to out of stock counts as new (its key changes)", () => {
  const low = R.summariseDueItems({ stock: [{ id: "lowstock-stock-q", state: "low" }], now: NOW });
  const out = R.summariseDueItems({ stock: [{ id: "outofstock-stock-q", state: "out" }], now: NOW });
  assert.notDeepEqual(low.keys, out.keys);
  const dismissed = R.afterDismiss(E, low);
  assert.equal(R.shouldShowAlert({ summary: out, state: dismissed, now: NOW }), true);
});

// ---- end to end: stock items -> shared alert rules -> pop-up text
t("end to end: real-looking stock rows become the right pop-up, resolved alerts stay out of it", () => {
  const today = new Date(NOW);
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const inDays = (k) => { const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + k); return ymd(d); };
  const rows = [
    { id: "adrenaline", name: "Adrenaline", category: "medicines", current_stock: 2, min_stock: 4, expiry_date: inDays(10) }, // low + expiring
    { id: "gloves", name: "Gloves", category: "clinical-consumables", current_stock: 0, min_stock: 5 },                       // out
    { id: "swabs", name: "Swabs", category: "clinical-consumables", current_stock: 50, min_stock: 5, expiry_date: inDays(-3) }, // expired
    { id: "fine", name: "Plasters", category: "general-stores", current_stock: 40, min_stock: 5, expiry_date: inDays(400) },
    { id: "old", name: "Old", archived_at: "2026-01-01", current_stock: 0, expiry_date: inDays(-90) },
  ];
  const alerts = summariseStockAlerts(rows, { categoryOf: (i) => i.category, now: today }).alerts;
  const summary = R.summariseDueItems({ stock: alerts, now: NOW });
  assert.deepEqual(summary.counts, { sarOverdue: 0, sarSoon: 0, concernOverdue: 0, concernSoon: 0, stockExpired: 1, stockOut: 1, stockSoon: 1, stockLow: 1, notificationUrgent: 0, notificationNew: 0 });
  const p = R.buildAlertPayload({ displayName: "Gwyn Hughes", counts: summary.counts });
  assert.equal(p.title, "Hi Gwyn, some items need attention now");
  assert.deepEqual(p.lines.map((l) => l.text), ["1 stock item expired", "1 item out of stock", "1 item expiring soon", "1 item low on stock"]);
  assert.ok(!JSON.stringify(p).match(/Adrenaline|Gloves|Swabs/), "no item names leave the app");

  // someone marks the glove alert resolved on the Alerts page -> it drops out
  const resolved = { "outofstock-stock-gloves": true };
  const after = summariseStockAlerts(rows, { categoryOf: (i) => i.category, now: today, resolved }).alerts;
  const counts2 = R.summariseDueItems({ stock: after, now: NOW }).counts;
  assert.equal(counts2.stockOut, 0);
  assert.equal(counts2.stockExpired, 1);
});

t("new notifications sent to the person show on the pop-up", () => {
  const summary = R.summariseDueItems({ notifications: [{ id: "n1", priority: "high" }, { id: "n2", priority: "info" }, { id: "n3", priority: "routine" }], now: NOW });
  assert.equal(summary.counts.notificationUrgent, 1);
  assert.equal(summary.counts.notificationNew, 2);
  const p = R.buildAlertPayload({ displayName: "Craig Smith", counts: summary.counts });
  assert.equal(p.title, "Hi Craig, you have urgent notifications");
  assert.deepEqual(p.lines.map((l) => l.text), ["1 urgent notification", "2 new notifications"]);
  assert.equal(p.openPath, "/notifications");
  assert.equal(R.summariseDueItems({ notifications: [], now: NOW }).total, 0);
});

console.log(`\n${n} passed`);
