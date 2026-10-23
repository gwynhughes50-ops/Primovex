// The payroll desk: the signed-off timesheets as the payroll team reads them, how they are searched and grouped, and the queries payroll raises
// with a person or their line manager. Pure (no Firestore, no screens) so it can be tested.
//
// A query is a thread on one timesheet. Payroll raises it with the person or with their line manager; whoever it is raised with replies;
// whoever raised it marks it resolved (and can reopen it). Every message is kept as it was written, with who and when, and the server also
// writes each step to the timesheet's audit trail, so "who asked what, who answered, when it was resolved" can be printed.

import { CODES, STATE, describeLines } from "./timesheet.js";

const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const lower = (v) => clean(v).toLowerCase();

// ---- queries -------------------------------------------------------------------------------------------------------------------

export const QUERY_STATUS = { open: "open", resolved: "resolved" };
export const QUERY_TO = { person: "person", manager: "manager" };
export const MIN_QUERY_TEXT = 3;
export const MAX_QUERY_TEXT = 1000;

// the kinds of step in a thread; every one is a message that can never be changed afterwards
export const QUERY_KINDS = { raised: "raised", reply: "reply", resolved: "resolved", reopened: "reopened" };

export const QUERY_ACTION = {
  raised: { person: "query raised with the person", manager: "query raised with the line manager" },
  reply: "replied to the query",
  resolved: "query marked as resolved",
  reopened: "query reopened",
};
export const queryAction = (kind, to) => (kind === "raised" ? QUERY_ACTION.raised[to] || QUERY_ACTION.raised.person : QUERY_ACTION[kind] || kind);

// what is wrong with a message, in words ("" when it is fine). A resolution note can be left out; everything else needs words.
export function queryTextProblem(text, { kind = "reply" } = {}) {
  const t = clean(text);
  if (kind === "resolved" && !t) return "";
  if (t.length < MIN_QUERY_TEXT) return kind === "raised" ? "Say what you need to know (a few words at least)." : kind === "resolved" ? "" : "Write your reply.";
  if (t.length > MAX_QUERY_TEXT) return `That is too long: keep it under ${MAX_QUERY_TEXT} letters.`;
  return "";
}
export const queryText = (text) => clean(text).slice(0, MAX_QUERY_TEXT);

export function raiseProblem({ sheet, to, text }) {
  if (!sheet?.id) return "Choose a timesheet.";
  if (to !== QUERY_TO.person && to !== QUERY_TO.manager) return "Choose who the query is for: the person or their line manager.";
  if (to === QUERY_TO.manager && !sheet.managerUid) return "This timesheet has no line manager recorded, so the query can only go to the person.";
  if (![STATE.approved, STATE.sent, STATE.returned].includes(sheet.state)) return "Queries can be raised on timesheets that have been signed off.";
  return queryTextProblem(text, { kind: "raised" });
}

// the query as it is saved (its first message is saved with it)
export function buildQuery({ sheet, to, text, uid, name }) {
  const toUid = to === QUERY_TO.manager ? sheet.managerUid : sheet.uid;
  const toName = to === QUERY_TO.manager ? (sheet.managerName || sheet.decision?.by || "the line manager") : sheet.staffName;
  return {
    timesheetId: sheet.id, periodId: sheet.periodId || "", staffId: sheet.staffId || "", staffUid: sheet.uid || "", staffName: clean(sheet.staffName).slice(0, 100),
    managerUid: sheet.managerUid || null, to, toUid, toName: clean(toName).slice(0, 100), subject: queryText(text).slice(0, 140),
    status: QUERY_STATUS.open, raisedByUid: uid, raisedByName: clean(name).slice(0, 100),
  };
}

const timeOf = (m) => (m?.createdAt?.toMillis ? m.createdAt.toMillis() : m?.createdAt?.seconds ? m.createdAt.seconds * 1000 : Number(m?.createdAtMs) || Infinity);
export const threadOf = (messages = []) => [...messages].sort((a, b) => timeOf(a) - timeOf(b));

// the queries on one timesheet, newest first
export const queriesFor = (queries = [], sheetId) => queries.filter((q) => q.timesheetId === sheetId).sort((a, b) => timeOf({ createdAt: b.createdAt, createdAtMs: b.createdAtMs }) - timeOf({ createdAt: a.createdAt, createdAtMs: a.createdAtMs }));
export const openQueries = (queries = []) => queries.filter((q) => q.status !== QUERY_STATUS.resolved);

// Who may do what, mirroring the database rules
export const canResolve = (query, uid) => Boolean(uid) && query?.raisedByUid === uid && query?.status === QUERY_STATUS.open;
export const canReopen = (query, uid) => Boolean(uid) && query?.raisedByUid === uid && query?.status === QUERY_STATUS.resolved;
export const canReply = (query, uid) => Boolean(uid) && query?.status === QUERY_STATUS.open && (query?.raisedByUid === uid || query?.toUid === uid);

// "Raised by Sam Payroll, with Pat Example (the person)"
export const queryHeading = (q) => `${q.raisedByName || "Payroll"} asked ${q.to === QUERY_TO.manager ? `${q.toName || "the line manager"} (the line manager)` : `${q.toName || q.staffName || "the person"}`}`;

