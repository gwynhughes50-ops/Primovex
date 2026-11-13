// Covers the Practice Manager's "Needs you" list and health strip (src/dashboard/needsYou.js) and how the new widgets are offered.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MAX_EACH, buildHealth, buildNeedsYou, dueWords } from "@/dashboard/needsYou";
import { DASHBOARD_WIDGETS, defaultWidgetsForRole, normaliseDashboardPreferences } from "@/dashboard/dashboardPreferences";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const read = (path) => readFileSync(join(process.cwd(), path), "utf8");
const sar = (id, daysLeft, extra = {}) => ({ id, reference: `SAR-${id}`, daysLeft, assignedToName: "Craig", remindedToday: false, ...extra });
const claim = (id) => ({ id, staffName: "Kim", fromName: "Surgery", toName: "Hospital", returnTrip: true, date: "2026-11-10" });
const req = (id, extra = {}) => ({ id, type: "swap", requesterName: "Kim", targetName: "Lee", changesHours: false, ...extra });

t("nothing waiting gives an empty list and green tiles", () => {
  assert.deepEqual(buildNeedsYou({}), []);
  assert.deepEqual(buildHealth({ areas: ["stock", "coldchain"], rows: [] }).map((x) => [x.area, x.level, x.text]), [["stock", "green", "All clear"], ["coldchain", "green", "All clear"]]);
});

t("SARs: only those due within a week or overdue, most overdue first, each with a Remind button; the rest are gathered into one row", () => {
  const rows = buildNeedsYou({ sarRows: [sar("a", 20), sar("b", 3), sar("c", -2), sar("d", 0)] });
  assert.deepEqual(rows.map((r) => r.text), ["SAR-c is overdue by 2 days", "SAR-d is due today", "SAR-b is due in 3 days"]);
  assert.ok(rows.every((r) => r.action.kind === "remind-sar"));
  assert.equal(rows[0].tone, "critical");
  assert.equal(rows[1].tone, "warning");
  const many = buildNeedsYou({ sarRows: [1, 2, 3, 4, 5, 6].map((i) => sar(String(i), i - 3)) });
  const more = many.find((r) => r.id === "sar-more");
  assert.ok(more && more.action.kind === "link" && more.action.to === "/sars-to-chase");
  assert.equal(many.filter((r) => r.action.kind === "remind-sar").length, MAX_EACH);
  assert.ok(!JSON.stringify(rows).includes("patient"), "no patient details");
});

t("a person with no SAR list still sees the Orb's SAR counts, and one with a list does not see them twice", () => {
  const signals = [{ key: "sars-overdue", area: "governance", level: "red", label: "1 SAR overdue", route: "/governance/sars" }, { key: "stock-low", area: "stock", level: "amber", label: "3 running low", route: "/inventory" }];
  assert.deepEqual(buildNeedsYou({ signals, sarRows: null }).map((r) => r.id), ["signal-sars-overdue", "signal-stock-low"]);
  assert.deepEqual(buildNeedsYou({ signals, sarRows: [] }).map((r) => r.id), ["signal-stock-low"]);
});

t("mileage and rota requests can be dealt with in the row (Approve, Agree), a few at a time, with a Review link for the rest", () => {
  const rows = buildNeedsYou({ mileage: [claim("1"), claim("2"), claim("3"), claim("4")], rota: [req("r1"), req("r2", { type: "adjust", adjust: { text: "Finish at 3pm" } })] });
  assert.equal(rows.filter((r) => r.action.kind === "approve-mileage").length, MAX_EACH);
  assert.equal(rows.find((r) => r.id === "mileage-more").action.to, "/mileage?tab=approve");
  assert.deepEqual(rows.filter((r) => r.action.kind === "agree-rota").map((r) => r.text), ["Kim and Lee would swap shifts", "Kim asked: Finish at 3pm"]);
  assert.equal(rows.find((r) => r.id === "mileage-1").text, "Kim: Surgery to Hospital and back");
  assert.equal(rows.find((r) => r.id === "mileage-1").detail, "Mileage claim · 10/11/2026");
});

