import { useEffect, useMemo, useState } from "react";
import { listActiveSites } from "@/lib/checklistsFirestore";
import { isSafeSyntheticMode } from "@/config/platformMode";
import { siteForNew, siteNameOf, siteOptions } from "./siteOptions";

const KEY = "primovex.compliance.site";
const read = () => { try { return localStorage.getItem(KEY) || ""; } catch { return ""; } };

// Which site the Compliance screens are showing ("" = every site), remembered on this device, with the list to choose from.
export default function useComplianceSites(usedSiteIds = []) {
  const [practiceSites, setPracticeSites] = useState([]);
  const [siteId, setSiteIdState] = useState(read);
  useEffect(() => {
    if (isSafeSyntheticMode()) return undefined;
    let live = true;
    listActiveSites().then((rows) => { if (live) setPracticeSites(rows); }).catch(() => { if (live) setPracticeSites([]); });
    return () => { live = false; };
  }, []);
  const usedKey = usedSiteIds.join("|");
  const options = useMemo(() => siteOptions({ practiceSites, used: [...usedSiteIds, siteId].filter(Boolean) }), [practiceSites, usedKey, siteId]);
  const setSiteId = (next) => { setSiteIdState(next); try { localStorage.setItem(KEY, next); } catch { /* not remembered */ } };
  return { options, siteId, setSiteId, newSiteId: siteForNew({ selected: siteId, options }), nameOf: (id) => siteNameOf(options, id) };
}
