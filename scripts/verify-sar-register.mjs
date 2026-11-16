// SAR register: spotting the same request entered twice (same EMIS number, today), the completion date, and sorting by due date, days left or completion date either way round.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SORT_KEYS, completionProblem, dayAtNoon, duplicateWords, findLikelyDuplicates, localDay, normaliseEmis, sortSars, sortValue, sortWords } from "../src/modules/governance/sarRegister.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const NOW = new Date(2026, 10, 16, 15, 30); // 16 November 2026, afternoon
const at = (y, m, d, h = 10) => new Date(y, m - 1, d, h, 0);
const sar = (id, extra = {}) => ({ id, reference: `SAR-${id}`, emisNumber: "", status: "assigned", createdAt: at(2026, 11, 1), receivedDate: at(2026, 11, 1), dueDate: at(2026, 11, 29), ...extra });

t("an EMIS number is compared without spaces or case", () => {
  assert.equal(normaliseEmis(" 123 456 "), "123456");
  assert.equal(normaliseEmis("ab 12"), "AB12");
  assert.equal(normaliseEmis(null), "");
});

t("the same EMIS number entered today is flagged, and says why", () => {
  const rows = [sar("a", { emisNumber: "123456", createdAt: at(2026, 11, 16, 9), createdByName: "Sam" }), sar("b", { emisNumber: "999999", createdAt: at(2026, 11, 16, 9) })];
  const found = findLikelyDuplicates(rows, { emisNumber: "123 456", receivedDate: "2026-11-16", now: NOW });
  assert.equal(found.length, 1);
  assert.equal(found[0].reference, "SAR-a");
  assert.equal(found[0].enteredToday, true);
  assert.equal(duplicateWords(found[0]), "SAR-a for this EMIS number was entered today (entered by Sam).");
});

t("a different EMIS number, an empty one, or the SAR itself is not a duplicate", () => {
  const rows = [sar("a", { emisNumber: "123456", createdAt: at(2026, 11, 16, 9) })];
  assert.deepEqual(findLikelyDuplicates(rows, { emisNumber: "777", now: NOW }), []);
  assert.deepEqual(findLikelyDuplicates(rows, { emisNumber: "", now: NOW }), []);
  assert.deepEqual(findLikelyDuplicates(rows, { emisNumber: "123456", now: NOW, excludeId: "a" }), []);
});

t("an older request for the same patient is not flagged, unless it was received on the same day", () => {
  const rows = [sar("old", { emisNumber: "123456", createdAt: at(2026, 10, 2), receivedDate: at(2026, 10, 2) })];
  assert.deepEqual(findLikelyDuplicates(rows, { emisNumber: "123456", receivedDate: "2026-11-16", now: NOW }), [], "a month ago is a new request");
  const same = [sar("x", { emisNumber: "123456", createdAt: at(2026, 11, 13), receivedDate: at(2026, 11, 16) })];
  const found = findLikelyDuplicates(same, { emisNumber: "123456", receivedDate: "2026-11-16", now: NOW });
  assert.equal(found.length, 1);
  assert.equal(found[0].sameReceived, true);
  assert.equal(found[0].enteredToday, false);
  assert.match(duplicateWords(found[0]), /was received on the same day/);
});

t("works with database timestamps (toDate) as well as dates, and late-evening entries still count as today", () => {
  const stamp = (d) => ({ toDate: () => d });
  const rows = [sar("a", { emisNumber: "55", createdAt: stamp(at(2026, 11, 16, 23)) })];
  assert.equal(findLikelyDuplicates(rows, { emisNumber: "55", now: at(2026, 11, 16, 0) }).length, 1);
  assert.equal(findLikelyDuplicates(rows, { emisNumber: "55", now: at(2026, 11, 17, 0) }).length, 0);
});

t("the completion date: blank is fine, and it must be a real day, not in the future, not before the SAR was received", () => {
  const today = "2026-11-16";
  assert.equal(completionProblem({ completedDate: "", receivedDate: "2026-11-01", today }), "");
  assert.equal(completionProblem({ completedDate: "2026-11-10", receivedDate: "2026-11-01", today }), "");
  assert.equal(completionProblem({ completedDate: "2026-11-16", receivedDate: "2026-11-01", today }), "", "today is allowed");
  assert.match(completionProblem({ completedDate: "2026-11-17", receivedDate: "2026-11-01", today }), /cannot be in the future/);
  assert.match(completionProblem({ completedDate: "2026-10-31", receivedDate: "2026-11-01", today }), /before the date the request was received/);
  assert.match(completionProblem({ completedDate: "16/11/2026", receivedDate: "2026-11-01", today }), /not a real date/);
  assert.equal(localDay(dayAtNoon("2026-11-16")), "2026-11-16", "a chosen day comes back as the same day");
  assert.equal(dayAtNoon("nonsense"), null);
});

