import assert from "node:assert/strict";
import { DUE_SOURCES, isOpenDueNotification, sourcesToCheck, staleNotificationIds, staleNotifications } from "../src/services/staleDueNotifications.js";
import { formatDue, normalizeNotification, summariseNotifications } from "../src/services/notificationCentreService.js";

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

// the notification in the report: ID48127, "acknowledgement due in 2 days", created 20/10/2026, deadline 22/10/2026, seen on 2/11/2026
const TODAY = new Date(Date.UTC(2026, 10, 2, 9, 0));
const ack = (over = {}) => due("concern-due-soon-c1-craig-acknowledgement-20261022", { kind: "due-soon", title: "Concern acknowledgement due in 2 days: ID48127", ...over });

t("a 'due soon' notice whose day has passed is out of date, and says why, even for a case that cannot be read", () => {
  assert.deepEqual(staleNotifications([ack()], {}, TODAY), [{ id: "concern-due-soon-c1-craig-acknowledgement-20261022", why: "The deadline has passed." }]);
  assert.deepEqual(staleNotificationIds([ack()], { "governance_concerns/c1": { status: "investigation", data: {} } }, TODAY), ["concern-due-soon-c1-craig-acknowledgement-20261022"]);
  const tomorrow = new Date(Date.UTC(2026, 9, 21, 9, 0));
  assert.deepEqual(staleNotificationIds([ack()], {}, tomorrow), [], "still ahead on 21/10: left alone");
  assert.deepEqual(staleNotificationIds([ack()], {}, new Date(Date.UTC(2026, 9, 22, 9, 0))), [], "due today is still due");
  assert.deepEqual(staleNotificationIds([ack({ kind: "overdue", id: "concern-overdue-c1-craig-acknowledgement-20261022" })], {}, TODAY), [], "an overdue notice does not go out of date by the days passing");
});

t("an acknowledgement notice is retired once the concern is acknowledged, even while it is open and not yet due", () => {
  const soon = ack({ id: "concern-due-soon-c1-craig-acknowledgement-20261103" });
  const open = { status: "investigation", data: { acknowledgedAt: { toDate: () => new Date(Date.UTC(2026, 9, 30)) }, acknowledgementDueAt: new Date(Date.UTC(2026, 10, 3, 11)) } };
  assert.deepEqual(staleNotifications([soon], { "governance_concerns/c1": open }, TODAY), [{ id: soon.id, why: "The concern has been acknowledged." }]);
  assert.deepEqual(staleNotificationIds([soon], { "governance_concerns/c1": { status: "received", data: { acknowledgementDueAt: new Date(Date.UTC(2026, 10, 3, 11)) } } }, TODAY), [], "not acknowledged: still right");
});

t("an early resolution notice is retired once the case has left that stage; a final response one once it has been sent", () => {
  const early = due("concern-due-soon-c1-craig-early-resolution-20261104", { kind: "due-soon" });
  assert.deepEqual(staleNotificationIds([early], { "governance_concerns/c1": { status: "investigation", data: {} } }, TODAY), [early.id]);
  assert.deepEqual(staleNotificationIds([early], { "governance_concerns/c1": { status: "early_resolution", data: { earlyResolutionDueAt: new Date(Date.UTC(2026, 10, 4, 11)) } } }, TODAY), []);
  const final = due("concern-due-soon-c1-craig-final-response-20261104", { kind: "due-soon" });
  assert.deepEqual(staleNotificationIds([final], { "governance_concerns/c1": { status: "response", data: { finalResponseSentAt: new Date(), finalResponseDueAt: new Date(Date.UTC(2026, 10, 4, 11)) } } }, TODAY), [final.id]);
});

t("a notice for a deadline that was moved is out of date (the daily job tells people again under a new id)", () => {
  const final = due("concern-due-soon-c1-craig-final-response-20261104", { kind: "due-soon" });
  const extended = { status: "response", data: { finalResponseDueAt: new Date(Date.UTC(2026, 10, 18, 11)) } };
  assert.deepEqual(staleNotifications([final], { "governance_concerns/c1": extended }, TODAY), [{ id: final.id, why: "The deadline has been changed." }]);
  const same = { status: "response", data: { finalResponseDueAt: new Date(Date.UTC(2026, 10, 4, 11)) } };
  assert.deepEqual(staleNotificationIds([final], { "governance_concerns/c1": same }, TODAY), []);
});

t("a SAR 'due soon' notice goes out of date when its day has passed; a message from a colleague never does", () => {
  const sarNote = due("sar-due-soon-s1-craig-20261022", { module: "sar", sourceId: "s1", kind: "due-soon" });
  assert.deepEqual(staleNotificationIds([sarNote], {}, TODAY), [sarNote.id]);
  assert.deepEqual(staleNotificationIds([{ ...sarNote, automated: false }], {}, TODAY), []);
});

