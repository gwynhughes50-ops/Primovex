import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DESK_STATUS, QUERY_STATUS, buildQuery, canReopen, canReply, canResolve, deskCsv, deskOptions, deskRows, deskSummary, filterDesk, openQueries, queriesFor, queryAction, queryHeading, queryText,
  queryTextProblem, raiseProblem, stampText, threadOf,
} from "../src/modules/timesheets/timesheetPayroll.js";
import { auditHtml, historySteps } from "../src/modules/timesheets/timesheetAudit.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const sheet = (id, name, state, extra = {}) => ({
  id, periodId: "p1", staffId: `s-${id}`, uid: `u-${id}`, staffName: name, payrollNo: "", managerUid: "m1", managerName: "Pat Manager", teams: ["Reception"], jobTitle: "Receptionist", state, kind: "no-change", totals: {}, lines: [],
  declaration: { confirmedAt: "2026-10-23T09:00:00Z", confirmedByName: name, text: "I confirm" }, decision: { outcome: "approved", by: "Pat Manager", byUid: "m1", at: "2026-10-24T10:30:00Z" }, submissions: 1, ...extra,
});
const sheets = [
  sheet("1", "Ann Example", "approved", { payrollNo: "1001", kind: "changes", totals: { B: 1, C: 1 }, lines: [{ date: "2026-10-22", code: "B", hours: 1, comment: "late clinic" }] }),
  sheet("2", "Bob Other", "sent", { payrollNo: "1002", teams: ["Nursing", "Clinical"], managerName: "Sue Lead", managerUid: "m2", decision: { by: "Sue Lead", at: "2026-10-24T11:00:00Z" } }),
  sheet("3", "Cat Third", "returned", { payrollNo: "1003", teams: ["Reception"], totals: { A: 7.5 }, kind: "changes" }),
  sheet("4", "Dan Fourth", "submitted"),
  sheet("5", "Eve Fifth", "approved", { periodId: "p0", payrollNo: "1005" }),
];
const queries = [
  { id: "q1", timesheetId: "1", status: "open", to: "person", raisedByUid: "pay1", raisedByName: "Sam Payroll", toUid: "u-1", toName: "Ann Example", staffName: "Ann Example", subject: "Was the overtime agreed?", createdAt: { seconds: 200 } },
  { id: "q2", timesheetId: "1", status: "resolved", to: "manager", raisedByUid: "pay1", raisedByName: "Sam Payroll", toUid: "m1", toName: "Pat Manager", subject: "Who approved it?", createdAt: { seconds: 100 } },
  { id: "q3", timesheetId: "3", status: "open", to: "person", raisedByUid: "pay1", subject: "x", createdAt: { seconds: 300 } },
];

t("the desk lists signed-off timesheets for the period with the manager's stamp, the declaration and what was claimed", () => {
  const rows = deskRows(sheets, { periodId: "p1", queries, mileageByUid: { "u-1": 1350 } });
  assert.deepEqual(rows.map((r) => r.name), ["Ann Example", "Bob Other", "Cat Third"], "this period only, signed off only, by name");
  const ann = rows[0];
  assert.equal(ann.signedOffBy, "Pat Manager");
  assert.equal(ann.signedOffAt, "2026-10-24T10:30:00Z");
  assert.equal(ann.declaredBy, "Ann Example");
  assert.equal(ann.declaredAt, "2026-10-23T09:00:00Z");
  assert.equal(ann.mileagePence, 1350);
  assert.deepEqual([ann.totals.B, ann.totals.C, ann.totals.A], [1, 1, 0]);
  assert.match(ann.details, /Overtime, standard rate 1h on 22\/10 \(late clinic\)/);
  assert.equal(ann.openQueries, 1);
  assert.equal(ann.queries.length, 2);
  assert.equal(rows[1].manager, "Sue Lead");
  assert.equal(deskRows([{ ...sheets[0], managerName: "", teams: undefined }], {})[0].manager, "Pat Manager", "falls back to whoever signed it off");
  assert.deepEqual(deskRows([{ ...sheets[0], teams: undefined }], {})[0].teams, []);
});

