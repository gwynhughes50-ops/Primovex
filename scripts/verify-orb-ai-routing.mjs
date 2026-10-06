// Covers when the Orb asks the language assistant, and that it can never make things
// worse (src/orb/aiRouting.js).
import assert from "node:assert/strict";
import { AiRouter, applyAiRouting, markAiRouted } from "../src/orb/aiRouting.js";

let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log("ok  " + name); };

const unmatched = { id: "general.unmatched", toolId: null, input: {}, confidence: 0.4, candidates: [] };
const matched = { id: "inventory.lowStock", toolId: "inventory.lowStock", input: {}, confidence: 0.96 };
const ctx = { userId: "u1" };
const routerReturning = (result, log = []) => ({ route: async (arg) => { log.push(arg); return result; } });

await t("a question the rules understood never goes to the assistant", async () => {
  const log = [];
  const r = await applyAiRouting({ classified: matched, input: "low stock", context: ctx, router: routerReturning({ toolId: "inventory.summary" }, log) });
  assert.equal(r.aiRouted, false);
  assert.equal(r.classified, matched);
  assert.equal(log.length, 0);
});

await t("a question the rules did not understand is routed by the assistant", async () => {
  const log = [];
  const r = await applyAiRouting({ classified: unmatched, input: "have we run out of the green needles", context: ctx, router: routerReturning({ toolId: "inventory.search", input: { query: "green needles" }, confidence: 0.9 }, log) });
  assert.equal(r.aiRouted, true);
  assert.deepEqual([r.classified.toolId, r.classified.input.query, r.classified.confidence], ["inventory.search", "green needles", 0.9]);
  assert.deepEqual(log, [{ question: "have we run out of the green needles" }]);
});

await t("no answer from the assistant leaves the Orb exactly as it was (it asks what they meant)", async () => {
  for (const result of [null, undefined, { toolId: null, reason: "unsure" }]) {
    const r = await applyAiRouting({ classified: unmatched, input: "something odd", context: ctx, router: routerReturning(result) });
    assert.equal(r.aiRouted, false);
    assert.equal(r.classified, unmatched);
  }
});

await t("a failing or slow assistant never breaks or stalls the Orb", async () => {
  const boom = { route: async () => { throw new Error("down"); } };
  assert.equal((await applyAiRouting({ classified: unmatched, input: "something odd", context: ctx, router: boom })).aiRouted, false);
  const slow = { route: () => new Promise((resolve) => setTimeout(() => resolve({ toolId: "inventory.summary" }), 200)) };
  const started = Date.now();
  const r = await applyAiRouting({ classified: unmatched, input: "something odd", context: ctx, router: slow, timeoutMs: 30 });
  assert.equal(r.aiRouted, false);
  assert.ok(Date.now() - started < 150);
});

await t("it is not used for a clarified choice, a signed-out demo, a tiny input or when there is no router", async () => {
  const log = [];
  const router = routerReturning({ toolId: "inventory.summary" }, log);
  await applyAiRouting({ classified: unmatched, input: "something odd", context: { ...ctx, forcedIntent: "inventory.lowStock" }, router });
  await applyAiRouting({ classified: unmatched, input: "something odd", context: {}, router });
  await applyAiRouting({ classified: unmatched, input: "hi", context: ctx, router });
  await applyAiRouting({ classified: unmatched, input: "something odd", context: ctx, router: null });
  assert.equal(log.length, 0);
});

await t("an answer that came via the assistant says so", async () => {
  const marked = markAiRouted({ answer: "x", sources: [{ title: "Inventory", type: "module" }] });
  assert.equal(marked.sources.length, 2);
  assert.equal(marked.sources[1].title, "Orb language assistant");
  assert.equal(markAiRouted({ answer: "x" }).sources.length, 1);
});

await t("when switched off, the app asks once and then leaves it alone for a while", async () => {
  let calls = 0; let clock = 1000;
  const router = new AiRouter({ call: async () => { calls += 1; return { enabled: false }; }, now: () => clock });
  assert.equal(await router.route({ question: "q" }), null);
  assert.equal(await router.route({ question: "q" }), null);
  assert.equal(calls, 1);
  clock += 11 * 60 * 1000;
  await router.route({ question: "q" });
  assert.equal(calls, 2);
});

await t("an administrator turning it on takes effect straight away", async () => {
  let enabled = false; let calls = 0;
  const router = new AiRouter({ call: async () => { calls += 1; return enabled ? { enabled: true, toolId: "inventory.summary", input: {}, confidence: 0.9 } : { enabled: false }; } });
  assert.equal(await router.route({ question: "q" }), null);
  enabled = true; router.reset();
  assert.equal((await router.route({ question: "q" })).toolId, "inventory.summary");
  assert.equal(calls, 2);
});

await t("errors (offline, over the limit, service down) are 'no answer' and back off, never thrown", async () => {
  let calls = 0; let clock = 0;
  const router = new AiRouter({ call: async () => { calls += 1; const e = new Error("x"); e.code = "functions/unavailable"; throw e; }, now: () => clock });
  assert.equal(await router.route({ question: "q" }), null);
  assert.equal(await router.route({ question: "q" }), null);
  assert.equal(calls, 1);
  clock += 61_000;
  await router.route({ question: "q" });
  assert.equal(calls, 2);
  const limited = new AiRouter({ call: async () => { const e = new Error("x"); e.code = "functions/resource-exhausted"; throw e; }, now: () => clock });
  await limited.route({ question: "q" });
  assert.ok(limited.pausedUntil - clock >= 5 * 60_000); // backs off longer when over the limit
});

await t("a result with no lookup is no answer", async () => {
  const router = new AiRouter({ call: async () => ({ enabled: true, toolId: null, reason: "none-fit" }) });
  assert.equal(await router.route({ question: "q" }), null);
});

console.log(`\n${n} passed`);
