import assert from "node:assert/strict";
import { clearBlockedReason, clearPatch, incidentStatusLabel, isQuarantined, quarantinePatch, quarantinedUnitIds, recheckReadings, stockPatch } from "../src/modules/temperature/fridgeIncidents.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const at = (iso) => new Date(iso);
const actor = { uid: "lead", displayName: "Lead Nurse" };
const incident = (over = {}) => ({ unitId: "u-1", unitName: "Vaccine fridge", status: "open", openedAt: at("2026-10-12T08:40:00"), expectedRange: { min: 2, max: 8 }, ...over });
const log = (over = {}) => ({ unitId: "u-1", temp: 5, minTemp: 3.5, maxTemp: 7, measured_at: at("2026-10-12T10:15:00"), recordedBy: "Hayley", ...over });

t("a quarantined fridge is an open incident marked quarantined", () => {
  assert.ok(isQuarantined(incident({ quarantined: true })));
  assert.ok(!isQuarantined(incident()));
  assert.ok(!isQuarantined(incident({ quarantined: true, status: "resolved" })), "once cleared it is no longer quarantined");
  assert.deepEqual(quarantinedUnitIds([incident({ quarantined: true }), incident({ unitId: "u-2" }), incident({ unitId: "u-3", quarantined: true, status: "resolved" })]), ["u-1"]);
  assert.deepEqual([incidentStatusLabel(incident()), incidentStatusLabel(incident({ quarantined: true })), incidentStatusLabel(incident({ status: "resolved" }))], ["Open", "Quarantined", "Cleared"]);
});

t("quarantining records who", () => {
  assert.deepEqual(quarantinePatch({ actor }), { quarantined: true, quarantinedBy: "Lead Nurse", quarantinedByUid: "lead" });
  assert.equal(quarantinePatch({ actor: { email: "a@b" } }).quarantinedBy, "a@b");
});

t("what happened to the stock is ticked, with how many, and the wording is made for them", () => {
  const moved = stockPatch(incident(), { moved: true, movedUnits: "12", actor });
  assert.equal(moved.affectedStock.stockNotes, "12 units of stock moved to another fridge");
  assert.equal(moved.affectedStock.movedToBackupUnit, true);
  assert.equal(moved.affectedStock.unitsMoved, 12);
  const both = stockPatch(incident(), { moved: true, discarded: true, movedUnits: 1, discardedUnits: 3, actor });
  assert.equal(both.affectedStock.stockNotes, "1 unit of stock moved to another fridge; 3 units of stock discarded");
  const noCounts = stockPatch(incident(), { discarded: true, actor });
  assert.equal(noCounts.affectedStock.stockNotes, "Stock discarded");
  assert.equal(noCounts.stockRecordedBy, "Lead Nurse");
  const keeps = stockPatch(incident({ affectedStock: { quarantined: true, movedToBackupUnit: true, discarded: false, stockNotes: "" } }), { discarded: true, actor });
  assert.equal(keeps.affectedStock.quarantined, true, "what was already recorded stays");
  assert.equal(keeps.affectedStock.movedToBackupUnit, true);
});

t("only readings for this fridge recorded after the incident count as a recheck, newest first", () => {
  const logs = [log({ measured_at: at("2026-10-12T08:00:00") }), log({ measured_at: at("2026-10-12T11:00:00"), temp: 4 }), log({ unitId: "u-2", measured_at: at("2026-10-12T12:00:00") }), log({ measured_at: at("2026-10-12T10:00:00"), temp: 6 })];
  assert.deepEqual(recheckReadings(incident(), logs).map((l) => l.temp), [4, 6]);
});

t("a fridge can only be cleared after a recheck that is back in range", () => {
  assert.match(clearBlockedReason(incident(), [], null), /only be cleared after a recheck/);
  assert.match(clearBlockedReason(incident(), [log({ measured_at: at("2026-10-12T07:00:00") })], null), /only be cleared after a recheck/, "a reading from before the incident doesn't count");
  assert.match(clearBlockedReason(incident(), [log({ temp: 9.1, maxTemp: 9.1 })], null), /latest recheck \(9\.1°C\) is still out of range/);
  assert.match(clearBlockedReason(incident(), [log({ outOfRange: true })], null), /still out of range/);
  assert.match(clearBlockedReason(incident(), [log({ maxTemp: 9.5 })], null), /still out of range/, "it rose above the range since");
  assert.equal(clearBlockedReason(incident(), [log()], null), "");
  assert.equal(clearBlockedReason(incident(), [log({ temp: 9, measured_at: at("2026-10-12T09:00:00") }), log()], { min: 2, max: 8 }), "", "the newest recheck is the one that counts");
  assert.match(clearBlockedReason(incident({ status: "resolved" }), [log()], null), /already cleared/);
});

t("clearing records who, when and the recheck, and ends the quarantine", () => {
  const patch = clearPatch(incident({ quarantined: true }), [log()], { actor, now: at("2026-10-12T11:30:00") });
  assert.equal(patch.status, "resolved");
  assert.equal(patch.quarantined, false);
  assert.equal(patch.resolvedBy, "Lead Nurse");
  assert.equal(patch.resolutionNotes, "Recheck 5°C in range (recorded by Hayley). Cleared by Lead Nurse at 11:30.");
});

console.log(`\n${n} passed`);
