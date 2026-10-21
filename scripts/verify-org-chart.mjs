// Covers the reporting-line maths in src/lib/orgChart.js (used by the
// organisation chart in Practice Administration).
import assert from "node:assert/strict";
import { buildTree, collectDescendants, managersOf } from "../src/lib/orgChart.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };
const byId = (users) => new Map(users.map((u) => [u.id, u]));

t("managersOf: legacy single-string reportsTo becomes a one-item list", () => {
  const u = { id: "a", reportsTo: "b" };
  assert.deepEqual(managersOf(u, byId([u, { id: "b" }])), ["b"]);
});
t("managersOf: array reportsTo passes through, de-duplicated", () => {
  const u = { id: "a", reportsTo: ["b", "c", "b"] };
  assert.deepEqual(managersOf(u, byId([u, { id: "b" }, { id: "c" }])), ["b", "c"]);
});
t("managersOf: missing/null reportsTo is an empty list", () => {
  assert.deepEqual(managersOf({ id: "a" }, byId([{ id: "a" }])), []);
  assert.deepEqual(managersOf({ id: "a", reportsTo: null }, byId([{ id: "a" }])), []);
});
t("managersOf: self-reference and references to people not in the list are dropped", () => {
  const u = { id: "a", reportsTo: ["a", "ghost", "b"] };
  assert.deepEqual(managersOf(u, byId([u, { id: "b" }])), ["b"]);
});

t("buildTree: simple single-manager tree", () => {
  const users = [{ id: "boss" }, { id: "staff", reportsTo: "boss" }];
  const { childrenOf, roots } = buildTree(users);
  assert.deepEqual(roots.map((u) => u.id), ["boss"]);
  assert.deepEqual((childrenOf.get("boss") || []).map((u) => u.id), ["staff"]);
});
t("buildTree: no manager at all is a root", () => {
  const users = [{ id: "a" }, { id: "b" }];
  const { roots } = buildTree(users);
  assert.deepEqual(roots.map((u) => u.id).sort(), ["a", "b"]);
});
t("buildTree: a person with several managers is drawn once, under the first listed, and still counts as reporting to all", () => {
  const users = [{ id: "pm" }, { id: "partner" }, { id: "gp", reportsTo: ["pm", "partner"] }];
  const { childrenOf, linksOf, roots } = buildTree(users);
  assert.deepEqual(roots.map((u) => u.id).sort(), ["partner", "pm"]);
  assert.deepEqual((childrenOf.get("pm") || []).map((u) => u.id), ["gp"]);
  assert.deepEqual((childrenOf.get("partner") || []).map((u) => u.id), [], "not drawn a second time");
  assert.deepEqual((linksOf.get("partner") || []).map((u) => u.id), ["gp"], "but still one of the partner's reports");
  const everyone = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }, ...["g1", "g2", "g3"].map((id) => ({ id, reportsTo: ["a", "b", "c", "d"] }))];
  const drawn = buildTree(everyone).childrenOf;
  assert.equal([...drawn.values()].flat().length, 3, "three GPs, each appearing once, not four times");
});
t("buildTree: the first listed manager that is in the chart is the one used", () => {
  const users = [{ id: "pm" }, { id: "gp", reportsTo: ["gone", "pm"] }];
  assert.deepEqual((buildTree(users).childrenOf.get("pm") || []).map((u) => u.id), ["gp"]);
  // in a department view where the first manager is not shown, the next one is used
  const shown = [{ id: "partner" }, { id: "gp", reportsTo: ["pm", "partner"] }];
  assert.deepEqual((buildTree(shown).childrenOf.get("partner") || []).map((u) => u.id), ["gp"]);
});
t("buildTree: several people reporting to the same manager", () => {
  const users = [{ id: "boss" }, { id: "a", reportsTo: "boss" }, { id: "b", reportsTo: "boss" }, { id: "c", reportsTo: "boss" }];
  const { childrenOf } = buildTree(users);
  assert.deepEqual((childrenOf.get("boss") || []).map((u) => u.id), ["a", "b", "c"]);
});

t("collectDescendants: multi-level chain", () => {
  const users = [{ id: "a" }, { id: "b", reportsTo: "a" }, { id: "c", reportsTo: "b" }];
  const { childrenOf } = buildTree(users);
  assert.deepEqual([...collectDescendants("a", childrenOf)].sort(), ["b", "c"]);
  assert.deepEqual([...collectDescendants("c", childrenOf)], []);
});
t("collectDescendants: a person under two managers is only counted once, and counts for both", () => {
  const users = [{ id: "pm" }, { id: "partner" }, { id: "gp", reportsTo: ["pm", "partner"] }];
  const { linksOf } = buildTree(users);
  assert.deepEqual([...collectDescendants("pm", linksOf)], ["gp"]);
  assert.deepEqual([...collectDescendants("partner", linksOf)], ["gp"], "so nobody can be put under their own subordinate by their second manager either");
});
t("collectDescendants: does not infinite-loop on a cycle already present in bad data", () => {
  // a -> b -> a (shouldn't be possible via the UI's own blocking, but the
  // walk itself must still terminate if it ever happens in raw data).
  const childrenOf = new Map([
    ["a", [{ id: "b" }]],
    ["b", [{ id: "a" }]],
  ]);
  const result = collectDescendants("a", childrenOf);
  assert.deepEqual([...result].sort(), ["a", "b"]);
});

console.log(`\n${n} passed`);
