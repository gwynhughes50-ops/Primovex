import { useCallback, useEffect, useMemo, useState } from "react";
import { describeIndex, indexIsOld, indexProblem } from "./snomedIndex";
import { createSearch } from "./snomedSearch";

// Keeps the UK SNOMED list on this computer (the browser's own database), so it is loaded once and nothing about it, or about any letter searched
// against it, leaves the computer. The list is the terminology only: no patient information is in it.

const DB = "clinflow-snomed";
const STORE = "list";
const KEY = "uk";

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("This computer cannot keep the SNOMED list.")); return; }
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("The SNOMED list could not be opened."));
  });
}
const run = async (mode, work) => {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = () => reject(tx.error || new Error("The SNOMED list could not be saved."));
    });
  } finally { db.close(); }
};
export const loadSavedList = () => run("readonly", (store) => store.get(KEY));
export const saveList = (index) => run("readwrite", (store) => store.put(index, KEY));
export const clearList = () => run("readwrite", (store) => store.delete(KEY));

// Reads a file made by `npm run snomed:index` (a .json.gz, or the .json inside it)
export async function readListFile(file) {
  if (!file) throw new Error("Choose the file made from the TRUD download.");
  const gz = /\.gz$/i.test(file.name) || /gzip/i.test(file.type);
  let body;
  if (gz) {
    const Decompress = globalThis.DecompressionStream;
    if (!Decompress) throw new Error("This browser cannot open a compressed list. Use the desktop app, or a current Chrome or Edge.");
    body = await new Response(file.stream().pipeThrough(new Decompress("gzip"))).text();
  } else body = await file.text();
  let index;
  try { index = JSON.parse(body); } catch { throw new Error("That file is not a SNOMED list made by ClinFlow's builder."); }
  const problem = indexProblem(index);
  if (problem) throw new Error(problem);
  return index;
}

// For the screen: the loaded list, ready to search, with the words to describe it and a way to load another
export function useSnomedList() {
  const [state, setState] = useState({ index: null, loading: true, error: "" });
  useEffect(() => {
    let live = true;
    loadSavedList().then((index) => live && setState({ index: index && !indexProblem(index) ? index : null, loading: false, error: "" })).catch(() => live && setState({ index: null, loading: false, error: "" }));
    return () => { live = false; };
  }, []);
  const load = useCallback(async (file) => {
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const index = await readListFile(file);
      await saveList(index).catch(() => {});
      setState({ index, loading: false, error: "" });
    } catch (failure) { setState((s) => ({ ...s, loading: false, error: failure?.message || "That file could not be read." })); }
  }, []);
  const remove = useCallback(async () => { await clearList().catch(() => {}); setState({ index: null, loading: false, error: "" }); }, []);
  const search = useMemo(() => (state.index ? createSearch(state.index) : null), [state.index]);
  return { search, info: describeIndex(state.index), old: indexIsOld(state.index), loading: state.loading, error: state.error, load, remove };
}
