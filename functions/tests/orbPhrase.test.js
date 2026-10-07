const test = require("node:test");
const assert = require("node:assert/strict");
const { checkPhrasing, phraseAnswer, scrubFacts } = require("../services/orbPhraseService");
const { ORB_TOOLS, PHRASE_TOOL_IDS } = require("../config/orbToolCatalog");

const NOW = new Date(Date.UTC(2026, 9, 7, 9, 0, 0));
const ALL = ["*"];
const AZURE = { endpoint: "https://example.openai.azure.com", key: "k", deployment: "d" };

function fakeDb(settings = { aiPhrasing: true }) {
  const store = new Map();
  return {
    store,
    collection: (name) => ({
      doc: (id) => ({
        path: `${name}/${id}`,
        get: async () => { const data = name === "settings" ? settings : store.get(`${name}/${id}`); return { exists: data !== undefined, data: () => data }; },
      }),
    }),
    runTransaction: async (fn) => fn({
      get: async (r) => ({ exists: store.has(r.path), data: () => store.get(r.path) }),
      set: (r, value) => store.set(r.path, value),
    }),
  };
}
const says = (text) => async () => ({ ok: true, json: async () => ({ output: [{ type: "message", content: [{ type: "output_text", text }] }] }) });
const seen = [];
const recording = (reply) => async (url, init) => { seen.push(JSON.parse(init.body)); return reply(url, init); };

const FACTS = "You have 214 stock items, 1,830 units in all.\nNeeds attention: 2 items are out of stock, 6 are running low and 1 has expired.\nOut of stock: Saline and Gauze.";
const run = (over = {}) => phraseAnswer({ db: fakeDb(), uid: "u", capabilities: ALL, toolId: "inventory.summary", question: "how is stock?", facts: FACTS, azure: AZURE, now: NOW, fetchImpl: says("Stock is mostly healthy: 214 items, 1,830 units. But 2 are out of stock (Saline and Gauze), 6 are running low and 1 has expired."), ...over });

test("only lookups with no staff-typed text, staff names or patient references can have their answers reworded", () => {
  assert.deepEqual([...PHRASE_TOOL_IDS].sort(), ORB_TOOLS.filter((t) => t.phrase).map((t) => t.id).sort());
  for (const banned of ["tasks.summary", "tasks.quickNotes", "admin.users", "facilities.roomStatus", "facilities.equipmentLocation", "facilities.maintenanceOpen", "operations.timeline"]) {
    assert.ok(!PHRASE_TOOL_IDS.includes(banned), `${banned} must not be reworded by the model`);
  }
  assert.ok(!PHRASE_TOOL_IDS.some((id) => id.startsWith("governance.")));
  assert.ok(PHRASE_TOOL_IDS.includes("inventory.summary"));
});

test("a faithful rewording is accepted", () => {
  const ok = checkPhrasing({ facts: FACTS, reply: "Stock is mostly fine: 214 items, 1,830 units, though 2 are out of stock, 6 low and 1 expired." });
  assert.equal(ok.ok, true);
});

test("a reply that invents or changes a number is thrown away", () => {
  assert.deepEqual(checkPhrasing({ facts: FACTS, reply: "You have about 200 items and 2 are out of stock." }), { ok: false, reason: "new-number" });
  assert.equal(checkPhrasing({ facts: FACTS, reply: "7 items are running low and 2 are out of stock; 1 expired." }).reason, "new-number");
  assert.equal(checkPhrasing({ facts: "Fridge 2 is at 5.5°C", reply: "Fridge 2 is at 5.6°C." }).reason, "new-number");
});

test("a reply that drops a warning is thrown away", () => {
  assert.equal(checkPhrasing({ facts: FACTS, reply: "Stock looks good: 214 items, 1,830 units, 6 running low." }).reason, "warning-lost");
  assert.equal(checkPhrasing({ facts: "Fridge 1 is at 9.1°C, outside its 2 to 8°C range.", reply: "Fridge 1 is at 9.1°C." }).reason, "warning-lost");
  assert.equal(checkPhrasing({ facts: "Fridge 1 is at 9.1°C, outside its 2 to 8°C range.", reply: "Fridge 1 is running warm at 9.1°C, above its 2 to 8°C range." }).ok, true);
  assert.equal(checkPhrasing({ facts: "1 item has already expired: Syringes.", reply: "Syringes are still fine." }).reason, "warning-lost");
});

