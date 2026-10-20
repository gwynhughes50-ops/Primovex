import assert from "node:assert/strict";
import {
  ALERT_ROLES, actionChoicesFor, actionEntry, ageText, assetGroup, buildIncident, buildPanelFaultIncident, closeBlockedReason, describeFailure, incidentChoices, isOpen, isPanelFault, recheckState, resolutionPatch, sortIncidents,
} from "../src/modules/compliance/complianceIncidents.js";
import { ageDays, buildIssue, isOpenIssue, issueSummary, openIssuesIn, sortIssues, updateEntry, validateIssue } from "../src/modules/maintenance/maintenance.js";
import { daysSinceFireTest, dueList, overdueDays, patRetest } from "../src/modules/compliance/complianceDue.js";
import { normaliseSubstance } from "../src/modules/coshh/coshh.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const now = new Date(2026, 9, 10, 12, 0);
const ago = (days) => new Date(now.getTime() - days * 86400000);
const actor = { uid: "u1", displayName: "Gwyn" };

const tap = { id: "a1", assetCode: "WH-002", assetType: "water_hot", label: "Staff Kitchen Hot Tap", location: "Staff kitchen", siteId: "main_branch", checkMode: "temperature", minTempC: 50, maxTempC: 65 };
const failed = { id: "c1", assetId: "a1", result: "fail", tempC: 44, severity: "high", checkMode: "temperature", createdAt: ago(1) };

t("a failed temperature check becomes an incident that says what happened in plain words", () => {
  assert.equal(describeFailure(tap, failed), "Staff Kitchen Hot Tap read 44°C, outside its safe range (50°C to 65°C).");
  assert.match(describeFailure(tap, { ...failed, tempC: "" }), /no usable reading/);
  assert.equal(describeFailure({ label: "Back door", checkMode: "pass_fail" }, { result: "fail" }), "Back door was marked as not working or failed its check.");
  const incident = buildIncident({ asset: tap, check: failed, actor });
  assert.deepEqual([incident.status, incident.assetCode, incident.siteId, incident.observedTemp, incident.openedBy, incident.actions], ["open", "WH-002", "main_branch", 44, "Gwyn", []]);
  assert.deepEqual(incident.expectedRange, { min: 50, max: 65 });
  assert.equal(buildIncident({ asset: { id: "x", assetType: "fire_door", label: "Door" }, check: { result: "fail" } }).expectedRange, null);
});

t("the actions on offer fit the kind of asset, and the people told are the caretaker and the practice manager", () => {
  assert.deepEqual(ALERT_ROLES, ["Caretaker", "Practice Manager"]);
  assert.equal(assetGroup("water_cold"), "water");
  assert.equal(assetGroup("fire_door"), "fire");
  assert.equal(assetGroup("aed"), "fire");
  assert.equal(assetGroup("general"), "other");
  const water = actionChoicesFor("water_hot").map((c) => c.key);
  assert.ok(water.includes("flushed") && water.includes("adjusted") && !water.includes("repaired"));
  const fire = actionChoicesFor("fire_door").map((c) => c.key);
  assert.ok(fire.includes("repaired") && !fire.includes("flushed"));
  for (const type of ["water_hot", "fire_point", "general"]) assert.ok(actionChoicesFor(type).some((c) => c.key === "other"));
});

t("it can only be closed once something was done and the asset has passed a check since the failure", () => {
  const incident = { ...buildIncident({ asset: tap, check: failed, actor }), id: "i1", openedAtMs: ago(1).getTime() };
  assert.match(closeBlockedReason(incident, []), /Record what was done/);
  const done = { ...incident, actions: [actionEntry({ choice: "flushed", note: "Ran for 5 minutes", actor })] };
  assert.match(closeBlockedReason(done, []), /scanning its tag/);
  const passAfter = { id: "c2", assetId: "a1", result: "pass", createdAt: new Date(now.getTime() - 3600000) };
  const failAfter = { id: "c3", assetId: "a1", result: "fail", createdAt: new Date(now.getTime() - 1800000) };
  const passBefore = { id: "c0", assetId: "a1", result: "pass", createdAt: ago(3) };
  const otherAsset = { id: "cx", assetId: "zzz", result: "pass", createdAt: new Date(now.getTime() - 600000) };
  assert.equal(recheckState(done, [passBefore, otherAsset]).state, "none", "a pass before the failure, or on another asset, doesn't count");
  assert.equal(recheckState(done, [passAfter]).state, "passed");
  assert.equal(recheckState(done, [passAfter, failAfter]).state, "failed", "the latest check decides");
  assert.match(closeBlockedReason(done, [passAfter, failAfter]), /failed too/);
  assert.equal(closeBlockedReason(done, [passAfter]), "");
  assert.equal(closeBlockedReason(done, [], { active: false }), "", "a retired asset needs no recheck");
  assert.match(closeBlockedReason(incident, [passAfter], { active: false }), /Record what was done/, "but something must still be recorded");
});

