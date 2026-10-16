// Knowing when a newer version of the web app has been published. Every build writes /version.json with its own build id; the
// running page knows the id it was built with. If the two differ, a newer version is ready and the person is offered a refresh.
// An iPhone Home Screen app keeps running its old page for as long as it stays in the background, so without this it can sit on an
// old version for days. Only the web app does this: the desktop and Android apps update by installing a new version.

export const BUILD_ID = typeof __PRIMOVEX_BUILD__ === "string" ? __PRIMOVEX_BUILD__ : "";

// true when the published build is not the one running (false when it can't be told: offline, no file, a dev server)
export async function newerVersionReady({ fetchFn = globalThis.fetch, current = BUILD_ID, base = "" } = {}) {
  if (!current || typeof fetchFn !== "function") return false;
  try {
    const response = await fetchFn(`${base}/version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!response?.ok) return false;
    const published = await response.json();
    return typeof published?.build === "string" && published.build !== "" && published.build !== current;
  } catch {
    return false;
  }
}

// the minimum gap between checks, so coming back to the app repeatedly doesn't ask every time
export const CHECK_EVERY_MS = 5 * 60 * 1000;
