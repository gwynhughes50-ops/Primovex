import assert from "node:assert/strict";
import { concernsOverviewAnswer, lastCheckAnswer, lastLoginAnswer, parseManagementQuestion, sarOverviewAnswer, waterTempsAnswer } from "../src/ai/management/managementAsk.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };

const now = new Date("2026-10-09T10:00:00");
const daysAgo = (d, h = 9) => { const x = new Date(now); x.setDate(x.getDate() - d); x.setHours(h, 0, 0, 0); return x; };
const route = (q, conv = []) => parseManagementQuestion(q, conv);

t("each management question goes to its own lookup", () => {
  assert.deepEqual(route("when was the last fire alarm test done"), { toolId: "compliance.lastCheck", input: { kind: "fire_alarm" } });
  assert.equal(route("when did we last test the fire alarm").input.kind, "fire_alarm");
  assert.equal(route("is the fire alarm test overdue").toolId, "compliance.lastCheck");
  assert.equal(route("when was the defibrillator last checked").input.kind, "defibrillator");
  assert.deepEqual(route("what are the tap water temps in the last month"), { toolId: "compliance.waterTemps", input: { days: 30 } });
  assert.equal(route("water temperatures this week").input.days, 7);
  assert.equal(route("legionella readings for the last 3 months").input.days, 90);
  assert.deepEqual(route("when did Craig last login"), { toolId: "security.lastLogin", input: { name: "craig" } });
  assert.equal(route("when did Craig Davies last log in").input.name, "craig davies");
  assert.equal(route("when was Sarah last seen").input.name, "sarah");
  assert.equal(route("how many SAR does Craig have outstanding").toolId, "governance.sarOverview");
  assert.equal(route("how many SAR does Craig have outstanding").input.person, "craig");
  assert.equal(route("what SARs are assigned to Sarah Jones").input.person, "sarah jones");
  assert.deepEqual(route("how many SARs are outstanding"), { toolId: "governance.sarOverview", input: { person: "" } });
  assert.equal(route("where are we up to with concerns").toolId, "governance.concernsOverview");
  assert.equal(route("any open complaints?").toolId, "governance.concernsOverview");
});

t("'he' and 'she' mean the person just asked about", () => {
  const earlier = [{ role: "user", content: "when did Craig last login" }, { role: "assistant", content: "Craig Davies last signed in…" }];
  assert.equal(route("how many SAR does he have outstanding", earlier).input.person, "craig");
  assert.equal(route("when did she last log in", [{ role: "user", content: "how many SARs does Sarah have" }]).input.name, "sarah");
  assert.equal(route("how many SAR does he have outstanding", []).input.person, "");
});

t("questions that are not management ones are left alone", () => {
  for (const q of ["how do I reset my password", "I've taken two gloves from stock", "do we have paracetamol", "what is the status of fridge 2", "where is the ECG machine", "how do I log in", "where are the SAR forms kept in the office"].slice(0, 6)) {
    assert.equal(route(q), null, q);
  }
  assert.equal(route("tell me about SAR-2026-004"), null, "a reference goes to the existing lookup");
  assert.equal(route("find concern CN-2026-12"), null);
});

const asset = (id, assetType, label, extra = {}) => ({ id, assetType, label, active: true, siteId: "main_branch", ...extra });
const check = (assetId, assetType, label, d, extra = {}) => ({ assetId, assetType, assetLabel: label, performedAt: daysAgo(d), result: "pass", actor: { displayName: "Gareth Price" }, ...extra });

