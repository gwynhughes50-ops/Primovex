// What each report shows. Pure (no Firestore, no screens) so it can be tested.
//
// Every report has its own controls and its own four figures: the Reports page used to show stock figures ("Out of stock", "Low stock") and the stock
// filters on every tab, so a temperature log said "0 low stock". The rules below say which controls belong to which report, and each summary
// gives the four figures for that report only.

import { STATUS, STATUS_LABEL, money, priceClaims, totalMiles, vehicleLabel, taxYearOf } from "@/modules/mileage/mileage";
import { CODES, STATE_LABEL, describeLines } from "@/modules/timesheets/timesheet";

// site / location / category / attention / date / period / status: which controls the report has. `search` is the box's hint.
export const TAB_RULES = {
  stock: { title: "Stock Levels", site: true, location: true, category: true, attention: true, date: false, search: "Search item, barcode, batch, location…" },
  expiry: { title: "Expiry Report", site: true, location: true, category: true, attention: true, date: false, search: "Search item, barcode, batch, location…" },
  tx: { title: "Transactions", site: true, date: true, search: "Search item, action, user, site…" },
  temp: { title: "Temperature", site: true, date: true, search: "Search site, unit, recorded by, notes…" },
  concerns: { title: "Concerns", date: true, search: "Search reference, summary, category, source…" },
  sars: { title: "SARs", date: true, search: "Search reference, request type, status, assigned to…" },
  mileage: { title: "Mileage claims", date: true, status: true, search: "Search name, from, to, reason…" },
  timesheets: { title: "Timesheets", period: true, search: "Search name or payroll number…" },
};

export const rulesFor = (tab) => TAB_RULES[tab] || TAB_RULES.stock;

const card = (title, value, tone) => ({ title, value, tone });
const round = (n) => Math.round((Number(n) || 0) * 100) / 100;

// ---- stock ----
const stockOf = (i) => Number(i.current_stock ?? i.qty ?? 0) || 0;
export function stockCards(rows) {
  const low = rows.filter((i) => { const cur = stockOf(i); const min = Number(i.min_stock ?? 0); return cur > 0 && cur <= min; }).length;
  return [card("Total Items", rows.length, "teal"), card("Out of Stock", rows.filter((i) => stockOf(i) === 0).length, "rose"), card("Low Stock", low, "amber"), card("Total Units", round(rows.reduce((s, i) => s + stockOf(i), 0)), "emerald")];
}

// ---- expiry: rows carry expiry_status ("Expired" / "Expiring soon" / "OK") ----
export function expiryCards(rows) {
  const expired = rows.filter((i) => i.expiry_status === "Expired");
  const soon = rows.filter((i) => i.expiry_status === "Expiring soon");
  return [card("With an expiry date", rows.length, "teal"), card("Expired", expired.length, "rose"), card("Expiring in 30 days", soon.length, "amber"), card("Units affected", round([...expired, ...soon].reduce((s, i) => s + stockOf(i), 0)), "emerald")];
}

// ---- transactions: rows carry action ("Use", "Receive", "Adjust", ...) and qty ----
export function transactionCards(rows) {
  const sum = (action) => round(rows.filter((t) => t.action === action).reduce((s, t) => s + (Number(t.qty) || 0), 0));
  return [card("Movements", rows.length, "teal"), card("Units used", sum("Use"), "rose"), card("Units received", sum("Receive"), "emerald"), card("Adjustments", rows.filter((t) => t.action === "Adjust").length, "amber")];
}

// ---- temperature: rows carry temp (a number or NaN), unit and site ----
export function temperatureCards(rows) {
  const temps = rows.map((t) => t.temp).filter((n) => Number.isFinite(n));
  const units = new Set(rows.map((t) => `${t.site}|${t.unit}`).filter((k) => k !== "|"));
  const shown = (n) => (temps.length ? `${round(n)}°C` : "—");
  return [card("Readings", rows.length, "teal"), card("Units logged", units.size, "emerald"), card("Lowest", shown(Math.min(...temps)), "amber"), card("Highest", shown(Math.max(...temps)), "rose")];
}

// ---- concerns and SARs (their breakdowns are worked out on the page) ----
export const concernCards = (rows, { high, closed }) => [card("Records", rows.length, "teal"), card("High priority", high, "rose"), card("Closed", closed, "amber"), card("Still open", rows.length - closed, "emerald")];
export const sarCards = (rows, { late, onTime, notDone }) => [card("Records", rows.length, "teal"), card("Completed late", late, "rose"), card("Completed on time", onTime, "amber"), card("Not yet completed", notDone, "emerald")];

