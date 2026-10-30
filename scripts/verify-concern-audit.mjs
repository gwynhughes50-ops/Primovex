import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { auditEntry, auditPeople, auditRows, auditRowsForScreen, changeText, cleanChanges, describeChanges } from "../src/modules/governance/concernAudit.js";
import { historyRows } from "../src/modules/governance/concernHistory.js";
import { outsidePartiesSummary } from "../src/modules/governance/concernCase.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const at = (y, m, d, h = 9, min = 30) => new Date(y, m - 1, d, h, min);
const stamp = (date) => ({ toDate: () => date }); // like a Firestore Timestamp
const marker = { _methodName: "serverTimestamp" }; // like serverTimestamp()
const find = (changes, label) => changes.find((c) => c.label === label);

t("a changed priority is recorded from and to, in words", () => {
  const changes = describeChanges({ priority: "low", category: "access" }, { priority: "high", category: "access" });
  assert.equal(changes.length, 1, "the unchanged category is left out");
  assert.deepEqual(changes[0], { label: "Priority", from: "Low", to: "High", hidden: false });
  assert.equal(changeText(changes[0]), "Priority: Low → High");
});

t("nothing changed means nothing is recorded", () => {
  assert.deepEqual(describeChanges({ priority: "low", statementOnly: false }, { priority: "low", statementOnly: false }), []);
  assert.equal(auditEntry({ priority: "low" }, { priority: "low" }), null);
  assert.equal(auditEntry({ priority: "low" }, { somethingElse: 1 }), null, "fields that are not audited are ignored");
});

t("yes/no fields and stages read plainly", () => {
  const changes = describeChanges({ dutyOfCandourTriggered: false, status: "early_resolution" }, { dutyOfCandourTriggered: true, status: "investigation" });
  assert.deepEqual([find(changes, "Duty of Candour triggered").from, find(changes, "Duty of Candour triggered").to], ["No", "Yes"]);
  assert.deepEqual([find(changes, "Stage").from, find(changes, "Stage").to], ["Early resolution", "Investigation"]);
  assert.equal(describeChanges({}, { statementOnly: false }).length, 0, "an unset flag saved as No is not a change");
});

t("free text, patient details and contact details are recorded as changed and never repeated", () => {
  const changes = describeChanges(
    { summary: "Waited a long time", desiredOutcome: "An apology", emisNumber: "123456", patientInitials: "AB", dateOfBirth: "1950-01-02", raisedByInitials: "CD", hasContactDetails: false },
    { summary: "Waited far too long", desiredOutcome: "A call", emisNumber: "654321", patientInitials: "EF", dateOfBirth: "1951-03-04", raisedByInitials: "GH", hasContactDetails: true },
  );
  assert.equal(changes.length, 7);
  for (const change of changes) {
    assert.equal(change.hidden, true);
    assert.equal(change.from, ""); assert.equal(change.to, "");
    assert.match(changeText(change), / changed$/);
  }
  const everything = JSON.stringify(auditEntry({ summary: "Waited a long time", emisNumber: "123456" }, { summary: "Waited far too long", emisNumber: "654321" }));
  for (const secret of ["Waited", "123456", "654321"]) assert.ok(!everything.includes(secret), `${secret} must not be in the audit line`);
});

t("dates are compared by moment and shown the UK way; 'set to now' is recorded as recorded now", () => {
  const same = describeChanges({ finalResponseDueAt: stamp(at(2026, 11, 20)) }, { finalResponseDueAt: at(2026, 11, 20) });
  assert.equal(same.length, 0);
  const moved = describeChanges({ finalResponseDueAt: stamp(at(2026, 11, 20)) }, { finalResponseDueAt: stamp(at(2026, 12, 4)) });
  assert.deepEqual([moved[0].label, moved[0].from, moved[0].to], ["Final response due", "20/11/2026", "04/12/2026"]);
  const now = describeChanges({ acknowledgedAt: null }, { acknowledgedAt: marker });
  assert.deepEqual([now[0].from, now[0].to], ["", "Recorded now"]);
});

