// Covers renaming floors and zones in the Space Registry
// (src/modules/sense/services/hierarchyEdit.js).
import assert from "node:assert/strict";
import { renameHierarchyItem } from "../src/modules/sense/services/hierarchyEdit.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };

const state = () => ({
  sites: [{ id: "SITE-MAIN", name: "Main Surgery" }, { id: "SITE-B", name: "Branch" }],
  floors: [
    { id: "F-G", siteId: "SITE-MAIN", name: "Ground Floor", order: 0 },
    { id: "F-1", siteId: "SITE-MAIN", name: "First Floor", order: 1 },
    { id: "F-B1", siteId: "SITE-B", name: "First Floor", order: 0 },
  ],
  zones: [{ id: "Z-C", siteId: "SITE-MAIN", name: "Clinical" }, { id: "Z-S", siteId: "SITE-MAIN", name: "Staff" }],
  spaces: [
    { id: "SP-1", name: "Room 1", siteId: "SITE-MAIN", floorId: "F-1", floor: "First Floor", floorName: "First Floor", zoneId: "Z-C", zone: "Clinical", zoneName: "Clinical" },
    { id: "SP-2", name: "Room 2", siteId: "SITE-MAIN", floorId: "F-G", floor: "Ground Floor", floorName: "Ground Floor" },
    { id: "SP-3", name: "Branch room", siteId: "SITE-B", floorId: "F-B1", floor: "First Floor", floorName: "First Floor" },
  ],
});

t("renames a floor and keeps its id, order and the site it belongs to", () => {
  const r = renameHierarchyItem(state(), "floors", "F-1", "Mezzanine");
  assert.equal(r.ok, true);
  const floor = r.state.floors.find((f) => f.id === "F-1");
  assert.deepEqual([floor.name, floor.siteId, floor.order], ["Mezzanine", "SITE-MAIN", 1]);
});

t("the floor name stored on that floor's spaces follows, and nobody else's does", () => {
  const r = renameHierarchyItem(state(), "floors", "F-1", "Mezzanine");
  const byId = Object.fromEntries(r.state.spaces.map((s) => [s.id, s]));
  assert.equal(byId["SP-1"].floor, "Mezzanine");
  assert.equal(byId["SP-1"].floorName, "Mezzanine");
  assert.equal(byId["SP-1"].floorId, "F-1");
  assert.equal(byId["SP-2"].floor, "Ground Floor");
  assert.equal(byId["SP-3"].floor, "First Floor"); // the other site's "First Floor" is untouched
});

t("renaming to a name the same site already uses is refused, ignoring case and spacing", () => {
  for (const name of ["Ground Floor", "ground  floor", " GROUND FLOOR "]) {
    const r = renameHierarchyItem(state(), "floors", "F-1", name);
    assert.equal(r.ok, false, name);
    assert.match(r.error, /already has a floor called/);
  }
});

t("a different site may use the same name", () => {
  const r = renameHierarchyItem(state(), "floors", "F-B1", "Ground Floor");
  assert.equal(r.ok, true);
});

t("a floor can be renamed to its own name in a different case", () => {
  const r = renameHierarchyItem(state(), "floors", "F-1", "first floor");
  assert.equal(r.ok, true);
  assert.equal(r.state.floors.find((f) => f.id === "F-1").name, "first floor");
});

t("blank names are refused; unchanged names are a no-op", () => {
  assert.equal(renameHierarchyItem(state(), "floors", "F-1", "   ").ok, false);
  const s = state();
  const r = renameHierarchyItem(s, "floors", "F-1", "First Floor");
  assert.equal(r.ok, true);
  assert.equal(r.state, s);
});

t("zones rename the same way, updating zone and zoneName on their spaces", () => {
  const r = renameHierarchyItem(state(), "zones", "Z-C", "Clinical area");
  assert.equal(r.ok, true);
  const sp = r.state.spaces.find((s) => s.id === "SP-1");
  assert.deepEqual([sp.zone, sp.zoneName, sp.zoneId], ["Clinical area", "Clinical area", "Z-C"]);
  assert.equal(renameHierarchyItem(state(), "zones", "Z-C", "staff").ok, false);
});

t("sites and unknown things can't be renamed here; a missing item is reported", () => {
  assert.equal(renameHierarchyItem(state(), "sites", "SITE-MAIN", "X").ok, false);
  assert.match(renameHierarchyItem(state(), "floors", "nope", "X").error, /no longer exists/);
});

t("the input isn't mutated", () => {
  const s = state();
  const before = JSON.stringify(s);
  renameHierarchyItem(s, "floors", "F-1", "Mezzanine");
  assert.equal(JSON.stringify(s), before);
});

console.log(`\n${n} passed`);
