import { useCallback, useEffect, useMemo, useState } from "react";
import { listActiveSites } from "@/lib/checklistsFirestore";
import { loadSpaceRegistry } from "@/modules/sense/services/sharedSpaceRegistry";
import { roomsOfPractice, spaceNamesForSite } from "@/modules/sense/services/siteLink";

// The practice's real site and space names (Practice Admin > Sites / Spaces),
// for Site and Location dropdowns. Sites come from Firestore (practice_sites);
// the Space Registry is local and synchronous. `loaded` is false until the
// sites have come back, so a form can tell "none set up" from "still loading".
export default function useSiteSpaceNames(enabled = true) {
  const [practiceSites, setPracticeSites] = useState([]);
  const [siteNames, setSiteNames] = useState([]);
  const [spaceNames, setSpaceNames] = useState([]);
  const [loaded, setLoaded] = useState(false);

  // the rooms follow the space registry: one added or changed on another device arrives by sync after the screen opened
  const [registryVersion, setRegistryVersion] = useState(0);
  useEffect(() => {
    if (!enabled) return undefined;
    const bump = () => setRegistryVersion((v) => v + 1);
    window.addEventListener("primovex:space-registry-changed", bump);
    return () => window.removeEventListener("primovex:space-registry-changed", bump);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    const registry = loadSpaceRegistry();
    setSpaceNames(
      (registry?.spaces || [])
        .filter((s) => s.status !== "archived")
        .map((s) => s.name)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))
    );
    listActiveSites()
      .then((rows) => { if (active) { setPracticeSites(rows); setSiteNames(rows.map((s) => s.name).filter(Boolean)); } })
      .catch(() => { if (active) { setPracticeSites([]); setSiteNames([]); } })
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, [enabled, registryVersion]);

  // The rooms belonging to the chosen site (all of them if that site hasn't
  // been linked to its rooms yet, so a Location list is never emptied by that).
  const spaceNamesFor = useCallback(
    (siteName) => spaceNamesForSite(loadSpaceRegistry(), practiceSites, siteName),
    [practiceSites]
  );

  // every room with its site, for choosing a place to count
  const rooms = useMemo(() => roomsOfPractice(loadSpaceRegistry(), practiceSites), [practiceSites, spaceNames, registryVersion]);

  return { siteNames, spaceNames, spaceNamesFor, rooms, loaded };
}