t("last fire alarm test: when, where, who, and when it is next due", () => {
  const checks = [check("a", "fire_point", "Reception call point", 10), check("b", "fire_point", "Corridor call point", 3, { location: "Ground floor" }), check("w", "water_hot", "Sink", 1)];
  const a = lastCheckAnswer({ kind: "fire_alarm", checks, assets: [], now });
  assert.match(a.text, /Tuesday 6 October/);
  assert.match(a.text, /3 days ago/);
  assert.match(a.text, /Corridor call point/);
  assert.match(a.text, /passed/);
  assert.match(a.text, /Gareth Price/);
  assert.match(a.text, /due by Tuesday 13 October/);
  assert.equal(a.overdue, false);
  const late = lastCheckAnswer({ kind: "fire_alarm", checks: [check("a", "fire_point", "Reception call point", 12)], assets: [], now });
  assert.equal(late.overdue, true);
  assert.match(late.text, /5 days ago, so it is overdue|due 5 days ago/);
  assert.match(lastCheckAnswer({ kind: "fire_alarm", checks: [], assets: [], now }).text, /can't find any fire alarm tests/);
  assert.match(lastCheckAnswer({ kind: "fire_alarm", checks: [check("b", "fire_point", "Corridor call point", 2, { result: "fail" })], now }).text, /failed/);
});

t("the asset's own 'last checked' stamp and the old weekly fire checks count too", () => {
  const stamp = lastCheckAnswer({ kind: "fire_alarm", checks: [], assets: [asset("a", "fire_point", "Hall", { lastCheckAt: daysAgo(2), lastCheckResult: "pass", lastCheckedByName: "Ann" })], now });
  assert.match(stamp.text, /Ann/);
  const old = lastCheckAnswer({ kind: "fire_alarm", checks: [], assets: [], legacy: [{ createdAt: daysAgo(4), createdByName: "Bob" }], now });
  assert.match(old.text, /4 days ago/);
});

const hot = (id, label, d, temp, extra = {}) => check(id, "water_hot", label, d, { tempC: temp, minTempC: 50, maxTempC: 65, ...extra });
const cold = (id, label, d, temp, extra = {}) => check(id, "water_cold", label, d, { tempC: temp, minTempC: 0, maxTempC: 20, ...extra });

t("water temperatures for the last month", () => {
  const assets = [asset("h1", "water_hot", "Clinic 1 hot"), asset("c1", "water_cold", "Clinic 1 cold"), asset("c2", "water_cold", "Kitchen cold")];
  const checks = [hot("h1", "Clinic 1 hot", 5, 56.2), hot("h1", "Clinic 1 hot", 35, 40), cold("c1", "Clinic 1 cold", 6, 22.4, { result: "fail" })];
  const a = waterTempsAnswer({ checks, assets, days: 30, now });
  assert.match(a.text, /2 readings across 2 outlets/);
  assert.match(a.text, /Hot: 56\.2–56\.2°C \(should be 50–65°C\)/);
  assert.match(a.text, /Cold: 22\.4–22\.4°C \(should be under 20°C\)/);
  assert.match(a.text, /Outside the safe range: Clinic 1 cold 22\.4°C/);
  assert.match(a.text, /Not checked in the last month: Kitchen cold/);
  assert.match(a.text, /• Clinic 1 hot: 56\.2°C \(4 Oct\)/);
  assert.ok(!/40\.0/.test(a.text), "a reading older than the window is left out");
  assert.equal(a.outOfRange, 1);
  assert.match(waterTempsAnswer({ checks: [], assets, days: 30, now }).text, /no water temperature readings in the last month/);
  assert.match(waterTempsAnswer({ checks: [hot("h1", "x", 1, 55)], assets: [asset("h1", "water_hot", "x")], days: 7, now }).text, /Every reading was inside the safe range/);
});

const session = (uid, name, startedAt, extra = {}) => ({ uid, name, startedAt, lastSeenAt: startedAt, status: "ended", platform: "android", ...extra });

t("when someone last signed in", () => {
  const people = [
    { name: "Craig Davies", sessionCount: 14, lastSignIn: daysAgo(1, 8), lastSeen: daysAgo(1, 9), sessions: [session("u1", "Craig Davies", daysAgo(1, 8))] },
    { name: "Sarah Jones", sessionCount: 3, lastSignIn: daysAgo(0, 9), lastSeen: daysAgo(0, 9), sessions: [session("u2", "Sarah Jones", daysAgo(0, 9), { status: "active", platform: "windows" })] },
    { name: "Sarah Lloyd", sessionCount: 1, lastSignIn: daysAgo(20), lastSeen: daysAgo(20), sessions: [session("u3", "Sarah Lloyd", daysAgo(20))] },
  ];
  const craig = lastLoginAnswer({ name: "craig", people, now });
  assert.match(craig.text, /Craig Davies last signed in on Thursday 8 October at 08:00 \(yesterday\) on the phone app/);
  assert.match(craig.text, /last active at 09:00/);
  assert.match(craig.text, /14 sessions/);
  const sarah = lastLoginAnswer({ name: "sarah", people, now });
  assert.equal(sarah.ambiguous, true);
  assert.match(sarah.text, /Sarah Jones, Sarah Lloyd/);
  assert.match(lastLoginAnswer({ name: "sarah jones", people, now }).text, /in Primovex right now/);
  assert.match(lastLoginAnswer({ name: "zed", people, now }).text, /can't find a sign-in for “zed”/);
  assert.match(lastLoginAnswer({ name: "", people, now }).text, /Whose sign-in/);
});

const sar = (reference, status, assignedToName, daysLeft, extra = {}) => ({ reference, status, assignedToName, dueDate: daysAgo(-daysLeft), ...extra });

t("SARs outstanding, for one person and for the practice", () => {
  const sars = [
    sar("SAR-2026-001", "in_progress", "Craig Davies", -3),
    sar("SAR-2026-002", "assigned", "Craig Davies", 12),
    sar("SAR-2026-003", "completed", "Craig Davies", -20),
    sar("SAR-2026-004", "new", "", 5, { urgent: true }),
    sar("SAR-2026-005", "quality_check", "Sarah Jones", 2),
  ];
  const craig = sarOverviewAnswer({ person: "craig", sars, now });
  assert.match(craig.text, /Craig Davies has 2 outstanding SARs, 1 of them overdue/);
  assert.match(craig.text, /SAR-2026-001: In progress, overdue by 3 days/);
  assert.ok(!/SAR-2026-003/.test(craig.text), "a completed one isn't outstanding");
  assert.equal(craig.count, 2);
  assert.match(sarOverviewAnswer({ person: "sarah", sars, now }).text, /Sarah Jones has 1 outstanding SAR\b/);
  assert.match(sarOverviewAnswer({ person: "nobody", sars, now }).text, /can't find any SARs assigned to “nobody”/);
  assert.match(sarOverviewAnswer({ person: "craig", sars: [sar("S", "completed", "Craig Davies", -1)], now }).text, /Craig has no outstanding SARs/);
  const all = sarOverviewAnswer({ sars, now });
  assert.match(all.text, /4 SARs outstanding/);
  assert.match(all.text, /1 overdue, 2 more due within a week/);
  assert.match(all.text, /Craig Davies 2/);
  assert.match(all.text, /1 SAR not assigned to anyone/);
  assert.match(sarOverviewAnswer({ sars: [], now }).text, /no outstanding SARs/);
});

const concern = (reference, status, extra = {}) => ({ reference, status, acknowledgedAt: daysAgo(10), ownerName: "Ben", finalResponseDueAt: daysAgo(-10), ...extra });

t("where concerns are up to", () => {
  const concerns = [
    concern("CN-2026-001", "investigation", { finalResponseDueAt: daysAgo(2) }),
    concern("CN-2026-002", "response", { finalResponseDueAt: daysAgo(-3) }),
    concern("CN-2026-003", "received", { acknowledgedAt: null, acknowledgementDueAt: daysAgo(1), ownerName: "" }),
    concern("CN-2026-004", "closed", { closedAt: daysAgo(30) }),
  ];
  const a = concernsOverviewAnswer({ concerns, now });
  assert.match(a.text, /3 open concerns: 1 being investigated, 1 response being written, 1 received/);
  assert.match(a.text, /2 are overdue/);
  assert.match(a.text, /1 concern not yet acknowledged/);
  assert.match(a.text, /1 closed so far this year/);
  assert.match(a.text, /CN-2026-001: being investigated, final response overdue by 2 days, owner Ben/);
  assert.match(a.text, /CN-2026-003: received, acknowledgement overdue by 1 day, no owner/);
  assert.match(concernsOverviewAnswer({ concerns: [], now }).text, /no open concerns/);
});

console.log(`\n${n} passed`);
