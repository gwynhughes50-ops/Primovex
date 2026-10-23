// Which groups in the left-hand menu are open. Pure (no screens, no storage calls of its own) so it can be tested.
//
// Each group can be folded. What a person has opened or folded is remembered on this device. A group not touched yet is open if it is one of
// the DEFAULT_OPEN ones, and the group holding the page you are on is always opened when you arrive at it, so you never lose your place.

export const DEFAULT_OPEN = ["mywork", "core"];
export const SIDEBAR_STORAGE_KEY = "medtrak.sidebar.groups";

// stored: { [groupKey]: true | false } for the groups the person has opened or folded themselves
export const isOpen = (stored, key, defaults = DEFAULT_OPEN) => (typeof stored?.[key] === "boolean" ? stored[key] : defaults.includes(key));

export const toggled = (stored, key, defaults = DEFAULT_OPEN) => ({ ...(stored || {}), [key]: !isOpen(stored, key, defaults) });

// opens a group (for arriving at a page inside it), only changing anything when it is folded
export const opened = (stored, key, defaults = DEFAULT_OPEN) => (isOpen(stored, key, defaults) ? stored || {} : { ...(stored || {}), [key]: true });

// what was saved on this device, tolerating anything (a different version, damaged, empty)
export function parseStored(raw) {
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([key, open]) => typeof key === "string" && key.length < 40 && typeof open === "boolean"));
  } catch { return {}; }
}

// the group a page belongs to: the item whose path is the page, or the longest path the page is inside
export function groupOfPath(pathname, groups = []) {
  const path = String(pathname || "").replace(/\/+$/, "") || "/";
  let best = null;
  for (const group of groups) {
    for (const item of group.items || []) {
      const base = String(item.path || "").replace(/\/+$/, "");
      if (!base || base === "/") continue;
      if ((path === base || path.startsWith(`${base}/`)) && (!best || base.length > best.length)) best = { key: group.key, length: base.length };
    }
  }
  return best?.key || "";
}

export const loadStored = () => { try { return parseStored(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)); } catch { return {}; } };
export const saveStored = (stored) => { try { window.localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify(stored)); } catch { /* remembering is a convenience */ } };
