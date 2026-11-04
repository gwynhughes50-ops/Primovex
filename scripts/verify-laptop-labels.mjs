import assert from "node:assert/strict";
import { PER_SHEET, SHEET, buildLabelsHtml } from "../src/components/laptops/laptopLabels.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const laptops = (count) => Array.from({ length: count }, (_, i) => ({ id: `L${i}`, assetCode: `W91003MLAP${10000 + i}` }));
const countOf = (html, re) => (html.match(re) || []).length;

t("the sheet is 14 stickers: two across and seven down, 100 mm by 40.4 mm, and it fits an A4 page exactly with the margins asked for", () => {
  assert.equal(PER_SHEET, 14);
  assert.equal(SHEET.columns * SHEET.widthMm + 2 * SHEET.marginSideMm, 210);
  assert.ok(SHEET.rows * SHEET.heightMm + 2 * SHEET.marginTopMm <= 297, "must not spill onto a second page");
  assert.equal(SHEET.marginTopMm, 7);
  assert.equal(SHEET.marginSideMm, 5);
});

t("14 laptops fill one sheet, 15 start a second, and there are no gaps between stickers", () => {
  const one = buildLabelsHtml(laptops(14));
  assert.equal(countOf(one, /<section class="page">/g), 1);
  assert.equal(countOf(one, /<div class="label">/g), 14);
  assert.equal(countOf(buildLabelsHtml(laptops(15)), /<section class="page">/g), 2);
  assert.equal(countOf(buildLabelsHtml(laptops(28)), /<section class="page">/g), 2);
  assert.match(one, /@page\{size:A4 portrait;margin:0\}/);
  assert.match(one, /grid-template-columns:repeat\(2,100mm\)/);
  assert.match(one, /grid-auto-rows:40\.4mm/);
  const pageRule = /.page{[^}]*}/.exec(one)[0];
  assert.doesNotMatch(pageRule, /gap/, "no gap between the stickers");
});

t("each sticker holds that laptop's own link and code; the outline appears only on the trial sheet", () => {
  const html = buildLabelsHtml(laptops(2), { origin: "https://app.primovex.co.uk" });
  assert.match(html, /W91003MLAP10000/);
  assert.match(html, /W91003MLAP10001/);
  const images = [...html.matchAll(/<img src="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(images.length, 2);
  assert.notEqual(images[0], images[1], "each laptop has its own code");
  assert.ok(images[0].startsWith("data:image/svg+xml;base64,"), "drawn on the page, nothing fetched from the internet");
  assert.doesNotMatch(html, /outline:0\.2mm/);
  assert.match(buildLabelsHtml(laptops(2), { guides: true }), /outline:0\.2mm dashed/);
});

t("a typed asset code cannot break the print page", () => {
  const html = buildLabelsHtml([{ id: "x", assetCode: '<script>alert(1)</script>"' }]);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
});

console.log(`\n${n} passed`);
