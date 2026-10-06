// Covers how the Orb phrases its answers (src/ai/tools/answerWording.js).
import assert from "node:assert/strict";
import { CLINICAL_INTENTS } from "../src/orb/clinicalIntentCatalog.js";
import {
  alertsAnswer, categoryAnswer, cleaningAnswer, coldChainOverview, coldChainUnitAnswer, complianceAnswer, dayWords, expiryAnswer,
  joinList, lowStockAnswer, maintenanceAnswer, operationsAnswer, plural, quickNotesAnswer, spacesAnswer, stockOverview, stockSearchAnswer,
  tasksAnswer, timelineAnswer, usersAnswer,
} from "../src/ai/tools/answerWording.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };
const item = (label, over = {}) => ({ label, current: 0, min: 0, days: null, expiry: null, ...over });

t("numbers and plurals read naturally", () => {
  assert.equal(plural(1, "item"), "1 item");
  assert.equal(plural(2, "item"), "2 items");
  assert.equal(plural(1234, "unit"), "1,234 units");
  assert.equal(plural(2, "person", "people"), "2 people");
});

t("lists read as sentences and never run on", () => {
  assert.equal(joinList([]), "");
  assert.equal(joinList(["A"]), "A");
  assert.equal(joinList(["A", "B"]), "A and B");
  assert.equal(joinList(["A", "B", "C"]), "A, B and C");
  assert.equal(joinList(["A", "B", "C", "D", "E", "F", "G"], 3), "A, B, C and 4 more");
  assert.equal(joinList(["A", "", null, "B"]), "A and B");
});

t("dates are said the way people say them", () => {
  assert.equal(dayWords(0), "today");
  assert.equal(dayWords(1), "tomorrow");
  assert.equal(dayWords(-1), "yesterday");
  assert.equal(dayWords(-5), "5 days ago");
  assert.equal(dayWords(12), "in 12 days");
  assert.equal(dayWords(90, "2027-01-14"), "on 14 Jan 2027");
  assert.equal(dayWords(null), "");
});

t("the stock overview leads with what you have, then what needs attention", () => {
  const r = stockOverview({ total: 214, units: 1830, out: [item("Saline"), item("Gauze")], low: [item("Gloves")], expired: [item("Syringes")], soon: [item("A"), item("B")], windowDays: 30 });
  assert.match(r.text, /^You have 214 stock items, 1,830 units in all\./);
  assert.match(r.text, /Needs attention: 2 items are out of stock, 1 is running low, 1 has expired and 2 are close to expiry\./);
  assert.match(r.text, /Out of stock: Saline and Gauze\./);
  assert.match(r.text, /Expired: Syringes\./);
  assert.deepEqual(r.followUps, ["low stock", "expiry dates"]);
});

t("a healthy stock overview says so plainly and offers nothing to chase", () => {
  const r = stockOverview({ total: 10, units: 50 });
  assert.match(r.text, /Nothing needs attention right now/);
  assert.deepEqual(r.followUps, []);
  assert.equal(stockOverview({ total: 0, units: 0 }).text, "There's no stock recorded yet.");
});

t("low stock separates 'run out' from 'running low' and names the numbers", () => {
  const r = lowStockAnswer({ out: [item("Saline")], low: [item("Gloves", { current: 3, min: 10 })] });
  assert.match(r.text, /1 item has run out: Saline\./);
  assert.match(r.text, /1 item is running low: Gloves \(3 left, minimum 10\)\./);
  assert.match(r.text, /probably need ordering/);
  assert.match(lowStockAnswer({}).text, /Good news/);
});

t("expiry says what has gone off first, then what is coming, with when", () => {
  const r = expiryAnswer({ expired: [item("Old syringes", { days: -3, expiry: "2026-10-01" })], soon: [item("Dressings", { days: 4, expiry: "2026-10-10" }), item("Tape", { days: 0, expiry: "2026-10-06" })] });
  assert.match(r.text, /1 item has already expired and should come out of use: Old syringes \(3 days ago\)\./);
  assert.match(r.text, /2 items expire soon: Dressings \(in 4 days\) and Tape \(today\)\./);
  const asked = expiryAnswer({ soon: [item("Dressings", { days: 4, expiry: "2026-10-10" })], windowDays: 14, explicitDays: true });
  assert.match(asked.text, /1 item expires within 14 days/);
});

