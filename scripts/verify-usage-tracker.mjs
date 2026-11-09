// Covers the visit counter (src/lib/usageTracker.js). It counts how many times each area is visited. How long someone spends in an area is NOT recorded (decision of 9 November 2026).
import assert from "node:assert/strict";
import { areaOf, createUsageTracker } from "../src/lib/usageTracker.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };

t("an area is a path without the query, ids or deep levels", () => {
  assert.equal(areaOf("/inventory?tab=x"), "/inventory");
  assert.equal(areaOf("/governance/sars/ABCDEFGHIJ1234567"), "/governance/sars");
  assert.equal(areaOf("/Sense/Open/Asset/x"), "/sense/open");
  assert.equal(areaOf(""), "/");
  assert.equal(areaOf(null), "/");
});

t("each visit to an area is counted, and nothing else is in what is sent", () => {
  const tr = createUsageTracker();
  tr.setPath("/dashboard");
  tr.setPath("/inventory?tab=emergency");
  const pages = tr.drain();
  assert.deepEqual(pages.find((p) => p.path === "/dashboard"), { path: "/dashboard", visits: 1 });
  assert.deepEqual(pages.find((p) => p.path === "/inventory"), { path: "/inventory", visits: 1 });
  for (const page of pages) assert.deepEqual(Object.keys(page).sort(), ["path", "visits"], "no seconds, minutes or anything about how long");
});

t("there is no way to give the tracker a clock or to tell it someone is active, and it never reports time, however long the person stays", () => {
  const tr = createUsageTracker({ now: () => 0, idleAfterMs: 1 }); // an old way of calling it: ignored
  assert.deepEqual(Object.keys(tr).sort(), ["current", "drain", "restore", "setPath"], "no tick, interact or setVisible: nothing here can measure time");
  tr.setPath("/a");
  assert.deepEqual(tr.drain(), [{ path: "/a", visits: 1 }]);
});

t("staying on the same area doesn't count another visit; coming back does", () => {
  const tr = createUsageTracker();
  tr.setPath("/a"); tr.setPath("/a?x=1");
  tr.setPath("/b"); tr.setPath("/a");
  const pages = tr.drain();
  assert.equal(pages.find((p) => p.path === "/a").visits, 2);
  assert.equal(pages.find((p) => p.path === "/b").visits, 1);
  assert.equal(tr.current(), "/a");
});

t("draining empties the counter; what couldn't be sent can be put back, and junk put back is ignored", () => {
  const tr = createUsageTracker();
  tr.setPath("/dashboard");
  const first = tr.drain();
  assert.deepEqual(first, [{ path: "/dashboard", visits: 1 }]);
  assert.deepEqual(tr.drain(), []);
  tr.restore(first);
  tr.setPath("/alerts");
  const again = tr.drain();
  assert.equal(again.find((p) => p.path === "/dashboard").visits, 1);
  tr.restore([{ path: "/x", visits: -5 }, { path: "/y", visits: "lots" }, { path: "/dashboard/ABCDEFGHIJ12345", visits: 2, seconds: 9999 }]);
  assert.deepEqual(tr.drain(), [{ path: "/dashboard", visits: 2 }], "a negative or non-numeric count is nothing; an id is cut off; seconds are not kept");
});

console.log(`\n${n} passed`);