// ---- the desk ------------------------------------------------------------------------------------------------------------------

export const DESK_STATUS = [
  { value: "toSend", label: "To send to payroll" },
  { value: "sent", label: "Sent to payroll" },
  { value: "returned", label: "Returned to the person" },
  { value: "all", label: "All signed off" },
];
const STATUS_STATES = { toSend: [STATE.approved], sent: [STATE.sent], returned: [STATE.returned], all: [STATE.approved, STATE.sent, STATE.returned] };

const isoMs = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? t : 0; };

// One row per timesheet: the person, the line manager's sign-off, the declaration, what was claimed, mileage and queries.
export function deskRows(sheets = [], { periodId = "", queries = [], mileageByUid = {} } = {}) {
  // only timesheets the line manager has signed off are on the desk
  return sheets.filter((t) => STATUS_STATES.all.includes(t.state) && (!periodId || t.periodId === periodId)).map((t) => {
    const mine = queriesFor(queries, t.id);
    return {
      id: t.id, sheet: t, uid: t.uid, name: clean(t.staffName), payrollNo: clean(t.payrollNo), teams: Array.isArray(t.teams) ? t.teams : [], jobTitle: clean(t.jobTitle),
      manager: clean(t.managerName || t.decision?.by), signedOffBy: clean(t.decision?.by), signedOffAtMs: isoMs(t.decision?.at), signedOffAt: t.decision?.at || "",
      state: t.state, kind: t.kind, declaredAt: t.declaration?.confirmedAt || "", declaredBy: clean(t.declaration?.confirmedByName),
      totals: Object.fromEntries(CODES.map((c) => [c.code, Math.round((Number(t.totals?.[c.code]) || 0) * 100) / 100])), lines: Array.isArray(t.lines) ? t.lines : [], details: describeLines(t.lines),
      mileagePence: Number(mileageByUid[t.uid]) || 0, queries: mine, openQueries: openQueries(mine).length, submissions: Number(t.submissions) || 0,
    };
  }).sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
}

// search words must all be found in the person's name, payroll number, line manager, teams or job title
export function filterDesk(rows = [], { search = "", team = "", manager = "", status = "all", withQueries = false } = {}) {
  const words = lower(search).split(" ").filter(Boolean);
  const states = STATUS_STATES[status] || STATUS_STATES.all;
  return rows.filter((r) => {
    if (!states.includes(r.state)) return false;
    if (team && !r.teams.includes(team)) return false;
    if (manager && r.manager !== manager) return false;
    if (withQueries && r.openQueries === 0) return false;
    if (!words.length) return true;
    const hay = lower([r.name, r.payrollNo, r.manager, r.jobTitle, ...r.teams].join(" "));
    return words.every((w) => hay.includes(w));
  });
}

// the teams and managers to choose from (each with how many timesheets), in name order
export function deskOptions(rows = []) {
  const count = (items) => [...items.reduce((m, k) => m.set(k, (m.get(k) || 0) + 1), new Map())].map(([value, n]) => ({ value, n })).sort((a, b) => a.value.localeCompare(b.value, "en", { sensitivity: "base" }));
  return { teams: count(rows.flatMap((r) => r.teams)), managers: count(rows.map((r) => r.manager).filter(Boolean)) };
}

export function deskSummary(rows = []) {
  const hours = (codes) => Math.round(rows.reduce((s, r) => s + codes.reduce((x, c) => x + r.totals[c], 0), 0) * 100) / 100;
  return {
    people: rows.length, toSend: rows.filter((r) => r.state === STATE.approved).length, sent: rows.filter((r) => r.state === STATE.sent).length, returned: rows.filter((r) => r.state === STATE.returned).length,
    openQueries: rows.reduce((s, r) => s + r.openQueries, 0), overtime: hours(["B", "C"]), leave: hours(["A", "D", "E"]),
  };
}

const uk = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
export const stampText = (iso) => uk(iso);

// A CSV of what is on the desk (the search and filters applied): one row per person, with the line manager's sign-off and any open queries
export function deskCsv(rows = [], periodName = "") {
  const cell = (v) => { const t = String(v ?? ""); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const head = ["Pay period", "Name", "Payroll no", "Teams", "Line manager", "Signed off by", "Signed off at", "Where it stands", "Declaration", ...CODES.map((c) => `${c.code} ${c.label} (h)`), "Mileage (GBP)", "Open queries", "Details"];
  const words = { approved: "To send to payroll", sent: "Sent to payroll", returned: "Returned to the person" };
  const out = rows.map((r) => [periodName || r.sheet.periodId, r.name, r.payrollNo, r.teams.join("; "), r.manager, r.signedOffBy, uk(r.signedOffAt), words[r.state] || r.state, r.kind === "no-change" ? "No changes" : "Changes", ...CODES.map((c) => r.totals[c.code]), (r.mileagePence / 100).toFixed(2), r.openQueries, r.details]);
  return [head, ...out].map((r) => r.map(cell).join(",")).join("\r\n");
}
