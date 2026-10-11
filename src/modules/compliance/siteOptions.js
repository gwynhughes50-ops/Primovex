// The sites a compliance screen can be filtered or created for: the practice's own sites (Practice Admin > Sites), plus
// any site id that existing assets or checks already carry (the first assets were all created for "main_branch", which
// may not be one of the practice's sites). Pure, so it can be tested.

const LEGACY_NAMES = { main_branch: "Main Branch" };

export function siteOptions({ practiceSites = [], used = [] } = {}) {
  const options = new Map();
  for (const site of practiceSites) {
    const id = String(site?.id || "").trim();
    if (id && site.active !== false) options.set(id, { id, name: String(site.name || id).trim() || id });
  }
  for (const raw of used) {
    const id = String(raw || "").trim();
    if (id && !options.has(id)) options.set(id, { id, name: LEGACY_NAMES[id] || id });
  }
  return [...options.values()].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
}

// the site a new asset is created for: the one being looked at, else the only/first site, else the original
export function siteForNew({ selected = "", options = [] } = {}) {
  if (selected) return selected;
  return options[0]?.id || "main_branch";
}

export const siteNameOf = (options, id) => options.find((o) => o.id === id)?.name || LEGACY_NAMES[id] || id || "";
