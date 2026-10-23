// The audit trail for timesheets. Every time a timesheet is created or changed, this writes a permanent entry to timesheet_audit:
// who did it, when (the server's clock), what state it went from and to, the reason if there was one, and what the timesheet said at
// that moment. The browser can't write to timesheet_audit (the rules refuse), so the trail can't be edited or left out, and the
// rules make the "who" honest: every write must name the signed-in person as lastActorUid.

const ACTIONS = {
  "draft>submitted": "submitted",
  "declined>submitted": "resubmitted after a decline",
  "returned>submitted": "resubmitted after payroll returned it",
  "submitted>draft": "taken back by the person to change",
  "submitted>approved": "signed off by the line manager",
  "submitted>declined": "declined by the line manager",
  "approved>sent": "sent to payroll",
  "approved>returned": "returned by the payroll team",
};

const text = (value, max = 300) => String(value ?? "").slice(0, max);

// before / after: the timesheet's data (null when it did not exist / no longer does). Returns the entry to write, or null when nothing
// that matters changed (only the "updated at" stamp, for instance).
function buildAuditEntry(before, after, { id = "" } = {}) {
  if (!before && !after) return null;
  if (!after) return { timesheetId: id, periodId: before.periodId || "", staffId: before.staffId || "", staffUid: before.uid || "", managerUid: before.managerUid || null, staffName: text(before.staffName, 100), action: "deleted", fromState: before.state || "", toState: "", actorUid: "", actorName: "", reason: "" };
  const from = before?.state || "";
  const to = after.state || "";
  const meaningful = !before || from !== to || JSON.stringify(before.lines || []) !== JSON.stringify(after.lines || []) || before.kind !== after.kind || JSON.stringify(before.declaration || null) !== JSON.stringify(after.declaration || null);
  if (!meaningful) return null;
  const action = !before ? (to === "submitted" ? "created and submitted" : "started") : ACTIONS[`${from}>${to}`] || (from === to ? "changed" : `moved from ${from} to ${to}`);
  const decision = after.decision || {};
  const payroll = after.payroll || {};
  const reason = to === "declined" ? decision.reason : to === "returned" ? payroll.reason : "";
  return {
    timesheetId: id, periodId: after.periodId || "", staffId: after.staffId || "", staffUid: after.uid || "", managerUid: after.managerUid || null, staffName: text(after.staffName, 100),
    action, fromState: from, toState: to, actorUid: text(after.lastActorUid, 128), actorName: text(after.lastActorName, 100), reason: text(reason),
    reference: to === "sent" ? text(payroll.reference, 100) : "",
    kind: after.kind || "", expectedHours: Number(after.expected?.hours) || 0, totals: after.totals || {}, lines: Array.isArray(after.lines) ? after.lines.slice(0, 120) : [], declaration: after.declaration || null, submissions: Number(after.submissions) || 0,
  };
}

module.exports = { buildAuditEntry, ACTIONS };
