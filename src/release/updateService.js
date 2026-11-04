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
// what went wrong, in words: the updater rejects with plain text as often as with an Error
export const failureText = (error) => String(error?.message || (typeof error === "string" ? error : "") || "").replace(/\s+/g, " ").trim().slice(0, 160);

export async function withRetries(task, { tries = 5, delayMs = 2000, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), retryIf = () => true } = {}) {
  let failure;
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    try {
      return await task(attempt);
    } catch (error) {
      failure = error;
      if (!retryIf(error)) throw error; // not the kind of failure that trying again can fix
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

// The update the banner holds was found at its last check, which may be hours ago. A newer release published since then replaces the installer that update points to, and the website
// answers a missing address with its home page: the app downloads that, and the signature check refuses it. So just before downloading, ask again for the current release and
// use that. If the question cannot be asked (no connection), the held update is used as it is. Returns null when there is nothing newer than the installed version.
export async function freshestUpdate(held) {
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    return await withRetries(() => check({ timeout: 20000 }), { tries: 3, delayMs: 1000 });
  } catch {
    return held;
  }
}

const signatureTrouble = (error) => /signature|verif/i.test(failureText(error));

export async function installDesktopUpdate(update, onProgress = () => {}, { refresh = freshestUpdate, relaunch = async () => { const { relaunch: go } = await import("@tauri-apps/plugin-process"); await go(); } } = {}) {
  if (!update) throw new Error("No update is ready to install.");
  const download = (target) => withRetries(async () => {
    let downloaded = 0;
    let total = 0;
    await target.downloadAndInstall((event) => {
      if (event.event === "Started") total = Number(event.data?.contentLength || 0);
      if (event.event === "Progress") downloaded += Number(event.data?.chunkLength || 0);
      onProgress({ phase: event.event, downloaded, total });
    });
  // a dropped connection part-way starts the download again, up to ten times, before giving up; a signature failure is not a dropped connection, so it is not repeated
  }, { tries: 10, delayMs: 1000, retryIf: (error) => !signatureTrouble(error) });
  const current = await refresh(update);
  if (!current) throw new Error("Primovex is already up to date.");
  try {
    await download(current);
  } catch (error) {
    // a release may have been published between asking and downloading: ask once more and try that one
    if (!signatureTrouble(error)) throw error;
    const newer = await refresh(current);
    if (!newer || newer === current || newer.version === current.version) throw error;
    await download(newer);
  }
  await relaunch();
}
