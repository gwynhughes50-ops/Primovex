import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ALL_PERIODS, TAB_RULES, expiryCards, mileageExport, mileageReport, rulesFor, stockCards, temperatureCards, timesheetExport, timesheetReport, transactionCards } from "../src/modules/reports/reportSummary.js";
import { DEFAULT_RATES } from "../src/modules/mileage/mileage.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const titles = (cards) => cards.map((c) => c.title);
const value = (cards, title) => cards.find((c) => c.title === title).value;

t("each report has its own controls: stock filters only on stock and expiry, dates only where records have dates", () => {
  for (const tab of ["stock", "expiry"]) assert.ok(TAB_RULES[tab].site && TAB_RULES[tab].location && TAB_RULES[tab].category && TAB_RULES[tab].attention && !TAB_RULES[tab].date);
  for (const tab of ["tx", "temp"]) assert.ok(TAB_RULES[tab].site && TAB_RULES[tab].date && !TAB_RULES[tab].location && !TAB_RULES[tab].category && !TAB_RULES[tab].attention);
  for (const tab of ["concerns", "sars", "mileage"]) assert.ok(TAB_RULES[tab].date && !TAB_RULES[tab].site);
  assert.ok(TAB_RULES.mileage.status && TAB_RULES.timesheets.period && !TAB_RULES.timesheets.date);
  assert.equal(rulesFor("nonsense"), TAB_RULES.stock);
});

t("stock figures are stock figures, and the other reports never show them", () => {
  const items = [{ current_stock: 0, min_stock: 2 }, { current_stock: 1, min_stock: 2 }, { current_stock: 10, min_stock: 2 }];
  const cards = stockCards(items);
  assert.deepEqual(titles(cards), ["Total Items", "Out of Stock", "Low Stock", "Total Units"]);
  assert.deepEqual(cards.map((c) => c.value), [3, 1, 1, 11]);
  for (const other of [expiryCards([]), transactionCards([]), temperatureCards([]), mileageReport([], DEFAULT_RATES).cards, timesheetReport([], []).cards]) {
    assert.ok(!titles(other).includes("Out of Stock") && !titles(other).includes("Low Stock") && !titles(other).includes("Total Units"));
  }
});

t("expiry figures: expired, expiring soon, and the units affected", () => {
  const cards = expiryCards([{ expiry_status: "Expired", current_stock: 3 }, { expiry_status: "Expiring soon", current_stock: 2 }, { expiry_status: "OK", current_stock: 50 }]);
  assert.deepEqual(cards.map((c) => c.value), [3, 1, 1, 5]);
});

t("transaction figures: used, received and adjustments", () => {
  const cards = transactionCards([{ action: "Use", qty: 2 }, { action: "Use", qty: 1 }, { action: "Receive", qty: 10 }, { action: "Adjust", qty: 4 }, { action: "Edit", qty: 0 }]);
  assert.equal(value(cards, "Movements"), 5);
  assert.equal(value(cards, "Units used"), 3);
  assert.equal(value(cards, "Units received"), 10);
  assert.equal(value(cards, "Adjustments"), 1);
});

t("temperature figures: readings, units, lowest and highest, and a dash when there is nothing", () => {
  const cards = temperatureCards([{ site: "A", unit: "Fridge 1", temp: 4.5 }, { site: "A", unit: "Fridge 1", temp: 8.2 }, { site: "B", unit: "Fridge 2", temp: 3 }, { site: "B", unit: "Fridge 2", temp: NaN }]);
  assert.equal(value(cards, "Readings"), 4);
  assert.equal(value(cards, "Units logged"), 2);
  assert.equal(value(cards, "Lowest"), "3°C");
  assert.equal(value(cards, "Highest"), "8.2°C");
  assert.equal(value(temperatureCards([]), "Lowest"), "—");
});

const claim = (id, date, miles, extra = {}) => ({ id, uid: "u1", staffName: "Ann Example", date, fromName: "Surgery", toName: "Branch", miles, returnTrip: false, vehicle: "car", purpose: "Meeting or training", status: "approved", ...extra });

