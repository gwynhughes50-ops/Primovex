import assert from "node:assert/strict";
import { buildReminderDraft, extractReminder, looksLikeReminder, parseWhen } from "../src/ai/reminders/reminders.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
// Friday 9 October 2026, 10:00
const now = new Date("2026-10-09T10:00:00");
const fmt = (d) => d && `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

t("a reminder request is told apart from everything else", () => {
  for (const s of ["remind me to check the vaccine fridge tomorrow at 9", "Remind me about the fire drill on Monday", "set a reminder to order gloves", "please remind me to call the supplier", "can you remind me to lock the store", "make a note to check the cleaning rota", "remind everyone to sign the fire register"]) {
    assert.ok(looksLikeReminder(s), s);
  }
  for (const s of ["what reminders do I have", "when is my reminder", "tell the HCA team the fridge needs checking", "I've taken two gloves", "remind Ben to check the fridge"]) {
    assert.ok(!looksLikeReminder(s), s);
  }
  assert.equal(extractReminder("remind everyone to sign the fire register").scope, "practice");
  assert.equal(extractReminder("remind me to order gloves").scope, "private");
});

t("when is read the way people say it", () => {
  assert.equal(fmt(parseWhen("check the fridge tomorrow at 9", now).date), "2026-10-10 09:00");
  assert.equal(fmt(parseWhen("check the fridge tomorrow", now).date), "2026-10-10 09:00");
  assert.equal(fmt(parseWhen("call Boots tomorrow at 3pm", now).date), "2026-10-10 15:00");
  assert.equal(fmt(parseWhen("order gloves on monday", now).date), "2026-10-12 09:00");
  assert.equal(fmt(parseWhen("order gloves next friday", now).date), "2026-10-16 09:00");
  assert.equal(fmt(parseWhen("order gloves on friday", now).date), "2026-10-16 09:00");
  assert.equal(fmt(parseWhen("sign off the rota in 2 hours", now).date), "2026-10-09 12:00");
  assert.equal(fmt(parseWhen("ring the lab in 30 minutes", now).date), "2026-10-09 10:30");
  assert.equal(fmt(parseWhen("chase the delivery in 3 days", now).date), "2026-10-12 09:00");
  assert.equal(fmt(parseWhen("check the fridge this afternoon", now).date), "2026-10-09 14:00");
  assert.equal(fmt(parseWhen("lock up tonight", now).date), "2026-10-09 20:00");
  assert.equal(fmt(parseWhen("fire drill on the 14th", now).date), "2026-10-14 09:00");
  assert.equal(fmt(parseWhen("fire drill on the 2nd of november", now).date), "2026-11-02 09:00");
  assert.equal(fmt(parseWhen("order gloves at 3", now).date), "2026-10-09 15:00");
  assert.equal(fmt(parseWhen("order gloves at 8am", now).date), "2026-10-10 08:00", "a time already gone today means tomorrow");
  assert.equal(parseWhen("check the cleaning rota", now).date, null);
  assert.equal(parseWhen("check the fridge tomorrow at 9", now).rest, "check the fridge");
});

t("the card says what, when and who sees it, and saves nothing yet", () => {
  const r = buildReminderDraft({ question: "remind me to check the vaccine fridge tomorrow at 9" }, { now });
  assert.ok(r.proposal, r.text);
  assert.equal(r.proposal.kind, "reminder");
  assert.equal(r.proposal.requiredCapability, "dashboard.read");
  assert.deepEqual(r.proposal.params, { text: "Check the vaccine fridge", dueAt: new Date("2026-10-10T09:00:00").toISOString(), scope: "private" });
  assert.match(r.proposal.lines.join("\n"), /Reminder: Check the vaccine fridge/);
  assert.match(r.proposal.lines.join("\n"), /When: tomorrow at 09:00/);
  assert.match(r.proposal.lines.join("\n"), /only you/);
  assert.match(r.text, /Nothing has been saved yet/);
});

t("a shared reminder, one with no time, and ones that are refused", () => {
  const shared = buildReminderDraft({ question: "remind everyone to sign the fire register on monday" }, { now });
  assert.equal(shared.proposal.params.scope, "practice");
  assert.match(shared.proposal.lines.join("\n"), /everyone in the practice/);
  const none = buildReminderDraft({ question: "remind me to order gloves" }, { now });
  assert.equal(none.proposal.params.dueAt, null);
  assert.match(none.proposal.lines.join("\n"), /no time set/);
  const empty = buildReminderDraft({ question: "remind me" }, { now });
  assert.equal(empty.proposal, undefined);
  const id = buildReminderDraft({ question: "remind me to ring 0121 555 0123 tomorrow" }, { now });
  assert.equal(id.proposal, undefined);
  assert.match(id.text, /patient details/);
});

console.log(`\n${n} passed`);
