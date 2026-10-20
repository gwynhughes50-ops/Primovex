export function isTauriRuntime() {
  return Boolean(window?.__TAURI_INTERNALS__);
}

// the installed Windows app (the phone apps are Tauri too, but they update another way)
export function isDesktopApp() {
  return isTauriRuntime() && !/android|iphone|ipad/i.test(globalThis.navigator?.userAgent || "");
}

export function getReleaseChannel() {
  return import.meta.env.VITE_PRIMOVEX_RELEASE_CHANNEL || "beta";
}

export async function getInstalledVersion() {
  if (!isTauriRuntime()) return import.meta.env.VITE_APP_VERSION || "web";
  try {
    const { getVersion } = await import("@tauri-apps/api/app");
    return await getVersion();
  } catch {
    return import.meta.env.VITE_APP_VERSION || "unknown";
  }
}

export async function checkForDesktopUpdate() {
  if (!isDesktopApp()) {
    return { supported: false, reason: "Updates are available in the installed Primovex desktop application. The web app and iPhone update by themselves; the Android app updates from the link in the email." };
  }
  if (import.meta.env.VITE_PRIMOVEX_UPDATES_ENABLED === "false") {
    return { supported: false, reason: "Updates are switched off in this build." };
  }
  const { check } = await import("@tauri-apps/plugin-updater");
  const update = await check({ timeout: 30000 });
  if (!update) return { supported: true, available: false };
  return { supported: true, available: true, update, version: update.version, date: update.date, notes: update.body || "A new Primovex release is available." };
}

export async function installDesktopUpdate(update, onProgress = () => {}) {
  if (!update) throw new Error("No update is ready to install.");
  let downloaded = 0;
  let total = 0;
  await update.downloadAndInstall((event) => {
    if (event.event === "Started") total = Number(event.data?.contentLength || 0);
    if (event.event === "Progress") downloaded += Number(event.data?.chunkLength || 0);
    onProgress({ phase: event.event, downloaded, total });
  });
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}
