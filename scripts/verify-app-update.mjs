import assert from "node:assert/strict";
import { buildLabel, newerVersionReady } from "../src/lib/appUpdate.js";

let n = 0;
const t = async (name, fn) => { await fn(); n += 1; console.log(`ok  ${name}`); };
const answer = (body, ok = true) => async () => ({ ok, json: async () => body });

await t("a newer version is ready when the published build is not the one running", async () => {
  assert.equal(await newerVersionReady({ fetchFn: answer({ build: "b2" }), current: "b1" }), true);
});
await t("nothing is offered when it is the same build", async () => {
  assert.equal(await newerVersionReady({ fetchFn: answer({ build: "b1" }), current: "b1" }), false);
});
await t("nothing is offered when it can't be told: no file, a bad answer, offline, a dev server with no build id", async () => {
  assert.equal(await newerVersionReady({ fetchFn: answer({}, false), current: "b1" }), false);
  assert.equal(await newerVersionReady({ fetchFn: answer({ nope: 1 }), current: "b1" }), false);
  assert.equal(await newerVersionReady({ fetchFn: answer({ build: "" }), current: "b1" }), false);
  assert.equal(await newerVersionReady({ fetchFn: async () => { throw new Error("offline"); }, current: "b1" }), false);
  assert.equal(await newerVersionReady({ fetchFn: answer({ build: "b2" }), current: "" }), false);
  assert.equal(await newerVersionReady({ fetchFn: undefined, current: "b1" }), false);
});
await t("the check is made fresh every time (never from the cache)", async () => {
  let seen = null;
  await newerVersionReady({ fetchFn: async (url, options) => { seen = { url, options }; return { ok: true, json: async () => ({ build: "b1" }) }; }, current: "b1", base: "" });
  assert.match(seen.url, /^\/version\.json\?t=\d+$/);
  assert.equal(seen.options.cache, "no-store");
});

await t("the version of a build is shown in words, or as unknown when there is none", async () => {
  assert.match(buildLabel("2026-10-16T15:04:58.670Z-cnhrw3"), /16 Oct/);
  assert.equal(buildLabel(""), "unknown");
  assert.equal(buildLabel("not a date"), "unknown");
});

console.log(`\n${n} passed`);