t("searching finds people by name, payroll number, team, manager or job title, and every word must match", () => {
  const rows = deskRows(sheets, { periodId: "p1", queries });
  const find = (f) => filterDesk(rows, { status: "all", ...f }).map((r) => r.name);
  assert.deepEqual(find({ search: "ann" }), ["Ann Example"]);
  assert.deepEqual(find({ search: "1002" }), ["Bob Other"]);
  assert.deepEqual(find({ search: "nursing" }), ["Bob Other"]);
  assert.deepEqual(find({ search: "sue" }), ["Bob Other"]);
  assert.deepEqual(find({ search: "RECEPTIONIST" }), ["Ann Example", "Bob Other", "Cat Third"], "job title, any case");
  assert.deepEqual(find({ search: "ann reception" }), ["Ann Example"], "both words together");
  assert.deepEqual(find({ search: "ann nursing" }), [], "a word that does not match removes the person");
  assert.deepEqual(find({ search: "  " }), ["Ann Example", "Bob Other", "Cat Third"], "a blank search shows everyone signed off");
});

t("the desk only ever lists timesheets that have been signed off", () => {
  const rows = deskRows(sheets, { periodId: "p1" });
  assert.ok(!rows.some((r) => r.name === "Dan Fourth"), "one still with the line manager is not on the desk");
  assert.ok(!deskRows(sheets, {}).some((r) => r.name === "Dan Fourth"), "in any period");
  assert.deepEqual(DESK_STATUS.map((s) => s.value), ["toSend", "sent", "returned", "all"]);
  assert.deepEqual(filterDesk(rows, { status: "toSend" }).map((r) => r.name), ["Ann Example"]);
  assert.deepEqual(filterDesk(rows, { status: "sent" }).map((r) => r.name), ["Bob Other"]);
  assert.deepEqual(filterDesk(rows, { status: "returned" }).map((r) => r.name), ["Cat Third"]);
});

t("people can be grouped by team or by line manager, and shown only when they have open queries", () => {
  const rows = deskRows(sheets, { periodId: "p1", queries });
  assert.deepEqual(filterDesk(rows, { team: "Reception" }).map((r) => r.name), ["Ann Example", "Cat Third"]);
  assert.deepEqual(filterDesk(rows, { team: "Clinical" }).map((r) => r.name), ["Bob Other"], "a person in two teams is in both");
  assert.deepEqual(filterDesk(rows, { manager: "Sue Lead" }).map((r) => r.name), ["Bob Other"]);
  assert.deepEqual(filterDesk(rows, { team: "Reception", manager: "Pat Manager" }).map((r) => r.name), ["Ann Example", "Cat Third"]);
  assert.deepEqual(filterDesk(rows, { withQueries: true }).map((r) => r.name), ["Ann Example", "Cat Third"], "a resolved query does not count");
  const options = deskOptions(rows);
  assert.deepEqual(options.teams, [{ value: "Clinical", n: 1 }, { value: "Nursing", n: 1 }, { value: "Reception", n: 2 }]);
  assert.deepEqual(options.managers, [{ value: "Pat Manager", n: 2 }, { value: "Sue Lead", n: 1 }]);
});

t("the figures at the top add up what is on the desk", () => {
  const rows = deskRows(sheets, { periodId: "p1", queries });
  assert.deepEqual(deskSummary(filterDesk(rows, { status: "all" })), { people: 3, toSend: 1, sent: 1, returned: 1, openQueries: 2, overtime: 2, leave: 7.5 });
});

t("the CSV of what is on the desk has the manager's stamp and the open queries, with the search applied", () => {
  const rows = filterDesk(deskRows(sheets, { periodId: "p1", queries, mileageByUid: { "u-1": 1350 } }), { search: "ann" });
  const lines = deskCsv(rows, "October").split("\r\n");
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^Pay period,Name,Payroll no,Teams,Line manager,Signed off by,Signed off at,Where it stands,Declaration,A Sick leave \(h\)/);
  assert.match(lines[1], /^October,Ann Example,1001,Reception,Pat Manager,Pat Manager,24\/10\/2026 \d\d:\d\d,To send to payroll,Changes,0,1,1,0,0,0,13\.50,1,/);
});