t("closing records who, when and which check proved it", () => {
  const incident = { ...buildIncident({ asset: tap, check: failed, actor }), openedAtMs: ago(1).getTime(), actions: [actionEntry({ choice: "adjusted", actor })] };
  const pass = { id: "c9", assetId: "a1", result: "pass", createdAt: new Date(now.getTime() - 1000) };
  const patch = resolutionPatch({ incident, checks: [pass], actor: { uid: "pm", displayName: "PM" }, note: "Thermostat reset" });
  assert.deepEqual([patch.status, patch.resolvedBy, patch.recheckCheckId, patch.resolutionNote], ["resolved", "PM", "c9", "Thermostat reset"]);
  assert.throws(() => resolutionPatch({ incident, checks: [], actor }), /scanning its tag/);
});

t("open incidents sort oldest first, then the recently closed; age reads well", () => {
  const a = { id: "a", status: "open", openedAtMs: ago(5).getTime() };
  const b = { id: "b", status: "open", openedAtMs: ago(1).getTime() };
  const c = { id: "c", status: "resolved", openedAtMs: ago(9).getTime() };
  const d = { id: "d", status: "resolved", openedAtMs: ago(2).getTime() };
  assert.deepEqual(sortIncidents([d, b, c, a]).map((i) => i.id), ["a", "b", "d", "c"]);
  assert.ok(isOpen(a) && !isOpen(c));
  assert.equal(ageText(a, now), "5 days");
  assert.equal(ageText({ openedAtMs: now.getTime() - 5 * 3600000 }, now), "5 hours");
  assert.equal(ageText({ openedAtMs: now.getTime() - 600000 }, now), "less than an hour");
  assert.equal(ageText({}, now), "just now");
});

t("a maintenance issue needs a room and a description; urgent raises the priority", () => {
  assert.equal(validateIssue({ roomName: "Room 1", note: "Light out" }).length, 0);
  assert.equal(validateIssue({ roomName: " ", note: "" }).length, 2);
  const issue = buildIssue({ roomId: "r1", roomName: "Treatment Room 1", note: "  Light   flickers ", urgent: true, source: "phone", actor });
  assert.deepEqual([issue.priority, issue.status, issue.title, issue.reportedBy, issue.assignedTo], ["high", "open", "Light flickers", "Gwyn", "Caretaker"]);
  assert.equal(buildIssue({ roomName: "R", note: "x" }).priority, "medium");
});

t("issues sort urgent first then oldest, closed ones last, and the summary counts what is open", () => {
  const mk = (id, status, priority, days) => ({ id, status, priority, reportedAtMs: ago(days).getTime() });
  const list = [mk("low-old", "open", "low", 9), mk("urgent-new", "open", "high", 1), mk("normal-old", "open", "medium", 8), mk("done-new", "closed", "high", 2), mk("done-old", "closed", "low", 20), mk("urgent-old", "in_progress", "high", 6)];
  assert.deepEqual(sortIssues(list).map((i) => i.id), ["urgent-old", "urgent-new", "normal-old", "low-old", "done-new", "done-old"]);
  assert.deepEqual(issueSummary(list, now), { open: 4, urgent: 2, oldestDays: 9 });
  assert.equal(isOpenIssue(list[3]), false);
  assert.equal(ageDays(list[0], now), 9);
  assert.equal(updateEntry({ text: " done ", status: "closed", actor }).text, "done");
  assert.deepEqual(openIssuesIn(list, "", "treatment room 1").length, 0);
  assert.equal(openIssuesIn([{ id: "x", status: "open", roomName: "Treatment Room 1" }, { id: "y", status: "closed", roomName: "Treatment Room 1" }, { id: "z", status: "open", roomId: "r9", roomName: "Other" }], "r9", "Treatment room 1").length, 2);
});

