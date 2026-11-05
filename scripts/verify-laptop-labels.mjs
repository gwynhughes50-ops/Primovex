import assert from "node:assert/strict";
import { DEFAULT_SHEET, NUDGE_LIMIT_MM, SHEETS, buildLabelsHtml, perSheet } from "../src/components/laptops/laptopLabels.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const laptops = (count) => Array.from({ length: count }, (_, i) => ({ id: `L${i}`, assetCode: `W91003MLAP${10000 + i}` }));
const countOf = (html, re) => (html.match(re) || []).length;
const near = (a, b) => Math.abs(a - b) < 0.05;

t("the default is the Avery L7162 sheet: 16 labels, two across and eight down, 99.1 x 33.9 mm, and it fits A4 with the published margins", () => {
  const s = SHEETS[DEFAULT_SHEET];
  assert.equal(DEFAULT_SHEET, "l7162");
  assert.equal(perSheet(), 16);
  assert.ok(near(2 * s.marginLeftMm + s.columns * s.widthMm + (s.columns - 1) * s.columnGapMm, 210), "across the page");
  assert.ok(near(2 * s.marginTopMm + s.rows * s.heightMm + (s.rows - 1) * s.rowGapMm, 297), "down the page");
  assert.equal(s.widthMm, 99.1);
  assert.equal(s.heightMm, 33.9);
  assert.equal(s.marginTopMm, 12.9);
  assert.equal(s.marginLeftMm, 4.65);
});

t("the 14-up sheet tried first is still there: 14 labels, 100 x 40.4 mm, 7 mm top and bottom, 5 mm sides, no gaps", () => {
  const s = SHEETS.wide14;
  assert.equal(perSheet("wide14"), 14);
  assert.ok(near(2 * s.marginLeftMm + s.columns * s.widthMm, 210));
  assert.ok(2 * s.marginTopMm + s.rows * s.heightMm <= 297);
  assert.equal(s.columnGapMm + s.rowGapMm, 0);
});

t("16 laptops fill one sheet, 17 start a second; the page, the grid and the gaps match the sheet", () => {
  const one = buildLabelsHtml(laptops(16));
  assert.equal(countOf(one, /<section class="page">/g), 1);
  assert.equal(countOf(one, /<div class="label">/g), 16);
  assert.equal(countOf(buildLabelsHtml(laptops(17)), /<section class="page">/g), 2);
  assert.equal(countOf(buildLabelsHtml(laptops(32)), /<section class="page">/g), 2);
  assert.match(one, /@page\{size:A4 portrait;margin:0\}/);
  assert.match(one, /left:4\.65mm;top:12\.9mm/);
  assert.match(one, /grid-template-columns:repeat\(2,99\.1mm\)/);
  assert.match(one, /grid-auto-rows:33\.9mm/);
  assert.match(one, /column-gap:2\.5mm;row-gap:0mm/);
  const wide = buildLabelsHtml(laptops(14), { sheet: "wide14" });
  assert.equal(countOf(wide, /<section class="page">/g), 1);
  assert.match(wide, /grid-auto-rows:40\.4mm/);
  assert.match(wide, /column-gap:0mm;row-gap:0mm/);
});

t("an unknown sheet falls back to the default rather than printing nothing", () => {
  assert.match(buildLabelsHtml(laptops(1), { sheet: "nonsense" }), /grid-auto-rows:33\.9mm/);
  assert.equal(perSheet("nonsense"), 16);
});

t("a nudge moves everything, and is kept to a few millimetres and to real numbers", () => {
  assert.match(buildLabelsHtml(laptops(1), { nudgeXMm: 1.5, nudgeYMm: -2 }), /left:6\.15mm;top:10\.9mm/);
  assert.match(buildLabelsHtml(laptops(1), { nudgeXMm: 99, nudgeYMm: -99 }), new RegExp(`left:${(4.65 + NUDGE_LIMIT_MM).toFixed(2).replace(/0+$/, "")}mm;top:${(12.9 - NUDGE_LIMIT_MM).toFixed(1)}mm`));
  assert.match(buildLabelsHtml(laptops(1), { nudgeXMm: "abc", nudgeYMm: "}body{display:none" }), /left:4\.65mm;top:12\.9mm/, "nothing typed reaches the style");
});

t("each sticker holds that laptop's own code; the outline appears only on the trial sheet", () => {
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
