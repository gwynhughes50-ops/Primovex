// The main window's side of the desktop orb: tells the desktop shell whether the orb is
// switched on and what it should say. Only does anything in the Windows/desktop app.

export function isDesktopShell() {
  if (typeof window === "undefined" || !window.__TAURI_INTERNALS__) return false;
  return document.documentElement.dataset.primovexClient === "desktop";
}

async function call(command, args) {
  if (!isDesktopShell()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke(command, args);
  } catch {
    /* the orb is a nicety: never get in the way of the app */
  }
}

// enabled: show the orb when Primovex is minimised or hidden. closeToTray: the window's
// close button hides Primovex to the tray. signedIn: false removes both.
// boxPx: how big the person set the orb to be (the same size it is in the app).
export const configureDesktopOrb = ({ enabled, closeToTray, signedIn, boxPx }) => call("orb_configure", { enabled, closeToTray, signedIn, boxPx: boxPx ?? null });

// { changed, note, score } - counts and a sentence only.
export const pushDesktopOrbState = (payload) => call("orb_set_state", { payload });
