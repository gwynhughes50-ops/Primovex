import assert from "node:assert/strict";
import fs from "node:fs";
import { ARCHIVE_FIELDS, ARCHIVE_REASONS, activeReadings, archivedLine, buildArchivePatch, buildRestorePatch, isArchived } from "../src/modules/temperature/readingArchive.js";
import { temperatureReadingEvent } from "../src/modules/audit/auditEvents.js";
import { CAPABILITIES, ROLE_TEMPLATES, hasCapability } from "../src/core/identity/capabilities.js";
import { fridgeStatuses, dayStrip, describeReading } from "../src/mobile/fridgeReadings.js";
import { QUICK_NOTES, buildReadingDoc, cleanNote, composeNote, fridgeChecksAnswer, notCheckedToday, NOTE_MAX } from "../src/mobile/fridgeCheck.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const ME = { uid: "pm-1", displayName: "Gwyn Hughes" };
const NOW = new Date(2026, 10, 5, 15, 0); // Thursday 5 Nov 2026, 15:00
const stamp = (d) => ({ toDate: () => d });
const reading = (extra = {}) => ({ id: "r1", unitId: "f1", unitName: "Vaccine fridge", temp: 4.5, minTemp: 3, maxTemp: 6, measured_at: stamp(NOW), dateKey: "2026-11-05", slot: "PM", recordedBy: "Nurse", ...extra });

t("archiving needs a reason picked from the list, and 'another reason' needs words", () => {
  assert.throws(() => buildArchivePatch({ actor: ME }), /Choose why/);
  assert.throws(() => buildArchivePatch({ reasonKey: "made-up", actor: ME }), /Choose why/);
  assert.throws(() => buildArchivePatch({ reasonKey: "other", note: "   ", actor: ME }), /what the other reason/);
  const ok = buildArchivePatch({ reasonKey: "other", note: "  Thermometer was\n faulty ", actor: ME, now: NOW });
  assert.equal(ok.archiveNote, "Thermometer was faulty");
  assert.deepEqual(ARCHIVE_REASONS.map((r) => r.key), ["wrong_fridge", "entered_in_error", "duplicate", "test", "other"]);
});

t("an archive patch says who, when and why, and touches only the archive fields", () => {
  const patch = buildArchivePatch({ reasonKey: "duplicate", actor: ME, now: NOW });
  assert.equal(patch.archived, true);
  assert.equal(patch.archivedBy, "Gwyn Hughes");
  assert.equal(patch.archivedByUid, "pm-1");
  assert.equal(patch.archiveReason, "Duplicate reading");
  assert.equal(patch.archiveReasonKey, "duplicate");
  assert.equal(patch.archivedAt, NOW);
  for (const key of Object.keys(patch)) assert.ok(ARCHIVE_FIELDS.includes(key), key);
  for (const key of Object.keys(buildRestorePatch({ actor: ME, now: NOW }))) assert.ok(ARCHIVE_FIELDS.includes(key), key);
  for (const forbidden of ["temp", "minTemp", "maxTemp", "measured_at", "unitId", "recordedBy", "notes", "dateKey", "slot", "created_at"]) assert.ok(!ARCHIVE_FIELDS.includes(forbidden), forbidden);
});

