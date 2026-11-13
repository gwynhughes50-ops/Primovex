// Covers two things Ask Primovex can now answer: "Who's in today?" (who has been in Primovex today, and for everyone else when they last signed in)
// and "Show my shifts" (a member of the reception team's own shifts from the published rota).
import assert from "node:assert/strict";
import { looksLikeWhoIsIn, parseManagementQuestion, whoIsInAnswer } from "../src/ai/management/managementAsk.js";
import { myShiftsAnswer, parseMyShifts } from "../src/ai/rota/rotaAsk.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };

// ---- who is in today ----
t("the ways of asking who is in Primovex are recognised, and rota and how-to questions are left alone", () => {
  for (const q of ["Who's in today?", "who is in today", "whos in today", "who has logged in today?", "Who's logged in?", "who hasn't logged in today", "who has not signed in", "who's in primovex", "who is using the app today", "who's online right now", "who's in?", "who has been in Primovex today"]) {
    assert.equal(looksLikeWhoIsIn(q), true, q);
    assert.deepEqual(parseManagementQuestion(q), { toolId: "security.whoIsIn", input: {} }, q);
  }
  for (const q of ["who's on reception today", "who is off today", "who's on the rota", "who is on holiday", "how do I see who is in today", "who is in charge of fridges", "when did Craig last log in", "who is Craig"]) assert.equal(looksLikeWhoIsIn(q), false, q);
  assert.equal(parseManagementQuestion("when did Craig last log in").toolId, "security.lastLogin", "a named person still goes to the last sign-in lookup");
});

const NOW = new Date("2026-11-13T14:00:00");
const at = (day, hour, min = 0) => new Date(2026, 10, day, hour, min, 0);
const person = (uid, name, signedIn, extra = {}) => ({ uid, name, lastSignIn: signedIn, lastSeen: extra.seen || signedIn, sessions: [{ status: extra.active ? "active" : "ended" }], ...extra });

t("who is in today: those signed in today first, then everyone else with the last time they signed in, and people with no sign-in at all", () => {
  const directory = [{ id: "u1", label: "Gwyn Hughes" }, { id: "u2", label: "Kim Bell" }, { id: "u3", label: "Craig Davies" }, { id: "u4", label: "Sam Price" }, { id: "u5", label: "Pat New" }];
  const people = [
    person("u1", "Gwyn Hughes", at(13, 8, 12), { active: true, seen: at(13, 13, 55) }),
    person("u2", "Kim Bell", at(13, 8, 45), { seen: at(13, 11, 20) }),
    person("u3", "Craig Davies", at(12, 9, 10)),
    person("u4", "Sam Price", at(2, 14, 20)),
  ];
  const a = whoIsInAnswer({ people, directory, now: NOW });
  assert.deepEqual(a.counts, { in: 2, out: 3, total: 5 });
  const lines = a.text.split("\n");
  assert.equal(lines[0], "2 of 5 people have been in Primovex today.");
  assert.ok(a.text.includes("Gwyn Hughes (since 08:12, in now)"));
  assert.ok(a.text.includes("Kim Bell (since 08:45, last active 11:20)"));
  assert.ok(a.text.indexOf("Gwyn Hughes") < a.text.indexOf("Kim Bell"), "earliest sign-in first");
  assert.ok(a.text.includes("Craig Davies: 12 Nov at 09:10 (yesterday)"));
  assert.ok(a.text.includes("Sam Price: 2 Nov at 14:20 (11 days ago)"));
  assert.ok(a.text.includes("Pat New: no sign-in in the last 90 days"));
  assert.ok(a.text.indexOf("Craig Davies") < a.text.indexOf("Sam Price") && a.text.indexOf("Sam Price") < a.text.indexOf("Pat New"), "most recent first, then no sign-in");
});

t("who is in today: still in when a session from before midnight is still open, and an empty or unreadable list says so", () => {
  const overnight = whoIsInAnswer({ people: [person("u1", "Night Owl", at(12, 22, 0), { active: true })], directory: [{ id: "u1", label: "Night Owl" }], now: NOW });
  assert.equal(overnight.counts.in, 1);
  const nobody = whoIsInAnswer({ people: [person("u1", "Kim Bell", at(12, 9))], directory: [{ id: "u1", label: "Kim Bell" }], now: NOW });
  assert.match(nobody.text, /^Nobody has signed in to Primovex today yet\./);
  assert.match(nobody.text, /Kim Bell: 12 Nov at 09:00 \(yesterday\)/);
  assert.equal(whoIsInAnswer({ people: [], directory: null, now: NOW }).found, false);
  // without the list of accounts, only people in the records are listed
  const noDirectory = whoIsInAnswer({ people: [person("u1", "Kim Bell", at(13, 9))], directory: null, now: NOW });
  assert.equal(noDirectory.counts.total, 1);
});

