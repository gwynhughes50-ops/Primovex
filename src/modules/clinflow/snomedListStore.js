import { useCallback, useEffect, useMemo, useState } from "react";
import { describeIndex, indexIsOld, indexProblem } from "./snomedIndex";
import { createSearch } from "./snomedSearch";
import { abbreviationInfo, parseAbbreviationCsv, setAbbreviationList } from "./clinicalAbbreviations";

// Keeps the UK SNOMED list and the dm+d medicines list on this computer (the browser's own database), so each is loaded once and nothing about
// them, or about any letter searched against them, leaves the computer. They are terminology only: no patient information is in either.
//
// What is kept is the file itself, exactly as it was chosen (a few megabytes), not the opened list (tens of megabytes of small pieces, which a
// browser can refuse to save). It is opened again each time ClinFlow starts. If it cannot be kept, the screen says so.

const DB = "clinflow-snomed";
const STORE = "list";
const KEYS = { snomed: "uk", dmd: "dmd" };
const FILES = { snomed: "snomed-file", dmd: "dmd-file" }; // the saved file; the old key ("uk", "dmd") held the opened list and is read as a fallback

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("This computer cannot keep the lists.")); return; }
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("The list could not be opened."));
  });
}
const run = async (mode, work) => {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = () => reject(tx.error || new Error("The list could not be saved."));
      tx.onabort = () => reject(tx.error || new Error("This computer would not keep the list (it may be short of space)."));
    });
  } finally { db.close(); }
};
export const loadSavedRecord = (kind = "snomed") => run("readonly", (store) => store.get(FILES[kind]));
// Asks the browser not to clear what is kept (it may refuse; the list is then kept only as long as the browser allows)
const keepSafe = () => { try { globalThis.navigator?.storage?.persist?.()?.catch?.(() => {}); } catch { /* not available */ } };
// A note of when each list was last loaded here, so a list that has gone missing can be told apart from one never loaded on this computer
const noteKey = (name) => `clinflow-loaded-${name}`;
const noteLoaded = (name) => { try { globalThis.localStorage?.setItem(noteKey(name), new Date().toISOString()); } catch { /* not available */ } };
const forgetLoaded = (name) => { try { globalThis.localStorage?.removeItem(noteKey(name)); } catch { /* not available */ } };
export const loadedBefore = (name) => { try { return globalThis.localStorage?.getItem(noteKey(name)) || ""; } catch { return ""; } };
export const saveRecord = async (record, kind = "snomed") => { keepSafe(); await run("readwrite", (store) => store.put(record, FILES[kind])); noteLoaded(kind); };
export const loadSavedList = (kind = "snomed") => run("readonly", (store) => store.get(KEYS[kind]));
export const clearList = async (kind = "snomed") => { forgetLoaded(kind); await run("readwrite", (store) => store.delete(FILES[kind])); await run("readwrite", (store) => store.delete(KEYS[kind])); };

// Opens a list from the bytes of its file (a .json.gz made by `npm run snomed:index` or `npm run dmd:index`, or the .json inside it)
export async function parseListBytes(bytes, gz, kind = "snomed") {
  let body;
  if (gz) {
    const Decompress = globalThis.DecompressionStream;
    if (!Decompress) throw new Error("This browser cannot open a compressed list. Use the desktop app, or a current Chrome or Edge.");
    body = await new Response(new Blob([bytes]).stream().pipeThrough(new Decompress("gzip"))).text();
  } else body = new TextDecoder().decode(bytes);
  let index;
  try { index = JSON.parse(body); } catch { throw new Error("That file is not a list made by ClinFlow's builder."); }
  const problem = indexProblem(index, kind);
  if (problem) throw new Error(problem);
  return index;
}

// Reads the file the person chose: its bytes, whether it is compressed, and the opened list
export async function readListFile(file, kind = "snomed") {
  if (!file) throw new Error("Choose the file made from the TRUD download.");
  const bytes = await file.arrayBuffer();
  const gz = /\.gz$/i.test(file.name) || /gzip/i.test(file.type);
  return { bytes, gz, name: file.name, index: await parseListBytes(bytes, gz, kind) };
}

