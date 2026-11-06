import assert from "node:assert/strict";
import { OFF_BY_DEFAULT, blockedModuleDomains as blockedAll, moduleMode, moduleToggleFor, shouldPurgeClinFlowLocalData } from "../src/core/identity/moduleAccess.js";
import { purgeClinFlowLocalData } from "../src/modules/clinflow/clinflowDocumentCache.js";
import { CAPABILITY_CATALOG, getCapabilitiesForProfile } from "../src/core/identity/capabilities.js";

let n = 0;
// the ClinFlow tests below look at ClinFlow only; Document reading (also off by default) has its own tests at the end
const blockedModuleDomains = (args) => blockedAll(args).filter((domain) => domain !== "documents");
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };

const dev = "dev-uid";
const off = { clinflow: { disabled: true, allowUids: [dev] } };

t("ClinFlow is off by default: nobody sees it until the practice has deliberately turned it on", () => {
  assert.deepEqual(OFF_BY_DEFAULT, ["clinflow", "documents"]);
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

t("ClinFlow data kept on the device is wiped when ClinFlow is off for the person signed in, and only then", () => {
  const base = { switchLoaded: true, blockedDomains: ["clinflow"], viewingAs: false, signedIn: true, synthetic: false };
  assert.equal(shouldPurgeClinFlowLocalData(base), true);
  assert.equal(shouldPurgeClinFlowLocalData({ ...base, switchLoaded: false }), false, "not until the practice switch has been read");
  assert.equal(shouldPurgeClinFlowLocalData({ ...base, blockedDomains: [] }), false, "the developer on the allow-list keeps theirs");
  assert.equal(shouldPurgeClinFlowLocalData({ ...base, blockedDomains: ["purchasing"] }), false);
  assert.equal(shouldPurgeClinFlowLocalData({ ...base, viewingAs: true }), false, "viewing as another role does not wipe the administrator's own data");
  assert.equal(shouldPurgeClinFlowLocalData({ ...base, signedIn: false }), false);
  assert.equal(shouldPurgeClinFlowLocalData({ ...base, synthetic: true }), false, "demo and training have no real documents");
  assert.equal(shouldPurgeClinFlowLocalData(), false);
});

const fakeFactory = (outcome) => {
  const calls = [];
  return { calls, deleteDatabase: (name) => { calls.push(name); const request = {}; setTimeout(() => request[outcome]?.(), 0); return request; } };
};

// the wipe deletes the whole ClinFlow database and says whether it worked
const ok = fakeFactory("onsuccess");
assert.equal(await purgeClinFlowLocalData(ok), true);
assert.deepEqual(ok.calls, ["primovex-clinflow"]);
assert.equal(await purgeClinFlowLocalData(fakeFactory("onerror")), false);
assert.equal(await purgeClinFlowLocalData(fakeFactory("onblocked")), false);
assert.equal(await purgeClinFlowLocalData({ deleteDatabase: () => { throw new Error("no"); } }), false);
assert.equal(await purgeClinFlowLocalData(null), true, "no local database in this environment: nothing to wipe");
n += 1; console.log("ok  the wipe deletes the whole ClinFlow database and says whether it worked");

t("Practice Admin shows who ClinFlow is really on for: off, only me, or everyone", () => {
  for (const toggle of [undefined, null, {}, { disabled: true }, { disabled: true, allowUids: ["someone-else"] }]) assert.equal(moduleMode("clinflow", toggle, dev), "off", JSON.stringify(toggle));
  assert.equal(moduleMode("clinflow", { disabled: true, allowUids: [dev] }, dev), "me");
  assert.equal(moduleMode("clinflow", { disabled: true, allowUids: [dev] }, "someone-else"), "off", "someone not on the list is off");
  assert.equal(moduleMode("clinflow", { disabled: false, allowUids: [] }, dev), "everyone");
  assert.equal(moduleMode("other", undefined, dev), "everyone", "a module that is on unless switched off");
  assert.equal(moduleMode("other", { disabled: true, allowUids: [] }, dev), "off");
});

t("choosing a mode saves exactly the setting that gives it, and the setting is what the rules and menus then read", () => {
  assert.deepEqual(moduleToggleFor("off", dev), { disabled: true, allowUids: [] });
  assert.deepEqual(moduleToggleFor("me", dev), { disabled: true, allowUids: [dev] });
  assert.deepEqual(moduleToggleFor("me", dev, { allowUids: ["partner", dev] }), { disabled: true, allowUids: ["partner", dev] }, "anyone already allowed stays allowed, nobody twice");
  assert.deepEqual(moduleToggleFor("everyone", dev, { allowUids: ["partner"] }), { disabled: false, allowUids: [] });
  for (const mode of ["off", "me", "everyone"]) {
    const toggle = moduleToggleFor(mode, dev);
    assert.equal(moduleMode("clinflow", toggle, dev), mode);
    assert.equal(blockedModuleDomains({ toggles: { clinflow: toggle }, uid: dev }).includes("clinflow"), mode === "off", `${mode}: what the menus hide from the administrator`);
    assert.equal(blockedModuleDomains({ toggles: { clinflow: toggle }, uid: "a-nurse" }).includes("clinflow"), mode !== "everyone", `${mode}: what a nurse is blocked from`);
  }
});

t("Document reading (the AI that reads dropped certificates and data sheets) is off by default, for everyone including an administrator", () => {
  for (const toggles of [null, undefined, {}, { documents: {} }, { documents: { disabled: "false" } }]) {
    assert.ok(blockedAll({ toggles, uid: "someone" }).includes("documents"), JSON.stringify(toggles));
    assert.ok(blockedAll({ toggles, uid: dev }).includes("documents"));
    assert.equal(moduleMode("documents", toggles?.documents, dev), "off");
  }
});

t("Document reading can be on for only the administrator, or for everyone with permission, and turning ClinFlow on does not turn it on", () => {
  const me = { documents: { disabled: true, allowUids: [dev] } };
  assert.ok(!blockedAll({ toggles: me, uid: dev }).includes("documents"));
  assert.ok(blockedAll({ toggles: me, uid: "pm" }).includes("documents"));
  assert.ok(blockedAll({ toggles: me, uid: dev, viewingAs: true }).includes("documents"), "viewing as another role, the allow-list does not carry over");
  assert.ok(!blockedAll({ toggles: { documents: { disabled: false, allowUids: [] } }, uid: "pm" }).includes("documents"));
  assert.ok(blockedAll({ toggles: { clinflow: { disabled: false, allowUids: [] } }, uid: "pm" }).includes("documents"));
  assert.equal(moduleMode("documents", me.documents, dev), "me");
  assert.deepEqual(moduleToggleFor("everyone", dev, me.documents), { disabled: false, allowUids: [] });
});

t("demo and training can try Document reading (it reads a made-up sample); and while it is off, nobody loses the rest of what they can do", () => {
  assert.ok(!blockedAll({ toggles: null, uid: dev, synthetic: true }).includes("documents"));
  const pm = getCapabilitiesForProfile({ role: "Practice Manager" }, {});
  assert.ok(pm.includes("documents.intake"), "the Practice Manager role carries the permission, so the switch is what hides it");
  const visible = pm.filter((c) => !blockedAll({ toggles: null, uid: "pm" }).includes(c.split(".")[0]));
  assert.ok(!visible.includes("documents.intake") && visible.includes("compliance.read") && visible.includes("temperature.archive"));
  assert.ok(CAPABILITY_CATALOG.some((c) => c.id === "documents.intake"));
  assert.equal(shouldPurgeClinFlowLocalData({ switchLoaded: true, blockedDomains: ["documents"], signedIn: true }), false, "a blocked Document reading does not wipe ClinFlow's local data");
});

console.log(`\n${n} passed`);
