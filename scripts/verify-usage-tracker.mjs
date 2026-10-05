// Covers the active-time counter (src/lib/usageTracker.js).
import assert from "node:assert/strict";
import { areaOf, createUsageTracker, IDLE_AFTER_MS } from "../src/lib/usageTracker.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };

const clock = (start = 1_000_000) => { let v = start; const now = () => v; now.advance = (ms) => { v += ms; }; return now; };
const sec = (s) => s * 1000;

t("an area is a path without the query, ids or deep levels", () => {
  assert.equal(areaOf("/inventory?tab=x"), "/inventory");
  assert.equal(areaOf("/governance/sars/ABCDEFGHIJ1234567"), "/governance/sars");
  assert.equal(areaOf("/Sense/Open/Asset/x"), "/sense/open");
  assert.equal(areaOf(""), "/");
  assert.equal(areaOf(null), "/");
});

t("time goes to the area the person was in, per area", () => {
  const now = clock();
  const tr = createUsageTracker({ now });
  tr.setPath("/dashboard");
  now.advance(sec(60)); tr.interact();
  tr.setPath("/inventory?tab=emergency");
  now.advance(sec(120)); tr.interact();
  const pages = tr.drain();
  assert.deepEqual(pages.find((p) => p.path === "/dashboard"), { path: "/dashboard", seconds: 60, visits: 1 });
  assert.deepEqual(pages.find((p) => p.path === "/inventory"), { path: "/inventory", seconds: 120, visits: 1 });
});

t("staying on the same area doesn't count another visit; coming back does", () => {
  const now = clock();
  const tr = createUsageTracker({ now });
  tr.setPath("/a"); tr.setPath("/a?x=1");
  tr.setPath("/b"); tr.setPath("/a");
  const pages = tr.drain();
  assert.equal(pages.find((p) => p.path === "/a").visits, 2);
  assert.equal(pages.find((p) => p.path === "/b").visits, 1);
});

t("time stops counting after the idle limit, even though the window is still open", () => {
  const now = clock();
  const tr = createUsageTracker({ now });
  tr.setPath("/dashboard");
  tr.interact();
  now.advance(sec(60) + IDLE_AFTER_MS + sec(3600)); // an hour away from the screen
  const seconds = tr.drain().find((p) => p.path === "/dashboard").seconds;
  assert.equal(seconds, IDLE_AFTER_MS / 1000); // only up to the idle limit
});

t("a hidden window doesn't count, and counting resumes when it's shown", () => {
  const now = clock();
  const tr = createUsageTracker({ now });
  tr.setPath("/dashboard");
  now.advance(sec(30)); tr.interact();
  tr.setVisible(false);
  now.advance(sec(100));
  tr.setVisible(true);
  tr.interact();
  now.advance(sec(20)); tr.interact();
  assert.equal(tr.drain().find((p) => p.path === "/dashboard").seconds, 50);
});

t("draining empties the counter; what couldn't be sent can be put back", () => {
  const now = clock();
  const tr = createUsageTracker({ now });
  tr.setPath("/dashboard");
  now.advance(sec(45)); tr.interact();
  const first = tr.drain();
  assert.equal(first[0].seconds, 45);
  assert.deepEqual(tr.drain(), []);
  tr.restore(first);
  now.advance(sec(10)); tr.interact();
  assert.equal(tr.drain().find((p) => p.path === "/dashboard").seconds, 55);
});

t("sub-second remainders carry over rather than being lost", () => {
  const now = clock();
  const tr = createUsageTracker({ now });
  tr.setPath("/a");
  now.advance(700); tr.interact();
  assert.deepEqual(tr.drain().map((p) => p.seconds), [0]); // the visit, no whole second yet
  now.advance(700); tr.interact();
  assert.equal(tr.drain().find((p) => p.path === "/a").seconds, 1);
});

console.log(`\n${n} passed`);
