// Mirrors managersOf/buildTree/collectDescendants from
// src/components/admin/OrgChart.jsx. Not imported directly: that file is a
// .jsx module (imports React + a .css file), which a plain Node ESM script
// can't load without a bundler step - same reasoning already documented in
// verify-stock-expiry.mjs. Keep this in step with the real implementation if
// either changes.
import assert from "node:assert/strict";

function managersOf(user, byId) {
  const raw = Array.isArray(user.reportsTo) ? user.reportsTo : user.reportsTo ? [user.reportsTo] : [];
  return [...new Set(raw)].filter((id) => id && id !== user.id && byId.has(id));
}

function buildTree(users) {
  const byId = new Map(users.map((u) => [u.id, u]));
  const childrenOf = new Map();
  const roots = [];

  for (const user of users) {
    const managers = managersOf(user, byId);
    if (managers.length === 0) {
      roots.push(user);
      continue;
    }
    for (const managerId of managers) {
      if (!childrenOf.has(managerId)) childrenOf.set(managerId, []);
      childrenOf.get(managerId).push(user);
    }
  }
  return { byId, childrenOf, roots };
}

function collectDescendants(uid, childrenOf, acc = new Set(), visited = new Set()) {
  if (visited.has(uid)) return acc;
  visited.add(uid);
  for (const child of childrenOf.get(uid) || []) {
    if (!acc.has(child.id)) {
      acc.add(child.id);
      collectDescendants(child.id, childrenOf, acc, visited);
    }
  }
  return acc;
}

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
t("buildTree: a person with two managers appears under both", () => {
  const users = [{ id: "pm" }, { id: "partner" }, { id: "gp", reportsTo: ["pm", "partner"] }];
  const { childrenOf, roots } = buildTree(users);
  assert.deepEqual(roots.map((u) => u.id).sort(), ["partner", "pm"]);
  assert.deepEqual((childrenOf.get("pm") || []).map((u) => u.id), ["gp"]);
  assert.deepEqual((childrenOf.get("partner") || []).map((u) => u.id), ["gp"]);
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
t("collectDescendants: a person under two managers is only counted once", () => {
  const users = [{ id: "pm" }, { id: "partner" }, { id: "gp", reportsTo: ["pm", "partner"] }];
  const { childrenOf } = buildTree(users);
  assert.deepEqual([...collectDescendants("pm", childrenOf)], ["gp"]);
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
