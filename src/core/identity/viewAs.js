// "View as": a System Admin can look at Primovex the way another kind of account sees it (the Caretaker, a Nurse...)
// without signing in as them. It only changes what the screens show (menus, tiles, what is allowed in the app);
// the person is still signed in as themselves, so anything they do is recorded as them and the database still
// applies their own permissions. Kept in the browser tab's session storage, so it ends when the tab closes. A
// phone preview (below) is separate and leaves the main window alone.

export const VIEW_AS_KEY = "primovex.viewAsRole";
export const ADMIN_ROLE = "System Admin";

// The phone preview is a frame inside the desktop app. It carries its role in the frame's own name, so previewing
// the phone as the Caretaker never changes what the administrator sees in the main window.
export const PREVIEW_FRAME_PREFIX = "primovex-phone-preview:";
export const previewFrameName = (role) => `${PREVIEW_FRAME_PREFIX}${role}`;
export function previewFrameRole() {
  try {
    const name = String(globalThis.window?.name || "");
    return name.startsWith(PREVIEW_FRAME_PREFIX) ? name.slice(PREVIEW_FRAME_PREFIX.length) || null : null;
  } catch { return null; }
}

export function readViewAs() {
  const frameRole = previewFrameRole();
  if (frameRole) return frameRole;
  try { return globalThis.sessionStorage?.getItem(VIEW_AS_KEY) || null; } catch { return null; }
}

export function writeViewAs(role) {
  if (previewFrameRole()) return; // a preview frame never changes the choice
  try {
    if (role) globalThis.sessionStorage?.setItem(VIEW_AS_KEY, role);
    else globalThis.sessionStorage?.removeItem(VIEW_AS_KEY);
  } catch { /* session storage unavailable: the choice just doesn't persist */ }
}

// The role being viewed, or null. Only a System Admin may, and viewing your own role is not a view.
export function resolveViewAs({ realRole, requested }) {
  if (realRole !== ADMIN_ROLE) return null;
  const wanted = String(requested || "").trim();
  return wanted && wanted !== realRole ? wanted : null;
}

// The roles to choose from: every built-in role but the admin's own, then the practice's own roles that are in use.
export function viewAsChoices({ builtIn = [], custom = [] } = {}) {
  const names = new Set(builtIn.filter((name) => name && name !== ADMIN_ROLE));
  const own = [...new Set(custom.filter((r) => r && r.active !== false).map((r) => r.name || r.id).filter(Boolean))].filter((name) => !names.has(name) && name !== ADMIN_ROLE);
  return { builtIn: [...names], custom: own.sort((a, b) => a.localeCompare(b)) };
}
