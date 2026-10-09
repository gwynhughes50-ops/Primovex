// Covers when the Orb asks the language assistant, and that it can never make things
// worse (src/orb/aiRouting.js).
import assert from "node:assert/strict";
import { AiRouter, PHRASABLE_TOOLS, applyAiPhrasing, applyAiRouting, markAiRouted } from "../src/orb/aiRouting.js";

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

await t("a catch-all stock search of a whole sentence is not understanding: the assistant gets a go", async () => {
  const weak = { id: "inventory.search", toolId: "inventory.search", input: { query: "ive nearly finished green needles nurses room" }, confidence: 0.8 };
  const log = [];
  const r = await applyAiRouting({ classified: weak, input: "ive nearly finished the green needles in the nurses room", context: ctx, router: routerReturning({ toolId: "reorder.draft", input: { item: "green needles" }, confidence: 0.9 }, log) });
  assert.equal(r.aiRouted, true);
  assert.equal(r.classified.toolId, "reorder.draft");
  assert.equal(log.length, 1);
  // nothing better from the assistant: the rules' answer stands
  const same = await applyAiRouting({ classified: weak, input: "ive nearly finished the green needles in the nurses room", context: ctx, router: routerReturning(null) });
  assert.equal(same.aiRouted, false);
  assert.equal(same.classified, weak);
  // a short, plain search is left to the rules, even a four-word one
  const fourWord = { id: "inventory.search", toolId: "inventory.search", input: { query: "blue needles" }, confidence: 0.9 };
  const spare = [];
  assert.equal((await applyAiRouting({ classified: fourWord, input: "do we have blue needles", context: ctx, router: routerReturning({ toolId: "x" }, spare) })).aiRouted, false);
  assert.equal(spare.length, 0);
  const plain = { id: "inventory.search", toolId: "inventory.search", input: { query: "paracetamol" }, confidence: 0.9 };
  const none = [];
  assert.equal((await applyAiRouting({ classified: plain, input: "do we have paracetamol", context: ctx, router: routerReturning({ toolId: "x" }, none) })).aiRouted, false);
  assert.equal(none.length, 0);
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

// ---- wording -----------------------------------------------------------------------

const raw = (over = {}) => ({ answer: "You have 214 stock items.", knownState: "known", sources: [{ title: "Inventory", type: "module" }], data: { items: [] }, ...over });
const phraser = (text, log = []) => ({ phrase: async (arg) => { log.push(arg); return text; } });

await t("a lookup's answer is reworded when the assistant gives better wording, and it says so", async () => {
  const log = [];
  const r = await applyAiPhrasing({ raw: raw(), toolId: "inventory.summary", question: "how is stock?", context: ctx, router: phraser("Stock looks healthy: 214 items.", log) });
  assert.equal(r.answer, "Stock looks healthy: 214 items.");
  assert.equal(r.sources.at(-1).title, "Orb language assistant");
  assert.deepEqual(log, [{ toolId: "inventory.summary", question: "how is stock?", facts: "You have 214 stock items." }]);
});

await t("no wording (off, rejected, failed or slow) leaves the original answer exactly as it was", async () => {
  const original = raw();
  assert.equal(await applyAiPhrasing({ raw: original, toolId: "inventory.summary", question: "q", context: ctx, router: phraser(null) }), original);
  assert.equal(await applyAiPhrasing({ raw: original, toolId: "inventory.summary", question: "q", context: ctx, router: { phrase: async () => { throw new Error("x"); } } }), original);
  const slow = { phrase: () => new Promise((resolve) => setTimeout(() => resolve("late"), 200)) };
  assert.equal(await applyAiPhrasing({ raw: original, toolId: "inventory.summary", question: "q", context: ctx, router: slow, timeoutMs: 30 }), original);
});

await t("only cleared lookups are ever sent, and never denied, incomplete, or action-proposing answers", async () => {
  const log = [];
  const router = phraser("reworded", log);
  for (const toolId of ["tasks.summary", "admin.users", "facilities.roomStatus", "governance.sarLookup", "operations.timeline", "tasks.quickNotes"]) {
    await applyAiPhrasing({ raw: raw(), toolId, question: "q", context: ctx, router });
  }
  await applyAiPhrasing({ raw: raw({ denied: true }), toolId: "inventory.summary", question: "q", context: ctx, router });
  await applyAiPhrasing({ raw: raw({ knownState: "partial" }), toolId: "inventory.summary", question: "q", context: ctx, router });
  await applyAiPhrasing({ raw: raw({ data: { proposal: { id: 1 } } }), toolId: "emergency.readiness", question: "q", context: ctx, router });
  await applyAiPhrasing({ raw: raw({ answer: "x".repeat(1500) }), toolId: "inventory.summary", question: "q", context: ctx, router });
  await applyAiPhrasing({ raw: raw(), toolId: "inventory.summary", question: "q", context: {}, router });
  assert.equal(log.length, 0);
  assert.ok(PHRASABLE_TOOLS.has("coldChain.latestStatus") && !PHRASABLE_TOOLS.has("tasks.summary"));
});

await t("the wording switch is remembered separately from the lookup switch", async () => {
  let clock = 0; let phraseCalls = 0; let routeCalls = 0;
  const router = new AiRouter({
    call: async () => { routeCalls += 1; return { enabled: true, toolId: null }; },
    callPhrase: async () => { phraseCalls += 1; return { enabled: false }; },
    now: () => clock,
  });
  assert.equal(await router.phrase({ toolId: "inventory.summary", question: "q", facts: "f" }), null);
  assert.equal(await router.phrase({ toolId: "inventory.summary", question: "q", facts: "f" }), null);
  assert.equal(phraseCalls, 1); // off: asked once, then left alone
  await router.route({ question: "q" });
  assert.equal(routeCalls, 1); // the other switch is unaffected
  clock += 11 * 60 * 1000;
  await router.phrase({ toolId: "inventory.summary", question: "q", facts: "f" });
  assert.equal(phraseCalls, 2);
});

await t("good wording comes back as text; an error is just no wording; reset clears the pause", async () => {
  const good = new AiRouter({ call: async () => null, callPhrase: async () => ({ enabled: true, text: "Hello" }) });
  assert.equal(await good.phrase({ toolId: "x", question: "q", facts: "f" }), "Hello");
  const none = new AiRouter({ call: async () => null, callPhrase: async () => ({ enabled: true, text: null, reason: "new-number" }) });
  assert.equal(await none.phrase({ toolId: "x", question: "q", facts: "f" }), null);
  let enabled = false;
  const sw = new AiRouter({ call: async () => null, callPhrase: async () => (enabled ? { enabled: true, text: "On" } : { enabled: false }) });
  assert.equal(await sw.phrase({}), null);
  enabled = true; sw.reset();
  assert.equal(await sw.phrase({}), "On");
  assert.equal(await new AiRouter({ call: async () => null }).phrase({}), null); // no wording connection at all
});

console.log(`\n${n} passed`);
