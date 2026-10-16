import assert from "node:assert/strict";
import { DEFAULT_RATES, MAX_ONE_WAY_MILES, PURPOSES, VISIT_PLACE, claimProblem, claimsCsv, money, pence, periodTotals, placeOptions, priceClaims, routeMiles, taxYearOf, totalMiles } from "../src/modules/mileage/mileage.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };

const claim = (id, date, miles, extra = {}) => ({ id, uid: "u1", staffName: "Ann Example", date, fromId: "site:a", fromName: "Surgery", toId: "site:b", toName: "Branch", miles, returnTrip: false, vehicle: "car", purpose: "Meeting or training", status: "approved", ...extra });

t("the tax year runs 6 April to 5 April", () => {
  assert.deepEqual(taxYearOf("2026-04-05"), { label: "2025-26", from: "2025-04-06", to: "2026-04-05" });
  assert.equal(taxYearOf("2026-04-06").label, "2026-27");
  assert.equal(taxYearOf("2027-01-15").label, "2026-27");
  assert.equal(taxYearOf("2026-12-31").label, "2026-27");
  assert.equal(taxYearOf("nonsense"), null);
});

t("money and miles read plainly, and a return trip doubles the miles", () => {
  assert.equal(money(1234), "£12.34");
  assert.equal(money(0), "£0.00");
  assert.equal(totalMiles(claim("a", "2026-05-01", 12.5)), 12.5);
  assert.equal(totalMiles(claim("a", "2026-05-01", 12.5, { returnTrip: true })), 25);
});

t("45p a mile up to 10,000 miles in the tax year, then 25p, and a claim that crosses the line is split", () => {
  assert.equal(pence(DEFAULT_RATES, "car", 0, 10), 450);
  assert.equal(pence(DEFAULT_RATES, "car", 10000, 10), 250);
  assert.equal(pence(DEFAULT_RATES, "car", 9995, 10), 5 * 45 + 5 * 25, "5 miles at 45p and 5 at 25p");
  assert.equal(pence(DEFAULT_RATES, "car", 0, 12000), 10000 * 45 + 2000 * 25);
  assert.equal(pence(DEFAULT_RATES, "motorcycle", 50000, 100), 2400, "a flat rate has no threshold");
  assert.equal(pence(DEFAULT_RATES, "bicycle", 0, 10), 200);
  assert.equal(pence(DEFAULT_RATES, "car", 0, 0), 0);
});

t("claims are priced in date order for each person, vehicle and tax year; only approved ones count", () => {
  const claims = [
    claim("c3", "2026-09-01", 100, { returnTrip: true }), // 200 miles, after the 9,900 mark
    claim("c1", "2026-05-01", 9900),
    claim("c2", "2026-06-01", 50),
    claim("late", "2026-08-01", 10, { status: "submitted" }),
    claim("no", "2026-08-02", 10, { status: "rejected" }),
    claim("other", "2026-05-01", 100, { uid: "u2" }),
    claim("bike", "2026-05-02", 10, { vehicle: "bicycle" }),
    claim("nextyear", "2027-04-10", 10),
  ];
  const priced = priceClaims(claims);
  assert.equal(priced.get("c1").pence, 9900 * 45);
  assert.equal(priced.get("c2").pence, 50 * 45, "9,950 miles so far");
  assert.equal(priced.get("c3").pence, 50 * 45 + 150 * 25, "50 more miles at 45p to reach 10,000, then 150 at 25p");
  assert.equal(priced.get("other").pence, 4500, "someone else starts from nothing");
  assert.equal(priced.get("bike").pence, 200, "another vehicle has its own count");
  assert.equal(priced.get("nextyear").pence, 450, "a new tax year starts again at 45p");
  assert.equal(priced.has("late") || priced.has("no"), false);
  assert.equal(priceClaims(claims, DEFAULT_RATES, ["submitted", "approved"]).has("late"), true, "a waiting claim can be priced to show what it would cost");
});