t("a query can be raised only on a signed-off timesheet, with the person or the line manager the timesheet names", () => {
  const ann = sheets[0];
  assert.equal(raiseProblem({ sheet: ann, to: "person", text: "Was the overtime agreed?" }), "");
  assert.equal(raiseProblem({ sheet: ann, to: "manager", text: "Who approved it?" }), "");
  assert.match(raiseProblem({ sheet: ann, to: "someone", text: "Hello there" }), /Choose who the query is for/);
  assert.match(raiseProblem({ sheet: { ...ann, managerUid: null }, to: "manager", text: "Hello there" }), /no line manager/);
  assert.match(raiseProblem({ sheet: sheets[3], to: "person", text: "Hello there" }), /signed off/);
  assert.match(raiseProblem({ sheet: ann, to: "person", text: "hi" }), /Say what you need to know/);
  assert.match(raiseProblem({ sheet: null, to: "person", text: "Hello there" }), /Choose a timesheet/);
  const person = buildQuery({ sheet: ann, to: "person", text: "  Was the overtime   agreed?  ", uid: "pay1", name: "Sam Payroll" });
  assert.equal(person.toUid, "u-1");
  assert.equal(person.toName, "Ann Example");
  assert.equal(person.staffUid, "u-1");
  assert.equal(person.managerUid, "m1");
  assert.equal(person.subject, "Was the overtime agreed?");
  assert.equal(person.status, "open");
  assert.equal(person.raisedByUid, "pay1");
  const manager = buildQuery({ sheet: ann, to: "manager", text: "Who approved it?", uid: "pay1", name: "Sam Payroll" });
  assert.equal(manager.toUid, "m1");
  assert.equal(manager.toName, "Pat Manager");
});

t("messages are checked in words, cut to length, and a resolution note may be empty", () => {
  assert.equal(queryTextProblem("Was it agreed?", { kind: "reply" }), "");
  assert.equal(queryTextProblem("", { kind: "reply" }), "Write your reply.");
  assert.equal(queryTextProblem("", { kind: "resolved" }), "", "a note is optional when resolving");
  assert.match(queryTextProblem("x".repeat(1001), { kind: "reply" }), /too long/);
  assert.equal(queryText("  a   b \n c  "), "a b c");
  assert.equal(queryText("y".repeat(2000)).length, 1000);
});

t("who can do what to a query: replies from either side while open; only whoever raised it closes or reopens it", () => {
  const open = queries[0];
  const resolved = queries[1];
  assert.ok(canReply(open, "pay1") && canReply(open, "u-1"));
  assert.ok(!canReply(open, "someone-else"), "a third person cannot join in");
  assert.ok(!canReply(resolved, "pay1") && !canReply(resolved, "m1"), "no replies once it is resolved");
  assert.ok(canResolve(open, "pay1"));
  assert.ok(!canResolve(open, "u-1"), "the person who was asked cannot close it");
  assert.ok(!canResolve(resolved, "pay1"));
  assert.ok(canReopen(resolved, "pay1"));
  assert.ok(!canReopen(resolved, "m1"));
  assert.ok(!canReopen(open, "pay1"));
  assert.ok(!canResolve(open, ""));
});

t("threads and queries are ordered, counted and named", () => {
  assert.deepEqual(threadOf([{ id: "b", createdAt: { seconds: 20 } }, { id: "a", createdAt: { seconds: 10 } }, { id: "c", createdAtMs: 30000 }]).map((m) => m.id), ["a", "b", "c"]);
  assert.equal(threadOf([{ id: "pending", createdAt: null }, { id: "a", createdAt: { seconds: 1 } }])[1].id, "pending", "a message still being saved goes last");
  assert.deepEqual(queriesFor(queries, "1").map((q) => q.id), ["q1", "q2"], "newest first");
  assert.deepEqual(openQueries(queries).map((q) => q.id), ["q1", "q3"]);
  assert.equal(queryHeading(queries[0]), "Sam Payroll asked Ann Example");
  assert.equal(queryHeading(queries[1]), "Sam Payroll asked Pat Manager (the line manager)");
  assert.equal(queryAction("raised", "manager"), "query raised with the line manager");
  assert.equal(queryAction("resolved"), "query marked as resolved");
  assert.equal(stampText("2026-10-24T10:30:00Z").length, 16);
  assert.equal(stampText("rubbish"), "");
});