t("nothing expiring is an all-clear that names the next one", () => {
  const r = expiryAnswer({ windowDays: 30, next: item("Vaccine", { days: 45, expiry: "2026-11-20" }) });
  assert.match(r.text, /Nothing has expired and nothing is close to its expiry date\./);
  assert.match(r.text, /next one to expire is Vaccine, on 20 Nov 2026\./);
  assert.match(expiryAnswer({ windowDays: 14, explicitDays: true }).text, /Nothing expires within 14 days\./);
});

t("a stock search answers one item in one line and several as a list", () => {
  assert.equal(stockSearchAnswer({ term: "x", matches: [item("Green needles", { current: 40, status: null, expiry: "2027-01-14", days: 100 })] }).text, "Green needles: 40 in stock, expires on 14 Jan 2027.");
  assert.match(stockSearchAnswer({ term: "x", matches: [item("Saline", { current: 0, status: "out" })] }).text, /Saline: 0 in stock \(out of stock\)\./);
  const many = stockSearchAnswer({ term: "needle", matches: [item("A", { current: 1 }), item("B", { current: 2, status: "low", min: 5 })] });
  assert.match(many.text, /I found 2 items matching “needle”:\n• A: 1 in stock\n• B: 2 in stock \(low, minimum 5\)/);
  assert.match(stockSearchAnswer({ term: "zzz", matches: [] }).text, /couldn't find any stock matching “zzz”/);
});

t("a category answer gives the total, the problems and the names", () => {
  const r = categoryAnswer({ label: "Wound care", total: 4, units: 40, low: [item("Gauze")], soon: [item("Tape"), item("Pads")], windowDays: 30, names: ["Gauze", "Tape", "Pads", "Plasters"] });
  assert.match(r.text, /^Wound care: 4 items, 40 units in all\./);
  assert.match(r.text, /Of those, 1 running low and 2 close to expiry\./);
  assert.match(r.text, /They are Gauze, Tape, Pads and Plasters\./);
  assert.match(categoryAnswer({ label: "PPE", total: 0, units: 0 }).text, /no active stock under PPE/);
});

t("cleaning names the rooms still to do, or says all done", () => {
  assert.match(cleaningAnswer({ overdue: ["Room 1", "Room 2"], total: 9 }).text, /2 of 9 rooms haven't been marked as cleaned today\.\nStill to do: Room 1 and Room 2\./);
  assert.match(cleaningAnswer({ overdue: ["A", "B"], total: 2 }).text, /None of the rooms have been marked as cleaned today yet\./);
  assert.equal(cleaningAnswer({ overdue: [], total: 9 }).text, "Every room (9) has been cleaned today.");
});

t("maintenance lists issues as bullets", () => {
  assert.equal(maintenanceAnswer([]).text, "There are no open maintenance issues.");
  assert.equal(maintenanceAnswer(["Leaking tap"]).text, "1 maintenance issue is open:\n• Leaking tap");
});

t("fridges: all in range is one calm sentence", () => {
  const r = coldChainOverview({ units: [{ name: "Fridge 1", value: 4.2, min: 2, max: 8, ageMinutes: 5 }, { name: "Fridge 2", value: 5, min: 2, max: 8, ageMinutes: 9 }] });
  assert.match(r.text, /^All 2 fridge and freezers are in range\. The most recent reading was 5 minutes ago\./);
});

t("fridges: an out-of-range unit is named with its reading and the action to take", () => {
  const r = coldChainOverview({ units: [{ name: "Fridge 1", value: 4, min: 2, max: 8, ageMinutes: 3 }, { name: "Vaccine fridge", value: 9.1, min: 2, max: 8, ageMinutes: 3 }] });
  assert.match(r.text, /1 of 2 units is out of range: Vaccine fridge at 9\.1°C \(should be 2 to 8°C\)\./);
  assert.match(r.text, /follow your cold chain procedure/);
});

t("fridges: one that has gone quiet is flagged even though its last reading was fine", () => {
  const r = coldChainOverview({ units: [{ name: "Fridge 1", value: 4, min: 2, max: 8, ageMinutes: 3 }, { name: "Fridge 3", value: 4, min: 2, max: 8, ageMinutes: 120 }] });
  assert.match(r.text, /2 of 2 units were in range at their last reading\./);
  assert.match(r.text, /Fridge 3 hasn't reported for over 30 minutes/);
  assert.match(coldChainOverview({ units: [] }).text, /can't see any fridge/);
});

t("one fridge: in range, out of range, stale and no reading", () => {
  assert.equal(coldChainUnitAnswer({ name: "Fridge 2", value: 5.5, min: 2, max: 8, ageMinutes: 4 }).text, "Fridge 2 is at 5.5°C, within its 2 to 8°C range (reading 4 minutes ago).");
  assert.match(coldChainUnitAnswer({ name: "Fridge 2", value: 9, min: 2, max: 8, ageMinutes: 1 }).text, /outside its 2 to 8°C range/);
  assert.match(coldChainUnitAnswer({ name: "Fridge 2", value: 5, min: 2, max: 8, ageMinutes: 200 }).text, /a while old/);
  assert.match(coldChainUnitAnswer({ name: "Fridge 2", value: NaN, min: 2, max: 8 }).text, /no recent reading/);
});

t("alerts add up stock and devices in plain words, and never claim an all-clear they can't back", () => {
  const r = alertsAnswer({ stock: { out: 2, low: 3, expired: 1, soon: 0 }, device: 1 });
  assert.equal(r.text, "Active alerts: 2 items out of stock, 3 running low, 1 expired and 1 device alert.");
  assert.deepEqual(r.followUps, ["low stock", "expiry dates", "all fridges"]);
  assert.equal(alertsAnswer({}).text, "There are no active alerts right now.");
  assert.match(alertsAnswer({ unavailable: 1 }).text, /can't promise there are none/);
});

t("tasks and quick notes list what is open", () => {
  assert.equal(tasksAnswer({ titles: ["Fix door"], total: 1, high: 0 }).text, "1 open task:\n• Fix door");
  assert.match(tasksAnswer({ titles: ["a", "b"], total: 8, high: 2 }).text, /8 open tasks, 2 of them high priority:\n• a\n• b\n…and 2 more\./);
  assert.equal(tasksAnswer({}).text, "There are no open tasks.");
  assert.match(quickNotesAnswer({ notes: ["Ring supplier"], overdue: 1 }).text, /You have 1 open quick note, 1 overdue:\n• Ring supplier/);
  assert.equal(quickNotesAnswer({}).text, "You have no open quick notes.");
});

t("practice readiness is a score plus what to do about it", () => {
  const r = operationsAnswer({ readiness: 82, priorities: ["Restock gloves", "Clean room 3"] });
  assert.equal(r.text, "The practice is 82% ready.\nWhat needs attention: Restock gloves and Clean room 3.");
  assert.match(operationsAnswer({ readiness: null }).text, /don't have enough connected information/);
  assert.match(operationsAnswer({ readiness: 100 }).text, /Nothing needs attention right now\./);
});

t("timeline, spaces, compliance and users are sentences, not fragments", () => {
  assert.match(timelineAnswer({ titles: ["Room 1 cleaned", "Stock received"] }).text, /^2 things happened:\n• Room 1 cleaned\n• Stock received/);
  assert.match(spacesAnswer({ total: 12, attention: ["Room 4"] }).text, /12 spaces are registered\. 1 needs a look: Room 4\./);
  assert.match(complianceAnswer({ assets: 5, checks: 20, failed: 2 }).text, /5 compliance assets are registered, with 20 recorded checks\.\n2 checks need review\./);
  assert.match(complianceAnswer({ known: false }).text, /can't see any compliance records/);
  assert.equal(usersAnswer({ total: 60, byRole: { Nurse: 15, Reception: 10, Partner: 3 } }).text, "60 accounts are registered: 15 Nurse, 10 Reception and 3 Partner.");
});

t("every follow-up offered is a phrase the Orb's own router understands", () => {
  const known = new Set(["low stock", "expiry dates", "all fridges", "active alerts", "cleaning status", "maintenance", "what needs attention"]);
  const all = [
    stockOverview({ total: 5, units: 5, out: [item("a")], expired: [item("b")] }), lowStockAnswer({ out: [item("a")] }), expiryAnswer({ soon: [item("a")] }),
    cleaningAnswer({ overdue: ["a"], total: 2 }), maintenanceAnswer(["a"]), coldChainOverview({ units: [{ name: "F", value: 9, min: 2, max: 8, ageMinutes: 1 }] }),
    alertsAnswer({ stock: { out: 1, low: 1, expired: 1, soon: 1 }, device: 1 }), operationsAnswer({ readiness: 50, priorities: ["x"] }), tasksAnswer({ titles: ["a"], total: 1 }),
  ];
  all.flatMap((r) => r.followUps).forEach((q) => assert.ok(known.has(q), `unknown follow-up: ${q}`));
  // ...and each one is literally a phrase of one of the Orb's own intents, so pressing it always routes
  for (const q of known) assert.ok(CLINICAL_INTENTS.some((intent) => intent.phrases.includes(q)), `"${q}" is not a phrase the Orb routes`);
});

console.log(`\n${n} passed`);
