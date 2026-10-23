// Payroll queries on a timesheet (a thread between the payroll team and the person or their line manager), and the details the payroll
// desk reads on each timesheet. The server does three things the browser cannot be trusted with:
//   - writes every step of a query to timesheet_audit (who, when, what was said), so it can be printed with the rest of the history
//   - tells the other side at once (a notification)
//   - copies the person's teams, job title and line manager's name onto their timesheet, because the payroll team may not read the staff
//     register itself

const ACTIONS = {
  raised: { person: "query raised with the person", manager: "query raised with the line manager" },
  reply: "replied to the query",
  resolved: "query marked as resolved",
  reopened: "query reopened",
};

const text = (value, max = 300) => String(value ?? "").slice(0, max);

// message: a timesheet_query_messages record, query: its timesheet_queries record, sheet: the timesheet. Returns the audit entry to write.
function queryAuditEntry(message, query, sheet, { id = "" } = {}) {
  if (!message || !query) return null;
  const action = message.kind === "raised" ? ACTIONS.raised[query.to] || ACTIONS.raised.person : ACTIONS[message.kind] || text(message.kind, 40);
  const s = sheet || {};
  return {
    timesheetId: text(query.timesheetId || message.timesheetId, 200), periodId: s.periodId || query.periodId || "", staffId: s.staffId || query.staffId || "", staffUid: s.uid || query.staffUid || "",
    managerUid: s.managerUid || query.managerUid || null, staffName: text(s.staffName || query.staffName, 100),
    action, fromState: s.state || "", toState: s.state || "", actorUid: text(message.authorUid, 128), actorName: text(message.authorName, 100), reason: "",
    query: { id: id || text(message.queryId, 200), event: text(message.kind, 20), text: text(message.text, 1000), to: query.to === "manager" ? "manager" : "person", toName: text(query.toName, 100) },
    kind: s.kind || "", expectedHours: Number(s.expected?.hours) || 0, totals: s.totals || {}, lines: Array.isArray(s.lines) ? s.lines.slice(0, 120) : [], declaration: s.declaration || null, submissions: Number(s.submissions) || 0,
  };
}

const excerpt = (value) => { const t = String(value ?? "").replace(/\s+/g, " ").trim(); return t.length > 140 ? `${t.slice(0, 137)}...` : t; };

// the other side of the thread is told: [{ uid, id, kind, title, message, priority, actionUrl }]
function queryNotices(message, query, messageId = "") {
  if (!message || !query) return [];
  const author = message.authorUid;
  const other = author === query.raisedByUid ? query.toUid : query.raisedByUid;
  if (!other || other === author) return [];
  const who = text(message.authorName, 100) || "Someone";
  const about = query.staffName ? `${query.staffName}'s timesheet` : "a timesheet";
  const base = { uid: other, id: `ts-query-${messageId || query.timesheetId}-${message.kind}`, kind: "timesheet-query", actionUrl: "/my-timesheet" };
  if (message.kind === "raised") return [{ ...base, title: "Payroll has a query", message: `${who} has a query about ${query.to === "manager" ? about : "your timesheet"}: “${excerpt(message.text)}”. Please reply.`, priority: "high" }];
  if (message.kind === "reply") return [{ ...base, title: "Reply to a timesheet query", message: `${who} replied about ${about}: “${excerpt(message.text)}”.`, priority: "routine" }];
  if (message.kind === "resolved") return [{ ...base, title: "Timesheet query resolved", message: `${who} marked the query about ${about} as resolved${message.text ? `: “${excerpt(message.text)}”` : ""}.`, priority: "routine" }];
  if (message.kind === "reopened") return [{ ...base, title: "Timesheet query reopened", message: `${who} reopened the query about ${about}${message.text ? `: “${excerpt(message.text)}”` : ""}. Please reply.`, priority: "high" }];
  return [];
}

// What to copy onto a timesheet from the staff register, or null when it already says the same. staffById: Map of staff id to record.
function enrichment(sheet, staffById) {
  if (!sheet?.staffId) return null;
  const person = staffById.get(sheet.staffId);
  if (!person) return null;
  const manager = person.managerId ? staffById.get(person.managerId) : null;
  const next = {
    teams: (Array.isArray(person.teams) ? person.teams : []).map((t) => text(t, 80)).filter(Boolean).slice(0, 12),
    jobTitle: text(person.jobTitle, 100),
    managerName: text(manager?.name || "", 100),
  };
  const same = JSON.stringify(sheet.teams || []) === JSON.stringify(next.teams) && (sheet.jobTitle || "") === next.jobTitle && (sheet.managerName || "") === next.managerName;
  return same ? null : next;
}

module.exports = { queryAuditEntry, queryNotices, enrichment, ACTIONS };
