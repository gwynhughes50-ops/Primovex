import assert from "node:assert/strict";
import { interpretSpoken, pickOption, spokenReply } from "../src/ai/voice/spokenCommands.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };

const harm = [
  { label: "No harm", hint: "Happened but nobody was harmed (a near miss)", ask: "a" },
  { label: "Low harm", hint: "Minor harm, needed no more than simple treatment", ask: "b" },
  { label: "Moderate harm", hint: "Needed extra treatment", ask: "c" },
  { label: "Severe harm", hint: "Serious or permanent harm, or a death", ask: "d" },
];
const batches = [
  { label: "Batch ending 4821", hint: "expires 31/03/2027 · 12 in stock", ask: "x" },
  { label: "Batch ending 7390", hint: "expires 31/01/2028 · 8 in stock", ask: "y" },
];
const places = ["I've taken 1 Adrenaline from Main Surgery - D62", "I've taken 1 Adrenaline from Anaphylaxis Box 3"];

t("short spoken answers pick the choice offered", () => {
  assert.equal(pickOption("low harm", harm), 1);
  assert.equal(pickOption("Severe harm.", harm), 3);
  assert.equal(pickOption("moderate", harm), 2);
  assert.equal(pickOption("no harm", harm), 0);
  assert.equal(pickOption("the second one", harm), 1);
  assert.equal(pickOption("number three", harm), 2);
  assert.equal(pickOption("first", batches), 0);
});

t("a batch is picked by the digits said", () => {
  assert.equal(pickOption("4821", batches), 0);
  assert.equal(pickOption("ending 7390", batches), 1);
  assert.equal(pickOption("batch ending four eight two one", batches), -1, "digits spoken one by one aren't guessed");
  assert.equal(pickOption("821", batches), 0, "the last few digits are enough");
});

t("choices that are plain sentences are picked by what is in them", () => {
  assert.equal(pickOption("anaphylaxis box", places), 1);
  assert.equal(pickOption("D62", places), 0);
  assert.equal(pickOption("the car park", places), -1);
});

t("ambiguous or unrelated speech picks nothing", () => {
  assert.equal(pickOption("harm", harm), -1);
  assert.equal(pickOption("what is the weather", harm), -1);
  assert.equal(pickOption("", harm), -1);
  assert.equal(pickOption("fifth", harm), -1);
});

t("yes and no only mean something when a card is waiting", () => {
  assert.deepEqual(interpretSpoken("yes", { hasProposal: true }), { type: "confirm" });
  assert.deepEqual(interpretSpoken("Yeah, go ahead", { hasProposal: true }), { type: "text" }, "only the plain forms");
  assert.deepEqual(interpretSpoken("go ahead", { hasProposal: true }), { type: "confirm" });
  assert.deepEqual(interpretSpoken("Orb, confirm", { hasProposal: true }), { type: "confirm" });
  assert.deepEqual(interpretSpoken("yes", { hasProposal: false }), { type: "text" });
  assert.deepEqual(interpretSpoken("cancel that", { hasProposal: true }), { type: "cancel" });
  assert.deepEqual(interpretSpoken("never mind", { hasProposal: true }), { type: "cancel" });
  assert.deepEqual(interpretSpoken("no", { hasProposal: true }), { type: "cancel" });
});

t("a choice wins while choices are on offer; 'no' then means no harm, not cancel", () => {
  assert.deepEqual(interpretSpoken("no", { options: harm, hasProposal: false }), { type: "choice", index: 0 });
  assert.deepEqual(interpretSpoken("low harm", { options: harm }), { type: "choice", index: 1 });
});

t("'that's all' and the like end the conversation", () => {
  for (const s of ["that's all", "That is all.", "thanks", "thank you", "stop", "I'm done", "bye", "all done", "no thanks"]) assert.deepEqual(interpretSpoken(s), { type: "end" }, s);
  assert.deepEqual(interpretSpoken("that's all", { hasProposal: true }), { type: "end" }, "the card stays on screen");
});

t("anything else is a normal request", () => {
  for (const s of ["I've taken one adrenaline", "and two more gloves", "where is the chlorphenamine", "how many are left"]) assert.deepEqual(interpretSpoken(s, { hasProposal: true }), { type: "text" }, s);
  assert.deepEqual(interpretSpoken("   "), { type: "empty" });
});

t("what it says out loud is short, and says what to say next", () => {
  assert.equal(spokenReply({ role: "user", content: "hi" }), null);
  assert.equal(spokenReply({ role: "assistant", error: true, content: "x" }), null);
  assert.equal(spokenReply({ role: "assistant", content: "There are 3 items low.\n\nEvidence: Current just now - 1 source." }), "There are 3 items low.");
  assert.match(spokenReply({ role: "assistant", content: "I'll take 2 items off stock once you confirm.", proposal: { status: "proposed" } }), /Say yes to confirm, or cancel\.$/);
  assert.equal(spokenReply({ role: "assistant", content: "x", proposal: { status: "done", result: "Done. Removed 1 Adrenaline." } }), "Done. Removed 1 Adrenaline.");
  assert.equal(spokenReply({ role: "assistant", content: "How much harm did it cause?", followUps: [{ label: "No harm", ask: "a" }, { label: "Low harm", ask: "b" }] }), "How much harm did it cause? No harm, Low harm?");
  assert.ok(spokenReply({ role: "assistant", content: "word ".repeat(100) }).length < 235);
});

console.log(`\n${n} passed`);
