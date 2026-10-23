import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FEATURES, featureOn, groupVisible } from "../src/config/featureFlags.js";
import { getRouteAuditRows, getVisibleRouteManifest } from "../src/config/routeManifest.js";
import { getDesktopNavigation } from "../src/config/navigation.js";
import { DESTINATIONS, parseNavigation } from "../src/ai/navigation/navigate.js";
import { permissionRows } from "../src/core/identity/permissionExceptions.js";
import { CAPABILITY_CATALOG } from "../src/core/identity/capabilities.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const EVERYTHING = CAPABILITY_CATALOG.map((c) => c.id); // what the System Admin has

t("ClinFlow is switched off, and the switch is one word", () => {
  assert.equal(FEATURES.clinflow, false);
  assert.equal(featureOn("clinflow"), false);
  assert.equal(featureOn("something-new"), true, "a feature not listed is on");
  assert.equal(groupVisible("ClinFlow"), false);
  assert.equal(groupVisible("Inventory"), true);
});

t("it does not show anywhere, even for the System Admin who has every permission", () => {
  const manifest = getVisibleRouteManifest({ isAdmin: true, capabilities: EVERYTHING, developer: true });
  assert.ok(!manifest.some((r) => r.path === "/clinflow"), "no menu entry");
  assert.ok(manifest.length > 20, "the rest of the menu is untouched");
  assert.equal(getRouteAuditRows({ isAdmin: true, capabilities: EVERYTHING, developer: true }).find((r) => r.path === "/clinflow").accessible, false, "and the route audit says it is not reachable");
  assert.ok(!getDesktopNavigation({ isAdmin: true, capabilities: EVERYTHING }).some((i) => i.to === "/clinflow"), "nor in the older navigation");
  assert.ok(!DESTINATIONS.some((d) => d.id === "clinflow"), "the Orb has nowhere to take anyone");
  assert.equal(parseNavigation("take me to clinflow")?.id ?? null, null, "and does not understand the request");
  const groups = permissionRows(EVERYTHING, {}).map((g) => g.group);
  assert.ok(!groups.includes("ClinFlow"), "its permissions are not offered in the role or exceptions lists");
  assert.ok(groups.length > 5, "the other permission groups still are");
});

t("the pages and wording do not name it, and the page itself sends anyone who types the address to the dashboard", () => {
  const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  assert.match(read("src/apps/DesktopApp.jsx"), /featureOn\("clinflow"\) \? <PermissionGate capability="clinflow\.read">.*: <Navigate to="\/dashboard" replace \/>/);
  assert.match(read("src/pages/SecurityCentre.jsx"), /featureOn\("clinflow"\) && <Metric label="ClinFlow clinical data"/);
  assert.match(read("src/pages/SecurityCentre.jsx"), /featureOn\("clinflow"\) && <span[^>]*>CLINFLOW: BLOCKED BY DESIGN/);
  assert.ok(!/ClinFlow/.test(read("src/core/identity/capabilities.js").split("\n").filter((l) => l.includes("description:")).join("\n")), "no role description mentions it");
});

t("the code and the data stay in the background: its module, its server side and its permissions are still there", () => {
  assert.ok(readFileSync(new URL("../src/modules/clinflow/ClinFlowWorkspace.jsx", import.meta.url), "utf8").length > 1000);
  assert.ok(CAPABILITY_CATALOG.some((c) => c.id === "clinflow.read"), "the permission still exists, so nothing saved is lost");
  assert.match(readFileSync(new URL("../functions/index.js", import.meta.url), "utf8"), /clinflow/i);
});

t("switching it back on brings it back everywhere", () => {
  FEATURES.clinflow = true;
  try {
    const manifest = getVisibleRouteManifest({ isAdmin: true, capabilities: EVERYTHING, developer: true });
    assert.ok(manifest.some((r) => r.path === "/clinflow"));
    assert.ok(getDesktopNavigation({ isAdmin: true, capabilities: EVERYTHING }).some((i) => i.to === "/clinflow"));
    assert.ok(permissionRows(EVERYTHING, {}).some((g) => g.group === "ClinFlow"));
    assert.equal(groupVisible("ClinFlow"), true);
  } finally { FEATURES.clinflow = false; }
});

console.log(`\n${n} passed`);
