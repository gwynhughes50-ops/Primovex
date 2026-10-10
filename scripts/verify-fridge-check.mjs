import assert from "node:assert/strict";
import { ACTIONS, buildIncidentDoc, fridgeChecksAnswer, normaliseUnit, buildReadingDoc, checkReadings, expectedFridges, isCheckTime, isFridgeAsset, notCheckedToday, parseTemp, rangeFor, resolveUnit, slotOf, unitTypeOf } from "../src/mobile/fridgeCheck.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };

const fridge = { id: "eq-1", name: "Vaccine Fridge", category: "Cold chain", monitoring: {} };
const printer = { id: "eq-2", name: "Printer - Lead", category: "General" };
const ultrasound = { id: "eq-3", name: "Portable Ultrasound Scanner", category: "Diagnostic" };
const freezer = { id: "eq-4", name: "Sample Freezer", category: "Freezer" };

t("only fridges and freezers are treated as fridges (a printer or scanner is not)", () => {
  assert.ok(isFridgeAsset(fridge));
  assert.ok(isFridgeAsset(freezer));
  assert.ok(isFridgeAsset({ id: "x", name: "Research Fridge 2" }));
  assert.ok(isFridgeAsset({ id: "x", name: "Unit A", monitoring: { fridgeId: "u1" } }));
  assert.ok(!isFridgeAsset(printer));
  assert.ok(!isFridgeAsset(ultrasound));
  assert.ok(!isFridgeAsset(null));
  assert.equal(unitTypeOf(freezer), "freezer");
  assert.equal(unitTypeOf(fridge), "fridge");
});

t("the safe range comes from the unit, then the fridge, then the usual for its kind", () => {
  assert.deepEqual(rangeFor(fridge, null), { min: 2, max: 8 });
  assert.deepEqual(rangeFor(freezer, null), { min: -25, max: -15 });
  assert.deepEqual(rangeFor({ ...fridge, monitoring: { min: "3", max: "7" } }, null), { min: 3, max: 7 });
  assert.deepEqual(rangeFor(fridge, { range: { min: 2, max: 6 } }), { min: 2, max: 6 });
  assert.deepEqual(rangeFor(fridge, { type: "freezer" }), { min: -25, max: -15 });
});

t("a fridge finds its temperature unit by id, then by name", () => {
  const units = [{ id: "u-1", name: "Vaccine fridge" }, { id: "eq-9", name: "Other" }];
  assert.equal(resolveUnit(fridge, units).id, "u-1", "by name, ignoring case");
  assert.equal(resolveUnit({ ...fridge, id: "eq-9", name: "Zzz" }, units).id, "eq-9", "by id");
  assert.equal(resolveUnit({ ...fridge, monitoring: { fridgeId: "u-1" }, name: "Zzz" }, units).id, "u-1", "by its linked unit id");
  assert.equal(resolveUnit({ id: "none", name: "Nothing" }, units), null);
});

t("what is typed from the thermometer is read as a number", () => {
  assert.equal(parseTemp("4.5"), 4.5);
  assert.equal(parseTemp("4,5"), 4.5);
  assert.equal(parseTemp(" -18 "), -18);
  assert.equal(parseTemp("−18.5"), -18.5);
  assert.equal(parseTemp("0"), 0);
  for (const bad of ["", "abc", "4.5.1", "100", "-70", "4,", "--3", null, undefined]) assert.equal(parseTemp(bad), null, String(bad));
});

