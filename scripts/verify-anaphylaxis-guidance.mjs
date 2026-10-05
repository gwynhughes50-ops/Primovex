// Covers the anaphylaxis guidance list (src/config/anaphylaxisGuidance.js).
import assert from "node:assert/strict";
import { ANAPHYLAXIS_GUIDANCE, GUIDANCE_CHECKED_ON, formatGuidanceDate, sortedGuidance } from "../src/config/anaphylaxisGuidance.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };

t("every entry has what the page shows, and a real https link to the publisher", () => {
  const ids = new Set();
  ANAPHYLAXIS_GUIDANCE.forEach((row) => {
    assert.ok(row.id && !ids.has(row.id), `unique id: ${row.id}`);
    ids.add(row.id);
    ["title", "issuer", "covers", "summary", "kind"].forEach((key) => assert.ok(String(row[key] || "").trim(), `${row.id} has ${key}`));
    assert.match(row.url, /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}\//i, `${row.id} link`);
    if (row.published) assert.ok(["day", "month", "year"].includes(row.published.precision), `${row.id} precision`);
  });
});

t("dates read as precisely as the publisher gives them", () => {
  assert.equal(formatGuidanceDate({ date: "2026-05-27", precision: "day" }), "27 May 2026");
  assert.equal(formatGuidanceDate({ date: "2021-05", precision: "month" }), "May 2021");
  assert.equal(formatGuidanceDate({ date: "2021", precision: "year" }), "2021");
  assert.equal(formatGuidanceDate({ date: "2021-08-10", precision: "day" }), "10 August 2021");
  assert.equal(formatGuidanceDate(null), "No date shown by the publisher");
});

t("the list is newest first with undated entries last", () => {
  const sorted = sortedGuidance();
  assert.equal(sorted[0].id, "nice-ng258");
  assert.equal(sorted[sorted.length - 1].published, null);
  const idx = (id) => sorted.findIndex((row) => row.id === id);
  assert.ok(idx("bsaci-aai") < idx("rcuk-vaccination"));
  assert.ok(idx("rcuk-vaccination") < idx("rcuk-emergency-treatment")); // Aug 2021 before May 2021
});

t("the 'checked on' date is a valid date and not in the future", () => {
  const d = new Date(`${GUIDANCE_CHECKED_ON}T12:00:00`);
  assert.ok(!Number.isNaN(d.getTime()));
  assert.ok(d <= new Date());
});

console.log(`\n${n} passed`);