t("PAT: the most recent session's retest date decides whether it is due", () => {
  const sessions = [{ testDate: "2025-01-10", retestDate: "2026-01-10" }, { testDate: "2026-08-01", retestDate: "2027-08-01" }];
  assert.equal(patRetest(sessions, now).days, 295, "the later session wins, not the earlier one that is overdue");
  assert.equal(patRetest([{ testDate: "2025-10-01", retestDate: "2026-10-05" }], now).days, -5);
  assert.equal(patRetest([{ testDate: "2025-10-01" }], now), null, "no retest date recorded");
  assert.equal(patRetest([], now), null);
});

t("the 'what needs doing' list puts failures first and gathers every area", () => {
  const assets = [
    { id: "fp1", assetCode: "FP-001", assetType: "fire_point", label: "Reception", lastCheckAt: ago(12) },
    { id: "a1", assetCode: "WH-002", assetType: "water_hot", label: "Staff Kitchen Hot Tap", lastCheckAt: ago(5), lastCheckResult: "fail" },
    { id: "w2", assetCode: "WC-001", assetType: "water_cold", label: "TR1 Cold", lastCheckAt: ago(40), lastCheckResult: "pass", frequency: "monthly" },
    { id: "gone", assetCode: "FP-009", assetType: "fire_point", active: false, lastCheckAt: ago(300) },
  ];
  const incidents = [{ id: "i1", assetId: "a1", assetCode: "WH-002", assetLabel: "Staff Kitchen Hot Tap", status: "open", openedAtMs: ago(5).getTime(), actions: [] }];
  const coshh = [normaliseSubstance("c", { name: "P", supplier: "S", hazards: ["corrosive"], ppe: ["gloves"], firstAid: ["skin"], location: "L", reviewDate: "2025-01-01" })];
  const list = dueList({ assets, incidents, patSessions: [{ testDate: "2025-10-01", retestDate: "2026-10-05" }], issues: [{ id: "m", status: "open", priority: "high", reportedAtMs: ago(4).getTime() }], coshh, now });
  assert.deepEqual(list.map((i) => i.key), ["incident-i1", "pat", "maintenance", "coshh-overdue", "fire-weekly", "overdue"].sort((x, y) => list.findIndex((i) => i.key === x) - list.findIndex((i) => i.key === y)));
  assert.equal(list[0].key, "incident-i1", "an open failed check heads the list");
  assert.equal(list[0].action.type, "incident");
  assert.ok(list.slice(0, 5).every((i) => i.tone === "critical") && list.slice(5).every((i) => i.tone === "warning"), "all the critical ones come before the warnings (the 10-days-overdue check is red)");
  assert.ok(!list.some((i) => i.key === "failing"), "an asset with an open incident is not listed twice");
  const overdue = list.find((i) => i.key === "overdue");
  assert.match(overdue.label, /1 check overdue/);
  assert.match(overdue.detail, /WC-001/);
  assert.match(list.find((i) => i.key === "fire-weekly").detail, /FP-009|Reception/, "says which call point to test next");
  assert.deepEqual(dueList({ now }), []);
  assert.equal(dueList({ assets: [{ id: "x", assetCode: "WH-9", assetType: "water_hot", lastCheckAt: ago(45), lastCheckResult: "fail" }], now })[0].key, "failing", "a legacy failure with no incident is still shown");
});

t("late is amber, properly overdue is red: a check a week past its day, the fire test a fortnight after the last", () => {
  const monthly = (id, daysSinceCheck) => ({ id, assetCode: id, assetType: "water_hot", frequency: "monthly", lastCheckAt: ago(daysSinceCheck), lastCheckResult: "pass" });
  const tone = (assets) => dueList({ assets, now }).find((i) => i.key === "overdue")?.tone;
  assert.equal(tone([monthly("a", 31)]), "warning", "one day late");
  assert.equal(tone([monthly("a", 36)]), "warning", "six days late");
  assert.equal(tone([monthly("a", 37)]), "critical", "seven days late");
  assert.equal(tone([monthly("a", 31), monthly("b", 50)]), "critical", "the worst one decides");
  assert.equal(tone([{ id: "n", assetCode: "N", assetType: "water_hot", frequency: "monthly" }]), "warning", "a new asset never checked is amber, not red");
  assert.equal(overdueDays(monthly("a", 40), now), 10);
  assert.equal(overdueDays({ assetType: "aed" }, now), 0);
  const fire = (days) => [{ id: "f", assetCode: "FP-1", assetType: "fire_point", lastCheckAt: days === null ? undefined : ago(days) }];
  const fireTone = (assets) => dueList({ assets, now }).find((i) => i.key === "fire-weekly")?.tone;
  assert.equal(fireTone(fire(8)), "warning");
  assert.equal(fireTone(fire(14)), "warning");
  assert.equal(fireTone(fire(15)), "critical");
  assert.equal(fireTone(fire(null)), "critical", "never tested");
  assert.equal(daysSinceFireTest(fire(null), now), Infinity);
  assert.equal(daysSinceFireTest(fire(20), now), 20);
  assert.equal(daysSinceFireTest([{ assetType: "fire_point", active: false, lastCheckAt: ago(1) }], now), Infinity, "a retired point doesn't count");
});

