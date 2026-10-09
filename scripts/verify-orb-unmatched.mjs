import assert from "node:assert/strict";
import { buildUnmatchedHelp } from "../src/ai/tools/unmatchedHelp.js";
import { ROLE_TEMPLATES } from "../src/core/identity/capabilities.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };

t("a nurse is offered things a nurse can do", () => {
  const h = buildUnmatchedHelp(ROLE_TEMPLATES.Nurse);
  assert.match(h.answer, /didn't understand that one, and I haven't changed anything/);
  assert.match(h.answer, /stock levels/);
  assert.match(h.answer, /record stock you've used/);
  assert.equal(h.followUps.length, 4);
  assert.ok(h.followUps.includes("I've just used one adrenaline from the store cupboard"));
});

t("someone who can't change stock isn't offered to record stock used", () => {
  const h = buildUnmatchedHelp(ROLE_TEMPLATES.ReadOnly);
  assert.ok(!/record stock/.test(h.answer));
  assert.ok(!h.followUps.some((q) => /just used/.test(q)));
  assert.ok(h.followUps.length >= 3);
});

t("everyone is offered reporting and help, even with almost no permissions", () => {
  const h = buildUnmatchedHelp(["dashboard.read"]);
  assert.match(h.answer, /report a significant event/);
  assert.ok(h.followUps.includes("Report a significant event"));
  assert.ok(h.followUps.includes("How do I add a new product to stock?"));
  assert.ok(!/stock levels|fridge/.test(h.answer));
});

t("an administrator sees the full range", () => {
  const h = buildUnmatchedHelp(["*"]);
  assert.match(h.answer, /fridge temperatures/);
  assert.equal(h.followUps.length, 4);
});

console.log(`\n${n} passed`);
