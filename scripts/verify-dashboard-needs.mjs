// Covers the Practice Manager's "Needs you" list and health strip (src/dashboard/needsYou.js) and how the new widgets are offered.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MAX_EACH, NEEDS_CATEGORIES, buildHealth, buildNeedsYou, dueWords, filterNeedsYou } from "@/dashboard/needsYou";
import { COMING_KINDS, buildComingUp, buildInToday, whenLabel } from "@/dashboard/comingUp";
import { DASHBOARD_WIDGETS, DEFAULT_SETTINGS, defaultWidgetsForRole, normaliseDashboardPreferences, normaliseSettings } from "@/dashboard/dashboardPreferences";

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
  assert.equal(tiles.coldchain.text, "1 to look at", "a tile says how many, never the same words as the row below it");
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
  assert.match(dash, /needsYou: <NeedsYou rows=\{needsShown\.rows\}/);
  assert.match(dash, /healthStrip: <HealthStrip tiles=\{tiles\} \/>/);
  const comp = read("src/components/dashboard/NeedsYou.jsx");
  assert.match(comp, /armed \? "Sure\?"/);
  assert.match(comp, /decideClaim\(action\.claim, MILEAGE\.approved/);
  for (const page of ["Mileage", "MyTimesheet", "ReceptionRota"]) assert.match(read(`src/pages/${page}.jsx`), /useUrlTab\(/);
});


// ---- coming up and in today ----
const FRI = new Date(2026, 10, 13, 10, 0, 0); // Friday 13 November 2026
const SAT = new Date(2026, 10, 14, 10, 0, 0);
const at = (iso) => new Date(`${iso}T12:00:00`).toISOString();

t("coming up shows only what Needs you does not already show: SARs more than a week away, concerns more than five days away, and time off, in date order", () => {
  const out = buildComingUp({
    now: FRI,
    sarRows: [{ id: "a", reference: "SAR-1", dueDate: at("2026-11-23"), assignedToName: "Craig" }, { id: "b", reference: "SAR-2", dueDate: at("2026-12-20"), assignedToName: "Craig" }, { id: "c", reference: "SAR-3", dueDate: at("2026-11-17"), assignedToName: "Craig" }],
    concerns: [{ id: "k1", reference: "C-9", status: "received", acknowledgementDueAt: new Date(2026, 10, 16, 9), finalResponseDueAt: new Date(2026, 10, 25, 9) }, { id: "k2", reference: "C-10", status: "closed", finalResponseDueAt: new Date(2026, 10, 22, 9) }],
    absences: [{ id: "o1", uid: "u1", name: "Kim", from: "2026-11-16", to: "2026-11-17", reason: "leave" }, { id: "o2", uid: "u2", name: "Lee", from: "2026-11-02", to: "2026-11-03", reason: "toil" }],
  });
  assert.deepEqual(out.items.map((i) => `${i.iso} ${i.text}`), [
    "2026-11-16 Kim is off to Tue 17 Nov",
    "2026-11-23 SAR-1 is due",
    "2026-11-25 C-9: final response due",
  ], "SAR-3 (4 days) and the acknowledgement (3 days) are in Needs you; SAR-2 and the closed concern are out");
  assert.equal(out.items[0].when, "Mon 16 Nov");
  assert.equal(out.more, 0);
  assert.equal(buildComingUp({ now: FRI }).items.length, 0);
  assert.ok(!JSON.stringify(buildComingUp({ now: FRI, certificates: [{ id: "x", label: "Gas safety", expiryDate: "2026-11-25" }] })).includes("Gas safety"), "certificates are in Needs you, not here");
});

t("coming up: a window of 1, 2 or 4 weeks, and kinds the person has left out", () => {
  const input = { now: FRI, sarRows: [{ id: "a", reference: "SAR-1", dueDate: at("2026-11-23"), assignedToName: "Craig" }, { id: "b", reference: "SAR-2", dueDate: at("2026-12-08"), assignedToName: "Craig" }], absences: [{ id: "o1", uid: "u1", name: "Kim", from: "2026-11-24", to: "2026-11-24", reason: "leave" }] };
  assert.deepEqual(buildComingUp({ ...input, days: 7 }).items, []);
  assert.deepEqual(buildComingUp({ ...input, days: 14 }).items.map((i) => i.text), ["SAR-1 is due", "Kim is off"]);
  assert.deepEqual(buildComingUp({ ...input, days: 28 }).items.map((i) => i.text), ["SAR-1 is due", "Kim is off", "SAR-2 is due"]);
  assert.deepEqual(buildComingUp({ ...input, days: 28, hide: ["SAR"] }).items.map((i) => i.text), ["Kim is off"]);
  assert.deepEqual(COMING_KINDS.map((k) => k.key), ["SAR", "Concern", "Off"]);
});