t("the screen says how far past the deadline it is, never 'Due in -12 days', and a completed notice says it is completed and why", () => {
  const now = TODAY;
  const view = (over) => formatDue(normalizeNotification({ dueDate: new Date(Date.UTC(2026, 9, 22, 11)), status: "open", ...over }, now));
  assert.equal(view({}), "Overdue by 11 days");
  assert.equal(view({ dueDate: new Date(Date.UTC(2026, 10, 1, 11)) }), "Overdue by 1 day");
  assert.equal(view({ dueDate: new Date(Date.UTC(2026, 10, 2, 11)) }), "Due today");
  assert.equal(view({ dueDate: new Date(Date.UTC(2026, 10, 3, 11)) }), "Due tomorrow");
  assert.equal(view({ dueDate: new Date(Date.UTC(2026, 10, 5, 11)) }), "Due in 3 days");
  assert.equal(view({ dueDate: null }), "No due date");
  assert.equal(view({ status: "completed", completedNote: "The concern has been acknowledged." }), "Completed: The concern has been acknowledged.");
  assert.equal(view({ status: "completed" }), "Completed");
});


// ---- IT laptops ----
const laptopNote = (id, extra = {}) => ({ id, automated: true, module: "laptop", sourceId: "L1", recipientUid: "ann", kind: "due-soon", status: "open", read: false, ...extra });
const NOV2 = new Date(Date.UTC(2026, 10, 2, 9, 0));

t("a laptop reminder is checked against the laptop register", () => {
  assert.equal(DUE_SOURCES.laptop.collection, "it_laptops");
  assert.deepEqual(sourcesToCheck([laptopNote("laptop-update-soon-L1-ann-20261105")]), [{ collection: "it_laptops", id: "L1" }]);
});

t("an update reminder stays while the date stands, and goes once the update is recorded or the date moves", () => {
  const note = laptopNote("laptop-update-soon-L1-ann-20261105");
  const base = { status: "in_use", currentUserUid: "ann", nextUpdateDue: "2026-11-05" };
  assert.deepEqual(staleNotificationIds([note], { "it_laptops/L1": { status: "in_use", data: base } }, NOV2), []);
  assert.deepEqual(staleNotificationIds([note], { "it_laptops/L1": { status: "in_use", data: { ...base, nextUpdateDue: "2027-05-05" } } }, NOV2), [note.id], "update recorded: the next date is months away");
  assert.deepEqual(staleNotificationIds([note], { "it_laptops/L1": "gone" }, NOV2), [note.id]);
  assert.deepEqual(staleNotificationIds([note], { "it_laptops/L1": { status: "decommissioned", data: { ...base, status: "decommissioned" } } }, NOV2), [note.id]);
  assert.deepEqual(staleNotificationIds([note], {}, NOV2), [], "a laptop that could not be read is left alone");
});

t("a return reminder goes once the laptop is back, or the return date moves, or someone else has it", () => {
  const note = laptopNote("laptop-return-soon-L1-ann-20261105");
  const lent = { status: "on_loan", currentUserUid: "", loan: { borrowerUid: "ann", dueBackOn: "2026-11-05" } };
  assert.deepEqual(staleNotificationIds([note], { "it_laptops/L1": { status: "on_loan", data: lent } }, NOV2), []);
  assert.deepEqual(staleNotificationIds([note], { "it_laptops/L1": { status: "spare", data: { status: "spare", currentUserUid: "" } } }, NOV2), [note.id], "returned");
  assert.deepEqual(staleNotificationIds([note], { "it_laptops/L1": { status: "on_loan", data: { ...lent, loan: { borrowerUid: "ann", dueBackOn: "2026-11-20" } } } }, NOV2), [note.id], "extended");
  assert.deepEqual(staleNotificationIds([note], { "it_laptops/L1": { status: "on_loan", data: { ...lent, loan: { borrowerUid: "bob", dueBackOn: "2026-11-05" } } } }, NOV2), [note.id], "lent to someone else");
});

t("a 'due soon' laptop reminder whose day has gone is out of date; an overdue one is not", () => {
  const past = "laptop-update-soon-L1-ann-20261101";
  assert.deepEqual(staleNotificationIds([laptopNote(past)], {}, NOV2), [past]);
  const overdue = laptopNote("laptop-update-overdue-L1-ann-20261101", { kind: "overdue" });
  assert.deepEqual(staleNotificationIds([overdue], { "it_laptops/L1": { status: "in_use", data: { status: "in_use", currentUserUid: "ann", nextUpdateDue: "2026-11-01" } } }, NOV2), []);
});

console.log(`
${n} passed`);
