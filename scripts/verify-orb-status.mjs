import assert from "node:assert/strict";
import { NO_STATUS, buildOrbStatus, buildSignals, levelOf, messageFor, scopeFor } from "../src/modules/orbStatus/orbStatus.js";
import { buildAttention } from "../src/mobile/homeAttention.js";
import { ROLE_TEMPLATES } from "../src/core/identity/capabilities.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const now = new Date(2026, 9, 10, 12, 0);
const ago = (days) => new Date(now.getTime() - days * 86400000);
const canOf = (role) => { const caps = ROLE_TEMPLATES[role] || []; return (c) => caps.includes("*") || caps.includes(c); };
const scope = (role) => scopeFor({ role, can: canOf(role) });

t("each kind of person's Orb watches their own part of the practice", () => {
  for (const role of ["Practice Manager", "System Admin", "Partner"]) assert.deepEqual(scope(role), { key: "practice", areas: ["governance", "stock", "coldchain", "compliance"] }, role);
  assert.deepEqual(scope("Caretaker"), { key: "caretaker", areas: ["compliance"] }, "compliance only, though the caretaker can also log temperatures");
  assert.deepEqual(scope("Nurse"), { key: "own", areas: ["coldchain", "stock"] });
  assert.deepEqual(scope("HCA"), { key: "own", areas: ["coldchain", "stock"] });
  assert.equal(scope("Reception").key, "none", "reception has nothing to watch");
  assert.equal(scope("Cleaner").key, "none");
  assert.equal(scopeFor({ role: "Nobody", can: () => false }).key, "none");
  // a practice's own role is judged by what it may do
  const custom = (caps) => scopeFor({ role: "Nurse Manager", can: (c) => caps.includes(c) });
  assert.deepEqual(custom(["temperature.write", "inventory.write", "compliance.write"]).areas, ["coldchain", "stock", "compliance"]);
  assert.deepEqual(custom(["compliance.manageAssets"]).areas, ["compliance"], "a Management Assistant given compliance gets compliance");
  assert.deepEqual(custom(["governance.manageSars", "governance.concernsTeam"]).areas, [], "governance belongs to the practice-wide roles only");
});

const chipsFor = (input) => buildAttention({ ...input, now });
const assets = [
  { id: "a1", assetCode: "WH-002", assetType: "water_hot", label: "Staff Kitchen Hot Tap", frequency: "monthly", lastCheckAt: ago(31), lastCheckResult: "pass" },
  { id: "fp", assetCode: "FP-001", assetType: "fire_point", label: "Reception", lastCheckAt: ago(3), lastCheckResult: "pass" },
];

t("green when everything of theirs is in order", () => {
  const status = buildOrbStatus({ scope: scope("Practice Manager"), chips: chipsFor({ sars: [], concerns: [], stockAlerts: [] }), dueInputs: { assets: [assets[1]] }, now });
  assert.deepEqual([status.level, status.signals.length, status.headline], ["green", 0, "All clear"]);
  assert.equal(levelOf([]), "green");
  assert.deepEqual(NO_STATUS.level, "green");
});

t("amber for something coming up or just late, red for something failed or properly overdue", () => {
  const justLate = buildOrbStatus({ scope: scope("Caretaker"), dueInputs: { assets }, now });
  assert.equal(justLate.level, "amber", "one day late");
  assert.deepEqual(justLate.signals.map((s) => [s.key, s.level]), [["overdue", "amber"]]);
  const veryLate = buildOrbStatus({ scope: scope("Caretaker"), dueInputs: { assets: [{ ...assets[0], lastCheckAt: ago(45) }, assets[1]] }, now });
  assert.equal(veryLate.level, "red");
  const failed = buildOrbStatus({ scope: scope("Caretaker"), dueInputs: { assets, incidents: [{ id: "i", assetId: "a1", assetLabel: "Tap", status: "open", openedAtMs: ago(1).getTime(), actions: [] }] }, now });
  assert.equal(failed.level, "red");
  assert.equal(failed.signals[0].key, "incident-i", "red first");
  assert.equal(failed.redCount, 1);
});