t("query steps appear in the timesheet's history and print, with who said what and when, and are escaped", () => {
  const e = (id, seconds, action, query, extra = {}) => ({ id, at: { seconds }, actorName: "Sam Payroll", action, kind: "changes", lines: [], totals: {}, query, ...extra });
  const steps = historySteps([
    e("1", 100, "signed off by the line manager", null, { actorName: "Pat Manager" }),
    e("2", 200, "query raised with the person", { id: "q1", event: "raised", text: "Was <b>this</b> agreed?", to: "person", toName: "Ann Example" }),
    e("3", 300, "replied to the query", { id: "q1", event: "reply", text: "Yes, with Dr Smith", to: "person" }, { actorName: "Ann Example" }),
    e("4", 400, "query marked as resolved", { id: "q1", event: "resolved", text: "", to: "person" }),
  ]);
  assert.equal(steps[1].query.text, "Was <b>this</b> agreed?");
  assert.equal(steps[0].query, null);
  assert.deepEqual(steps.map((s) => s.changes.length), [0, 0, 0, 0], "a query never shows as a change to the hours");
  const html = auditHtml({ sheet: { staffName: "Ann Example", state: "approved", lines: [] }, steps, printedBy: "Sam Payroll" });
  assert.match(html, /query raised with the person/);
  assert.match(html, /Query:<\/b> Was &lt;b&gt;this&lt;\/b&gt; agreed\? <span class="was">\(asked of Ann Example\)/);
  assert.match(html, /Reply:<\/b> Yes, with Dr Smith/);
  assert.match(html, /Resolution note:<\/b> none given/);
  assert.ok(!html.includes("<b>this</b>"));
});

t("the database rules: only payroll raises a query, only the two sides write to it, messages are never changed, only the raiser closes it", () => {
  const rules = read("firestore.rules");
  const block = rules.slice(rules.indexOf("match /timesheet_queries/"), rules.indexOf("match /timesheet_query_messages/") + 3000);
  assert.match(block, /allow create: if tsPayroll\(\)/);
  assert.match(block, /raisedByUid == request\.auth\.uid/);
  assert.match(block, /state in \["approved", "sent", "returned"\]/);
  assert.match(block, /to == "manager" && request\.resource\.data\.managerUid != null && request\.resource\.data\.toUid == request\.resource\.data\.managerUid/);
  assert.match(block, /allow update: if signedIn\(\) && \(resource\.data\.raisedByUid == request\.auth\.uid \|\| isAdmin\(\)\)/);
  assert.match(block, /affectedKeys\(\)\.hasOnly\(\["status", "updatedAt", "resolvedAt", "resolvedByUid", "resolvedByName", "resolution", "lastMessageId"\]\)/);
  assert.match(block, /a change of status always comes with the message/, "closing or reopening needs the message that says why, in the same batch");
  assert.match(block, /allow delete: if false/);
  assert.match(block, /allow update, delete: if false/, "messages can never be changed or removed");
  assert.match(block, /createdAt == request\.time/, "the time on a message is the server's");
  assert.match(block, /authorUid == request\.auth\.uid/, "who said it is the signed-in person");
});

t("the server writes each step to the trail and tells the other side, and copies teams onto timesheets", () => {
  const index = read("functions/index.js");
  assert.match(index, /exports\.auditTimesheetQueries = onDocumentCreated\(\{ document: "timesheet_query_messages\/\{messageId\}"/);
  assert.match(index, /queryAuditEntry\(message, query/);
  assert.match(index, /queryNotices\(message, query/);
  assert.match(index, /enrichment\(/);
});

t("the screens: the payroll tab is the desk, with search, team and manager filters, queries and the audit print; people and managers see queries addressed to them", () => {
  const page = read("src/pages/MyTimesheet.jsx");
  assert.match(page, /<PayrollDesk canSend=\{canPayroll\} \/>/);
  const desk = read("src/modules/timesheets/PayrollDesk.jsx");
  for (const text of ["Search", "All teams", "All managers", "Open queries only", "Raise a query", "Print the audit", "Signed off by", "Download CSV of these"]) assert.ok(desk.includes(text), text);
  assert.match(desk, /useSheets\("payroll"\)/);
  const panels = read("src/modules/timesheets/TimesheetPanels.jsx");
  assert.match(panels, /<QueriesInbox scope="person" skin=\{skin\} \/>/);
  assert.match(panels, /<QueriesInbox scope="manager" skin=\{skin\} \/>/);
  const thread = read("src/modules/timesheets/QueryThread.jsx");
  for (const text of ["Mark as resolved", "Open it again", "Send reply", "Send the query"]) assert.ok(thread.includes(text), text);
});

t("the payroll desk keeps every hook above its early returns", () => {
  const src = read("src/modules/timesheets/PayrollDesk.jsx");
  const start = src.indexOf("export default function PayrollDesk");
  const end = src.indexOf("\nfunction FragmentRow");
  const body = src.slice(start, end);
  const early = body.search(/\n {2}if \(.*\) return /);
  assert.ok(early > 0, "the early returns were found");
  assert.ok(!/\buse(State|Memo|Effect|Auth|Sheets|Periods|Queries|Claims|Places)\(/.test(body.slice(early)), "a hook is called after an early return");
});

console.log(`\n${n} passed`);
