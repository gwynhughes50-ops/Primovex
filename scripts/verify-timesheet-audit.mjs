import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { auditHtml, describeLine, historySteps, lineChanges, stateWords, totalsText } from "../src/modules/timesheets/timesheetAudit.js";
import { STATE, canMove } from "../src/modules/timesheets/timesheet.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const ot = (date, hours, comment = "") => ({ date, code: "B", hours, comment });
const entry = (id, seconds, extra = {}) => ({ id, at: { seconds }, actorName: "Pat Example", action: "submitted", kind: "changes", lines: [], totals: {}, ...extra });

t("a line is described in words", () => {
  assert.equal(describeLine(ot("2026-10-22", 1)), "Thu 22 Oct: Overtime, standard rate, 1h");
  assert.equal(describeLine({ date: "2026-10-21", code: "F", hours: 2.5, comment: "Covering the late clinic" }), "Wed 21 Oct: Other, 2.5h (Covering the late clinic)");
});

t("what changed between two lists of lines: added, removed, changed, in any order", () => {
  assert.deepEqual(lineChanges([], [ot("2026-10-22", 1)]), [{ type: "added", text: "Thu 22 Oct: Overtime, standard rate, 1h" }]);
  assert.deepEqual(lineChanges([ot("2026-10-22", 1)], []), [{ type: "removed", text: "Thu 22 Oct: Overtime, standard rate, 1h" }]);
  assert.deepEqual(lineChanges([ot("2026-10-22", 1)], [ot("2026-10-22", 2)]), [{ type: "changed", from: "Thu 22 Oct: Overtime, standard rate, 1h", text: "Thu 22 Oct: Overtime, standard rate, 2h" }]);
  assert.deepEqual(lineChanges([ot("2026-10-22", 1), ot("2026-10-23", 2)], [ot("2026-10-23", 2), ot("2026-10-22", 1)]), [], "the same lines in another order are no change");
  const mixed = lineChanges([ot("2026-10-20", 1), ot("2026-10-21", 1)], [ot("2026-10-21", 3), ot("2026-10-24", 1)]);
  assert.deepEqual(mixed.map((c) => c.type).sort(), ["added", "changed", "removed"]);
  assert.deepEqual(lineChanges([ot("2026-10-22", 1)], [ot("2026-10-22", 1), ot("2026-10-22", 1)]).map((c) => c.type), ["added"], "two the same on one day is one more");
});

t("the history is in order, and says what each step added, removed or changed", () => {
  const steps = historySteps([
    entry("c", 300, { action: "resubmitted after a decline", lines: [ot("2026-10-22", 1.5)], totals: { B: 1.5 }, actorName: "Pat Example" }),
    entry("a", 100, { action: "started", kind: "changes", lines: [ot("2026-10-22", 1)], totals: { B: 1 } }),
    entry("b", 200, { action: "declined by the line manager", actorName: "Sam Manager", reason: "Overtime was not agreed", lines: [ot("2026-10-22", 1)], totals: { B: 1 } }),
  ]);
  assert.deepEqual(steps.map((s) => s.id), ["a", "b", "c"]);
  assert.deepEqual(steps[0].changes.map((c) => c.type), ["added"], "the first step added the line");
  assert.deepEqual(steps[1].changes, [], "a decline changes no lines");
  assert.equal(steps[1].reason, "Overtime was not agreed");
  assert.equal(steps[1].who, "Sam Manager");
  assert.deepEqual(steps[2].changes.map((c) => [c.type, c.from]), [["changed", "Thu 22 Oct: Overtime, standard rate, 1h"]], "then the hours were changed");
  assert.equal(steps[2].totals, "Overtime, standard rate 1.5h");
});

t("a change between 'no changes' and 'something was different' is noted, and a draft with nothing says so", () => {
  const steps = historySteps([entry("a", 1, { kind: "no-change", lines: [] }), entry("b", 2, { kind: "changes", lines: [ot("2026-10-22", 1)], totals: { B: 1 } })]);
  assert.equal(steps[0].kindNote, "");
  assert.equal(steps[1].kindNote, "Changed to: something was different");
  assert.equal(totalsText({}, []), "No changes");
  assert.equal(totalsText({ B: 1, A: 7.5 }, [ot("2026-10-22", 1)]), "Sick leave 7.5h; Overtime, standard rate 1h");
  assert.deepEqual(historySteps([]), []);
  assert.deepEqual(historySteps(undefined), []);
});

