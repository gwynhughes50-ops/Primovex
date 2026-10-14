// Small facts about the device Primovex is running on. Pure reads of the browser, each safe to call anywhere.

const ua = () => (typeof navigator !== "undefined" ? navigator.userAgent || "" : "");

// iPhone or iPad (an iPad can present itself as a Mac, so touch points are checked too)
export function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(ua()) || (/Macintosh/i.test(ua()) && (navigator.maxTouchPoints || 0) > 1);
}

// Opened from the Home Screen icon (a "web app") rather than as a tab in the browser
export function isStandalone() {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(window.navigator.standalone) || Boolean(window.matchMedia?.("(display-mode: standalone)")?.matches);
  } catch {
    return false;
  }
}

// Inside the packaged Android/desktop app
export const isTauriApp = () => typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);

// The Home Screen web app on an iPhone: the browser's speech recognition is not available there
export const isIosHomeScreenApp = () => isIos() && isStandalone();
