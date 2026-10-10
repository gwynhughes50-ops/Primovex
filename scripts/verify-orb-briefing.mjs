import assert from "node:assert/strict";
import { composeBriefing, headlineOf, looksLikeBriefing, needsAttention } from "../src/ai/briefing/briefing.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };

t("asking for a briefing is told apart from asking how to do things", () => {
  for (const s of ["what needs attention before I leave", "give me the end of day briefing", "morning briefing please", "anything I need to know before I go home", "brief me", "handover for tonight", "what's outstanding", "end of the day round up"]) {
    assert.ok(looksLikeBriefing(s), s);
  }
  for (const s of ["how do I do the end of day check", "where is the handover form", "what is low in stock", "are all fridges ok"]) {
    assert.ok(!looksLikeBriefing(s), s);
  }
});

t("each answer is cut down to its headline", () => {
  assert.equal(headlineOf("Active alerts: 2 running low.\nSome other line"), "Active alerts: 2 running low.");
  assert.equal(headlineOf("3 SARs outstanding.\n1 overdue.\nBy person: A 2\n• SAR-1: x", 2), "3 SARs outstanding. 1 overdue.");
  assert.equal(headlineOf("1 of 5 rooms haven't been cleaned.\nStill to do: Clinic 1.\n• bullet", 2), "1 of 5 rooms haven't been cleaned. Still to do: Clinic 1.");
  assert.equal(headlineOf(""), "");
});

t("what needs attention is separated from what is fine", () => {
  for (const s of ["Active alerts: 2 running low.", "3 SARs outstanding. 1 overdue.", "2 items have already expired and should come out of use", "The next one was due 5 days ago, so it is overdue.", "Outside the safe range: Clinic 1 cold 22.4°C", "1 of 5 rooms haven't been marked as cleaned today.", "2 items out of stock"]) {
    assert.ok(needsAttention(s), s);
  }
  for (const s of ["There are no active alerts right now.", "Every room (5) has been cleaned today.", "Nothing has expired and nothing is close to its expiry date.", "No SARs outstanding", "The next one is due by Tuesday 13 October.", "You have no open quick notes.", "None overdue; 2 due within a week", "There are no open concerns."]) {
    assert.ok(!needsAttention(s), s);
  }
});

t("fridge checks that are missing are an attention item", () => {
  assert.ok(needsAttention("1 of 3 fridges checked today. Not checked yet: Medicine fridge, Sample freezer."));
  assert.ok(needsAttention("2 fridge incidents open: Vaccine fridge."));
  assert.ok(!needsAttention("All 3 fridges have been checked today."));
});

t("the briefing leads with what needs attention and lists the rest as fine", () => {
  const r = composeBriefing([
    { label: "Alerts", text: "Active alerts: 2 running low.", attention: true },
    { label: "Cleaning", text: "Every room (5) has been cleaned today.", attention: false },
    { label: "SARs", text: "3 SARs outstanding. 1 overdue.", attention: true },
  ]);
  assert.equal(r.attention, 2);
  assert.match(r.text, /^2 things need your attention before you go:\n• Alerts: Active alerts: 2 running low\.\n• SARs: 3 SARs outstanding\. 1 overdue\.\n\nAll fine:\n• Cleaning: Every room/);
  assert.match(composeBriefing([{ label: "Alerts", text: "x", attention: true }]).text, /^One thing needs your attention/);
  assert.match(composeBriefing([{ label: "Alerts", text: "ok", attention: false }]).text, /^Nothing needs your attention right now\./);
  assert.match(composeBriefing([{ label: "Alerts", text: "x", attention: true }], { when: "morning" }).text, /today:/);
  assert.match(composeBriefing([]).text, /couldn't read anything/);
});

console.log(`\n${n} passed`);
