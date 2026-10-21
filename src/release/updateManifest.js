// The file the installed desktop app reads to learn whether a newer release exists (latest.json, served from
// https://medtrak-b1cad.web.app/updates/). Pure, so the release script and the tests build it the same way. The installed app
// downloads the installer named here and refuses it unless its signature matches the public key built into the app.

export const UPDATE_BASE_URL = "https://medtrak-b1cad.web.app/updates";
export const UPDATE_PLATFORM = "windows-x86_64";

const SEMVER = /^\d+\.\d+\.\d+([+-][0-9A-Za-z.-]+)?$/;

export const installerName = (version) => `Primovex_${version}_x64-setup.exe`;

export function buildLatestJson({ version, notes = "", signature, now = new Date(), baseUrl = UPDATE_BASE_URL } = {}) {
  if (!SEMVER.test(String(version || ""))) throw new Error(`The version is not valid: ${version}`);
  const sig = String(signature || "").trim();
  if (!sig) throw new Error("The installer has no signature. Build it with the update signing key (npm run desktop:build does this).");
  if (!/^https:\/\//.test(baseUrl)) throw new Error("The update address must be https.");
  return {
    version,
    notes: String(notes || "").trim() || `Primovex ${version}`,
    pub_date: now.toISOString(),
    platforms: { [UPDATE_PLATFORM]: { signature: sig, url: `${baseUrl.replace(/\/$/, "")}/${installerName(version)}` } },
  };
}

// 1 when a is newer than b, -1 when older, 0 when the same (the three numbers only)
export function compareVersions(a, b) {
  const parts = (v) => String(v).split(/[-+]/)[0].split(".").map((n) => Number(n) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i += 1) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0) ? 1 : -1;
  return 0;
}
