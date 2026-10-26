import { useCallback, useEffect, useMemo, useState } from "react";
import { describeIndex, indexIsOld, indexProblem } from "./snomedIndex";
import { createSearch } from "./snomedSearch";

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
export const saveRecord = (record, kind = "snomed") => run("readwrite", (store) => store.put(record, FILES[kind]));
export const loadSavedList = (kind = "snomed") => run("readonly", (store) => store.get(KEYS[kind]));
export const clearList = async (kind = "snomed") => { await run("readwrite", (store) => store.delete(FILES[kind])); await run("readwrite", (store) => store.delete(KEYS[kind])); };

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
  return { kind, search, info: describeIndex(state.index), old: indexIsOld(state.index), loading: state.loading, error: state.error, kept: state.kept, load, remove };
}
