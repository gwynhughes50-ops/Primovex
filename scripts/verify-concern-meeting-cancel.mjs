// Covers cancelling a face-to-face meeting on a concern: the reasons, what is saved, what goes into the case history and the audit trail, and that it is wired into the screen, the print and the ledger.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MEETING_CANCEL_REASONS, cancelFields, cancelProblem, cancelReasonLabel, cancelTimelineMessage, cancelledText, isCancelled } from "../src/modules/governance/concernMeetings.js";
import { auditRows } from "../src/modules/governance/concernAudit.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const meeting = { id: "m1", concernId: "c1", requestedDate: "2026-11-09", requestedBy: "Their relative or representative", bookedDate: "2026-11-18", bookedTime: "15:00" };
const actor = { uid: "liz-uid", displayName: "Liz" };

t("the reasons are a fixed list: nothing is typed", () => {
  assert.deepEqual(MEETING_CANCEL_REASONS.map((r) => r.key), ["patient_cancelled", "no_reply", "staff_unavailable", "rearranged", "no_longer_needed", "other"]);
  for (const r of MEETING_CANCEL_REASONS) assert.ok(r.label.length > 5 && cancelReasonLabel(r.key) === r.label);
  assert.equal(cancelReasonLabel("made up"), "");
});

t("a meeting can be cancelled once, and only with a reason from the list", () => {
  assert.equal(cancelProblem(meeting, "staff_unavailable"), "");
  assert.match(cancelProblem(meeting, ""), /Choose a reason/);
  assert.match(cancelProblem(meeting, "because I said so"), /Choose a reason/);
  assert.match(cancelProblem(null, "other"), /could not be found/);
  assert.match(cancelProblem({ ...meeting, cancelled: true }, "other"), /already been cancelled/);
  assert.equal(isCancelled({ cancelled: true }), true);
  assert.equal(isCancelled(meeting), false);
});

t("what is saved on the meeting: cancelled, the reason (key and words) and who", () => {
  assert.deepEqual(cancelFields("patient_cancelled", actor), { cancelled: true, cancelReasonKey: "patient_cancelled", cancelReason: "The patient or their representative asked to cancel", cancelledByUid: "liz-uid", cancelledByName: "Liz" });
  assert.equal(cancelFields("other", {}).cancelledByName, "Unknown");
});

t("what the case history says, and that it becomes a row in the audit trail and the printed audit table", () => {
  const message = cancelTimelineMessage(meeting, "staff_unavailable");
  assert.equal(message, "It was booked for 18/11/2026 at 15:00. Cancelled: The staff who were to attend were not available.");
  assert.equal(cancelTimelineMessage({ ...meeting, bookedDate: "", bookedTime: "" }, "no_reply"), "It had not been booked yet. Cancelled: No reply from the patient or their representative.");
  const when = new Date(2026, 10, 12, 11, 30);
  const rows = auditRows([{ type: "meeting", title: "Face-to-face meeting cancelled", message, actorName: "Liz", createdAt: when }]);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], { when: "12/11/2026 11:30", who: "Liz", what: "Face-to-face meeting cancelled", detail: message });
});

t("how a cancelled meeting reads on the case and the print: who, when and why, or nothing for a live meeting", () => {
  const cancelled = { ...meeting, ...cancelFields("rearranged", actor), cancelledAt: { toDate: () => new Date(2026, 10, 12, 9, 0) } };
  assert.equal(cancelledText(cancelled), "Cancelled on 12/11/2026 by Liz. Reason: Being rearranged for another date.");
  assert.equal(cancelledText({ ...cancelled, cancelledAt: null }), "Cancelled by Liz. Reason: Being rearranged for another date.");
  assert.equal(cancelledText(meeting), "");
});

t("it is wired in: the service saves it and writes the case history and the ledger, a cancelled meeting is not editable, and the status says Cancelled", () => {
  const service = read("src/modules/governance/services/concernService.js");
  const block = service.slice(service.indexOf("export async function cancelConcernMeeting"), service.indexOf("export function subscribeConcernMeetings"));
  assert.match(block, /cancelProblem\(meeting, reasonKey\)/);
  assert.match(block, /updateDoc\(doc\(db, CONCERN_MEETINGS_COLLECTION, meeting\.id\), \{ \.\.\.cancelFields\(reasonKey, actor\), cancelledAt: serverTimestamp\(\)/);
  assert.match(block, /title: "Face-to-face meeting cancelled"/);
  assert.match(block, /message: cancelTimelineMessage\(meeting, reasonKey\)/);
  assert.match(block, /recordAudit\(concernEvent\("meeting_cancelled"/);
  assert.match(service, /if \(isCancelled\(meeting\)\) return \{ key: "cancelled", label: "Cancelled"/);
  assert.match(service, /A cancelled meeting can't be edited/);
  assert.match(read("src/modules/audit/auditEvents.js"), /case "meeting_cancelled"/);
});

t("the screen: the concerns team gets Cancel meeting with a reason list and a second step; a cancelled meeting offers a new one instead of Edit", () => {
  const screen = read("src/modules/governance/components/ConcernMeetings.jsx");
  assert.match(screen, /Cancel meeting<\/button>/);
  assert.match(screen, /Why is the meeting being cancelled\?/);
  assert.match(screen, /MEETING_CANCEL_REASONS\.map/);
  assert.match(screen, /Keep the meeting/);
  assert.match(screen, /disabled=\{busy \|\| !cancelling\.reasonKey\}/, "the button waits for a reason");
  assert.match(screen, /isCancelled\(meeting\) \? \(\s*<button[\s\S]{0,200}Arrange a new meeting/);
  assert.match(screen, /isTeam && !form && !cancelling/, "only the concerns team");
});

t("the printed summary shows who cancelled a meeting, when and why", () => {
  const print = read("src/modules/governance/services/concernPrint.js");
  assert.match(print, /meeting\.cancelled \? `<p><strong>\$\{esc\(cancelledText\(meeting\)\)\}<\/strong><\/p>`/);
});

console.log(`\n${n} passed`);
