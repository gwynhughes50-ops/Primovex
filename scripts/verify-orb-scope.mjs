import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { ORB_TOPICS, applyOrbScope, describeOrbScope, normaliseOrbScope, pulseModulesFor } from "../src/lib/orbScope.js";
import { calculateOverallPulse, placeholderModule } from "../src/services/pulseService.js";
import { ROLE_TEMPLATES, hasCapability } from "../src/core/identity/capabilities.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };

t("no scope set: nothing changes", () => {
  const caps = ROLE_TEMPLATES["Practice Manager"];
  assert.equal(applyOrbScope(caps, undefined), caps);
  assert.equal(applyOrbScope(caps, null), caps);
  assert.equal(applyOrbScope(caps, "stock"), caps, "not a list: ignored");
  assert.equal(describeOrbScope(null), "Everything their role allows");
});

t("IT lead limited to SARs and concerns: can use governance lookups, nothing else", () => {
  const caps = applyOrbScope(ROLE_TEMPLATES["Practice Manager"], ["governance"]);
  assert.ok(hasCapability(caps, "governance.read"));
  assert.ok(!hasCapability(caps, "inventory.read"));
  assert.ok(!hasCapability(caps, "inventory.write"), "can't prepare reorders or team messages");
  assert.ok(!hasCapability(caps, "compliance.read"));
  assert.ok(!hasCapability(caps, "admin.access"));
  assert.ok(hasCapability(caps, "dashboard.read"), "how-to help stays");
});

t("caretaker limited to compliance", () => {
  const caps = applyOrbScope(ROLE_TEMPLATES.Caretaker, ["compliance"]);
  assert.ok(hasCapability(caps, "compliance.read"));
  assert.ok(!hasCapability(caps, "operations.read"));
});

t("it only takes away: a topic the role doesn't hold stays unavailable", () => {
  const caps = applyOrbScope(ROLE_TEMPLATES.Reception, ["admin"]);
  assert.ok(!hasCapability(caps, "admin.access"));
});

t("System Admin ('*') limited to a topic is expanded to just that topic", () => {
  const caps = applyOrbScope(["*"], ["stock"]);
  assert.ok(!caps.includes("*"));
  assert.ok(hasCapability(caps, "inventory.read"));
  assert.ok(hasCapability(caps, "purchasing.approve"));
  assert.ok(!hasCapability(caps, "governance.read"));
  assert.deepEqual(applyOrbScope(["*"], null), ["*"], "unlimited admin untouched");
});

t("an empty list means how-to help only", () => {
  assert.deepEqual(applyOrbScope(ROLE_TEMPLATES["Practice Manager"], []), ["dashboard.read"]);
  assert.equal(describeOrbScope([]), "How-to help only");
});

t("unknown topics are dropped", () => {
  assert.deepEqual(normaliseOrbScope(["stock", "nonsense", "stock"]), ["stock"]);
  assert.equal(normaliseOrbScope("stock"), null);
});

t("every Orb tool's permission belongs to a topic (or is the always-on help one)", () => {
  const domains = new Set(ORB_TOPICS.flatMap((x) => x.domains));
  for (const cap of ["operations.read", "inventory.read", "inventory.write", "temperature.read", "compliance.read", "admin.access", "governance.read"]) {
    assert.ok(domains.has(cap.split(".")[0]), `${cap} has no topic`);
  }
});

t("Pulse: the modules and the overall score follow the topics", () => {
  assert.equal(pulseModulesFor(null), null);
  assert.deepEqual(pulseModulesFor(["governance"]), ["governance"]);
  const modules = [
    { key: "inventory", label: "Inventory", score: 40, issues: ["low stock"] },
    { key: "governance", label: "Governance", score: 100, issues: [] },
  ];
  const all = calculateOverallPulse(modules);
  const gov = calculateOverallPulse(modules, { only: ["governance"] });
  assert.deepEqual(gov.modules.map((m) => m.key), ["governance"]);
  assert.equal(gov.score, 100);
  assert.ok(all.score < 100);
  assert.equal(gov.issues.length, 0, "stock issues are not shown to someone limited to governance");
  assert.equal(calculateOverallPulse(modules, { only: [] }).score, 100, "no topics: no modules, not a failing score");
  void placeholderModule;
});

t("the server's copy has the same topics", () => {
  const require = createRequire(import.meta.url);
  const server = require(`${process.cwd()}/functions/services/orbScope.js`);
  assert.deepEqual(server.ORB_TOPICS.map((x) => ({ id: x.id, domains: x.domains })), ORB_TOPICS.map((x) => ({ id: x.id, domains: x.domains })));
  const sample = ["inventory.read", "governance.read", "compliance.read", "dashboard.read", "admin.access"];
  for (const scope of [["stock"], ["governance", "compliance"], [], ["admin"]]) {
    assert.deepEqual([...server.applyOrbScope(sample, scope)].sort(), [...applyOrbScope(sample, scope)].sort());
  }
});

console.log(`\n${n} passed`);
