import assert from "node:assert/strict";
import { fridgeLabelsHtml } from "../src/modules/temperature/fridgeLabels.js";
import { unitAsAsset, isFridgeAsset, resolveUnit } from "../src/mobile/fridgeCheck.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const sites = [{ id: "main_branch", name: "Main Branch" }];
const unit = { id: "u-1", name: "Vaccine fridge", siteId: "main_branch", type: "fridge", range: { min: 2, max: 8 } };
const urlFor = (u) => `https://app.example/sense/open/fridge/${encodeURIComponent(u.id)}`;
const qrFor = (link) => `data:qr/${link}`;

t("a label has the fridge's name, site, range, a QR for its own link and the instruction", () => {
  const html = fridgeLabelsHtml([unit], { sites, urlFor, qrFor });
  assert.match(html, /<div class="name">Vaccine fridge<\/div>/);
  assert.match(html, /<div class="site">Main Branch<\/div>/);
  assert.match(html, /Safe range 2\u00b0C to 8\u00b0C/);
  assert.match(html, /data:qr\/https:\/\/app\.example\/sense\/open\/fridge\/u-1/);
  assert.match(html, /Scan to record the temperature/);
});

t("several fridges give several labels, and a name can't inject markup", () => {
  const html = fridgeLabelsHtml([unit, { ...unit, id: "u-2", name: "<img src=x onerror=alert(1)>" }], { sites, urlFor, qrFor });
  assert.equal((html.match(/<section class="label">/g) || []).length, 2);
  assert.ok(!html.includes("<img src=x"));
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

t("a fridge with no site or range still prints", () => {
  const html = fridgeLabelsHtml([{ id: "u-3", name: "Old unit" }], { sites, urlFor, qrFor });
  assert.match(html, /<div class="site"><\/div>/);
  assert.match(html, /Safe range  to /);
});

t("a tag that points at a fridge opens the same check as one on its equipment", () => {
  const asset = unitAsAsset({ ...unit });
  assert.deepEqual(asset, { id: "u-1", name: "Vaccine fridge", category: "Fridge", monitoring: { fridgeId: "u-1", min: 2, max: 8 } });
  assert.ok(isFridgeAsset(asset));
  assert.equal(resolveUnit(asset, [unit]).id, "u-1", "it is found as its own unit");
  assert.equal(unitAsAsset({ ...unit, type: "freezer" }).category, "Freezer");
});

console.log(`\n${n} passed`);
