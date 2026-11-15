// Covers the PC QR labels: each holds that PC's own link, says its number and where it is, escapes whatever was typed, and prints on the same sticker sheets as the laptop labels.
import assert from "node:assert/strict";
import { COMPUTER_LABEL, DEFAULT_SHEET, buildComputerLabelsHtml, perSheet } from "../src/components/computers/computerLabels.js";
import { buildLabelsHtml } from "../src/components/laptops/laptopLabels.js";
import { getQrImageUrl } from "../src/lib/qrCode.js";
import { buildComputerLink } from "../src/modules/computers/computers.js";
import { buildLaptopLink } from "../src/modules/laptops/laptops.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const pcs = (count) => Array.from({ length: count }, (_, i) => ({ id: `P${i}`, assetNumber: String(100 + i), department: "Consultation", label: `Room ${i}` }));
const count = (html, re) => (html.match(re) || []).length;

t("each sticker is one PC: its number, where it is, a hint, and its own link in the QR code", () => {
  const html = buildComputerLabelsHtml(pcs(3), { origin: "https://app.primovex.co.uk" });
  assert.equal(count(html, /class="label"/g), 3);
  assert.match(html, /<b>PC 100<\/b>/); assert.match(html, /<b>PC 102<\/b>/);
  assert.match(html, /Consultation · Room 1/);
  assert.match(html, /Scan to check this PC/);
  assert.match(html, /<title>PC QR labels<\/title>/);
  // the QR is an image made on the device, so it is checked against the image for that PC's own link
  const own = getQrImageUrl(buildComputerLink({ id: "P1" }, "https://app.primovex.co.uk"), 300);
  const laptopsLink = getQrImageUrl(buildLaptopLink({ id: "P1" }, "https://app.primovex.co.uk"), 300);
  assert.ok(html.includes(`<img src="${own}"`), "the QR holds the PC's own link");
  assert.notEqual(own, laptopsLink);
  assert.ok(!html.includes(laptopsLink), "and not a laptop's");
});

t("a PC with no room or department still says it belongs to IT equipment", () => {
  assert.match(buildComputerLabelsHtml([{ id: "P9", assetNumber: "9" }], {}), /Primovex IT equipment/);
  assert.equal(COMPUTER_LABEL.titleOf({ assetNumber: "146" }), "PC 146");
});

t("whatever was typed cannot break the print page", () => {
  const html = buildComputerLabelsHtml([{ id: "P1", assetNumber: "<script>alert(1)</script>", department: "A&B", label: "\"quoted\"" }], {});
  assert.ok(!html.includes("<script>alert"));
  assert.match(html, /&lt;script&gt;/); assert.match(html, /A&amp;B/); assert.match(html, /&quot;quoted&quot;/);
});

t("it prints on the same sticker sheet as the laptops, and the laptop labels are unchanged", () => {
  assert.equal(DEFAULT_SHEET, "l7162");
  assert.equal(perSheet(), 16);
  const many = buildComputerLabelsHtml(pcs(20), {});
  assert.equal(count(many, /class="page"/g), 2, "16 on the first page, 4 on the second");
  const guides = buildComputerLabelsHtml(pcs(2), { guides: true });
  assert.match(guides, /outline:0.2mm dashed/);
  const laptop = buildLabelsHtml([{ id: "L1", assetCode: "W91003MLAP10001" }], {});
  assert.match(laptop, /<b>W91003MLAP10001<\/b>/); assert.match(laptop, /Scan to loan out, return or record an update/); assert.match(laptop, /<title>Laptop QR labels<\/title>/);
});

console.log(`\n${n} passed`);