// ---- sorting ----
const rows = [
  sar("late", { dueDate: at(2026, 11, 10), createdAt: at(2026, 10, 12) }),                       // 6 days overdue
  sar("soon", { dueDate: at(2026, 11, 18), createdAt: at(2026, 10, 20) }),                       // 2 days left
  sar("far", { dueDate: at(2026, 12, 20), createdAt: at(2026, 11, 14) }),                        // 34 days left
  sar("doneA", { status: "completed", dueDate: at(2026, 11, 5), completedAt: at(2026, 11, 3), createdAt: at(2026, 10, 1) }),
  sar("doneB", { status: "completed", dueDate: at(2026, 11, 30), completedAt: at(2026, 11, 12), createdAt: at(2026, 10, 25) }),
  sar("nodue", { dueDate: null, createdAt: at(2026, 11, 2) }),
];
const ids = (list) => list.map((r) => r.id);

t("by due date, earliest first or latest first, and one with no due date is always last", () => {
  assert.deepEqual(ids(sortSars(rows, { key: "due", dir: "asc" }, NOW)), ["doneA", "late", "soon", "doneB", "far", "nodue"]);
  assert.deepEqual(ids(sortSars(rows, { key: "due", dir: "desc" }, NOW)), ["far", "doneB", "soon", "late", "doneA", "nodue"]);
});

t("by days left, the most overdue and then the nearest come first; a completed SAR has no days left and goes last", () => {
  assert.deepEqual(ids(sortSars(rows, { key: "daysLeft", dir: "asc" }, NOW)), ["late", "soon", "far", "doneA", "doneB", "nodue"]);
  assert.deepEqual(ids(sortSars(rows, { key: "daysLeft", dir: "desc" }, NOW)), ["far", "soon", "late", "doneA", "doneB", "nodue"]);
  assert.equal(sortValue(rows[0], "daysLeft", NOW), -6);
  assert.equal(sortValue(rows[1], "daysLeft", NOW), 2);
  assert.equal(sortValue(rows[3], "daysLeft", NOW), null);
  assert.equal(sortValue(sar("today", { dueDate: at(2026, 11, 16, 9) }), "daysLeft", at(2026, 11, 16, 23)), 0, "due today is 0 days, whatever the time");
});

t("by completion date, either way round, with SARs that are not completed last", () => {
  assert.deepEqual(ids(sortSars(rows, { key: "completed", dir: "desc" }, NOW)).slice(0, 2), ["doneB", "doneA"]);
  assert.deepEqual(ids(sortSars(rows, { key: "completed", dir: "asc" }, NOW)).slice(0, 2), ["doneA", "doneB"]);
  assert.deepEqual(ids(sortSars(rows, { key: "completed", dir: "asc" }, NOW)).slice(2), ["late", "soon", "far", "nodue"], "the rest keep their order");
});

t("the register's usual order (newest entry first) is the default, and sorting never loses or changes a SAR", () => {
  assert.deepEqual(ids(sortSars(rows, undefined, NOW)), ["far", "nodue", "doneB", "soon", "late", "doneA"]);
  assert.deepEqual(ids(sortSars(rows, { key: "entered", dir: "asc" }, NOW)), ["doneA", "late", "soon", "doneB", "nodue", "far"]);
  for (const key of Object.keys(SORT_KEYS)) for (const dir of ["asc", "desc"]) assert.equal(sortSars(rows, { key, dir }, NOW).length, rows.length);
  const before = ids(rows);
  sortSars(rows, { key: "due", dir: "asc" }, NOW);
  assert.deepEqual(ids(rows), before, "the list passed in is not reordered");
});

t("ties keep the register's order, and the labels say which way round", () => {
  const tied = [sar("x", { dueDate: at(2026, 11, 20) }), sar("y", { dueDate: at(2026, 11, 20) }), sar("z", { dueDate: at(2026, 11, 20) })];
  assert.deepEqual(ids(sortSars(tied, { key: "due", dir: "asc" }, NOW)), ["x", "y", "z"]);
  assert.deepEqual(ids(sortSars(tied, { key: "due", dir: "desc" }, NOW)), ["x", "y", "z"]);
  assert.equal(sortWords({ key: "daysLeft", dir: "asc" }), "Days left to complete: Fewest days left first (most urgent)");
  assert.equal(sortWords({ key: "completed", dir: "desc" }), "Completion date: Most recently completed first");
});

t("the screen has the sort control, the completion date field, the completed column and the duplicate warning", () => {
  const page = readFileSync(new URL("../src/pages/GovernanceSARs.jsx", import.meta.url), "utf8");
  assert.match(page, /aria-label="Sort the register by"/);
  assert.match(page, /aria-label="Reverse the order"/);
  assert.match(page, /Date Completed/);
  assert.match(page, /<th className="py-3 pr-3">Completed<\/th>/);
  assert.match(page, /This is a different request, add it anyway/);
  assert.match(page, /rows=\{rows\}/);
  const phone = readFileSync(new URL("../src/mobile/MobileGovernanceSARs.jsx", import.meta.url), "utf8");
  assert.match(phone, /aria-label="Reverse the order"/);
  assert.match(phone, /Date completed/);
  assert.match(phone, /This is a different request, add it anyway/);
  assert.match(phone, /rows={rows}/);
  const service = readFileSync(new URL("../src/modules/governance/services/sarService.js", import.meta.url), "utf8");
  assert.match(service, /checkCompletionDate\(form\)/);
  assert.match(service, /updates\.completedAt = deleteField\(\)/);
});

console.log(`\n${n} checks passed`);
