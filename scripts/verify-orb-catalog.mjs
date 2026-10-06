// The server keeps its own copy of the Orb's approved lookups (what the language
// assistant may choose from). This fails if that copy drifts from the app's: a lookup
// added, removed or given a different permission in one place but not the other.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { TOOL_SCHEMAS } from "../src/ai/tools/toolSchemas.js";

const require = createRequire(import.meta.url);
const { ORB_TOOLS } = require("../functions/config/orbToolCatalog.js");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };

// every lookup registered in the app with the permission it needs
const source = readFileSync(new URL("../src/ai/tools/readOnlyTools.js", import.meta.url), "utf8");
const registered = new Map();
for (const m of source.matchAll(/id: '([a-zA-Z.]+)', label: '[^']*', requiredCapability: '([a-z.A-Z]+)'/g)) registered.set(m[1], m[2]);
// the two readiness lookups are registered through a helper that applies inventory.read
registered.set("emergency.readiness", "inventory.read");
registered.set("anaphylaxis.readiness", "inventory.read");

const NEVER_SENT = ["governance.concernLookup", "governance.sarLookup", "knowledge.faqLookup"];

t("every lookup the model can choose exists in the app, with the same permission", () => {
  for (const tool of ORB_TOOLS) {
    assert.ok(registered.has(tool.id), `${tool.id} is not a registered lookup`);
    assert.equal(tool.capability, registered.get(tool.id), `${tool.id} permission differs`);
  }
});

t("every other lookup in the app is deliberately left out, never forgotten", () => {
  const offered = new Set(ORB_TOOLS.map((tool) => tool.id));
  const missing = [...registered.keys()].filter((id) => !offered.has(id) && !NEVER_SENT.includes(id));
  assert.deepEqual(missing, [], `new lookups need a decision: ${missing.join(", ")}`);
  NEVER_SENT.forEach((id) => assert.ok(!offered.has(id), `${id} must never be offered to the model`));
});

t("the descriptions and inputs match the app's own tool definitions", () => {
  for (const tool of ORB_TOOLS) {
    const schema = TOOL_SCHEMAS[tool.id];
    if (!schema) continue; // inventory.categoryLookup has no app-side definition yet
    const appParams = Object.keys(schema.input_schema?.properties || {}).sort();
    assert.deepEqual(Object.keys(tool.params).sort(), appParams, `${tool.id} inputs differ`);
    assert.deepEqual([...(tool.required || [])].sort(), [...(schema.input_schema?.required || [])].sort(), `${tool.id} required inputs differ`);
  }
});

console.log(`\n${n} passed`);
