// Covers the reception team's rota helper in Ask Primovex: how many lates and earlies, who is on, and "swap my Tuesday late".
import assert from "node:assert/strict";
import { KINDS, countShifts, kindOfLabel, myCountsAnswer, parseMyCounts, parseMyShifts, parseSwap, parseWhoIsOn, swapCandidates, swapReply, whoIsOnAnswer } from "../src/ai/rota/rotaAsk.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };

const SLOTS = [
  { key: "early1", label: "Early 1", start: "08:00", end: "16:30" }, { key: "early2", label: "Early 2", start: "08:00", end: "16:30" },
  { key: "mid", label: "Mid", start: "09:30", end: "18:00" }, { key: "late", label: "Late", start: "10:00", end: "18:30" },
];
// place: [day, key, uid, name]
const week = (monday, isoOfDay, places, team = ["me", "kim", "lee", "sam"]) => ({
  mondayIso: monday, teamUids: team, slots: SLOTS,
  days: Object.fromEntries(Object.entries(isoOfDay).map(([day, iso]) => [day, { iso, slots: Object.fromEntries(places.filter((p) => p[0] === day).map(([, key, uid, name]) => [key, { uid, name }])) }])),
});
const D1 = { mon: "2026-11-16", tue: "2026-11-17", wed: "2026-11-18", thu: "2026-11-19", fri: "2026-11-20" };
const D2 = { mon: "2026-11-23", tue: "2026-11-24", wed: "2026-11-25", thu: "2026-11-26", fri: "2026-11-27" };
const weeks = {
  "2026-11-16": week("2026-11-16", D1, [
    ["mon", "early1", "me", "Me"], ["mon", "late", "kim", "Kim"], ["mon", "mid", "lee", "Lee"],
    ["tue", "late", "me", "Me"], ["tue", "early1", "kim", "Kim"], ["tue", "early2", "sam", "Sam"],
    ["wed", "late", "kim", "Kim"], ["wed", "mid", "me", "Me"], ["wed", "early1", "lee", "Lee"],
    ["fri", "late", "me", "Me"], ["fri", "early1", "sam", "Sam"],
  ]),
  "2026-11-23": week("2026-11-23", D2, [
    ["mon", "late", "me", "Me"], ["mon", "early1", "kim", "Kim"], ["tue", "late", "kim", "Kim"], ["tue", "early1", "me", "Me"], ["thu", "late", "lee", "Lee"], ["thu", "early1", "me", "Me"],
  ]),
};
const MON = new Date("2026-11-16T09:00:00");

t("shifts are sorted into kinds from their names", () => {
  assert.deepEqual(["Early 1", "Early 2", "Mid", "Late", "Admin 3", "Desk/phones", "Desk/phones (morning)", "Ty Elan", "Something"].map(kindOfLabel), ["early", "early", "mid", "late", "admin", "desk", "desk", "tyelan", ""]);
  assert.equal(KINDS.tyelan, "Ty Elan");
});

t("counting questions are recognised, with the kind and when, and other questions are left alone", () => {
  assert.deepEqual(parseMyCounts("How many lates do I have?"), { kind: "late", when: "all" });
  assert.deepEqual(parseMyCounts("how many earlies do I have this week"), { kind: "early", when: "week" });
  assert.deepEqual(parseMyCounts("how many shifts do I have next week"), { kind: "", when: "nextWeek" });
  assert.deepEqual(parseMyCounts("what's my shift breakdown for the rota"), { kind: "", when: "all" });
  assert.deepEqual(parseMyCounts("how many mids have I got"), { kind: "mid", when: "all" });
  for (const q of ["how many SARs are outstanding", "how do I count my shifts", "how many lates does Kim have", "show my shifts", "who's on tomorrow", "swap my late"]) assert.equal(parseMyCounts(q), null, q);
});

