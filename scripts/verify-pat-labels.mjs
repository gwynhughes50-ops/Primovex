// PAT QR labels: each appliance gets a label holding its own link; scanning it (on a phone or a computer) opens that appliance with its details, test history and a Retest button.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PAT_LABEL, buildPatLabelsHtml, perSheet } from "../src/components/pat/patLabels.js";
import { getQrImageUrl } from "../src/lib/qrCode.js";
import { buildPatLink, findAppliance, parsePatLink, readingsLine, testsOf } from "../src/modules/pat/pat.js";
import { classifyScan } from "../src/mobile/scanRouter.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const appliances = (count) => Array.from({ length: count }, (_, i) => ({ id: `A${i}`, tag: `R-${i + 1}`, name: "Kettle", location: `Room ${i}`, active: true }));
const count = (html, re) => (html.match(re) || []).length;

t("a label's link opens that appliance, and reads back from the link or the plain text form", () => {
  const link = buildPatLink({ id: "abc123" });
  assert.equal(link, "https://app.primovex.co.uk/sense/open/pat/abc123");
  assert.deepEqual(parsePatLink(link), { id: "abc123", raw: link });
  assert.equal(parsePatLink("/sense/open/pat/abc123").id, "abc123");
  assert.equal(parsePatLink("MEDTRAK:PAT:abc123").id, "abc123");
  assert.equal(parsePatLink(buildPatLink({ id: "a b/c" })).id, "a b/c", "an id with odd characters survives");
  assert.equal(parsePatLink("R-2"), null, "a plain tag is not a link");
  assert.equal(parsePatLink(""), null);
  assert.equal(parsePatLink("https://app.primovex.co.uk/sense/open/laptop/abc123"), null, "a laptop's link is not an appliance's");
  assert.equal(buildPatLink({ id: "x" }, "https://test.example/"), "https://test.example/sense/open/pat/x");
});

t("scanning a label is recognised as an appliance, and is not mistaken for a laptop, a PC or a fire point", () => {
  const link = buildPatLink({ id: "abc123" });
  assert.deepEqual(classifyScan(link), { kind: "pat", id: "abc123", raw: link, route: "/sense/open/pat/abc123" });
  assert.equal(classifyScan("/sense/open/pat/abc123").kind, "pat");
  assert.equal(classifyScan("MEDTRAK:PAT:abc123").route, "/sense/open/pat/abc123");
  assert.equal(classifyScan("https://app.primovex.co.uk/sense/open/laptop/abc123").kind, "laptop");
  assert.equal(classifyScan("https://app.primovex.co.uk/sense/open/pc/abc123").kind, "pc");
});

t("the PAT wizard's own tag finder understands the label too", () => {
  const list = appliances(3);
  assert.equal(findAppliance(list, buildPatLink({ id: "A1" })).tag, "R-2");
  assert.equal(findAppliance(list, "MEDTRAK:PAT:A2").tag, "R-3");
  assert.equal(findAppliance(list, "r 1").id, "A0", "a typed tag still works");
  assert.equal(findAppliance(list, buildPatLink({ id: "nope" })), null);
});

t("a label holds the appliance's link, its tag and what it is, and says what scanning does", () => {
  const html = buildPatLabelsHtml([{ id: "A9", tag: "R-9", name: "Kettle", location: "Staff kitchen" }]);
  assert.ok(html.includes(getQrImageUrl(buildPatLink({ id: "A9" }), 300)), "the QR code is the appliance's own link");
  assert.match(html, /<b>R-9<\/b>/);
  assert.match(html, /<span>Kettle · Staff kitchen<\/span>/);
  assert.match(html, /Scan for its test history and to retest/);
  assert.match(html, /<title>PAT QR labels<\/title>/);
  assert.equal(PAT_LABEL.titleOf({ tag: "T-1" }), "T-1");
  assert.equal(PAT_LABEL.subtitleOf({ tag: "T-1" }), "Primovex PAT testing", "an appliance with no name or room still prints");
});

t("whatever was typed is escaped before it goes into the print page", () => {
  const html = buildPatLabelsHtml([{ id: "A1", tag: "<b>X</b>", name: "Kettle & \"toaster\"", location: "<script>alert(1)</script>" }]);
  assert.ok(!html.includes("<script>alert"));
  assert.ok(!html.includes("<b>X</b>"));
  assert.match(html, /&lt;b&gt;X&lt;\/b&gt;/);
  assert.match(html, /Kettle &amp; &quot;toaster&quot;/);
});

t("labels print on the same sticker sheets as the laptop and PC labels, a page at a time", () => {
  assert.equal(perSheet("l7162"), 16);
  assert.equal(count(buildPatLabelsHtml(appliances(16)), /class="label"/g), 16);
  assert.equal(count(buildPatLabelsHtml(appliances(16)), /class="page"/g), 1);
  assert.equal(count(buildPatLabelsHtml(appliances(17)), /class="page"/g), 2);
  assert.match(buildPatLabelsHtml(appliances(1), { guides: true }), /outline:0\.2mm dashed/);
  assert.doesNotMatch(buildPatLabelsHtml(appliances(1)), /outline:0\.2mm dashed/);
  assert.match(buildPatLabelsHtml(appliances(1), { sheet: "wide14" }), /grid-template-columns:repeat\(2,100mm\)/);
});

t("an appliance's history: its own tests, newest first, with what each read", () => {
  const tests = [
    { id: "1", assetId: "A1", testedOn: "2025-05-01", result: "pass", visualOk: true, earth: "pass", earthOhms: 0.12, insulation: "pass", insulationMohms: 250, fuseRating: "13A" },
    { id: "2", assetId: "A2", testedOn: "2026-01-01", result: "pass" },
    { id: "3", assetId: "A1", testedOn: "2026-05-01", result: "fail", visualOk: false, earth: "fail", insulation: "pass" },
  ];
  assert.deepEqual(testsOf(tests, "A1").map((x) => x.id), ["3", "1"]);
  assert.deepEqual(testsOf(tests, "none"), []);
  assert.equal(readingsLine(tests[0]), "Visual ok · Earth pass 0.12Ω · Insulation pass 250MΩ · 13A");
  assert.equal(readingsLine({ visualOk: true, earth: "na", insulation: "pass" }), "Visual ok · Insulation pass", "a Class II item has no earth reading");
  assert.equal(readingsLine({ visualOk: false }), "Visual damaged");
});

t("the screens: Print QR labels on the register, the label lands on a retest page on the phone and on the register on a computer", () => {
  const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
  const panel = read("../src/components/compliance/PatRegisterPanel.jsx");
  assert.match(panel, /Print QR labels/);
  assert.match(panel, /Trial sheet/);
  assert.match(panel, /buildPatLabelsHtml/);
  assert.match(panel, /get\("open"\)/);
  const landing = read("../src/mobile/pat/PatLanding.jsx");
  assert.match(landing, /Retest this appliance/);
  assert.match(landing, /startAsset=\{asset\}/);
  assert.match(landing, /Test history/);
  assert.match(read("../src/mobile/pat/PatWizard.jsx"), /startAsset/);
  assert.match(read("../src/apps/MobileApp.jsx"), /entityType === "pat"/);
  assert.match(read("../src/apps/DesktopApp.jsx"), /\/sense\/open\/pat\/:assetId/);
  assert.match(read("../src/apps/DesktopApp.jsx"), /compliance\?tab=pat&open=/);
});

console.log(`\n${n} checks passed`);