t("when the case could not be read first, the change is still recorded with the old value marked as not known", () => {
  const changes = describeChanges(null, { ownerName: "Sam Lee", summary: "x" });
  assert.equal(find(changes, "Case owner").from, "(not known)");
  assert.equal(find(changes, "Case owner").to, "Sam Lee");
  assert.equal(find(changes, "Summary").hidden, true);
});

t("an audit entry is a timeline line of type audit with a readable message and clean stored changes", () => {
  const entry = auditEntry({ ownerName: "Pat", priority: "low" }, { ownerName: "Sam Lee", priority: "medium" });
  assert.equal(entry.type, "audit");
  assert.equal(entry.title, "Case record changed");
  assert.equal(entry.message, "Priority: Low → Medium; Case owner: Pat → Sam Lee");
  assert.equal(entry.changes.length, 2);
  const stored = cleanChanges([{ label: "x".repeat(300), from: "y".repeat(300), to: 5, hidden: 1 }, ...Array.from({ length: 60 }, () => ({ label: "a" }))]);
  assert.equal(stored.length, 40);
  assert.equal(stored[0].label.length, 80); assert.equal(stored[0].from.length, 160);
  assert.equal(stored[0].hidden, false, "hidden is only ever a real true");
  assert.deepEqual(cleanChanges("nonsense"), []);
});

t("the audit table is the whole case timeline plus one row per field changed, oldest first, with who and when", () => {
  const timeline = [
    { id: "3", type: "audit", title: "Case summary printed", message: "", actorName: "Sam Lee", createdAt: at(2026, 10, 9, 15, 0) },
    { id: "1", type: "audit", title: "Case record changed", changes: [{ label: "Priority", from: "Low", to: "High", hidden: false }, { label: "Summary", from: "", to: "", hidden: true }], actorName: "Pat Example", createdAt: at(2026, 10, 5, 10, 5) },
    { id: "2", type: "note", title: "Note added", message: "hello", actorName: "Pat Example", createdAt: at(2026, 10, 6) },
    { id: "4", type: "audit", title: "Contact details changed", message: "The details themselves are not shown here.", actorName: "Unknown", createdAt: at(2026, 10, 7) },
    { id: "0", type: "created", title: "Concern received", message: "Logged by phone.", actorName: "Pat Example", createdAt: at(2026, 10, 1) },
  ];
  const rows = auditRows(timeline);
  assert.equal(rows.length, 6, "the timeline entries are in the audit table as well as the field changes");
  assert.deepEqual(rows[0], { when: "01/10/2026 09:30", who: "Pat Example", what: "Concern received", detail: "Logged by phone." });
  assert.deepEqual(rows[1], { when: "05/10/2026 10:05", who: "Pat Example", what: "Priority changed", detail: "Low → High" });
  assert.deepEqual(rows[2], { when: "05/10/2026 10:05", who: "Pat Example", what: "Summary changed", detail: "The words are not shown here." });
  assert.equal(rows[3].what, "Note added");
  assert.equal(rows[4].who, "Not recorded", "a missing name is said, not hidden");
  assert.equal(rows[4].what, "Contact details changed");
  assert.equal(rows[5].what, "Case summary printed");
  assert.deepEqual(auditRows(null), []);
});

t("the narrative history leaves the audit lines out, so nothing is printed twice", () => {
  const timeline = [
    { id: "1", type: "note", title: "Note added", actorName: "Pat", createdAt: at(2026, 10, 6) },
    { id: "2", type: "audit", title: "Case record changed", actorName: "Pat", createdAt: at(2026, 10, 6, 10) },
  ];
  assert.equal(historyRows(timeline).length, 1);
  assert.equal(historyRows(timeline)[0].title, "Note added");
});