t("the caretaker's Orb ignores the rest of the practice; the practice manager's sees it all", () => {
  const chips = chipsFor({ sars: [{ status: "new", dueDate: ago(5) }], stockAlerts: [{ state: "expired" }], fridgeIncidents: 1, fridgesUnchecked: 2, messages: 3 });
  assert.equal(chips.filter((c) => c.area).length, 4 + 1, "every chip says which part of the practice it is about");
  const caretaker = buildOrbStatus({ scope: scope("Caretaker"), chips, dueInputs: { assets: [assets[1]] }, now });
  assert.equal(caretaker.level, "green", "overdue SARs, expired stock and a fridge incident are not the caretaker's to worry about");
  const manager = buildOrbStatus({ scope: scope("Practice Manager"), chips, dueInputs: { assets: [assets[1]] }, now });
  assert.equal(manager.level, "red");
  assert.deepEqual(manager.signals.filter((s) => s.level === "red").map((s) => s.area).sort(), ["coldchain", "governance", "stock"]);
  assert.ok(manager.signals.some((s) => s.level === "amber" && s.area === "coldchain"), "fridges not checked today is amber");
  assert.ok(!manager.signals.some((s) => s.key === "messages"), "unread messages never colour the Orb");
  const nurse = buildOrbStatus({ scope: scope("Nurse"), chips, now });
  assert.deepEqual(nurse.signals.map((s) => s.area).sort(), ["coldchain", "coldchain", "stock"], "a nurse sees the cold chain and stock, not the SARs");
  assert.ok(!nurse.signals.some((s) => s.area === "governance"));
});

t("compliance is counted once: the strip's own compliance chips don't double up with the compliance list", () => {
  const chips = chipsFor({ complianceFailures: 2, certificates: { expired: 1, dueSoon: 0 }, coshh: { overdue: 1, dueSoon: 0 } });
  assert.ok(chips.every((c) => c.area === "compliance"));
  const status = buildOrbStatus({ scope: scope("Practice Manager"), chips, dueInputs: { assets: [assets[1]] }, now });
  assert.equal(status.level, "green", "the compliance list is the one source, and it has nothing");
});

t("someone with no scope stays green whatever else is going on", () => {
  const chips = chipsFor({ sars: [{ status: "new", dueDate: ago(5) }], stockAlerts: [{ state: "expired" }], fridgeIncidents: 2 });
  assert.equal(buildOrbStatus({ scope: scope("Reception"), chips, dueInputs: { assets: [{ ...assets[0], lastCheckAt: ago(99) }] }, now }).level, "green");
  assert.equal(buildOrbStatus({ scope: scope("Cleaner"), chips, now }).level, "green");
  assert.equal(buildOrbStatus({ now }).level, "green", "nothing known is green");
});

t("the message says plainly what is wrong, red before amber, with a limit on how many it names", () => {
  assert.deepEqual(messageFor([]), { level: "green", headline: "All clear", summary: "Nothing needs attention." });
  const one = messageFor([{ level: "red", label: "Staff Kitchen Hot Tap failed its check" }]);
  assert.deepEqual([one.level, one.headline], ["red", "Something has failed or is overdue"]);
  assert.equal(one.summary, "1 thing needs attention now: staff Kitchen Hot Tap failed its check.");
  const mixed = messageFor([{ level: "red", label: "A" }, { level: "red", label: "B" }, { level: "red", label: "C" }, { level: "red", label: "D" }, { level: "amber", label: "E" }]);
  assert.equal(mixed.headline, "Things have failed or are overdue");
  assert.equal(mixed.summary, "4 things need attention now: a; b; c and 1 more. Also 1 thing coming up.");
  const amber = messageFor([{ level: "amber", label: "1 certificate running out soon" }, { level: "amber", label: "2 checks overdue" }]);
  assert.deepEqual([amber.level, amber.headline], ["amber", "Things are coming up"]);
  assert.equal(amber.summary, "2 things are coming up or just late: 1 certificate running out soon; 2 checks overdue.");
});

t("each signal knows where to take the person", () => {
  const status = buildOrbStatus({ scope: scope("Practice Manager"), chips: chipsFor({ sars: [{ status: "new", dueDate: ago(5) }], concerns: [{ status: "received", finalResponseDueAt: ago(2) }], stockAlerts: [{ state: "out" }], fridgeIncidents: 1 }), dueInputs: { assets: [{ ...assets[1], lastCheckAt: ago(20) }] }, now });
  const by = Object.fromEntries(status.signals.map((s) => [s.key, s]));
  assert.equal(by["sars-overdue"].route, "/governance/sars");
  assert.equal(by["concerns-overdue"].route, "/governance/concerns");
  assert.equal(by["stock-urgent"].route, "/inventory");
  assert.equal(by["fridge-incidents"].route, "/temperature");
  assert.equal(by["fire-weekly"].route, "/compliance");
  assert.equal(by["fire-weekly"].level, "red", "the weekly fire test 20 days after the last");
});

console.log(`\n${n} passed`);