t("counts: lates and earlies in the published weeks, in one week, with the team average, and the whole breakdown", () => {
  assert.deepEqual(countShifts(weeks, "me", { from: "2026-11-16", to: "9999-12-31" }), { early: 3, mid: 1, late: 3, admin: 0, desk: 0, tyelan: 0, other: 0, total: 7 });
  const lates = myCountsAnswer({ weeks, uid: "me", now: MON, kind: "late", when: "all" });
  assert.equal(lates.count, 3);
  assert.match(lates.text, /^You have 3 lates in the 2 published weeks\. The team average is \d(\.\d)?\.$/);
  assert.match(myCountsAnswer({ weeks, uid: "me", now: MON, kind: "early", when: "week" }).text, /^You have 1 early this week\./);
  assert.match(myCountsAnswer({ weeks, uid: "me", now: MON, kind: "late", when: "nextWeek" }).text, /^You have 1 late next week\./);
  assert.match(myCountsAnswer({ weeks, uid: "me", now: MON, kind: "admin", when: "all" }).text, /^You have no admin shifts in the 2 published weeks\./);
  assert.equal(myCountsAnswer({ weeks, uid: "me", now: MON, kind: "", when: "all" }).text, "You have 7 shifts in the 2 published weeks: 3 earlies, 1 mid, 3 lates.");
  assert.equal(myCountsAnswer({ weeks, uid: "stranger", now: MON }).found, false);
});

t("who is on is recognised, and holiday, call and sign-in questions are not taken for it", () => {
  assert.deepEqual(parseWhoIsOn("Who's on tomorrow?"), { when: "tomorrow", kind: "", withMe: false });
  assert.deepEqual(parseWhoIsOn("who is working Thursday"), { when: "thu", kind: "", withMe: false });
  assert.deepEqual(parseWhoIsOn("who's on with me on Wednesday"), { when: "wed", kind: "", withMe: true });
  assert.deepEqual(parseWhoIsOn("who am I working with tomorrow"), { when: "tomorrow", kind: "", withMe: true });
  assert.deepEqual(parseWhoIsOn("who's on the late tomorrow"), { when: "tomorrow", kind: "late", withMe: false });
  assert.deepEqual(parseWhoIsOn("who's on today"), { when: "today", kind: "", withMe: false });
  for (const q of ["who's in today", "who is on holiday", "who's on call", "who is off tomorrow", "how do I see who's on", "swap who's on"]) assert.equal(parseWhoIsOn(q), null, q);
});