t("the three readings are checked against the range, and impossible ones are refused", () => {
  const range = { min: 2, max: 8 };
  assert.deepEqual(checkReadings({ current: 5, min: 3.5, max: 7 }, range), { errors: [], reasons: [], outOfRange: false });
  const high = checkReadings({ current: 6, min: 4, max: 9.5 }, range);
  assert.equal(high.outOfRange, true);
  assert.deepEqual(high.reasons, ["It rose to 9.5°C"]);
  const low = checkReadings({ current: 1.5, min: 0.5, max: 4 }, range);
  assert.deepEqual(low.reasons, ["Right now it is 1.5°C", "It dropped to 0.5°C"]);
  assert.match(checkReadings({ current: 5, min: 6, max: 4 }, range).errors[0], /minimum can't be higher/);
  assert.match(checkReadings({ current: 9, min: 3, max: 7 }, range).errors[0], /between the minimum and the maximum/);
  assert.match(checkReadings({ current: null, min: 3, max: 7 }, range).errors[0], /all three/);
  assert.equal(checkReadings({ current: -20, min: -22, max: -18 }, { min: -25, max: -15 }).outOfRange, false, "a freezer in range");
});

t("the reading is stored with who, when, the min and max and the reset, in the Temperature page's shape", () => {
  const now = new Date("2026-10-12T08:40:00");
  const doc = buildReadingDoc({ asset: fridge, unit: { id: "u-1", name: "Vaccine fridge", type: "fridge", siteId: "main", siteName: "Main Surgery" }, range: { min: 2, max: 8 }, readings: { current: 5, min: 3, max: 7 }, actor: { uid: "n1", displayName: "Nina" }, now, checked: { reset: true, outOfRange: false } });
  assert.deepEqual([doc.temp, doc.minTemp, doc.maxTemp, doc.resetDone, doc.outOfRange], [5, 3, 7, true, false]);
  assert.deepEqual([doc.recordedBy, doc.recordedByUid, doc.unitId, doc.unitName, doc.unitType, doc.siteId, doc.slot, doc.dateKey, doc.source], ["Nina", "n1", "u-1", "Vaccine fridge", "fridge", "main", "AM", "2026-10-12", "manual-mobile"]);
  assert.deepEqual(doc.unitRange, { min: 2, max: 8 });
  assert.equal(doc.assetId, "eq-1");
  assert.equal(slotOf(new Date("2026-10-12T13:00:00")), "PM");
  const unlinked = buildReadingDoc({ asset: fridge, unit: null, range: { min: 2, max: 8 }, readings: { current: 5, min: 3, max: 7 }, actor: { uid: "n1", email: "n@x" }, now, checked: { reset: true } });
  assert.deepEqual([unlinked.unitId, unlinked.unitName, unlinked.recordedBy], ["eq-1", "Vaccine Fridge", "n@x"]);
});

t("an out-of-range reading opens an incident carrying what was done, in the Temperature page's shape", () => {
  const inc = buildIncidentDoc({ asset: fridge, unit: { id: "u-1", name: "Vaccine fridge", type: "fridge", siteId: "main" }, range: { min: 2, max: 8 }, readings: { current: 6, min: 4, max: 9.5 }, reasons: ["It rose to 9.5°C"], actionKeys: ["moved", "told"], actor: { uid: "n1", displayName: "Nina" } });
  assert.equal(inc.status, "open");
  assert.equal(inc.openedByUid, "n1", "who opened it, so only they can raise the alert for it");
  assert.equal(inc.summary, "Vaccine fridge out of range (4°C to 9.5°C)");
  assert.equal(inc.actionsTaken, "Moved the stock to another fridge; Told the Practice Manager");
  assert.deepEqual(inc.affectedStock, { quarantined: false, discarded: false, movedToBackupUnit: true, stockNotes: "" });
  assert.deepEqual([inc.unitId, inc.expectedRange, inc.observedTemp, inc.openedBy, inc.source], ["u-1", { min: 2, max: 8 }, 6, "Nina", "mobile-check"]);
  assert.equal(ACTIONS.length, 5);
});

const at = (iso) => new Date(iso);

t("fridges not checked today are only counted on weekday afternoons", () => {
  const fridges = [{ id: "u-1", name: "Vaccine fridge" }, { id: "u-2", name: "Medicine fridge" }];
  const logs = [{ unitId: "u-1", dateKey: "2026-10-12" }, { unitId: "u-2", dateKey: "2026-10-09" }];
  assert.deepEqual(notCheckedToday({ fridges, logs, now: at("2026-10-12T14:00:00") }).map((f) => f.id), ["u-2"]);
  assert.deepEqual(notCheckedToday({ fridges, logs, now: at("2026-10-12T09:00:00") }), [], "not before midday");
  assert.deepEqual(notCheckedToday({ fridges, logs, now: at("2026-10-10T14:00:00") }), [], "not on a Saturday");
  assert.ok(isCheckTime(at("2026-10-14T12:00:00")));
  assert.ok(!isCheckTime(at("2026-10-11T15:00:00")));
  assert.deepEqual(notCheckedToday({ fridges, logs: [], now: at("2026-10-12T15:00:00") }).length, 2);
});

t("the fridges to expect are the temperature units plus fridge equipment that isn't one yet", () => {
  const units = [{ id: "u-1", name: "Vaccine fridge", active: true }, { id: "u-2", name: "Old unit", active: false }];
  const list = expectedFridges({ units, assets: [fridge, printer, freezer, ultrasound] });
  assert.deepEqual(list.map((f) => f.name), ["Vaccine fridge", "Sample Freezer"], "the Vaccine Fridge asset is already the unit; the printer is not a fridge");
});

t("a temperature unit is read the way the Temperature page reads it", () => {
  assert.deepEqual(normaliseUnit("u1", { unitName: "Vaccine fridge", site: "main", unitType: "fridge" }), { id: "u1", name: "Vaccine fridge", siteId: "main", siteName: "", type: "fridge", rawType: "fridge", active: true, range: { min: 2, max: 8 } });
  assert.deepEqual(normaliseUnit("u2", { name: "Deep freezer", unitType: "freezer40" }).range, { min: -45, max: -35 });
  assert.deepEqual(normaliseUnit("u3", { name: "F", unitType: "freezer20", rangeMin: "-24", rangeMax: "-16" }).range, { min: -24, max: -16 });
  assert.equal(normaliseUnit("u4", { active: false }).active, false);
});

t("which fridges have not been checked today, and any open incidents", () => {
  const now = at("2026-10-12T15:00:00");
  const fridges = [{ id: "u-1", name: "Vaccine fridge" }, { id: "u-2", name: "Medicine fridge" }, { id: "u-3", name: "Sample freezer" }];
  const logs = [{ unitId: "u-1", dateKey: "2026-10-12" }, { unitId: "u-2", dateKey: "2026-10-11" }];
  const a = fridgeChecksAnswer({ fridges, logs, incidents: [{ status: "open", unitName: "Vaccine fridge" }, { status: "resolved", unitName: "Old" }], now });
  assert.match(a.text, /1 of 3 fridges checked today\. Not checked yet: Medicine fridge, Sample freezer\./);
  assert.match(a.text, /1 fridge incident open: Vaccine fridge\./);
  assert.equal(a.unchecked, 2);
  assert.match(fridgeChecksAnswer({ fridges: fridges.slice(0, 1), logs, now }).text, /All 1 fridge has been checked today/);
  assert.match(fridgeChecksAnswer({ fridges: [], now }).text, /No fridges or freezers are set up/);
});

console.log(`\n${n} passed`);
