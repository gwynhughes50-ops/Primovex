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

console.log(`\n${n} passed`);
