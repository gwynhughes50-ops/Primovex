import assert from "node:assert/strict";
import { CLEANING_FREQUENCY_OPTIONS, cleaningFrequencyHours, cleaningFrequencyLabel, isCleaningOverdue, needsCleaning, nextCleanDue } from "../src/lib/cleaningFrequency.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const NOW = Date.parse("2026-10-08T12:00:00Z");
const daysAgo = (d) => new Date(NOW - d * 86400000);

t("Never is offered first and saved as 0", () => {
  assert.deepEqual(CLEANING_FREQUENCY_OPTIONS[0], { hours: 0, label: "Never" });
  assert.equal(cleaningFrequencyLabel(0), "Never");
});

t("0 survives (it is not turned into daily), blanks and junk become daily", () => {
  assert.equal(cleaningFrequencyHours(0), 0);
  assert.equal(cleaningFrequencyHours("0"), 0);
  for (const v of [undefined, null, "", NaN, -5, "abc"]) assert.equal(cleaningFrequencyHours(v), 24);
  assert.equal(cleaningFrequencyHours(168), 168);
});

t("a Never space is never overdue, never due, even if it has never been cleaned", () => {
  const space = { cleaningFrequencyHours: 0 };
  assert.equal(needsCleaning(space), false);
  assert.equal(nextCleanDue(space, daysAgo(400)), null);
  assert.equal(isCleaningOverdue(space, null, NOW), false);
  assert.equal(isCleaningOverdue(space, daysAgo(400), NOW), false);
});

t("scheduled spaces behave as before", () => {
  const weekly = { cleaningFrequencyHours: 168 };
  assert.equal(isCleaningOverdue(weekly, null, NOW), true, "never cleaned yet = due now");
  assert.equal(isCleaningOverdue(weekly, daysAgo(3), NOW), false);
  assert.equal(isCleaningOverdue(weekly, daysAgo(8), NOW), true);
  assert.equal(isCleaningOverdue({}, daysAgo(2), NOW), true, "no frequency set = daily");
  assert.equal(nextCleanDue(weekly, daysAgo(3)).getTime(), NOW + 4 * 86400000);
});

console.log(`\n${n} passed`);
