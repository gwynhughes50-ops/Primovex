import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MAX_MESSAGE, NEXT_STATUSES, REPORT_KINDS, REPORT_STATUS, buildReport, cleanFixedIn, cleanReply, cleanRoute, kindLabel, looksLikeReportRequest, platformOf, privacyProblem, statusLabel, ticketFor } from "../src/modules/feedback/issueReport.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const NOW = new Date(2026, 9, 23, 10, 0);
const reporter = { uid: "u1", name: "Pat Example" };
const ok = { kind: "problem", message: "The save button on the SAR form does nothing", reporter };

t("a report needs a kind, a real message and a signed-in person, and says what is wrong in words", () => {
  assert.throws(() => buildReport({ ...ok, kind: "" }), /sort of report/);
  assert.throws(() => buildReport({ ...ok, kind: "rant" }), /sort of report/);
  assert.throws(() => buildReport({ ...ok, message: "broken" }), /a little more/);
  assert.throws(() => buildReport({ ...ok, message: "   " }), /a little more/);
  assert.throws(() => buildReport({ ...ok, reporter: {} }), /signed in/);
  const r = buildReport({ ...ok, now: NOW });
  assert.deepEqual([r.kind, r.status, r.reporterUid, r.reporterName], ["problem", "new", "u1", "Pat Example"]);
  assert.equal(REPORT_KINDS.length, 3);
});

t("the record is tidied and bounded, and gets the page, version, device and role added for them", () => {
  const r = buildReport({ ...ok, message: `  The   button\n does nothing ${"x".repeat(2000)}`, doing: "  Logging a SAR  ", route: "/governance/sars?id=abc#top", appVersion: "0.15.62", client: "tauri", userAgent: "Mozilla Windows NT 10", role: "Reception", now: NOW });
  assert.ok(r.message.length <= MAX_MESSAGE);
  assert.match(r.message, /^The button does nothing xxx/);
  assert.equal(r.doing, "Logging a SAR");
  assert.deepEqual([r.route, r.appVersion, r.platform, r.role], ["/governance/sars", "0.15.62", "windows", "Reception"], "the path only: nothing after ? or #");
  assert.equal(buildReport({ ...ok, reporter: { uid: "u2" }, now: NOW }).reporterName, "Unnamed");
  assert.deepEqual(Object.keys(buildReport({ ...ok, now: NOW })).sort(), ["appVersion", "doing", "kind", "message", "platform", "reporterName", "reporterUid", "role", "route", "status", "ticket"]);
});

t("anything that could identify a patient is refused with a reason: long numbers and full dates", () => {
  assert.match(privacyProblem("EMIS 1234567 would not open"), /patient number/);
  assert.match(privacyProblem("NHS number 123 456 7890"), /patient number/);
  assert.match(privacyProblem("born 26/07/1963 and then"), /full date/);
  assert.match(privacyProblem("date was 26.07.1963"), /full date/);
  assert.match(privacyProblem("the date 5-3-24 failed"), /full date/);
  assert.throws(() => buildReport({ ...ok, message: "It crashed when I opened EMIS 1216637 on the SAR page" }), /patient number/);
  assert.throws(() => buildReport({ ...ok, doing: "Opening the record for 26/07/1963" }), /full date/);
  // ordinary things that mention numbers are fine
  assert.equal(privacyProblem("Version 0.15.62 shows 3 fridges and 12 staff, 2 of 8 sessions"), "");
  assert.equal(privacyProblem("On 22 October the page was blank"), "");
  assert.equal(privacyProblem("it took 30 seconds and then 2026 appeared"), "");
});

t("routes keep only a plain path, and devices are told apart", () => {
  assert.equal(cleanRoute("/training"), "/training");
  assert.equal(cleanRoute("/governance/sars/abc-123?x=1"), "/governance/sars/abc-123");
  assert.equal(cleanRoute("https://evil.example/x"), "");
  assert.equal(cleanRoute("/a b"), "");
  assert.equal(cleanRoute(null), "");
  assert.equal(platformOf({ client: "tauri", userAgent: "Windows" }), "windows");
  assert.equal(platformOf({ client: "tauri", userAgent: "Linux; Android 14" }), "android");
  assert.equal(platformOf({ client: "web", userAgent: "iPhone OS 17" }), "ios");
  assert.equal(platformOf({}), "web");
});

t("tickets are short and name the year", () => {
  const a = ticketFor(NOW);
  assert.match(a, /^FB-2026-[0-9A-Z]{6}$/);
  assert.notEqual(a, ticketFor(new Date(NOW.getTime() + 60000)));
});

t("the Orb knows when someone is asking to report something, and does not mistake ordinary questions", () => {
  for (const yes of ["report a problem", "I want to report a bug", "I've found a bug", "I have an idea", "I've got a suggestion for Primovex", "suggest something", "tell the developer something", "log an issue", "the SAR page is broken", "something isn't working", "this keeps crashing"]) assert.equal(looksLikeReportRequest(yes), true, yes);
  for (const no of ["are all fridges ok today", "how do I report a significant event", "which stock is low", "what is the problem with fridge 2", "the fridge is not working", "the printer is broken", "the lift is stuck", "the thermometer reading is wrong", "", "tell me about the bug spray stock levels in the cleaning cupboard please and keep going for a long time so this is clearly a question about stock and not a report of anything at all"]) assert.equal(looksLikeReportRequest(no), false, no);
});

t("the developer moves a report on in order, with a short reply and the version it was fixed in", () => {
  assert.deepEqual(REPORT_STATUS.map((s) => s.key), ["new", "seen", "planned", "fixed", "wont"]);
  assert.deepEqual(NEXT_STATUSES.new, ["seen", "planned", "fixed", "wont"]);
  assert.ok(NEXT_STATUSES.fixed.includes("planned"), "a mistake can be undone");
  assert.equal(statusLabel("fixed"), "Done");
  assert.equal(statusLabel("nonsense"), "Sent");
  assert.equal(kindLabel("idea"), "An idea or improvement");
  assert.equal(cleanReply("  Thanks,   fixed in the next update ".padEnd(500, "!")).length, 300);
  assert.equal(cleanFixedIn(" 0.15.64 "), "0.15.64");
  assert.equal(cleanFixedIn("next week"), "");
});

t("the Orb opens the form from its button, its suggestions and what people say, and the developer sees the reports", () => {
  const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const orb = read("src/ai/components/AskPrimovexPanel.jsx");
  assert.match(orb, /<ReportIssueDialog initialText=\{report\.text\}/, "the form is rendered by the Orb");
  assert.match(orb, /looksLikeReportRequest\(text\)/, "and opened by what people say or type");
  assert.ok((orb.match(/setReport\(\{ text: ''/g) || []).length >= 2, "from the header button and the suggestion");
  assert.match(read("src/pages/DeveloperCentre.jsx"), /<StaffReportsPanel \/>/, "the developer's inbox is on the Developer Centre");
  const service = read("src/modules/feedback/issueReportService.js");
  assert.match(service, /buildReport\(/, "every report goes through the same checks");
  assert.ok(!/\.\.\.form,\s*status/.test(service), "a person cannot set the status themselves");
  const rules = read("firestore.rules");
  assert.match(rules, /match \/issue_reports\/\{reportId\}/);
  assert.match(read("functions/index.js"), /exports\.notifyIssueReport = onDocumentCreated\(\{ document: "issue_reports\/\{reportId\}"/);
});

console.log(`\n${n} passed`);
