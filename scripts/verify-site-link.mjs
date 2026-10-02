// Covers linking the Space Registry's sites to Practice Admin's
// (src/modules/sense/services/siteLink.js).
import assert from "node:assert/strict";
import { createLinkedSite, linkSite, planSiteLinks, reconcileLinkedNames, spaceNamesForSite } from "../src/modules/sense/services/siteLink.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };

const registry = () => ({
  sites: [{ id: "SITE-MAIN", name: "Main Surgery", status: "active" }],
  floors: [{ id: "FLOOR-GROUND", siteId: "SITE-MAIN", name: "Ground Floor", order: 0 }],
  zones: [{ id: "ZONE-CLINICAL", siteId: "SITE-MAIN", name: "Clinical" }],
  spaces: [
    { id: "SP-1", name: "Treatment Room 1", siteId: "SITE-MAIN", site: "Main Surgery", status: "ready" },
    { id: "SP-2", name: "Store Room", siteId: "SITE-MAIN", site: "Main Surgery", status: "ready" },
    { id: "SP-3", name: "Old Cupboard", siteId: "SITE-MAIN", status: "archived" },
  ],
});
const main = { id: "ps-main", name: "Main Surgery" };
const branch = { id: "ps-branch", name: "Branch Surgery" };

t("planSiteLinks: a same-named site is suggested, never auto-applied", () => {
  const plan = planSiteLinks(registry().sites, [main, branch]);
  assert.equal(plan.rows[0].suggested.id, "SITE-MAIN");
  assert.equal(plan.rows[0].linked, null);
  assert.equal(plan.rows[1].suggested, null);
  assert.equal(plan.unlinked.length, 1);
});
t("planSiteLinks: names match ignoring case and punctuation", () => {
  assert.equal(planSiteLinks([{ id: "S", name: "main  surgery!" }], [main]).rows[0].suggested.id, "S");
});

t("linkSite: links, renames, and updates the name stored on its spaces", () => {
  const next = linkSite(registry(), "SITE-MAIN", { id: "ps-main", name: "Main Site" });
  assert.equal(next.sites[0].practiceSiteId, "ps-main");
  assert.equal(next.sites[0].name, "Main Site");
  assert.equal(next.sites[0].id, "SITE-MAIN"); // ids never change
  assert.equal(next.spaces[0].siteName, "Main Site");
  assert.equal(next.spaces[0].siteId, "SITE-MAIN");
});

t("createLinkedSite: new linked site with a ground floor and the standard zones", () => {
  const next = createLinkedSite(registry(), branch);
  const site = next.sites.find((s) => s.practiceSiteId === "ps-branch");
  assert.ok(site && site.name === "Branch Surgery");
  assert.equal(next.floors.filter((f) => f.siteId === site.id).length, 1);
  assert.ok(next.zones.filter((z) => z.siteId === site.id).length >= 4);
  assert.equal(new Set(next.zones.map((z) => z.id)).size, next.zones.length); // ids unique
  assert.equal(next.sites.length, 2);
});
t("createLinkedSite: doing it twice doesn't duplicate", () => {
  const once = createLinkedSite(registry(), branch);
  assert.equal(createLinkedSite(once, branch).sites.length, 2);
});

t("reconcileLinkedNames: a rename in Practice Admin reaches the registry", () => {
  const linked = linkSite(registry(), "SITE-MAIN", main);
  const next = reconcileLinkedNames(linked, [{ id: "ps-main", name: "Main Site" }]);
  assert.equal(next.sites[0].name, "Main Site");
  assert.equal(next.spaces[0].siteName, "Main Site");
});
t("reconcileLinkedNames: nothing to change returns the same object", () => {
  const linked = linkSite(registry(), "SITE-MAIN", main);
  assert.equal(reconcileLinkedNames(linked, [main]), linked);
  assert.equal(reconcileLinkedNames(registry(), [main]).sites[0].practiceSiteId, undefined); // unlinked untouched
});

t("spaceNamesForSite: only that site's rooms, archived excluded, sorted", () => {
  let state = linkSite(registry(), "SITE-MAIN", main);
  state = createLinkedSite(state, branch);
  state = { ...state, spaces: [...state.spaces, { id: "SP-9", name: "Branch Store", siteId: state.sites[1].id, status: "ready" }] };
  assert.deepEqual(spaceNamesForSite(state, [main, branch], "Main Surgery"), ["Store Room", "Treatment Room 1"]);
  assert.deepEqual(spaceNamesForSite(state, [main, branch], "Branch Surgery"), ["Branch Store"]);
});
t("spaceNamesForSite: a site that isn't linked yet offers every room, not none", () => {
  assert.deepEqual(spaceNamesForSite(registry(), [main], "Main Surgery"), ["Store Room", "Treatment Room 1"]);
  assert.deepEqual(spaceNamesForSite(registry(), [main], "Something else"), ["Store Room", "Treatment Room 1"]);
  assert.deepEqual(spaceNamesForSite(registry(), [main], ""), ["Store Room", "Treatment Room 1"]);
});

console.log(`\n${n} passed`);
