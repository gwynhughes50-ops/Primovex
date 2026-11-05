import assert from "node:assert/strict";
import { classifyScan } from "../src/mobile/scanRouter.js";
import { buildLaptopLink } from "../src/modules/laptops/laptops.js";
import { buildAssetQrPayload } from "../src/services/assets/assetLabelService.js";
import { buildComplianceLink, buildComplianceQrPayload } from "../src/services/compliance/complianceRules.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const APP = "https://app.primovex.co.uk";

t("a laptop's label opens that laptop, from its link, a link without the address, or the plain text form", () => {
  const link = buildLaptopLink({ id: "abc123" });
  assert.deepEqual(classifyScan(link), { kind: "laptop", id: "abc123", raw: link, route: "/sense/open/laptop/abc123" });
  assert.equal(classifyScan("/sense/open/laptop/abc123").kind, "laptop");
  assert.equal(classifyScan("MEDTRAK:LAPTOP:abc123").route, "/sense/open/laptop/abc123");
  assert.equal(classifyScan(`${APP}/sense/open/laptop/a%20b`).id, "a b");
});

t("a fridge and a chemical cupboard go to their own screens", () => {
  assert.equal(classifyScan(`${APP}/sense/open/fridge/fr-1`).route, "/sense/open/fridge/fr-1");
  assert.equal(classifyScan(`${APP}/sense/open/coshh/Store%20room`).route, "/sense/open/coshh/Store%20room");
  assert.equal(classifyScan(`${APP}/sense/open/fridge/fr-1`).kind, "fridge");
  assert.equal(classifyScan(`${APP}/sense/open/coshh/x`).kind, "coshh");
});

t("a room and a Sense asset are named, and left for the room scanner to find (no route of their own)", () => {
  const room = classifyScan(`${APP}/sense/open/space/room-4`);
  assert.deepEqual([room.kind, room.id, room.route], ["space", "room-4", null]);
  const asset = classifyScan(`${APP}/sense/open/asset/eq-9`);
  assert.deepEqual([asset.kind, asset.id, asset.route], ["asset", "eq-9", null]);
});

t("a fire point, water outlet or other checked asset is recognised in every form it has been printed", () => {
  for (const code of [buildComplianceLink({ id: "FP-007" }), buildComplianceLink({ id: "FP-007" }, { method: "nfc" }), buildComplianceQrPayload({ id: "FP-007" }), "MTQR:FP-007", "FP-007"]) {
    const r = classifyScan(code);
    assert.equal(r.kind, "compliance", code);
    assert.equal(r.id, "FP-007", code);
  }
});

t("an emergency kit or anaphylaxis box label opens the box check", () => {
  for (const collection of ["emergency_assets", "anaphylaxis_boxes"]) {
    const r = classifyScan(buildAssetQrPayload(collection, "box-1"));
    assert.equal(r.kind, "kit", collection);
    assert.equal(r.id, "box-1");
  }
});

t("a product barcode, a room code that is not a link, and rubbish are left as unknown (tried as a room, then as stock)", () => {
  for (const code of ["5012345678900", "012345678905", "room-4 front", "https://example.com/menu", "hello world"]) assert.equal(classifyScan(code).kind, "unknown", code);
  assert.equal(classifyScan("").kind, "empty");
  assert.equal(classifyScan(null).kind, "empty");
  assert.equal(classifyScan("   ").kind, "empty");
});

t("a laptop link is never mistaken for a plain compliance code, and the order of checks keeps each kind to itself", () => {
  assert.equal(classifyScan(buildLaptopLink({ id: "FP-007" })).kind, "laptop");
  assert.equal(classifyScan(`${APP}/sense/open/fridge/FP-007`).kind, "fridge");
});

console.log(`\n${n} passed`);