t("who is in today: a long list is cut with a count, and names nothing but staff", () => {
  const directory = Array.from({ length: 40 }, (_, i) => ({ id: `u${i}`, label: `Person ${String(i).padStart(2, "0")}` }));
  const a = whoIsInAnswer({ people: [], directory, now: NOW });
  assert.match(a.text, /and 10 more$/);
  assert.equal(a.counts.out, 40);
});

// ---- show my shifts ----
t("the ways of asking for your own shifts are recognised, with when you mean", () => {
  const cases = [
    ["Show my shifts", "next"], ["what are my shifts this week", "week"], ["my rota", "next"], ["when am I working next", "next"], ["Am I working tomorrow?", "tomorrow"],
    ["what shift am I on today", "today"], ["when am I in on Wednesday", "wed"], ["show my shifts next week", "nextWeek"], ["what am I working on friday", "fri"],
  ];
  for (const [q, when] of cases) assert.deepEqual(parseMyShifts(q), { when }, q);
  for (const q of ["how do I swap my shift", "I want to change my shift", "swap my shifts with Kim", "who is in today", "show the rota", "how do I see my shifts"]) assert.equal(parseMyShifts(q), null, q);
});

const week = (monday, slots, uid = "me") => ({
  mondayIso: monday, teamUids: [uid, "kim"],
  slots: [{ key: "early1", label: "Early 1", start: "08:00", end: "16:30" }, { key: "late", label: "Late", start: "10:00", end: "18:30" }],
  days: Object.fromEntries(slots.map(([day, iso, key, who, extra]) => [day, { iso, slots: { [key]: { uid: who, name: who, ...(extra || {}) } } }])),
});
const weeks = {
  "2026-11-09": week("2026-11-09", [["fri", "2026-11-13", "late", "me"]]),
  "2026-11-16": { ...week("2026-11-16", [["mon", "2026-11-16", "early1", "me"], ["wed", "2026-11-18", "late", "me", { from: "11:00" }]]), days: { mon: { iso: "2026-11-16", slots: { early1: { uid: "me", name: "Me" } } }, tue: { iso: "2026-11-17", slots: { late: { uid: "kim", name: "Kim" } } }, wed: { iso: "2026-11-18", slots: { late: { uid: "me", name: "Me", from: "11:00" } } } } },
};
const FRI = new Date("2026-11-13T09:00:00");

t("my shifts: today, tomorrow, a day, this week and the next few, in the person's own words", () => {
  const ask = (when, now = FRI) => myShiftsAnswer({ weeks, uid: "me", now, when });
  assert.equal(ask("today").text, "Today you're on Late, 10–18.30.");
  assert.equal(ask("tomorrow").text, "You're not on a shift tomorrow. Your next is Mon 16 Nov: Early 1, 8–16.30.");
  assert.equal(ask("mon").text, "On Monday you're on Early 1, 8–16.30.");
  assert.equal(ask("week").text, "Your shifts this week:\nFri 13 Nov: Late, 10–18.30");
  assert.equal(ask("nextWeek").text, "Your shifts next week:\nMon 16 Nov: Early 1, 8–16.30\nWed 18 Nov: Late, 11–18.30 (a part shift)");
  assert.equal(ask("next").text, "Your next shifts:\nFri 13 Nov: Late, 10–18.30\nMon 16 Nov: Early 1, 8–16.30\nWed 18 Nov: Late, 11–18.30 (a part shift)");
  assert.equal(ask("tue", new Date("2026-11-16T09:00:00")).text.startsWith("You're not on a shift on Tuesday."), true);
});

t("my shifts: someone who is not on the rota, or has no published week, is told so and sees nothing of anyone else", () => {
  const none = myShiftsAnswer({ weeks, uid: "stranger", now: FRI, when: "next" });
  assert.equal(none.found, false);
  assert.match(none.text, /not on the reception rota/);
  assert.equal(myShiftsAnswer({ weeks: {}, uid: "me", now: FRI }).found, false);
  const text = myShiftsAnswer({ weeks, uid: "me", now: FRI, when: "next" }).text;
  assert.ok(!/Kim/.test(text), "no one else's shifts");
});

console.log(`\n${n} passed`);