t("the mileage report: filters choose rows, amounts are priced over the whole tax year, only approved claims are paid", () => {
  const claims = [claim("a", "2026-09-01", 10), claim("b", "2026-09-20", 10, { returnTrip: true }), claim("c", "2026-10-01", 5, { status: "submitted" }), claim("d", "2026-10-02", 5, { status: "rejected", staffName: "Bob Other" })];
  const all = mileageReport(claims, DEFAULT_RATES);
  assert.deepEqual(all.rows.map((r) => r.id), ["d", "c", "b", "a"], "newest first");
  assert.deepEqual(all.cards.map((c) => c.value), [4, 30, "£13.50", 1]);
  assert.equal(all.rows.find((r) => r.id === "c").pence, null, "a waiting claim has no amount yet");
  const from = mileageReport(claims, DEFAULT_RATES, { from: "2026-09-10", to: "2026-09-30" });
  assert.deepEqual(from.rows.map((r) => r.id), ["b"]);
  assert.equal(from.rows[0].pence, 900, "20 miles at 45p");
  assert.deepEqual(mileageReport(claims, DEFAULT_RATES, { status: "submitted" }).rows.map((r) => r.id), ["c"]);
  assert.deepEqual(mileageReport(claims, DEFAULT_RATES, { query: "bob" }).rows.map((r) => r.id), ["d"]);
  const late = mileageReport([claim("x", "2026-04-07", 10000), claim("y", "2026-04-08", 10)], DEFAULT_RATES, { from: "2026-04-08" });
  assert.equal(late.rows[0].pence, 250, "the 10,000 miles already claimed this tax year count even though that claim is filtered out");
});

t("the mileage export has one row per claim with the amount in pounds", () => {
  const rows = mileageExport(mileageReport([claim("a", "2026-09-01", 10), claim("c", "2026-10-01", 5, { status: "submitted" })], DEFAULT_RATES).rows);
  assert.deepEqual(Object.keys(rows[0]), ["Date", "Name", "From", "To", "ReturnTrip", "TotalMiles", "Vehicle", "Reason", "Status", "AmountGBP", "TaxYear"]);
  assert.equal(rows[1].AmountGBP, "4.50");
  assert.equal(rows[0].AmountGBP, "");
  assert.equal(rows[0].Status, "Waiting for approval");
});

const sheet = (id, periodId, name, state, totals = {}, extra = {}) => ({ id, periodId, staffName: name, payrollNo: "", state, kind: Object.keys(totals).length ? "changes" : "no-change", totals, lines: [], from: periodId === "p2" ? "2026-10-05" : "2026-09-07", ...extra });

t("the timesheet report: by pay period, with hours by code and where each one stands", () => {
  const periods = [{ id: "p1", name: "September", from: "2026-09-07", to: "2026-10-04" }, { id: "p2", name: "October", from: "2026-10-05", to: "2026-11-01" }];
  const sheets = [
    sheet("1", "p1", "Ann Example", "sent", { B: 2 }), sheet("2", "p2", "Ann Example", "submitted", { B: 1, C: 1, A: 7.5 }, { payrollNo: "1234" }),
    sheet("3", "p2", "Bob Other", "approved", {}), sheet("4", "p2", "Cat Third", "declined", { D: 15 }),
  ];
  const all = timesheetReport(sheets, periods);
  assert.equal(all.rows.length, 4);
  assert.deepEqual(all.rows.map((r) => r.id).slice(0, 3), ["2", "3", "4"], "newest period first, then by name");
  const oct = timesheetReport(sheets, periods, { periodId: "p2" });
  assert.deepEqual(oct.cards.map((c) => [c.title, c.value]), [["Timesheets", 3], ["Signed off or sent", 1], ["Overtime hours", 2], ["Leave and sickness hours", 22.5]]);
  assert.equal(oct.rows[0].period, "October");
  assert.equal(oct.rows[0].stateLabel, "Waiting for the line manager");
  assert.equal(oct.rows.find((r) => r.id === "3").declaration, "No changes");
  assert.deepEqual(timesheetReport(sheets, periods, { periodId: "p2", query: "1234" }).rows.map((r) => r.id), ["2"]);
  assert.deepEqual(timesheetReport(sheets, periods, { periodId: ALL_PERIODS, query: "cat" }).rows.map((r) => r.id), ["4"]);
  const out = timesheetExport(oct.rows);
  assert.equal(out[0]["B Overtime, standard rate (h)"], 1);
  assert.equal(out[0].Status, "Waiting for the line manager");
});

t("the Reports page uses the rules: per-report controls and figures, and both new reports are offered", () => {
  const src = readFileSync(new URL("../src/pages/Reports.jsx", import.meta.url), "utf8");
  assert.match(src, /rulesFor\(tab\)/);
  assert.match(src, /label="Mileage"/);
  assert.match(src, /label="Timesheets"/);
  assert.ok(!/title=\{tab === "concerns" \? "High priority"/.test(src), "the stock cards are no longer reused with relabelled titles");
  assert.match(readFileSync(new URL("../src/config/routeManifest.js", import.meta.url), "utf8"), /"Concerns", "SARs", "Mileage", "Timesheets"\]/);
});

console.log(`\n${n} passed`);