// For the screen: a loaded list, ready to search, with the words to describe it and a way to load another. kind: "snomed" or "dmd".
// kept: true once this computer has saved it, false if it could not (it then lasts only until ClinFlow is closed), null if not known yet.
export function useSnomedList(kind = "snomed") {
  const [state, setState] = useState({ index: null, loading: true, error: "", kept: null });
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const record = await loadSavedRecord(kind);
        if (record?.bytes) { const index = await parseListBytes(record.bytes, record.gz, kind); if (live) setState({ index, loading: false, error: "", kept: true }); return; }
        const old = await loadSavedList(kind); // a list saved by an earlier version
        if (live) setState({ index: old && !indexProblem(old, kind) ? old : null, loading: false, error: "", kept: old ? true : null });
      } catch { if (live) setState({ index: null, loading: false, error: "", kept: null }); }
    })();
    return () => { live = false; };
  }, [kind]);
  const load = useCallback(async (file) => {
    setState((s) => ({ ...s, loading: true, error: "" }));
    let read;
    try { read = await readListFile(file, kind); } catch (failure) { setState((s) => ({ ...s, loading: false, error: failure?.message || "That file could not be read." })); return; }
    try {
      await saveRecord({ bytes: read.bytes, gz: read.gz, name: read.name, savedAt: new Date().toISOString() }, kind);
      setState({ index: read.index, loading: false, error: "", kept: true });
    } catch (failure) {
      setState({ index: read.index, loading: false, error: `The list is loaded for now, but this computer would not keep it, so it will need loading again next time. ${failure?.message || ""}`.trim(), kept: false });
    }
  }, [kind]);
  const remove = useCallback(async () => { await clearList(kind).catch(() => {}); setState({ index: null, loading: false, error: "", kept: null }); }, [kind]);
  const search = useMemo(() => (state.index ? createSearch(state.index) : null), [state.index]);
  return { kind, search, lostSince: !state.loading && !state.index ? loadedBefore(kind) : "", info: describeIndex(state.index), old: indexIsOld(state.index), loading: state.loading, error: state.error, kept: state.kept, load, remove };
}

// ---- the practice's own list of abbreviations (a plain file; see clinicalAbbreviations.js) ----
const ABBREVIATIONS_KEY = "abbreviations-file";
export const loadSavedAbbreviations = () => run("readonly", (store) => store.get(ABBREVIATIONS_KEY));
export const saveAbbreviations = async (record) => { keepSafe(); await run("readwrite", (store) => store.put(record, ABBREVIATIONS_KEY)); };
export const clearAbbreviations = () => run("readwrite", (store) => store.delete(ABBREVIATIONS_KEY));

export function useAbbreviations() {
  const [state, setState] = useState({ version: 0, loading: true, error: "", problems: [], info: abbreviationInfo() });
  const apply = (text, name) => {
    const parsed = parseAbbreviationCsv(text);
    if (!parsed.entries.length) throw new Error("There were no abbreviations in that file. It needs one per line: the abbreviation, then its meaning, separated by a comma or a tab.");
    setAbbreviationList(parsed.entries, name);
    return parsed;
  };
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const record = await loadSavedAbbreviations();
        if (record?.text) { const parsed = apply(record.text, record.name || "your list"); if (live) setState((s) => ({ ...s, version: s.version + 1, loading: false, problems: parsed.problems, info: abbreviationInfo() })); return; }
      } catch { /* the built-in list is used */ }
      if (live) setState((s) => ({ ...s, loading: false }));
    })();
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const load = useCallback(async (file) => {
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const text = await file.text();
      const parsed = apply(text, file.name);
      let kept = true;
      try { await saveAbbreviations({ text, name: file.name, savedAt: new Date().toISOString() }); } catch { kept = false; }
      setState((s) => ({ version: s.version + 1, loading: false, error: kept ? "" : "The list is in use for now, but this computer would not keep it, so it will need loading again next time.", problems: parsed.problems, info: abbreviationInfo() }));
    } catch (failure) { setState((s) => ({ ...s, loading: false, error: failure?.message || "That file could not be read." })); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const remove = useCallback(async () => { await clearAbbreviations().catch(() => {}); setAbbreviationList(null); setState((s) => ({ version: s.version + 1, loading: false, error: "", problems: [], info: abbreviationInfo() })); }, []);
  return { ...state, load, remove };
}
