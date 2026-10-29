// The practice's three lists (SNOMED, dm+d, abbreviations) kept once, in a "lists" folder inside the shared letters folder, and loaded by every computer from there. A computer loads a list
// when the shared copy is different from the one it last loaded (or it has none), so putting a new file in the folder updates everyone within minutes. Loading goes through the same
// path as loading a list by hand (so it is checked, kept and audited the same way). Pure apart from `api`, the loaders and the stamps store, which are passed in.

export const LIST_FILES = { "snomed-uk-index.json.gz": "snomed", "dmd-index.json.gz": "dmd", "abbreviations.csv": "abbreviations" };
export const LIST_WORDS = { snomed: "SNOMED", dmd: "dm+d", abbreviations: "Abbreviations" };
const CHUNK = 2 * 1024 * 1024;

const stampOf = (entry) => `${entry.size}:${entry.modifiedMs}`;

// Which lists to load: the shared copy differs from the last one loaded here, or this computer has no copy of it (SNOMED and dm+d only: the abbreviations have a built-in list)
export function listsToLoad({ status = [], stamps = {}, have = {} }) {
  return status.filter((entry) => LIST_FILES[entry.name]).filter((entry) => stamps[entry.name] !== stampOf(entry) || have[LIST_FILES[entry.name]] === false).map((entry) => entry.name);
}

// Fetches a list file piece by piece
export async function fetchList(api, entry) {
  const bytes = new Uint8Array(entry.size);
  for (let offset = 0; offset < entry.size; offset += CHUNK) {
    const piece = await api.readListChunk(entry.name, offset, Math.min(CHUNK, entry.size - offset));
    if (!piece.length) throw new Error(`${entry.name} could not be read from the shared folder.`);
    bytes.set(piece, offset);
  }
  return bytes;
}

// Loads whatever needs loading. loaders: { snomed, dmd, abbreviations }, each `load(file)` (the audited loaders the screen uses). stamps: { get(name), set(name, stamp) }.
// Resolves [{ kind, name, ok, error }]. A file that is still syncing is simply tried again at the next look.
export async function syncSharedLists({ api, loaders, stamps, have = {}, onLoaded = () => {} }) {
  const status = await api.listsStatus();
  const known = Object.fromEntries(status.map((entry) => [entry.name, stamps.get(entry.name)]));
  const wanted = listsToLoad({ status, stamps: known, have });
  const results = [];
  for (const name of wanted) {
    const entry = status.find((item) => item.name === name);
    const kind = LIST_FILES[name];
    try {
      const bytes = await fetchList(api, entry);
      const file = new File([bytes], name, { type: /\.gz$/.test(name) ? "application/gzip" : "text/csv" });
      await loaders[kind](file);
      stamps.set(name, stampOf(entry));
      results.push({ kind, name, ok: true });
      onLoaded(kind);
    } catch (error) {
      results.push({ kind, name, ok: false, error: String(error?.message || error).slice(0, 160) });
    }
  }
  return { results, present: status.map((entry) => LIST_FILES[entry.name]).filter(Boolean) };
}

// What was last loaded from the shared folder, remembered on this computer
export const localStamps = (storage = globalThis.localStorage) => ({
  get: (name) => { try { return storage?.getItem(`primovex.clinflow.sharedList.${name}`) || ""; } catch { return ""; } },
  set: (name, stamp) => { try { storage?.setItem(`primovex.clinflow.sharedList.${name}`, stamp); } catch { /* it will simply be loaded again */ } },
});