t("who is on: the day's roster from the published week, only people who are on, and who you are working with", () => {
  const tomorrow = whoIsOnAnswer({ weeks, uid: "me", now: MON, when: "tomorrow" }).text;
  assert.match(tomorrow, /^Tomorrow:\n/);
  for (const line of ["Kim (Early 1, 8–16.30)", "Sam (Early 2, 8–16.30)", "Me (Late, 10–18.30) that's you"]) assert.ok(tomorrow.includes(line), line);
  const withMe = whoIsOnAnswer({ weeks, uid: "me", now: MON, when: "tue", withMe: true }).text;
  assert.match(withMe, /^On Tuesday you're on Late, 10–18\.30\. Also on:\n/);
  assert.ok(withMe.includes("Kim (Early 1, 8–16.30)") && withMe.includes("Sam (Early 2, 8–16.30)") && !withMe.includes("that's you"));
  assert.match(whoIsOnAnswer({ weeks, uid: "lee", now: MON, when: "tue", withMe: true }).text, /not on a shift/);
  assert.match(whoIsOnAnswer({ weeks, uid: "me", now: MON, when: "thu" }).text, /^Nobody is shown on a shift on Thursday\./);
  assert.equal(whoIsOnAnswer({ weeks, uid: "me", now: MON, when: "wed", kind: "late" }).text, "Wednesday (late):\nKim (Late, 10–18.30)");
  assert.match(whoIsOnAnswer({ weeks, uid: "me", now: new Date("2026-11-30T09:00:00"), when: "today" }).text, /Nothing has been published/);
  assert.equal(whoIsOnAnswer({ weeks, uid: "stranger", now: MON }).found, false);
});

t("swap requests are recognised, with the day, the kind and the colleague, and help questions are not", () => {
  assert.deepEqual(parseSwap("swap my Tuesday late"), { day: "tue", kind: "late", withName: "", theirDay: "", theirKind: "" });
  assert.deepEqual(parseSwap("I want to swap my shift on Thursday"), { day: "thu", kind: "", withName: "", theirDay: "", theirKind: "" });
  assert.deepEqual(parseSwap("swap my Tuesday late with Kim"), { day: "tue", kind: "late", withName: "kim", theirDay: "", theirKind: "" });
  assert.deepEqual(parseSwap("swap my Tuesday late with kim for her wednesday early"), { day: "tue", kind: "late", withName: "kim", theirDay: "wed", theirKind: "early" });
  assert.equal(parseSwap("who can swap with me on Wednesday").day, "wed");
  for (const q of ["how do I swap a shift", "swap the stock", "show my shifts", "who's on tomorrow"]) assert.equal(parseSwap(q), null, q);
});

const options = [
  { withUid: "kim", name: "Kim Bell", monday: "2026-11-16", day: "wed", key: "late", label: "Wed 18 Nov: Late, 10–18.30", changesHours: false },
  { withUid: "kim", name: "Kim Bell", monday: "2026-11-16", day: "tue", key: "early1", label: "Tue 17 Nov: Early 1, 8–16.30", changesHours: true },
  { withUid: "sam", name: "Sam Price", monday: "2026-11-16", day: "tue", key: "early2", label: "Tue 17 Nov: Early 2, 8–16.30", changesHours: false },
];

t("swap: which shift, which colleague, then a card to confirm that asks the colleague, and nothing is sent before", () => {
  const parsed = parseSwap("swap my Tuesday late");
  const candidates = swapCandidates({ weeks, uid: "me", now: MON, day: parsed.day, kind: parsed.kind });
  assert.equal(candidates.length, 1);
  assert.equal(swapReply({ parsed, candidates }).stage, "need-options");
  const several = swapReply({ parsed, candidates, options });
  assert.equal(several.stage, "choose-swap");
  assert.equal(several.followUps.length, 3);
  assert.match(several.text, /^3 swaps would work for your Tue 17 Nov Late\./);
  const picked = swapReply({ parsed: parseSwap("swap my tue late with sam"), candidates, options });
  assert.equal(picked.stage, "propose");
  assert.equal(picked.proposal.kind, "rota-swap");
  assert.equal(picked.proposal.title, "Ask Sam Price to swap shifts");
  assert.equal(picked.proposal.status, "proposed");
  assert.deepEqual(picked.proposal.params.from, { monday: "2026-11-16", day: "tue", key: "late" });
  assert.deepEqual(picked.proposal.params.to, { monday: "2026-11-16", day: "tue", key: "early2" });
  assert.match(picked.proposal.lines.join("|"), /No one's hours change/);
  const hours = swapReply({ parsed: parseSwap("swap my tue late with kim for her tuesday early"), candidates, options });
  assert.equal(hours.stage, "propose");
  assert.match(hours.proposal.lines.join("|"), /changes someone's hours, so the coordinator will also need to agree/);
  const second = swapReply({ parsed: parseSwap("swap my tue late with kim"), candidates, options });
  assert.equal(second.stage, "choose-swap", "Kim has two that work, so she is asked which");
  assert.equal(second.followUps.length, 2);
});

t("swap: several shifts asks which, no shift says so, no options says what to do instead, and a name with no swap lists what does work", () => {
  const both = swapCandidates({ weeks, uid: "me", now: MON, day: "", kind: "late" });
  assert.equal(both.length, 3);
  const choose = swapReply({ parsed: parseSwap("swap my late"), candidates: both });
  assert.equal(choose.stage, "choose-shift");
  assert.equal(choose.followUps.length, 3);
  assert.match(choose.followUps[0].ask, /^swap my Tue Late/);
  assert.match(swapReply({ parsed: parseSwap("swap my thursday late"), candidates: swapCandidates({ weeks, uid: "me", now: MON, day: "thu", kind: "late" }) }).text, /^You don't have a late shift on Thursday to swap/);
  assert.equal(swapReply({ parsed: parseSwap("swap my tue late"), candidates: swapCandidates({ weeks, uid: "me", now: MON, day: "tue" }), options: [] }).stage, "no-options");
  const nobody = swapReply({ parsed: parseSwap("swap my tue late with pat"), candidates: swapCandidates({ weeks, uid: "me", now: MON, day: "tue" }), options });
  assert.equal(nobody.stage, "no-match");
  assert.match(nobody.text, /Pat can't swap/);
  assert.match(nobody.text, /Sam Price: Tue 17 Nov: Early 2/);
});

t("my shifts still work, and are not taken for a count or a swap", () => {
  assert.deepEqual(parseMyShifts("Show my shifts"), { when: "next" });
  assert.equal(parseMyShifts("how many shifts do I have"), null);
  assert.equal(parseMyShifts("swap my shift"), null);
});

console.log(`\n${n} passed`);