t("the printable audit has the person, period, where it stands, the lines and every step, and escapes what was typed", () => {
  const steps = historySteps([
    entry("a", 100, { action: "submitted", lines: [ot("2026-10-22", 1, "<b>late clinic</b>")], totals: { B: 1 }, declaration: { confirmedAt: "2026-10-23T09:00:00Z", confirmedByName: "Pat Example" } }),
    entry("b", 200, { action: "taken back by the person to change", lines: [ot("2026-10-22", 1, "<b>late clinic</b>")], totals: { B: 1 } }),
    entry("c", 300, { action: "declined by the line manager", actorName: "Sam Manager", reason: "Not agreed & not needed", lines: [] }),
  ]);
  const html = auditHtml({ sheet: { staffName: "Pat Example", payrollNo: "1234", from: "2026-10-05", to: "2026-11-01", state: "declined", kind: "changes", lines: [ot("2026-10-22", 1, "<b>late clinic</b>")] }, period: { name: "October payroll" }, steps, stateLabel: stateWords("declined"), printedBy: "Sam Manager", now: new Date(2026, 9, 23) });
  assert.match(html, /Timesheet audit/);
  assert.match(html, /Pat Example/);
  assert.match(html, /payroll no 1234/);
  assert.match(html, /October payroll: 05\/10\/2026 to 01\/11\/2026/);
  assert.match(html, /Declined by the line manager/);
  assert.match(html, /taken back by the person to change/);
  assert.match(html, /Reason:<\/b> Not agreed &amp; not needed/);
  assert.match(html, /Removed: Thu 22 Oct: Overtime, standard rate, 1h/);
  assert.match(html, /Added: Thu 22 Oct: Overtime, standard rate, 1h/);
  assert.match(html, /Confirmed by Pat Example/);
  assert.match(html, /Printed 23 October 2026 by Sam Manager/);
  assert.ok(!html.includes("<b>late clinic</b>"), "typed text is escaped, so it can not add markup");
  assert.match(html, /&lt;b&gt;late clinic&lt;\/b&gt;/);
  assert.match(auditHtml({ sheet: { staffName: "X", kind: "no-change", lines: [] }, steps: [] }), /No changes: the hours were as normal\./);
  assert.match(auditHtml({ sheet: { staffName: "X", lines: [] }, steps: [] }), /Nothing is recorded yet/);
});

t("a person can take a sent timesheet back only while it waits for the line manager, never after it is signed off", () => {
  assert.equal(canMove("staff", STATE.submitted, STATE.draft), true);
  for (const from of [STATE.approved, STATE.sent, STATE.declined, STATE.returned]) assert.equal(canMove("staff", from, STATE.draft), false, `from ${from}`);
  assert.equal(canMove("manager", STATE.submitted, STATE.draft), false, "only the person takes it back");
  assert.equal(canMove("payroll", STATE.approved, STATE.draft), false);
  const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  assert.match(read("functions/services/timesheetAuditService.js"), /"submitted>draft": "taken back by the person to change"/);
  const rules = read("firestore.rules");
  assert.match(rules, /resource\.data\.state == "submitted"\s*&& request\.resource\.data\.state == "draft"/);
  assert.match(rules, /affectedKeys\(\)\.hasOnly\(\["state", "lastActorUid", "lastActorName", "updatedAt"\]\)/, "only the state moves: the lines sent are kept as they were");
});

t("the screens carry it: lines are listed with Edit and Remove, a sent one can be taken back, and the history can be printed", () => {
  const src = readFileSync(new URL("../src/modules/timesheets/TimesheetPanels.jsx", import.meta.url), "utf8");
  assert.match(src, /Added so far \(\{lines\.length\}\): not sent yet/);
  assert.match(src, /onClick=\{\(\) => editLine\(i\)\}>Edit</);
  assert.match(src, /onClick=\{\(\) => setLines\(lines\.filter\(\(_, j\) => j !== i\)\)\}>Remove</);
  assert.match(src, /Take it back to change it/);
  assert.match(src, /Print the audit/);
  assert.equal((src.match(/<History /g) || []).length, 3, "the person and the line manager get the full history here (payroll has its own on the desk)");
  assert.ok((src.match(/<History [^>]*period=\{period\}/g) || []).length === 3, "and each prints with the pay period's name");
  assert.match(readFileSync(new URL("../src/modules/timesheets/PayrollDesk.jsx", import.meta.url), "utf8"), /auditHtml\(\{ sheet: t, period, steps/, "payroll prints it from the desk");
});

t("every timesheet panel keeps its hooks above its early returns (a hook after them crashes the screen when the data loads)", () => {
  const src = readFileSync(new URL("../src/modules/timesheets/TimesheetPanels.jsx", import.meta.url), "utf8");
  const hook = /\buse(State|Memo|Effect|Auth|History|Sheets|Periods|Claims|Places|MyStaffRecord|CurrentPeriod|TimesheetStaff)\(/;
  let checked = 0;
  for (const name of ["MyTimesheetPanel", "SignOffPanel", "PeriodsPanel"]) {
    const start = src.indexOf(`export function ${name}`);
    assert.ok(start >= 0, name);
    const next = src.slice(start + 10).search(/\n(export )?function /);
    const body = next === -1 ? src.slice(start) : src.slice(start, start + 10 + next);
    const early = body.search(/\n {2}if \(.*\) return /);
    if (early === -1) continue;
    checked += 1;
    assert.ok(!hook.test(body.slice(early)), `${name}: a hook is called after an early return`);
  }
  assert.ok(checked >= 2, "the early returns were found");
});

console.log(`\n${n} passed`);
