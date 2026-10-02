import { useEffect, useState } from "react";
import { listActiveSites } from "@/lib/checklistsFirestore";
import { loadSpaceRegistry } from "@/modules/sense/services/sharedSpaceRegistry";

// The practice's real site and space names (Practice Admin > Sites / Spaces),
// for Site and Location dropdowns. Sites come from Firestore (practice_sites);
// the Space Registry is local and synchronous. `loaded` is false until the
// sites have come back, so a form can tell "none set up" from "still loading".
export default function useSiteSpaceNames(enabled = true) {
  const [siteNames, setSiteNames] = useState([]);
  const [spaceNames, setSpaceNames] = useState([]);
  const [loaded, setLoaded] = useState(false);

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
      .then((rows) => { if (active) setSiteNames(rows.map((s) => s.name).filter(Boolean)); })
      .catch(() => { if (active) setSiteNames([]); })
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, [enabled]);

  return { siteNames, spaceNames, loaded };
}
