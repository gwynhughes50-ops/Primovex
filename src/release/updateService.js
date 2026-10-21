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

// Some connections drop the secure handshake now and then (one practice PC fails two attempts in three), so a check or a download is
// tried again a few times, a little apart, before it is reported as failed. `wait` is replaceable so tests need not sleep.
export async function withRetries(task, { tries = 5, delayMs = 2000, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  let failure;
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    try {
      return await task(attempt);
    } catch (error) {
      failure = error;
      if (attempt < tries) await wait(delayMs * attempt);
    }
  }
  throw failure;
}

export async function checkForDesktopUpdate() {
  if (!isDesktopApp()) {
    return { supported: false, reason: "Updates are available in the installed Primovex desktop application. The web app and iPhone update by themselves; the Android app updates from the link in the email." };
  }
  if (import.meta.env.VITE_PRIMOVEX_UPDATES_ENABLED === "false") {
    return { supported: false, reason: "Updates are switched off in this build." };
  }
  const { check } = await import("@tauri-apps/plugin-updater");
  const update = await withRetries(() => check({ timeout: 20000 }));
  if (!update) return { supported: true, available: false };
  return { supported: true, available: true, update, version: update.version, date: update.date, notes: update.body || "A new Primovex release is available." };
}

export async function installDesktopUpdate(update, onProgress = () => {}) {
  if (!update) throw new Error("No update is ready to install.");
  // a dropped connection part-way starts the download again, a few times, before giving up
  await withRetries(async () => {
    let downloaded = 0;
    let total = 0;
    await update.downloadAndInstall((event) => {
      if (event.event === "Started") total = Number(event.data?.contentLength || 0);
      if (event.event === "Progress") downloaded += Number(event.data?.chunkLength || 0);
      onProgress({ phase: event.event, downloaded, total });
    });
  }, { tries: 4, delayMs: 3000 });
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}
