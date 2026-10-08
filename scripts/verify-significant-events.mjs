import assert from "node:assert/strict";
import * as M from "../src/modules/governance/seModel.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const NOW = Date.parse("2026-10-08T12:00:00Z");

t("a report needs a title, what happened and a date; a patient needs an identifier, never a name", () => {
  assert.match(M.validateReport({}), /title/);
  assert.match(M.validateReport({ title: "x" }), /what happened/);
  assert.match(M.validateReport({ title: "x", description: "y" }), /date/);
  assert.match(M.validateReport({ title: "x", description: "y", eventDate: "2999-01-01" }), /future/);
  assert.match(M.validateReport({ title: "x", description: "y", eventDate: "2026-10-01", patientInvolved: true }), /EMIS number/);
  assert.equal(M.validateReport({ title: "x", description: "y", eventDate: "2026-10-01", patientInvolved: true, patientInitials: "AB" }), "");
  assert.equal(M.validateReport({ title: "x", description: "y", eventDate: "2026-10-01" }), "");
});

t("normalising keeps identifiers only when a patient was involved, and trims and bounds text", () => {
  const a = M.normaliseReport({ title: " T ", description: "d", eventDate: "2026-10-01", patientInvolved: false, emisNumber: "123", patientInitials: "ab" });
  assert.equal(a.emisNumber, "");
  assert.equal(a.patientInitials, "");
  const b = M.normaliseReport({ title: "T", description: "d", eventDate: "2026-10-01", patientInvolved: true, patientInitials: "ab", dateOfBirth: "1990-01-01", category: "nonsense", harm: "huge" });
  assert.equal(b.patientInitials, "AB");
  assert.equal(b.dateOfBirth, "1990-01-01");
  assert.equal(b.category, "other");
  assert.equal(b.harm, "none");
  assert.equal(M.normaliseReport({ title: "x".repeat(500), description: "d", eventDate: "2026-10-01" }).title.length, 120);
  assert.equal(M.normaliseReport({ title: "T", description: "d", eventDate: "2026-10-01", patientInvolved: true, emisNumber: "9", dateOfBirth: "1990-01-01" }).dateOfBirth, "", "DOB only when there is no EMIS number");
});

t("the flow: reported -> investigate or not -> review -> meeting -> actions -> closed", () => {
  const ids = (status, ctx) => M.nextSteps({ status }, ctx).map((s) => s.id);
  assert.deepEqual(ids("reported"), ["investigate", "no_investigation"]);
  assert.deepEqual(ids("investigating"), ["investigation_done", "close_without_meeting"]);
  assert.deepEqual(ids("in_review"), ["ready_for_meeting", "close_without_meeting"]);
  assert.deepEqual(ids("awaiting_meeting"), ["close_without_meeting"]);
  assert.deepEqual(ids("actions_open"), ["close"]);
  assert.deepEqual(ids("closed"), ["reopen"]);
  assert.equal(M.nextSteps({ status: "reported" })[1].needsReason, true, "skipping the investigation needs a reason");
});

t("an event with open actions can't be closed", () => {
  const close = M.nextSteps({ status: "actions_open" }, { openActions: 2 })[0];
  assert.equal(close.blocked, true);
  assert.match(close.label, /2 actions still open/);
  assert.equal(M.nextSteps({ status: "actions_open" }, { openActions: 0 })[0].blocked, false);
});

t("reviews: progress and the practice's default reviewers", () => {
  const p = M.reviewProgress([{ status: "submitted" }, { status: "requested" }]);
  assert.deepEqual(p, { total: 2, submitted: 1, waiting: 1, complete: false });
  assert.equal(M.reviewProgress([]).complete, false);
  assert.equal(M.reviewProgress([{ status: "submitted" }]).complete, true);
  const staff = [{ id: "a", label: "A", role: "Practice Manager" }, { id: "b", label: "B", role: "Reception" }, { id: "c", label: "C", role: "Partner" }];
  assert.deepEqual(M.defaultReviewers(staff, ["Practice Manager", "Partner"]).map((s) => s.id), ["a", "c"]);
  assert.deepEqual(M.defaultReviewers(staff, ["Practice Manager", "Partner"], ["a"]).map((s) => s.id), ["c"]);
  assert.deepEqual(M.defaultReviewers(staff, []), []);
  assert.equal(M.reviewDocId("se1", "u1"), "se1_u1");
  assert.match(M.validateReview({}), /what you think/);
});

t("actions need a task and an owner; overdue and due-soon show", () => {
  assert.match(M.validateAction({}), /what needs/);
  assert.match(M.validateAction({ title: "x" }), /who/);
  assert.equal(M.validateAction({ title: "x", ownerUid: "u" }), "");
  assert.equal(M.actionTone({ status: "done" }, NOW).id, "done");
  assert.equal(M.actionTone({ status: "open", dueDate: "2026-10-01" }, NOW).id, "overdue");
  assert.equal(M.actionTone({ status: "open", dueDate: "2026-10-12" }, NOW).id, "soon");
  assert.equal(M.actionTone({ status: "open", dueDate: "2026-12-01" }, NOW).id, "open");
  assert.equal(M.actionTone({ status: "open" }, NOW).label, "No due date");
});

t("numbers for the dashboard", () => {
  const events = [{ status: "reported" }, { status: "awaiting_meeting" }, { status: "closed" }, { status: "in_review" }];
  const actions = [{ status: "open", dueDate: "2026-10-01" }, { status: "done", dueDate: "2026-10-01" }];
  assert.deepEqual(M.seMetrics(events, actions, NOW), { open: 3, toTriage: 1, awaitingMeeting: 1, overdueActions: 1 });
});

t("minutes read back as plain text with events by reference and title only", () => {
  const text = M.minutesText(
    { title: "October SE meeting", meetingDate: "2026-10-08", chairName: "Gwyn", attendeeNames: ["Gwyn", "Liz"], apologies: "Craig", minutes: "Agenda agreed.", discussion: { e1: "Agreed a new checklist." } },
    [{ id: "e1", reference: "SE-2026-1008", title: "Wrong vaccine drawn up" }],
    [{ seId: "e1", title: "Update checklist", ownerName: "Liz", dueDate: "2026-11-01" }, { title: "Review meeting dates", ownerName: "Gwyn" }]
  );
  assert.match(text, /Present: Gwyn, Liz/);
  assert.match(text, /SE-2026-1008 Wrong vaccine drawn up/);
  assert.match(text, /- Update checklist \(Liz, due 2026-11-01\)/);
  assert.match(text, /Other actions:\n- Review meeting dates \(Gwyn\)/);
});

t("stage names and references", () => {
  assert.equal(M.stageLabel("awaiting_meeting"), "Awaiting meeting");
  assert.equal(M.createSeReference(new Date(2026, 9, 8, 14, 5)), "SE-2026-10081405");
  assert.equal(M.SE_STAGES.length, 6);
});

console.log(`\n${n} passed`);