t("the database rule allows exactly those fields, and only whoever has temperature.archive (or an admin) may change a reading", () => {
  const rules = fs.readFileSync("firestore.rules", "utf8");
  const block = rules.slice(rules.indexOf("match /temperature_logs/{docId}"), rules.indexOf("match /temperature_units/{docId}"));
  const listed = [...block.match(/hasOnly\(\[([^\]]+)\]\)/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(listed, [...ARCHIVE_FIELDS].sort());
  assert.match(block, /allow update: if isAdmin\(\) \|\| \(hasPermission\("temperature", "archive"\)/);
  assert.match(block, /allow delete: if isAdmin\(\);/);
  assert.doesNotMatch(block, /allow update, delete/);
});

t("the Practice Manager has the permission in every place permissions are defined, and the Nurse does not", () => {
  assert.equal(CAPABILITIES.temperature.archive, "temperature.archive");
  assert.ok(ROLE_TEMPLATES["Practice Manager"].includes("temperature.archive"));
  assert.ok(!(ROLE_TEMPLATES.Nurse || []).includes("temperature.archive"));
  assert.ok(!(ROLE_TEMPLATES["Nurse and HCA"] || []).includes("temperature.archive"));
  assert.ok(hasCapability(["*"], "temperature.archive"));
  const rules = fs.readFileSync("firestore.rules", "utf8");
  const functionsFile = fs.readFileSync("functions/services/roleCapabilities.js", "utf8");
  const pmRules = rules.slice(rules.indexOf('"itAssets.manage"') - 400, rules.indexOf('"itAssets.manage"') + 80);
  assert.match(pmRules, /"temperature.archive"/);
  assert.match(functionsFile.split("\n").find((l) => l.includes("itAssets.manage")), /"temperature.archive"/);
  const nurseRules = rules.slice(rules.indexOf('role == "Nurse"'), rules.indexOf('role == "Nurse"') + 700);
  assert.doesNotMatch(nurseRules.split("role ==")[1] || "", /temperature\.archive/);
});

t("an archived reading drops out of the status, the day strip, 'not checked today' and the Orb's answer", () => {
  const units = [{ id: "f1", name: "Vaccine fridge", active: true }];
  const archived = reading({ archived: true, archiveReason: "Duplicate reading", archivedBy: "Gwyn Hughes" });
  const live = fridgeStatuses({ units, logs: [reading()], now: NOW })[0];
  assert.equal(live.state, "ok");
  const gone = fridgeStatuses({ units, logs: [archived], now: NOW })[0];
  assert.equal(gone.state, "missing", "the only reading was archived, so the fridge is unchecked again");
  assert.equal(gone.newest, null);
  assert.equal(dayStrip([archived], NOW).at(-1).state, "none");
  assert.equal(dayStrip([reading()], NOW).at(-1).state, "ok");
  assert.equal(notCheckedToday({ fridges: units, logs: [archived], now: NOW }).length, 1);
  assert.equal(notCheckedToday({ fridges: units, logs: [reading()], now: NOW }).length, 0);
  assert.match(fridgeChecksAnswer({ fridges: units, logs: [archived], now: NOW }).text, /Not checked yet: Vaccine fridge/);
  assert.equal(activeReadings([reading(), archived]).length, 1);
  assert.ok(isArchived(archived));
  assert.ok(!isArchived(reading()));
});

t("an archived out-of-range reading no longer makes the fridge 'out'", () => {
  const units = [{ id: "f1", name: "Vaccine fridge", active: true }];
  assert.equal(fridgeStatuses({ units, logs: [reading({ outOfRange: true })], now: NOW })[0].state, "out");
  assert.equal(fridgeStatuses({ units, logs: [reading({ outOfRange: true, archived: true })], now: NOW })[0].state, "missing");
});

t("the list line says who archived it, when and why", () => {
  assert.equal(archivedLine(reading()), "");
  const line = archivedLine(reading({ archived: true, archivedBy: "Gwyn Hughes", archivedAt: stamp(new Date(2026, 10, 5)), archiveReason: "Another reason (say what)", archiveNote: "Thermometer faulty" }));
  assert.equal(line, "Archived by Gwyn Hughes on 05/11/2026: Another reason (say what): Thermometer faulty");
});

t("archiving and restoring are written to the audit ledger without the typed note", () => {
  const a = temperatureReadingEvent("archived", { reading: reading(), reasonKey: "duplicate" });
  assert.equal(a.action, "temperature.reading.archived");
  assert.equal(a.module, "temperature");
  assert.equal(a.targetId, "r1");
  assert.equal(a.metadata.reason, "duplicate");
  assert.match(a.summary, /Vaccine fridge/);
  assert.doesNotMatch(JSON.stringify(a), /faulty|note/i);
  assert.equal(temperatureReadingEvent("restored", { reading: reading() }).action, "temperature.reading.restored");
});

t("a note added on the phone is saved with the reading and shown on the list", () => {
  assert.equal(composeNote([], ""), "");
  assert.equal(composeNote(["Door was open"], ""), "Door was open");
  assert.equal(composeNote(["Door was open", "Stock delivery put away"], "  restocking   after delivery "), "Door was open. Stock delivery put away. restocking after delivery");
  assert.equal(composeNote(["Not a real quick pick"], "hello"), "hello", "only the listed quick picks are accepted");
  assert.equal(cleanNote("x".repeat(500)).length, NOTE_MAX);
  assert.ok(QUICK_NOTES.includes("Door was open"));
  const doc = buildReadingDoc({ asset: { id: "f1", name: "Vaccine fridge" }, unit: { id: "f1", name: "Vaccine fridge" }, range: { min: 2, max: 8 }, readings: { current: 4, min: 3, max: 6 }, actor: ME, now: NOW, checked: { reset: true }, note: "Door was open" });
  assert.equal(doc.notes, "Door was open");
  assert.equal(buildReadingDoc({ asset: { id: "f1", name: "x" }, unit: null, range: { min: 2, max: 8 }, readings: { current: 4, min: 3, max: 6 }, actor: ME, now: NOW, checked: {} }).notes, "", "no note is an empty note");
  assert.equal(describeReading(reading({ notes: " Door was open " })).notes, "Door was open");
  assert.equal(describeReading(reading()).notes, "");
});

console.log(`\n${n} passed`);
