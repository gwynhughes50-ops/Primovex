// Covers the asset QR payload round-trip (build on the label, parse on
// scan) for emergency_assets / anaphylaxis_boxes - see assetLabelService.js.
// Bundled with esbuild (not run directly with node) because this file is
// imported via the project's @/ alias.
import assert from "node:assert/strict";
import { buildAssetQrPayload, getMedTrakAssetId, parseAssetQrPayload } from "../src/services/assets/assetLabelService.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };

t("round trip: what gets printed on the label is exactly what scanning it recovers", () => {
  for (const collection of ["emergency_assets", "anaphylaxis_boxes"]) {
    const payload = buildAssetQrPayload(collection, "box2");
    assert.deepEqual(parseAssetQrPayload(payload), { collection, assetId: "box2" });
  }
});

t("getMedTrakAssetId still works the same for both collections (printed on the label, not scanned)", () => {
  assert.equal(getMedTrakAssetId("anaphylaxis_boxes", "box2"), "ANX-BOX2");
  assert.equal(getMedTrakAssetId("emergency_assets", "resus_trolley"), "EDK-RESUS-TROLLEY");
});

t("parseAssetQrPayload: rejects anything that isn't our JSON shape", () => {
  assert.equal(parseAssetQrPayload(""), null);
  assert.equal(parseAssetQrPayload("1234567890128"), null); // an ordinary manufacturer barcode
  assert.equal(parseAssetQrPayload("not json"), null);
  assert.equal(parseAssetQrPayload("{not valid json"), null);
  assert.equal(parseAssetQrPayload(null), null);
  assert.equal(parseAssetQrPayload(undefined), null);
});

t("parseAssetQrPayload: rejects a different payload shape with the same JSON-object look", () => {
  assert.equal(parseAssetQrPayload(JSON.stringify({ type: "medtrak.compliance", collection: "emergency_assets", assetId: "x" })), null);
  assert.equal(parseAssetQrPayload(JSON.stringify({ type: "medtrak.asset", collection: "stock_items", assetId: "x" })), null); // not one of ours
  assert.equal(parseAssetQrPayload(JSON.stringify({ type: "medtrak.asset", collection: "emergency_assets" })), null); // no assetId
});

t("parseAssetQrPayload: tolerates surrounding whitespace from a real scanner", () => {
  const payload = buildAssetQrPayload("anaphylaxis_boxes", "box1");
  assert.deepEqual(parseAssetQrPayload(`  ${payload}\n`), { collection: "anaphylaxis_boxes", assetId: "box1" });
});

// ---- the short link on current labels, and labels printed earlier
const LEGACY = (collection, assetId) => JSON.stringify({ type: "medtrak.asset", version: 1, collection, assetId, medtrakId: "X" });

t("the label is now a short link, not a long JSON text", () => {
  const payload = buildAssetQrPayload("anaphylaxis_boxes", "anaphylaxis_box_3");
  assert.equal(payload, "primovex://asset/anaphylaxis_boxes/anaphylaxis_box_3");
  assert.ok(payload.length < 60);
  assert.ok(payload.length < LEGACY("anaphylaxis_boxes", "anaphylaxis_box_3").length / 2);
});

t("labels printed before the short link still scan: the old JSON text is still read", () => {
  assert.deepEqual(parseAssetQrPayload(LEGACY("anaphylaxis_boxes", "kit_1")), { collection: "anaphylaxis_boxes", assetId: "kit_1" });
  assert.deepEqual(parseAssetQrPayload(LEGACY("emergency_assets", "resus")), { collection: "emergency_assets", assetId: "resus" });
});

t("the https form of the link works too, and trailing slashes or query bits are tolerated", () => {
  assert.deepEqual(parseAssetQrPayload("https://app.primovex.co.uk/asset/anaphylaxis_boxes/kit_3"), { collection: "anaphylaxis_boxes", assetId: "kit_3" });
  assert.deepEqual(parseAssetQrPayload("primovex://asset/emergency_assets/resus/"), { collection: "emergency_assets", assetId: "resus" });
  assert.deepEqual(parseAssetQrPayload("primovex://asset/emergency_assets/resus?x=1"), { collection: "emergency_assets", assetId: "resus" });
  assert.deepEqual(parseAssetQrPayload("PRIMOVEX://ASSET/anaphylaxis_boxes/kit_3"), { collection: "anaphylaxis_boxes", assetId: "kit_3" });
});

t("a box id with spaces or odd characters survives the round trip", () => {
  for (const id of ["Kit 3", "box/2", "ward & clinic", "kit-3_a"]) {
    assert.deepEqual(parseAssetQrPayload(buildAssetQrPayload("anaphylaxis_boxes", id)), { collection: "anaphylaxis_boxes", assetId: id });
  }
});

t("links that are not one of ours are rejected", () => {
  assert.equal(parseAssetQrPayload("https://evil.example/asset/anaphylaxis_boxes/kit_3"), null);
  assert.equal(parseAssetQrPayload("https://app.primovex.co.uk.evil.example/asset/anaphylaxis_boxes/kit_3"), null);
  assert.equal(parseAssetQrPayload("primovex://asset/stock_items/x"), null);        // not a kit collection
  assert.equal(parseAssetQrPayload("primovex://asset/anaphylaxis_boxes/"), null);     // no id
  assert.equal(parseAssetQrPayload("primovex://sense/open/space/abc"), null);          // a room tag, handled elsewhere
  assert.equal(parseAssetQrPayload("primovex://asset/anaphylaxis_boxes/%E0%A4%A"), null); // broken escape
});

console.log(`\n${n} passed`);
