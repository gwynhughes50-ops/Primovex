// Covers the guard as Ask Primovex uses it: what is said is checked before it is classified or sent anywhere, commands about a colleague by name still work,
// and the wiring is in the right place.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkAskInput } from "@/ai/guard/askGuard";
import { redactText } from "@/ai/guard/patientGuard";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const read = (path) => readFileSync(join(process.cwd(), path), "utf8");

t("a patient's name stops the request, whatever it is asking for", () => {
  for (const text of ["Write a reply to Margaret Smith about her complaint", "Mrs Jones wants a copy of her records", "the patient called John Davies rang"]) {
    const out = checkAskInput(text);
    assert.equal(out.ok, false, text);
    assert.match(out.message, /^I can't process this because it looks like it contains a person's name/);
  }
});

t("commands about a colleague by name still work: with the staff list the name is allowed (and a stranger's is not); without it the look-up decides", () => {
  const staff = ["Craig Davies", "Sam Price", "Gwyn Hughes"];
  for (const text of ["Tell Sam the fridge needs checking", "when did Craig last log in", "how many SARs does Craig have outstanding", "tell the HCA team BD blue needles need ordering"]) {
    assert.equal(checkAskInput(text, { allow: staff }).ok, true, `with the list: ${text}`);
    assert.equal(checkAskInput(text, { allow: ["Gwyn Hughes"] }).ok, true, `without the list: ${text}`);
  }
  assert.equal(checkAskInput("SAR for Mary Evans is overdue", { allow: staff }).ok, false, "with the list, a patient's name in a SAR question is refused");
  assert.equal(checkAskInput("when did Margaret Smith last log in", { allow: staff }).ok, false);
});

t("but anything else identifying in those commands is still refused", () => {
  const out = checkAskInput("Tell Sam her NHS number is 943 476 5919");
  assert.equal(out.ok, false);
  assert.match(out.message, /an NHS number/);
  assert.ok(!/a person's name/.test(out.message));
});

t("ordinary requests are untouched", () => {
  for (const text of ["Which stock is low?", "Count the gloves, I have 12", "Remind me on Monday to ring the pharmacy", "Take me to the SARs", "Show my shifts", "Who's in today?", "SAR for EMIS 1234567, patient JS, born 04/05/1960"]) {
    assert.equal(checkAskInput(text).ok, true, text);
  }
});

t("a colleague's name from the staff list is allowed anywhere, a stranger's is not", () => {
  assert.equal(checkAskInput("Dr Lane has asked about the fire alarm test", { allow: ["Ben Lane"] }).ok, true);
  assert.equal(checkAskInput("Dr Patel has asked about the fire alarm test", { allow: ["Ben Lane"] }).ok, false);
});

t("what stays in the conversation has the name blanked out", () => {
  const typed = "Write a reply to Margaret Smith about her complaint";
  const out = checkAskInput(typed);
  assert.equal(redactText(typed, out.problems), "Write a reply to [removed] about her complaint");
});

t("it is wired in before anything is classified or sent: in the context's ask, ahead of the user's message and the engine", () => {
  const ctx = read("src/ai/context/PrimovexAIContext.jsx");
  const ask = ctx.slice(ctx.indexOf("const ask = useCallback"), ctx.indexOf("}, [capabilities, messages, orb"));
  assert.match(ask, /checkAskInput\(engineInput, \{ allow: staff, conversation: messages \}\)/);
  assert.ok(ask.indexOf("checkAskInput") < ask.indexOf("orb.ask("), "checked before the engine is called");
  assert.ok(ask.indexOf("checkAskInput") < ask.indexOf("createMessage({ role: 'user', content: options.displayText"), "and before the typed words are put in the conversation");
  assert.match(ask, /content: redactText\(options\.displayText \|\| cleanPrompt, guard\.problems\)/);
  assert.match(ask, /intent: 'privacy\.blocked'/);
  assert.match(read("src/ai/guard/staffNames.js"), /listStaffDirectory/);
  const panel = read("src/ai/components/AskPrimovexPanel.jsx");
  assert.match(panel, /message\.intent !== 'privacy\.blocked' && Number\.isFinite\(message\.confidence\)/, "a refusal shows no confidence score");
  assert.match(panel, /message\.intent !== 'privacy\.blocked' && <MessageFeedback/, "and no Did that help? row");
});

console.log(`\n${n} passed`);
