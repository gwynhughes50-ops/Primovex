import assert from "node:assert/strict";
import { parseManagementQuestion, concernsOverviewAnswer, caseOutsideLine, outsidePartyLines } from "../src/ai/management/managementAsk.js";
import { dueNowAnswer, incidentsAnswer, patStatusAnswer } from "../src/ai/management/complianceAsk.js";
import { headlineOf, needsAttention } from "../src/ai/briefing/briefing.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const now = new Date(2026, 9, 14, 9, 0); // Wed 14 Oct 2026
const ago = (days) => new Date(now.getTime() - days * 86400000);
const day = (offset) => { const d = new Date(now.getTime() + offset * 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const route = (q) => parseManagementQuestion(q)?.toolId || null;

t("questions about PAT, incidents and what is due go to the right lookup", () => {
  assert.equal(route("which appliances are overdue for PAT testing?"), "pat.status");
  assert.equal(route("how is the PAT testing going"), "pat.status");
  assert.equal(route("has the kettle been PAT tested"), "pat.status");
  assert.equal(route("any appliances that failed their PAT test"), "pat.status");
  assert.equal(route("when is the portable appliance testing due"), "pat.status");
  assert.equal(route("is there a fault on the fire alarm panel"), "compliance.incidents");
  assert.equal(route("are there any open compliance incidents"), "compliance.incidents");
  assert.equal(route("any failed checks outstanding"), "compliance.incidents");
  assert.equal(route("what compliance checks are overdue"), "compliance.dueNow");
  assert.equal(route("what does the caretaker still need to do"), "compliance.dueNow");
  assert.equal(route("what's due in compliance this week"), "compliance.dueNow");
  assert.equal(route("is anything overdue in the compliance checks"), "compliance.dueNow");
  assert.equal(route("are the water checks overdue"), "compliance.lastCheck", "a named kind of check is answered by its own last-check lookup");
});

t("the questions that already worked still go where they went", () => {
  assert.equal(route("when was the last fire alarm test"), "compliance.lastCheck");
  assert.equal(route("is the fire alarm test overdue"), "compliance.lastCheck");
  assert.equal(route("what are the water temps this month"), "compliance.waterTemps");
  assert.equal(route("when did Pat last log in"), "security.lastLogin");
  assert.equal(route("how many SARs does Pat have outstanding"), "governance.sarOverview");
  assert.equal(route("where are we up to with concerns"), "governance.concernsOverview");
  assert.equal(route("which concerns are with the indemnity insurer"), "governance.concernsOverview");
  assert.equal(route("are there any fridge incidents open"), null, "a fridge incident is the fridge's, not Compliance's");
  assert.equal(route("how many significant events are open"), null);
});

t("a how-to question about these goes to the help, not the lookup", () => {
  assert.equal(route("how do I do a PAT test"), null);
  assert.equal(route("how do I record a panel fault"), null);
  assert.equal(route("how can I see what is overdue in compliance"), null);
  assert.equal(route("tell Pat to send the rota"), null);
});

t("an appliance named in the question is passed on to be found", () => {
  assert.equal(parseManagementQuestion("when is PAT tag R-12 due").input.query, "r-12");
  assert.equal(parseManagementQuestion("has tag 0042 been PAT tested").input.query, "0042");
  assert.equal(parseManagementQuestion("has the kettle been PAT tested").input.query, "kettle");
  assert.deepEqual(parseManagementQuestion("how is the PAT testing going").input, {});
});

const live = (extra) => ({ active: true, ...extra });
const appliances = [
  live({ id: "p1", tag: "R-1", name: "Kettle", location: "Kitchen", category: "handheld", nextDueOn: day(200), lastTestedOn: day(-165), lastResult: "pass" }),
  live({ id: "p2", tag: "R-2", name: "Label printer", location: "Reception", category: "it", nextDueOn: day(-12), lastTestedOn: "2024-10-02", lastResult: "pass" }),
  live({ id: "p3", tag: "R-3", name: "Extension lead", location: "Store", category: "extension" }),
  live({ id: "p4", tag: "R-4", name: "Fan", location: "Office", category: "handheld", outOfUse: true, lastTestedOn: day(-3), lastResult: "fail" }),
  live({ id: "p5", tag: "R-5", name: "Couch lamp", location: "Room 2", category: "clinical", nextDueOn: day(10), lastTestedOn: day(-355), lastResult: "pass" }),
  { id: "p6", tag: "R-6", name: "Old heater", active: false },
];

t("PAT: the overall position, then one appliance, several, none and an empty register", () => {
  const all = patStatusAnswer({ patAssets: appliances, patTests: [{ testedOn: day(-3) }, { testedOn: day(-400) }], now });
  assert.match(all.text, /5 appliances on the PAT register, 4 tested/);
  assert.match(all.text, /1 out of use after a failed test, 1 overdue, 1 not tested yet, 1 due in the next 30 days/);
  assert.match(all.text, /Fan/);
  assert.match(all.text, /1 test recorded in the last 12 months/);
  assert.ok(!all.text.includes("Old heater"), "a retired appliance is not counted");
  const one = patStatusAnswer({ patAssets: appliances, query: "R-2", now });
  assert.match(one.text, /Tag R-2, Label printer \(Reception\) is overdue for testing by 12 days/);
  assert.match(one.text, /Last tested 02\/10\/2024: passed/);
  assert.match(patStatusAnswer({ patAssets: appliances, query: "fan", now }).text, /failed its last test and is out of use/);
  assert.match(patStatusAnswer({ patAssets: appliances, query: "R-3", now }).text, /has not been PAT tested yet/);
  const several = patStatusAnswer({ patAssets: appliances, query: "lamp", now });
  assert.match(several.text, /Couch lamp.*due for testing in 10 days/);
  const none = patStatusAnswer({ patAssets: appliances, query: "microwave", now });
  assert.match(none.text, /can't find an appliance matching "microwave"/);
  assert.match(none.text, /5 appliances on the PAT register/);
  assert.match(patStatusAnswer({ patAssets: [], now }).text, /No appliances are on the PAT register yet/);
  assert.match(patStatusAnswer({ patAssets: [appliances[0]], now }).text, /Every appliance is up to date/);
});

const incident = (extra) => ({ id: `i${Math.random()}`, status: "open", openedAtMs: ago(3).getTime(), actions: [], ...extra });

t("incidents: what is open, how long, and nothing a person typed", () => {
  assert.match(incidentsAnswer({ incidents: [incident({ status: "resolved" })], now }).text, /no open incidents/);
  const answer = incidentsAnswer({
    incidents: [
      incident({ assetLabel: "Hot tap, Staff WC", assetType: "water_hot", location: "Ground floor", actions: [{ choice: "flushed", note: "ZZTYPED note" }] }),
      incident({ kind: "panel_fault", assetLabel: "Fire alarm panel fault", faultNote: "ZZTYPED earth fault", openedAtMs: ago(9).getTime() }),
      incident({ kind: "pat_fail", assetLabel: "Fan", assetType: "pat" }),
      incident({ status: "resolved", assetLabel: "Old one" }),
    ], now,
  });
  assert.match(answer.text, /3 open incidents: 1 failed check, 1 alarm panel fault, 1 failed appliance/);
  assert.match(answer.text, /Fire alarm panel fault, open 9 days/);
  assert.match(answer.text, /Fan failed its PAT test, open 3 days/);
  assert.match(answer.text, /Hot tap, Staff WC failed its check \(Ground floor\), open 3 days\. 1 action recorded; needs a passing recheck/);
  assert.match(answer.text, /Nothing recorded yet/);
  assert.ok(!/ZZTYPED|Old one/.test(answer.text));
  assert.equal(answer.count, 3);
});

t("what is due: nothing, then the urgent things first", () => {
  assert.match(dueNowAnswer({ assets: [], incidents: [], patAssets: [], now }).text, /Nothing needs doing in Compliance/);
  const a = dueNowAnswer({
    assets: [{ id: "fp1", assetType: "fire_point", label: "Call point 1", frequency: "weekly", lastCheckAt: ago(30), active: true }],
    incidents: [incident({ kind: "panel_fault", assetLabel: "Fire alarm panel fault" })],
    patAssets: appliances, now,
  });
  assert.ok(a.count >= 3);
  assert.ok(a.urgent >= 1);
  const lines = a.text.split("\n");
  assert.match(lines[0], /things in Compliance need attention, \d+ urgent/);
  assert.match(lines[1], /^• Urgent: /, "the urgent ones are listed first");
  assert.ok(a.text.includes("The fire alarm panel is showing a fault"));
  assert.match(a.text, /overdue for PAT testing/);
});

t("concerns: where they are with the insurer, GMPI and a solicitor, as counts and waits", () => {
  const open = (id, extra) => ({ id, status: "in_progress", receivedAt: ago(30), ...extra });
  const concerns = [open("a", { mddusRequired: true }), open("b", { gmpiReference: "G-9" }), open("c"), { id: "d", status: "closed", closedAt: ago(5) }];
  const steps = [
    { concernId: "a", party: "indemnity", action: "sent", occurredOn: day(-8), createdAtMs: 1 },
    { concernId: "b", party: "gmpi", action: "sent", occurredOn: day(-2), createdAtMs: 2 },
    { concernId: "b", party: "gmpi", action: "accepted", occurredOn: day(-1), createdAtMs: 3 },
  ];
  const lines = outsidePartyLines(concerns.filter((c) => c.status !== "closed"), steps, now);
  assert.ok(lines.some((l) => /Waiting for a reply: 1 with the indemnity insurer \(longest wait 8 days\)/.test(l)));
  assert.ok(lines.some((l) => /1 case has everyone's agreement and is ready for the final response/.test(l)));
  assert.deepEqual(outsidePartyLines(concerns, null, now), [], "a role that cannot read the steps is told nothing about them");
  const overview = concernsOverviewAnswer({ concerns, steps, now });
  assert.match(overview.text, /Waiting for a reply/);
  assert.ok(!/Waiting for a reply/.test(concernsOverviewAnswer({ concerns, now }).text));
  assert.match(caseOutsideLine(concerns[0], steps.slice(0, 1), now), /Indemnity insurer: waiting for a reply since/);
  assert.match(caseOutsideLine(concerns[1], steps.slice(1), now), /ready for the final response/);
  assert.equal(caseOutsideLine(concerns[2], [], now), "", "a case with no outside party says nothing");
});

t("the daily briefing flags Compliance when something is due, and leaves it with the fine ones when not", () => {
  const busy = dueNowAnswer({ assets: [], incidents: [incident({ kind: "panel_fault", assetLabel: "Fire alarm panel fault" })], patAssets: appliances, now });
  assert.ok(needsAttention(headlineOf(busy.text, 1)), headlineOf(busy.text, 1));
  const quiet = dueNowAnswer({ assets: [], incidents: [], patAssets: [], now });
  assert.ok(!needsAttention(headlineOf(quiet.text, 1)), headlineOf(quiet.text, 1));
});

console.log(`\n${n} passed`);