t("timesheets and messages open the exact tab, and the Orb's red items come before amber before the rest", () => {
  const rows = buildNeedsYou({ sheetsWaiting: 6, messages: 2, signals: [{ key: "fridge-incidents", area: "coldchain", level: "red", label: "1 fridge incident open", route: "/temperature" }, { key: "coshh-soon", area: "compliance", level: "amber", label: "2 COSHH reviews due soon", route: "/compliance" }] });
  assert.deepEqual(rows.map((r) => r.id), ["signal-fridge-incidents", "timesheets", "signal-coshh-soon", "messages"]);
  assert.equal(rows.find((r) => r.id === "timesheets").action.to, "/my-timesheet?tab=signoff");
  assert.equal(rows.find((r) => r.id === "signal-fridge-incidents").action.label, "Check fridges");
});

t("the health strip colours each area by its worst row", () => {
  const rows = buildNeedsYou({ signals: [{ key: "fridge-incidents", area: "coldchain", level: "red", label: "1 fridge incident open", route: "/temperature" }, { key: "stock-low", area: "stock", level: "amber", label: "3 running low", route: "/inventory" }, { key: "stock-soon", area: "stock", level: "amber", label: "2 expiring", route: "/inventory" }], sarRows: [sar("a", -1)] });
  const tiles = Object.fromEntries(buildHealth({ areas: ["governance", "stock", "coldchain", "compliance"], rows }).map((x) => [x.area, x]));
  assert.equal(tiles.coldchain.level, "red");
  assert.equal(tiles.stock.level, "amber");
  assert.equal(tiles.stock.text, "2 to look at");
  assert.equal(tiles.governance.level, "red");
  assert.equal(tiles.compliance.level, "green");
});

t("due wording", () => {
  assert.equal(dueWords(-1), "is overdue by 1 day");
  assert.equal(dueWords(0), "is due today");
  assert.equal(dueWords(1), "is due tomorrow");
  assert.equal(dueWords(5), "is due in 5 days");
});

t("the Practice Manager gets the new widgets first; other roles are unchanged; a saved layout keeps what it had and gains the new ones at the top", () => {
  assert.deepEqual(defaultWidgetsForRole("Practice Manager").slice(0, 2), ["healthStrip", "needsYou"]);
  assert.ok(!defaultWidgetsForRole("Nurse").includes("needsYou"));
  assert.ok(!defaultWidgetsForRole("Caretaker").includes("healthStrip"));
  const saved = normaliseDashboardPreferences({ visible: ["brief", "issues"], order: ["brief", "issues", "quickActions"] }, "Practice Manager");
  assert.deepEqual(saved.order.slice(0, 3), ["healthStrip", "needsYou", "brief"]);
  assert.deepEqual(saved.visible.slice(0, 2), ["brief", "issues"], "what they had stays");
  assert.ok(saved.visible.includes("healthStrip") && saved.visible.includes("needsYou"), "the new ones are added");
  assert.ok(DASHBOARD_WIDGETS.some((w) => w.id === "needsYou"));
});

t("it is wired in: the Dashboard shows the two widgets, the buttons that change something ask first, and the pages open on the tab asked for", () => {
  const dash = read("src/pages/Dashboard.jsx");
  assert.match(dash, /needsYou: <NeedsYou rows=\{needs\.rows\}/);
  assert.match(dash, /healthStrip: <HealthStrip tiles=\{needs\.tiles\} \/>/);
  const comp = read("src/components/dashboard/NeedsYou.jsx");
  assert.match(comp, /armed \? "Sure\?"/);
  assert.match(comp, /decideClaim\(action\.claim, MILEAGE\.approved/);
  for (const page of ["Mileage", "MyTimesheet", "ReceptionRota"]) assert.match(read(`src/pages/${page}.jsx`), /useUrlTab\(/);
});

console.log(`\n${n} passed`);
