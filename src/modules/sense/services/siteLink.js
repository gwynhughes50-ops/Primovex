// Practice Admin (practice_sites) is the master list of the practice's sites.
// The Space Registry keeps its own sites list, which floors, zones and spaces
// hang off (and which other modules refer to by id like "SITE-MAIN"), so those
// ids are never changed. Instead each registry site can be *linked* to a
// Practice Admin site (`practiceSiteId`), and a linked site takes its name from
// Practice Admin. All of this is pure: it takes the registry state
// ({ sites, floors, zones, spaces }) and returns the next one.
import { DEFAULT_ZONES } from "../data/spaceTemplates";

const norm = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const isActive = (space) => space.status !== "archived";

// For each Practice Admin site: the registry site it's linked to, or - if not
// linked yet - the unlinked registry site with the same name (a suggestion to
// confirm, never applied automatically). `spacesOnly` are registry sites with
// no Practice Admin site behind them.
export function planSiteLinks(sites = [], practiceSites = []) {
  const unlinked = sites.filter((site) => !site.practiceSiteId);
  return {
    rows: practiceSites.map((practiceSite) => {
      const linked = sites.find((site) => site.practiceSiteId === practiceSite.id) || null;
      const suggested = linked ? null : unlinked.find((site) => norm(site.name) === norm(practiceSite.name)) || null;
      return { practiceSite, linked, suggested };
    }),
    unlinked,
  };
}

function renameSiteOnSpaces(spaces, siteId, name) {
  return spaces.map((space) => (space.siteId === siteId ? { ...space, site: name, siteName: name } : space));
}

// Links an existing registry site to a Practice Admin site, and renames it to match.
export function linkSite(state, registrySiteId, practiceSite) {
  if (!state.sites.some((site) => site.id === registrySiteId)) return state;
  return {
    ...state,
    sites: state.sites.map((site) =>
      site.id === registrySiteId ? { ...site, practiceSiteId: practiceSite.id, name: practiceSite.name } : site
    ),
    spaces: renameSiteOnSpaces(state.spaces, registrySiteId, practiceSite.name),
  };
}

// Creates a registry site for a Practice Admin site that has none, with a
// ground floor and the standard zones so rooms can be added straight away.
export function createLinkedSite(state, practiceSite) {
  if (state.sites.some((site) => site.practiceSiteId === practiceSite.id)) return state;
  const suffix = String(practiceSite.id).replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase() || "NEW";
  const siteId = `SITE-${suffix}`;
  if (state.sites.some((site) => site.id === siteId)) return state;
  return {
    ...state,
    sites: [...state.sites, { id: siteId, name: practiceSite.name, status: "active", practiceSiteId: practiceSite.id }],
    floors: [...state.floors, { id: `FLOOR-${suffix}-GROUND`, siteId, name: "Ground Floor", order: 0 }],
    zones: [
      ...state.zones,
      ...DEFAULT_ZONES.map((zone) => ({ id: `${zone.id}-${suffix}`, siteId, name: zone.name })),
    ],
  };
}

// Keeps linked sites' names in step with Practice Admin (a rename there shows
// up here). Returns the same object when nothing needs changing.
export function reconcileLinkedNames(state, practiceSites = []) {
  let next = state;
  for (const site of state.sites) {
    if (!site.practiceSiteId) continue;
    const practiceSite = practiceSites.find((p) => p.id === site.practiceSiteId);
    if (practiceSite && practiceSite.name && practiceSite.name !== site.name) {
      next = linkSite(next, site.id, practiceSite);
    }
  }
  return next;
}

// The spaces (rooms) that belong to a site, for a Location dropdown that's
// narrowed by the chosen Site. Sites are matched by name. If the name isn't a
// Practice Admin site, or hasn't been linked to a registry site yet, every
// space is offered rather than none - so nothing disappears before linking.
export function spaceNamesForSite(registry, practiceSites, siteName) {
  const all = (registry?.spaces || []).filter(isActive);
  const names = (list) => list.map((space) => space.name).filter(Boolean).sort((a, b) => a.localeCompare(b));
  const practiceSite = practiceSites.find((p) => norm(p.name) === norm(siteName));
  if (!practiceSite) return names(all);
  const linkedIds = (registry?.sites || []).filter((site) => site.practiceSiteId === practiceSite.id).map((site) => site.id);
  if (linkedIds.length === 0) return names(all);
  return names(all.filter((space) => linkedIds.includes(space.siteId)));
}
