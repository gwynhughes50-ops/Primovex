import assert from "node:assert/strict";
import { OFF_BY_DEFAULT, blockedModuleDomains } from "../src/core/identity/moduleAccess.js";
import { CAPABILITY_CATALOG, getCapabilitiesForProfile } from "../src/core/identity/capabilities.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };

const dev = "dev-uid";
const off = { clinflow: { disabled: true, allowUids: [dev] } };

t("ClinFlow is off by default: nobody sees it until the practice has deliberately turned it on", () => {
  assert.deepEqual(OFF_BY_DEFAULT, ["clinflow"]);
  for (const toggles of [null, undefined, {}, { clinflow: {} }, { clinflow: { disabled: "false" } }]) {
    assert.deepEqual(blockedModuleDomains({ toggles, uid: "someone" }), ["clinflow"], JSON.stringify(toggles));
    assert.deepEqual(blockedModuleDomains({ toggles, uid: dev }), ["clinflow"], "even an administrator, if the practice never set it");
  }
});

t("switched off, only the people on the allow-list see it", () => {
  assert.deepEqual(blockedModuleDomains({ toggles: off, uid: "nurse" }), ["clinflow"]);
  assert.deepEqual(blockedModuleDomains({ toggles: off, uid: dev }), []);
  assert.deepEqual(blockedModuleDomains({ toggles: off, uid: "" }), ["clinflow"]);
  assert.deepEqual(blockedModuleDomains({ toggles: { clinflow: { disabled: true, allowUids: "dev-uid" } }, uid: dev }), ["clinflow"], "a malformed allow-list allows no one");
});

t("viewing as another role, the administrator's allow-list does not carry over (the bug: ClinFlow showed on the Nurse's desktop)", () => {
  assert.deepEqual(blockedModuleDomains({ toggles: off, uid: dev, viewingAs: true }), ["clinflow"]);
  const nurse = getCapabilitiesForProfile({ role: "Nurse" }, {});
  assert.ok(nurse.includes("clinflow.read"), "the Nurse role does carry ClinFlow permissions, so the switch is what hides it");
  const visible = nurse.filter((c) => !blockedModuleDomains({ toggles: off, uid: dev, viewingAs: true }).includes(c.split(".")[0]));
  assert.ok(!visible.some((c) => c.startsWith("clinflow.")) && visible.includes("inventory.read"));
});

t("turned on for everyone, it is visible to everyone with ClinFlow access", () => {
  assert.deepEqual(blockedModuleDomains({ toggles: { clinflow: { disabled: false, allowUids: [] } }, uid: "nurse" }), []);
});

t("demo and training use synthetic data only, so ClinFlow stays available there", () => {
  assert.deepEqual(blockedModuleDomains({ toggles: null, uid: dev, synthetic: true }), []);
  assert.deepEqual(blockedModuleDomains({ toggles: off, uid: "nurse", synthetic: true }), []);
});

t("any other module switched off works as before, and is not off by default", () => {
  assert.deepEqual(blockedModuleDomains({ toggles: { purchasing: { disabled: true, allowUids: [dev] } }, uid: "x" }).sort(), ["clinflow", "purchasing"]);
  assert.deepEqual(blockedModuleDomains({ toggles: { purchasing: { disabled: true, allowUids: [dev] } }, uid: dev }), ["clinflow"]);
  assert.deepEqual(blockedModuleDomains({ toggles: { purchasing: { disabled: false } }, uid: "x" }), ["clinflow"]);
  assert.ok(CAPABILITY_CATALOG.some((c) => c.id.startsWith("clinflow.")), "the domain name matches the capability prefix");
});

console.log(`\n${n} passed`);