t("coming up: no more than eight lines, and it says how many more", () => {
  const sarRows = Array.from({ length: 11 }, (_, i) => ({ id: String(i), reference: `SAR-${i}`, dueDate: at("2026-11-25"), assignedToName: "Craig" }));
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
  assert.ok(!defaultWidgetsForRole("Practice Manager").includes("management"), "the MedAI overview repeats Needs you, so it is not on by default");
  assert.ok(defaultWidgetsForRole("Practice Manager").includes("priorities"), "the inbox is");
  assert.ok(!defaultWidgetsForRole("Nurse").includes("comingUp"));
  const dash = read("src/pages/Dashboard.jsx");
  assert.match(dash, /comingUp: <ComingUp coming=\{ahead\.coming\}/);
  assert.match(dash, /inToday: <InToday today=\{ahead\.today\} seesRota=\{ahead\.seesRota\} \/>/);
});


t("filtering Needs you: hide the kinds the person never deals with, and keep the first few, saying how many were cut off", () => {
  const rows = buildNeedsYou({ mileage: [claim("1"), claim("2")], rota: [req("r1")], sheetsWaiting: 2, messages: 1, signals: [{ key: "stock-low", area: "stock", level: "amber", label: "3 running low", route: "/inventory" }] });
  assert.ok(rows.every((r) => NEEDS_CATEGORIES.some((c) => c.key === r.category)), "every row has a known kind");
  assert.deepEqual(filterNeedsYou(rows, { hide: ["mileage", "messages"] }).rows.map((r) => r.category).sort(), ["rota", "stock", "timesheets"]);
  const cut = filterNeedsYou(rows, { max: 3 });
  assert.equal(cut.rows.length, 3);
  assert.equal(cut.more, rows.length - 3);
  assert.deepEqual(filterNeedsYou(rows, { max: 0 }).rows, rows);
  assert.deepEqual(filterNeedsYou(rows, { hide: ["mileage", "messages", "rota", "stock", "timesheets"] }), { rows: [], more: 0 });
});

t("settings: only known choices are kept, anything else falls back to the standard, and an old saved layout gets the standard settings", () => {
  assert.deepEqual(normaliseSettings(undefined), DEFAULT_SETTINGS);
  assert.deepEqual(normaliseSettings({ layout: "weird", needsYouMax: 7, comingUpDays: 3, needsYouHide: ["stock", "nonsense"], comingUpHide: ["Off", "x"], healthHide: ["stock", "people", "y"] }), { ...DEFAULT_SETTINGS, needsYouHide: ["stock"], comingUpHide: ["Off"], healthHide: ["stock", "people"] });
  assert.deepEqual(normaliseSettings({ layout: "stacked", needsYouMax: 0, comingUpDays: 28 }), { ...DEFAULT_SETTINGS, layout: "stacked", needsYouMax: 0, comingUpDays: 28 });
  const old = normaliseDashboardPreferences({ visible: ["brief"], order: ["brief"] }, "Practice Manager");
  assert.deepEqual(old.settings, DEFAULT_SETTINGS);
  const kept = normaliseDashboardPreferences({ visible: ["brief"], order: ["brief"], settings: { comingUpDays: 7 } }, "Practice Manager");
  assert.equal(kept.settings.comingUpDays, 7);
});

t("the old quick actions widget is gone: its buttons are in the page header for everyone, and a saved layout that still lists it is not upset", () => {
  assert.ok(!DASHBOARD_WIDGETS.some((w) => w.id === "quickActions"));
  const saved = normaliseDashboardPreferences({ visible: ["quickActions", "brief"], order: ["quickActions", "brief"] }, "Nurse");
  assert.ok(!saved.visible.includes("quickActions") && !saved.order.includes("quickActions"));
  assert.ok(saved.visible.includes("brief"));
  const header = read("src/components/dashboard/DashboardHeader.jsx");
  assert.match(header, /Use stock/);
  assert.match(header, /Customise/);
});

t("Customise offers the settings and a reset that puts the order and the settings back as well", () => {
  const c = read("src/dashboard/DashboardCustomizer.jsx");
  for (const text of ["Show up to", "Look ahead", "Show tiles for", "Arrangement", "Reset to the standard Home"]) assert.ok(c.includes(text), text);
  assert.match(c, /normaliseDashboardPreferences\(\{ visible: defaultWidgetsForRole\(role, homeType\), settings: DEFAULT_SETTINGS \}/);
  assert.match(read("src/dashboard/dashboardPreferences.js"), /dashboardPreferences: \{ \.\.\.preferences, settings: normaliseSettings\(preferences\?\.settings\) \}/, "the settings are saved with the layout");
});

t("the Dashboard applies the settings, shows the inbox on its own, and does not show it twice", () => {
  const dash = read("src/pages/Dashboard.jsx");
  assert.match(dash, /filterNeedsYou\(needs\.rows, \{ hide: settings\.needsYouHide, max: settings\.needsYouMax \}\)/);
  assert.match(dash, /settings\.healthHide\.includes\(tile\.area\)/);
  assert.match(dash, /useAhead\(.*days: settings\.comingUpDays, hide: settings\.comingUpHide/);
  assert.match(dash, /management: <OperationsCentre part=\{visible\.has\("priorities"\) \? "overview" : "all"\} \/>/);
  assert.match(dash, /priorities: <OperationsCentre part="priorities" \/>/);
  const centre = read("src/components/dashboard/OperationsCentre.jsx");
  assert.match(centre, /part !== "priorities" && </);
  assert.match(centre, /part !== "overview" && \(/);
});

console.log(`\n${n} passed`);