// ---- mileage ----
// Claims are priced over the whole tax year (the 10,000-mile tier counts every earlier claim), so pricing uses ALL claims and the filters only choose the rows.
export function mileageReport(claims, rates, { from = "", to = "", status = "all", query = "" } = {}) {
  const priced = priceClaims(claims, rates);
  const q = String(query || "").trim().toLowerCase();
  const rows = claims.filter((c) => (!from || c.date >= from) && (!to || c.date <= to) && (status === "all" || c.status === status)
    && (!q || [c.staffName, c.fromName, c.toName, c.purpose].some((v) => String(v || "").toLowerCase().includes(q))))
    .sort((a, b) => b.date.localeCompare(a.date) || String(a.staffName).localeCompare(String(b.staffName)))
    .map((c) => {
      const price = c.status === STATUS.approved ? priced.get(c.id) : null;
      return { id: c.id, date: c.date, name: c.staffName || "", from: c.fromName || "", to: c.toName || "", returnTrip: Boolean(c.returnTrip), miles: totalMiles(c), vehicle: vehicleLabel(c.vehicle), purpose: c.purpose || "", status: c.status, statusLabel: STATUS_LABEL[c.status] || c.status, pence: price ? price.pence : null, taxYear: price?.taxYear || taxYearOf(c.date).label };
    });
  const approved = rows.filter((r) => r.status === STATUS.approved);
  const cards = [
    card("Claims", rows.length, "teal"),
    card("Approved miles", round(approved.reduce((s, r) => s + r.miles, 0)), "emerald"),
    card("Approved amount", money(approved.reduce((s, r) => s + (r.pence || 0), 0)), "amber"),
    card("Waiting for approval", rows.filter((r) => r.status === STATUS.submitted).length, "rose"),
  ];
  return { rows, cards };
}

export const mileageExport = (rows) => rows.map((r) => ({
  Date: r.date, Name: r.name, From: r.from, To: r.to, ReturnTrip: r.returnTrip ? "Yes" : "No", TotalMiles: r.miles, Vehicle: r.vehicle, Reason: r.purpose,
  Status: r.statusLabel, AmountGBP: r.pence === null ? "" : (r.pence / 100).toFixed(2), TaxYear: r.taxYear,
}));

// ---- timesheets ----
export const ALL_PERIODS = "__ALL_PERIODS__";
export function timesheetReport(sheets, periods, { periodId = ALL_PERIODS, query = "" } = {}) {
  const q = String(query || "").trim().toLowerCase();
  const periodName = (id) => { const p = (periods || []).find((x) => x.id === id); return p ? (p.name || `${p.from} to ${p.to}`) : id; };
  const rows = sheets.filter((s) => (periodId === ALL_PERIODS || s.periodId === periodId) && (!q || [s.staffName, s.payrollNo].some((v) => String(v || "").toLowerCase().includes(q))))
    .sort((a, b) => String(b.from || "").localeCompare(String(a.from || "")) || String(a.staffName).localeCompare(String(b.staffName)))
    .map((s) => ({
      id: s.id, period: periodName(s.periodId), name: s.staffName || "", payrollNo: s.payrollNo || "", state: s.state, stateLabel: STATE_LABEL_NEUTRAL[s.state] || STATE_LABEL[s.state] || s.state,
      declaration: s.kind === "no-change" ? "No changes" : "Changes", totals: Object.fromEntries(CODES.map((c) => [c.code, round(s.totals?.[c.code] || 0)])), details: describeLines(s.lines),
    }));
  const hours = (codes) => round(rows.reduce((sum, r) => sum + codes.reduce((s, c) => s + r.totals[c], 0), 0));
  const settled = rows.filter((r) => r.state === "approved" || r.state === "sent").length;
  const cards = [card("Timesheets", rows.length, "teal"), card("Signed off or sent", settled, "emerald"), card("Overtime hours", hours(["B", "C"]), "amber"), card("Leave and sickness hours", hours(["A", "D", "E"]), "rose")];
  return { rows, cards };
}

// states in the words a manager reads (STATE_LABEL speaks to the person: "your line manager")
export const STATE_LABEL_NEUTRAL = { draft: "Not sent yet", submitted: "Waiting for the line manager", declined: "Declined by the line manager", approved: "Signed off, with payroll", returned: "Returned by payroll", sent: "Sent to payroll" };

export const timesheetExport = (rows) => rows.map((r) => ({
  PayPeriod: r.period, Name: r.name, PayrollNo: r.payrollNo, Status: r.stateLabel, Declaration: r.declaration,
  ...Object.fromEntries(CODES.map((c) => [`${c.code} ${c.label} (h)`, r.totals[c.code]])), Details: r.details,
}));