t("a known route is found either way round", () => {
  const routes = [{ fromId: "site:a", toId: "site:b", miles: 7.4 }];
  assert.equal(routeMiles(routes, "site:a", "site:b"), 7.4);
  assert.equal(routeMiles(routes, "site:b", "site:a"), 7.4);
  assert.equal(routeMiles(routes, "site:a", "site:c"), null);
  assert.equal(routeMiles([], "site:a", "site:b"), null);
});

t("a claim is checked in words before it is sent", () => {
  const ok = { date: "2026-10-01", fromId: "site:a", toId: "site:b", miles: 7.4, vehicle: "car", purpose: PURPOSES[0] };
  const today = "2026-10-16";
  assert.equal(claimProblem(ok, { today }), "");
  assert.match(claimProblem({ ...ok, date: "" }, { today }), /date of the journey/);
  assert.match(claimProblem({ ...ok, date: "2026-10-20" }, { today }), /future/);
  assert.match(claimProblem({ ...ok, fromId: "" }, { today }), /started and where it ended/);
  assert.match(claimProblem({ ...ok, toId: "site:a" }, { today }), /same place/);
  assert.equal(claimProblem({ ...ok, fromId: VISIT_PLACE.id, toId: VISIT_PLACE.id }, { today }), "", "one home visit to another is a real journey");
  assert.match(claimProblem({ ...ok, miles: 0 }, { today }), /miles for one way/);
  assert.match(claimProblem({ ...ok, miles: "abc" }, { today }), /miles for one way/);
  assert.match(claimProblem({ ...ok, miles: MAX_ONE_WAY_MILES + 1 }, { today }), /Check the distance/);
  assert.match(claimProblem({ ...ok, vehicle: "tank" }, { today }), /vehicle/);
  assert.match(claimProblem({ ...ok, purpose: "A patient's address" }, { today }), /reason/);
});

t("payroll totals add up approved claims for the dates asked for, per person", () => {
  const claims = [claim("a", "2026-09-01", 10), claim("b", "2026-09-15", 10, { returnTrip: true }), claim("c", "2026-10-01", 10), claim("d", "2026-09-10", 10, { uid: "u2", staffName: "Bea Sample" }), claim("e", "2026-09-11", 10, { status: "submitted" })];
  const totals = periodTotals(claims, "2026-09-01", "2026-09-30");
  assert.deepEqual(totals.map((r) => [r.name, r.journeys, r.miles, r.pence]), [["Ann Example", 2, 30, 1350], ["Bea Sample", 1, 10, 450]]);
});

t("the places to choose from are the sites, the extra places and home visits, with home visits last", () => {
  const options = placeOptions({ sites: [{ id: "s1", name: "Main Surgery" }, { id: "s2", name: "Branch" }], places: [{ id: "p1", name: "Hospital" }, { id: "p2", name: "Closed", active: false }] });
  assert.deepEqual(options.map((o) => o.name), ["Branch", "Hospital", "Main Surgery", VISIT_PLACE.name]);
  assert.deepEqual(options.map((o) => o.id), ["site:s2", "place:p1", "site:s1", "visit"]);
});

t("the payroll file has one row per approved claim, with the amount worked out, and quotes what needs quoting", () => {
  const csv = claimsCsv([claim("a", "2026-09-01", 10, { toName: 'The "Branch", Rhyl' }), claim("b", "2026-09-02", 5, { status: "submitted" })]);
  const lines = csv.split("\r\n");
  assert.equal(lines.length, 2);
  assert.equal(lines[0], "Date,Name,From,To,Return trip,Total miles,Vehicle,Reason,Amount (GBP),Tax year");
  assert.equal(lines[1], '2026-09-01,Ann Example,Surgery,"The ""Branch"", Rhyl",No,10,Car or van,Meeting or training,4.50,2026-27');
});

console.log(`\n${n} passed`);