t("every change goes through one place and is written when it is made", () => {
  const service = read("src/modules/governance/services/concernService.js");
  assert.match(service, /async function recordCaseChange[\s\S]*auditEntry\(before, patch\)/);
  const update = service.slice(service.indexOf("export async function updateConcern("), service.indexOf("// Deliberately whitelisted"));
  assert.ok(update.indexOf("getDoc(doc(db, CONCERNS_COLLECTION, concernId))") > -1 && update.indexOf("getDoc(") < update.indexOf("await updateDoc("), "the old values are read before the change is made");
  assert.ok(update.indexOf("await updateDoc(") < update.indexOf("await recordCaseChange("), "the audit line is written after the change succeeds");
  assert.match(service, /try \{[\s\S]*await addConcernTimeline\(concernId, \{ \.\.\.entry, actor \}\)[\s\S]*\} catch/, "a failed audit write can never stop the work");
  assert.match(service, /recordContactChange\(concernId, "Contact details removed"/);
  assert.match(service, /"The details themselves are not shown here\."/);
  assert.match(service, /\.filter\(\(event\) => includeAudit \|\| event\.type !== AUDIT_TYPE\)/, "the plain case timeline screen does not show the audit lines");
  assert.match(service, /recordAudit\(concernEvent\("printed", \{ concern \}\)\)/, "every print is in the governed ledger");
});

t("only the concerns team gets the audit table on the print, and the print is added to it", () => {
  const print = read("src/modules/governance/services/concernPrint.js");
  assert.match(print, /includeAudit = false/, "off unless asked for");
  assert.match(print, /\$\{includeAudit \? section\("Audit trail: everything done to the case"/);
  assert.match(print, /recordCasePrinted\(concern, actor, \{ inTrail: includeAudit \}\)/);
  const page = read("src/pages/GovernanceConcerns.jsx");
  assert.equal((page.match(/printConcernSummary\(concern, actor, \{ includeAudit: isTeam \}\)/g) || []).length, 2, "both print buttons pass the team flag");
  assert.match(read("src/modules/audit/auditEvents.js"), /case "printed"/);
});

// the case in the screenshot: the Health Board has had it twice and asked for more in between; GMPI was recorded by mistake
const step = (id, party, action, occurredOn, extra = {}) => ({ id, party, action, occurredOn, what: "", note: "", round: null, createdByName: "Gwyn Hughes", createdAtMs: Date.parse(occurredOn), ...extra });
const caseSteps = [
  step("a", "gmpi", "sent", "2026-10-21", { what: "our_reply", round: 1 }),
  step("b", "healthboard", "sent", "2026-10-21", { what: "our_reply", round: 1 }),
  step("w", "gmpi", "withdrawn", "2026-10-21", { withdrawsId: "a", note: "GMPI was wrong should have been BCUHB" }),
  step("c", "healthboard", "info", "2026-10-27", { note: "want practice to review the final reply and confirm if happy to approve by end of 28/10/26" }),
  step("d", "healthboard", "sent", "2026-10-29", { what: "draft_response", note: "final statement checked by gwyn hughes and sent", round: 2 }),
];

t("the printed summary has the dealings with outside parties, the same as the case screen", () => {
  const out = outsidePartiesSummary({ mddusRequired: false }, caseSteps, new Date(2026, 9, 29));
  assert.equal(out.ready, false);
  assert.deepEqual(out.parties, [{ name: "Health Board", text: "With them since 29/10/2026 · sent 2 times" }]);
  assert.equal(out.history.length, 4, "the withdrawal record is not listed as a step of its own");
  assert.equal(out.history[0].title, "GMPI: We sent it to them");
  assert.deepEqual(out.history[0].takenBack, { date: "21/10/2026", why: "GMPI was wrong should have been BCUHB", by: "Gwyn Hughes" });
  assert.equal(out.history[0].detail, "Our reply to what they asked for");
  assert.equal(out.history[1].takenBack, null);
  assert.equal(out.history[2].title, "Health Board: They need more information");
  assert.match(out.history[2].detail, /^want practice to review/);
  assert.equal(out.history[3].title, "Health Board: We sent it to them (time 2)");
  assert.equal(out.history[3].detail, "The draft final response letter · final statement checked by gwyn hughes and sent");
  assert.equal(out.history[3].by, "Gwyn Hughes");
});

t("a case with no outside parties prints nothing for them, and an accepted case says ready", () => {
  assert.equal(outsidePartiesSummary({}, [], new Date()), null);
  const accepted = outsidePartiesSummary({}, [step("1", "healthboard", "sent", "2026-10-01", { round: 1 }), step("2", "healthboard", "accepted", "2026-10-05")], new Date(2026, 9, 29));
  assert.equal(accepted.ready, true);
  assert.equal(accepted.parties[0].text, "Accepted");
});

t("the print reads the steps themselves and shows the section to everyone who prints", () => {
  const print = read("src/modules/governance/services/concernPrint.js");
  assert.match(print, /collection\(db, CONCERN_STEPS_COLLECTION\), where\("concernId", "==", concernId\)/);
  assert.match(print, /steps: data\.steps/);
  assert.match(print, /\$\{outsideBlock\}/);
  assert.ok(!/includeAudit[^\n]*outsideBlock|outsideBlock[^\n]*includeAudit/.test(print), "not only for the team");
  assert.match(print, /could not be loaded for this print/, "a failed read is said, not hidden");
  assert.match(read("src/modules/governance/components/ConcernWizards.jsx"), /const stateText = partyStateText;/, "the screen and the print use the same words");
});

t("the concerns team sees the audit trail on the case itself, newest first, and can look at one person's lines", () => {
  const timeline = [
    { id: "1", type: "created", title: "Concern received", message: "Logged by phone.", actorName: "Pat Example", createdAt: at(2026, 10, 1) },
    { id: "2", type: "audit", title: "Case record changed", changes: [{ label: "Priority", from: "Low", to: "High", hidden: false }], actorName: "Sam Lee", createdAt: at(2026, 10, 5, 10, 5) },
    { id: "3", type: "note", title: "Note added", message: "hello", actorName: "Pat Example", createdAt: at(2026, 10, 6) },
  ];
  const all = auditRowsForScreen(timeline);
  assert.deepEqual(all.map((r) => r.what), ["Note added", "Priority changed", "Concern received"], "newest first");
  assert.deepEqual(auditRowsForScreen(timeline, "Sam Lee").map((r) => r.what), ["Priority changed"]);
  assert.deepEqual(auditRowsForScreen(timeline, "Nobody"), []);
  assert.deepEqual(auditPeople(timeline), ["Pat Example", "Sam Lee"]);
  assert.deepEqual(auditRowsForScreen(null), []);

  const service = read("src/modules/governance/services/concernService.js");
  assert.match(service, /subscribeConcernTimeline\(concernId, callback, onError, \{ includeAudit = false \} = \{\}\)/, "the plain timeline still leaves the audit lines out");
  assert.match(service, /filter\(\(event\) => includeAudit \|\| event\.type !== AUDIT_TYPE\)/);
  const component = read("src/modules/governance/components/ConcernAuditTrail.jsx");
  assert.match(component, /\{ includeAudit: true \}/);
  assert.match(component, /auditRowsForScreen\(events \|\| \[\], who\)/);
  assert.match(read("src/pages/GovernanceConcerns.jsx"), /\{isTeam && <ConcernAuditTrail concernId=\{concern\.id\} \/>\}/, "desktop: team only");
  assert.match(read("src/mobile/MobileGovernanceConcerns.jsx"), /\{isTeam && <div className="mt-3"><ConcernAuditTrail concernId=\{concern\.id\} \/><\/div>\}/, "phone: team only");
});

t("a change whose audit line cannot be written says so on the screen and in the ledger, never silently", () => {
  const service = read("src/modules/governance/services/concernService.js");
  assert.match(service, /function reportAuditFailure\(concernId, err\)[\s\S]*dispatchEvent\(new CustomEvent\("primovex:audit-failed"[\s\S]*recordAudit\(concernEvent\("audit_line_failed"/);
  assert.equal((service.match(/reportAuditFailure\(/g) || []).length, 4, "the definition and the three places an audit line is written");
  assert.ok(!/console\.error\("The audit line/.test(service), "no failure is only logged to a console nobody reads");
  assert.match(read("src/components/system/AuditFailureNotice.jsx"), /AUDIT_FAILED_EVENT = "primovex:audit-failed"/);
  assert.match(read("src/main.jsx"), /<AuditFailureNotice \/>/);
  assert.match(read("src/modules/audit/auditEvents.js"), /case "audit_line_failed"/);
});

console.log(`\n${n} concern audit checks passed`);
