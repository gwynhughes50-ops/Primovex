import assert from "node:assert/strict";
import { DUE_SOURCES, isOpenDueNotification, sourcesToCheck, staleNotificationIds } from "../src/services/staleDueNotifications.js";
import { summariseNotifications } from "../src/services/notificationCentreService.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };

const due = (id, extra = {}) => ({ id, automated: true, module: "governance", sourceId: "c1", status: "open", read: false, title: "Concern overdue: CN-2026-1", ...extra });

t("only the daily job's due notices for a case are checked", () => {
  assert.ok(isOpenDueNotification(due("a")));
  assert.ok(isOpenDueNotification(due("a", { status: undefined })), "no status means open");
  assert.ok(!isOpenDueNotification(due("a", { automated: false })), "a message from a colleague is never touched");
  assert.ok(!isOpenDueNotification(due("a", { module: "stock" })));
  assert.ok(!isOpenDueNotification(due("a", { sourceId: "" })));
  assert.ok(!isOpenDueNotification(due("a", { status: "completed" })), "already dealt with");
  assert.ok(!isOpenDueNotification(null));
});

t("each case is looked up once, in the right collection", () => {
  const notes = [due("a"), due("b"), due("c", { sourceId: "c2" }), due("d", { module: "sar", sourceId: "s1" }), due("e", { automated: false })];
  assert.deepEqual(sourcesToCheck(notes), [
    { collection: "governance_concerns", id: "c1" },
    { collection: "governance_concerns", id: "c2" },
    { collection: "governance_sars", id: "s1" },
  ]);
});

t("a notice for a closed, archived or deleted case is out of date; an open one, or one that could not be read, is not", () => {
  const notes = [due("closed"), due("open", { sourceId: "c2" }), due("gone", { sourceId: "c3" }), due("unreadable", { sourceId: "c4" }), due("sar-done", { module: "sar", sourceId: "s1" }), due("sar-open", { module: "sar", sourceId: "s2" })];
  const states = {
    "governance_concerns/c1": "closed",
    "governance_concerns/c2": "investigation",
    "governance_concerns/c3": "gone",
    "governance_sars/s1": "completed",
    "governance_sars/s2": "in_progress",
  };
  assert.deepEqual(staleNotificationIds(notes, states), ["closed", "gone", "sar-done"]);
  assert.deepEqual(staleNotificationIds([due("x", { status: "archived" })], { "governance_concerns/c1": "closed" }), [], "already finished ones are not touched again");
  assert.deepEqual(staleNotificationIds([], {}), []);
});

t("what counts as dealt with matches the statuses the app uses", () => {
  assert.deepEqual(DUE_SOURCES.governance.done, ["closed", "archived"]);
  assert.deepEqual(DUE_SOURCES.sar.done, ["completed", "archived"]);
});

t("once completed, the notice drops out of what the bell and the pop-up count", () => {
  const rows = [due("a"), due("b", { sourceId: "c2" })];
  assert.equal(summariseNotifications(rows).active.length, 2);
  const after = rows.map((row) => (row.id === "a" ? { ...row, status: "completed", read: true } : row));
  const active = summariseNotifications(after).active;
  assert.deepEqual(active.map((row) => row.id), ["b"]);
});

console.log(`\n${n} passed`);