test("a reply with a link, an email, nothing, or far too much is thrown away", () => {
  assert.equal(checkPhrasing({ facts: FACTS, reply: "See https://evil.example for 2 items out of stock, 1 expired" }).reason, "link");
  assert.equal(checkPhrasing({ facts: FACTS, reply: "Email me@example.org about 214 items" }).reason, "link");
  assert.equal(checkPhrasing({ facts: FACTS, reply: "   " }).reason, "empty");
  assert.equal(checkPhrasing({ facts: FACTS, reply: "x".repeat(2000) }).reason, "too-long");
});

test("off unless an administrator turned this feature on (turning on the lookup picker is not enough)", async () => {
  seen.length = 0;
  for (const settings of [{}, { aiRouting: true }, { aiPhrasing: "true" }]) {
    const r = await run({ db: fakeDb(settings), fetchImpl: recording(says("x")) });
    assert.deepEqual(r, { enabled: false });
  }
  assert.equal(seen.length, 0);
});

test("a cleared lookup is reworded, and only the scrubbed facts and question are sent", async () => {
  seen.length = 0;
  const r = await run({ question: "how is stock? ring 07700 900123", fetchImpl: recording(says("Stock is mostly healthy: 214 items, 1,830 units. But 2 are out of stock (Saline and Gauze), 6 are running low and 1 has expired.")) });
  assert.equal(r.reason, "reworded");
  assert.match(r.text, /Saline and Gauze/);
  assert.equal(seen.length, 1);
  const sent = JSON.stringify(seen[0]);
  assert.ok(!sent.includes("07700"));
  assert.ok(sent.includes("Facts:"));
  assert.equal(seen[0].temperature, 0);
});

test("lookups that may carry staff names or free text are never sent, even with the feature on", async () => {
  seen.length = 0;
  for (const toolId of ["tasks.summary", "admin.users", "facilities.roomStatus", "governance.sarLookup", "nonsense"]) {
    const r = await run({ toolId, fetchImpl: recording(says("x")) });
    assert.deepEqual([r.enabled, r.text, r.reason], [true, null, "not-allowed"], toolId);
  }
  assert.equal(seen.length, 0);
});

test("someone without permission for the lookup gets nothing reworded", async () => {
  seen.length = 0;
  const r = await run({ capabilities: ["operations.read"], toolId: "inventory.summary", fetchImpl: recording(says("x")) });
  assert.equal(r.reason, "not-allowed");
  assert.equal(seen.length, 0);
});

test("facts are never cut short, and numbers, dates and emails inside them are removed", async () => {
  seen.length = 0;
  const long = await run({ facts: "a ".repeat(900), fetchImpl: recording(says("x")) });
  assert.equal(long.reason, "too-long");
  assert.equal(seen.length, 0);
  const scrubbed = scrubFacts("Item A: 40 in stock\nCall 07700 900123 or jo@example.org about EMIS 1234567");
  assert.ok(!/07700|example\.org|1234567/.test(scrubbed.text));
  assert.match(scrubbed.text, /^Item A: 40 in stock\n/);
  assert.ok(scrubbed.redactions >= 3);
});

test("a rejected, failing or unreachable model means the original answer is kept, quietly", async () => {
  assert.equal((await run({ fetchImpl: says("You have about 200 items, 2 out of stock, 1 expired.") })).text, null);
  const down = await run({ fetchImpl: async () => ({ ok: false, status: 500 }) });
  assert.deepEqual([down.enabled, down.text, down.reason], [true, null, "unavailable"]);
  assert.equal((await run({ fetchImpl: async () => { throw new Error("net"); } })).reason, "unavailable");
  assert.equal((await run({ azure: { ...AZURE, key: "" } })).reason, "unavailable");
});

test("it has its own limits, separate from the lookup picker's, and failed calls count", async () => {
  const db = fakeDb({ aiPhrasing: true, phraseHourlyLimit: 1 });
  await run({ db, fetchImpl: async () => { throw new Error("x"); } });
  await assert.rejects(() => run({ db }), /this hour/);
  assert.ok(db.store.has("orb_ai_usage/p_u_2026100709"));
  assert.ok(db.store.has("orb_ai_usage/p_all_20261007"));
  assert.ok(![...db.store.keys()].some((k) => k.startsWith("orb_ai_usage/u_") || k.startsWith("orb_ai_usage/all_")));
});
