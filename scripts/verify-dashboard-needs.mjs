// Covers the Practice Manager's "Needs you" list and health strip (src/dashboard/needsYou.js) and how the new widgets are offered.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MAX_EACH, buildHealth, buildNeedsYou, dueWords } from "@/dashboard/needsYou";
import { buildComingUp, buildInToday, whenLabel } from "@/dashboard/comingUp";
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
  assert.deepEqual(saved.order.slice(0, 5), ["healthStrip", "needsYou", "comingUp", "inToday", "brief"]);
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


// ---- coming up and in today ----
const FRI = new Date(2026, 10, 13, 10, 0, 0); // Friday 13 November 2026
const SAT = new Date(2026, 10, 14, 10, 0, 0);
const at = (iso) => new Date(`${iso}T12:00:00`).toISOString();

t("coming up: the next two weeks in date order, with SARs, concerns, certificates, COSHH reviews and time off, and nothing outside the window", () => {
  const out = buildComingUp({
    now: FRI,
    sarRows: [{ id: "a", reference: "SAR-1", dueDate: at("2026-11-20"), assignedToName: "Craig" }, { id: "b", reference: "SAR-2", dueDate: at("2026-12-20"), assignedToName: "Craig" }, { id: "c", reference: "SAR-3", dueDate: at("2026-11-10"), assignedToName: "Craig" }],
    concerns: [{ id: "k1", reference: "C-9", status: "received", acknowledgementDueAt: new Date(2026, 10, 16, 9), finalResponseDueAt: new Date(2026, 10, 30, 9) }, { id: "k2", reference: "C-10", status: "closed", finalResponseDueAt: new Date(2026, 10, 18, 9) }],
    certificates: [{ id: "x", label: "Gas safety certificate", expiryDate: "2026-11-25" }, { id: "y", label: "Old", expiryDate: "2027-05-01" }, { id: "z", label: "Gone", expiryDate: "2026-11-22", active: false }],
    coshh: [{ id: "h", name: "Bleach", reviewDate: "2026-11-14" }],
    absences: [{ id: "o1", uid: "u1", name: "Kim", from: "2026-11-16", to: "2026-11-17", reason: "leave" }, { id: "o2", uid: "u2", name: "Lee", from: "2026-11-02", to: "2026-11-03", reason: "toil" }],
  });
  assert.deepEqual(out.items.map((i) => `${i.iso} ${i.text}`), [
    "2026-11-14 Bleach: review due",
    "2026-11-16 C-9: acknowledgement due",
    "2026-11-16 Kim is off to Tue 17 Nov",
    "2026-11-20 SAR-1 is due",
    "2026-11-25 Gas safety certificate runs out",
  ], "the final response is 17 days away, so it is not listed");
  assert.equal(out.items[0].when, "Tomorrow");
  assert.equal(out.items[1].when, "Mon 16 Nov");
  assert.equal(out.more, 0);
  assert.ok(!JSON.stringify(out).includes("Secret"));
  assert.equal(buildComingUp({ now: FRI }).items.length, 0);
});

t("coming up: no more than eight lines, and it says how many more", () => {
  const sarRows = Array.from({ length: 11 }, (_, i) => ({ id: String(i), reference: `SAR-${i}`, dueDate: at("2026-11-18"), assignedToName: "Craig" }));
  const out = buildComingUp({ now: FRI, sarRows });
  assert.equal(out.items.length, 8);
  assert.equal(out.more, 3);
  assert.equal(whenLabel("2026-11-13", "2026-11-13"), "Today");
});

const rules = { people: [{ uid: "u1", name: "Kim" }, { uid: "u2", name: "Lee" }, { uid: "u3", name: "Sam" }], shifts: [
  { id: "early1", label: "Early 1", group: "early", start: "08:00", end: "16:30", count: 1, days: ["mon", "tue", "wed", "thu", "fri"] },
  { id: "late", label: "Late", group: "late", start: "10:00", end: "18:30", count: 1, days: ["mon", "tue", "wed", "thu", "fri"] },
] };
const weeks = { "2026-11-09": { mondayIso: "2026-11-09", days: { fri: { iso: "2026-11-13", slots: { early1: { uid: "u1" }, late: { uid: "u2", from: "11:00" } } } } } };

t("in today: who is on which shift (with part-day times), who is off, and what to say when no rota has been built", () => {
  const out = buildInToday({ now: FRI, weeks, rules, absences: [{ id: "a", uid: "u3", name: "Sam", from: "2026-11-12", to: "2026-11-13", toTime: "10:00", reason: "toil" }, { id: "b", uid: "u9", name: "Pat", from: "2026-11-20", to: "2026-11-20", reason: "leave" }] });
  assert.equal(out.hasWeek, true);
  assert.equal(out.label, "today");
  assert.deepEqual(out.on.map((p) => `${p.name} ${p.shift} ${p.start}-${p.end}`), ["Kim Early 1 08:00-16:30", "Lee Late 11:00-18:30"]);
  assert.equal(out.people, 2);
  assert.deepEqual(out.off, [{ uid: "u3", name: "Sam", reason: "TOIL", part: "until 10" }]);
  assert.equal(buildInToday({ now: FRI, weeks: {}, rules, absences: [] }).hasWeek, false);
  assert.equal(buildInToday({ now: FRI, weeks, rules: null, absences: [] }).hasWeek, false);
});

t("in today: at a weekend it shows the next working day", () => {
  const out = buildInToday({ now: SAT, weeks: {}, rules, absences: [{ id: "a", uid: "u3", name: "Sam", from: "2026-11-16", to: "2026-11-16", reason: "leave" }] });
  assert.equal(out.iso, "2026-11-16");
  assert.equal(out.label, "Monday");
  assert.deepEqual(out.off.map((o) => o.name), ["Sam"]);
});

t("the new widgets are offered to the Practice Manager after the first two, and wired into the Dashboard", () => {
  assert.deepEqual(DASHBOARD_WIDGETS.slice(0, 4).map((w) => w.id), ["healthStrip", "needsYou", "comingUp", "inToday"], "the order a new user gets");
  assert.deepEqual(normaliseDashboardPreferences(undefined, "Practice Manager").order.slice(0, 4), ["healthStrip", "needsYou", "comingUp", "inToday"]);
  assert.deepEqual(defaultWidgetsForRole("Practice Manager").slice(0, 4), ["healthStrip", "needsYou", "comingUp", "inToday"]);
  assert.ok(!defaultWidgetsForRole("Nurse").includes("comingUp"));
  const dash = read("src/pages/Dashboard.jsx");
  assert.match(dash, /comingUp: <ComingUp coming=\{ahead\.coming\} \/>/);
  assert.match(dash, /inToday: <InToday today=\{ahead\.today\} seesRota=\{ahead\.seesRota\} \/>/);
});

console.log(`\n${n} passed`);