t("'Open' on a check that needs doing takes the person to the list it belongs to", () => {
  const now = new Date(2026, 9, 10, 12);
  const ago = (days) => new Date(now.getTime() - days * 86400000);
  const list = dueList({ assets: [
    { id: "fp", assetCode: "FP-001", assetType: "fire_point", label: "Reception", lastCheckAt: ago(30), lastCheckResult: "pass" },
    { id: "w", assetCode: "WH-002", assetType: "water_hot", label: "Tap", frequency: "monthly", lastCheckAt: ago(40), lastCheckResult: "pass" },
  ], now });
  const by = Object.fromEntries(list.map((i) => [i.key, i.action]));
  assert.deepEqual(by["fire-weekly"], { type: "section", section: "fire" });
  assert.deepEqual(by.overdue, { type: "section", section: "water" });
});

t("a fault shown by the fire alarm panel is its own kind of incident: the note is kept apart from the summary, and the engineer's actions are offered", () => {
  const asset = { id: "a1", assetCode: "FP-050", label: "Fire point 50", location: "Reception", siteId: "main_branch" };
  const incident = buildPanelFaultIncident({ asset, check: { id: "c1" }, actor, note: "  Earth fault   zone 3 " });
  assert.equal(isPanelFault(incident), true);
  assert.equal(isPanelFault(buildIncident({ asset, check: { id: "c1", result: "fail" }, actor })), false);
  assert.equal(incident.severity, "high");
  assert.equal(incident.assetLabel, "Fire alarm panel fault");
  assert.equal(incident.summary, "The fire alarm panel showed a fault during the test of Fire point 50.");
  assert.ok(!incident.summary.includes("Earth"), "what was typed is never in the summary, which goes into the alert");
  assert.equal(incident.faultNote, "Earth fault zone 3");
  assert.deepEqual([incident.status, incident.openedByUid, incident.actions], ["open", "u1", []]);
  assert.deepEqual(incidentChoices(incident).map((c) => c.key), ["engineer", "monitoring", "fixed", "other"]);
  assert.ok(incidentChoices({ assetType: "water_hot" }).some((c) => c.key === "flushed"), "an ordinary failure keeps its own choices");
  assert.equal(actionEntry({ choice: "engineer", actor }).label, "Fire alarm engineer called");
});

t("a panel fault is closed once something has been done about it, without checking the call point again", () => {
  const incident = { ...buildPanelFaultIncident({ asset: { id: "a1", label: "Fire point 50" }, actor }), openedAtMs: 1000 };
  assert.equal(closeBlockedReason(incident, []), "Record what was done about it first.");
  const dealt = { ...incident, actions: [actionEntry({ choice: "engineer", actor })] };
  assert.equal(closeBlockedReason(dealt, []), "", "no recheck needed");
  assert.equal(resolutionPatch({ incident: dealt, checks: [], actor, note: "Engineer cleared the earth fault" }).status, "resolved");
  // an ordinary failure still needs a passing recheck
  const failed = { ...buildIncident({ asset: { id: "a2", label: "Tap" }, check: {}, actor }), actions: [actionEntry({ choice: "flushed", actor })], openedAtMs: 1000 };
  assert.match(closeBlockedReason(failed, []), /Check it again/);
});

t("'what needs doing' says the alarm panel is showing a fault, not that an asset failed", () => {
  const incident = { id: "i1", ...buildPanelFaultIncident({ asset: { id: "a1", label: "Fire point 50" }, actor }), openedAtMs: ago(2).getTime() };
  const item = dueList({ assets: [], incidents: [incident], now }).find((i) => i.key === "incident-i1");
  assert.equal(item.label, "The fire alarm panel is showing a fault");
  assert.equal(item.tone, "critical");
  assert.match(item.detail, /Nothing recorded yet/);
  const dealt = dueList({ assets: [], incidents: [{ ...incident, actions: [actionEntry({ choice: "engineer", actor })] }], now }).find((i) => i.key === "incident-i1");
  assert.match(dealt.detail, /needs closing once it is put right/);
});

console.log(`\n${n} passed`);
