import { useCallback, useEffect, useMemo, useState } from "react";
import { describeIndex, indexIsOld, indexProblem } from "./snomedIndex";
import { createSearch } from "./snomedSearch";

// Keeps the UK SNOMED list and the dm+d medicines list on this computer (the browser's own database), so each is loaded once and nothing about
// them, or about any letter searched against them, leaves the computer. They are terminology only: no patient information is in either.

const DB = "clinflow-snomed";
const STORE = "list";
const KEYS = { snomed: "uk", dmd: "dmd" };

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
    });
  } finally { db.close(); }
};
export const loadSavedList = (kind = "snomed") => run("readonly", (store) => store.get(KEYS[kind]));
export const saveList = (index, kind = "snomed") => run("readwrite", (store) => store.put(index, KEYS[kind]));
export const clearList = (kind = "snomed") => run("readwrite", (store) => store.delete(KEYS[kind]));

// Reads a file made by `npm run snomed:index` or `npm run dmd:index` (a .json.gz, or the .json inside it)
export async function readListFile(file, kind = "snomed") {
  if (!file) throw new Error("Choose the file made from the TRUD download.");
  const gz = /\.gz$/i.test(file.name) || /gzip/i.test(file.type);
  let body;
  if (gz) {
    const Decompress = globalThis.DecompressionStream;
    if (!Decompress) throw new Error("This browser cannot open a compressed list. Use the desktop app, or a current Chrome or Edge.");
    body = await new Response(file.stream().pipeThrough(new Decompress("gzip"))).text();
  } else body = await file.text();
  let index;
  try { index = JSON.parse(body); } catch { throw new Error("That file is not a list made by ClinFlow's builder."); }
  const problem = indexProblem(index, kind);
  if (problem) throw new Error(problem);
  return index;
}

// For the screen: a loaded list, ready to search, with the words to describe it and a way to load another. kind: "snomed" or "dmd".
export function useSnomedList(kind = "snomed") {
  const [state, setState] = useState({ index: null, loading: true, error: "" });
  useEffect(() => {
    let live = true;
    loadSavedList(kind).then((index) => live && setState({ index: index && !indexProblem(index, kind) ? index : null, loading: false, error: "" })).catch(() => live && setState({ index: null, loading: false, error: "" }));
    return () => { live = false; };
  }, [kind]);
  const load = useCallback(async (file) => {
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const index = await readListFile(file, kind);
      await saveList(index, kind).catch(() => {});
      setState({ index, loading: false, error: "" });
    } catch (failure) { setState((s) => ({ ...s, loading: false, error: failure?.message || "That file could not be read." })); }
  }, [kind]);
  const remove = useCallback(async () => { await clearList(kind).catch(() => {}); setState({ index: null, loading: false, error: "" }); }, [kind]);
  const search = useMemo(() => (state.index ? createSearch(state.index) : null), [state.index]);
  return { kind, search, info: describeIndex(state.index), old: indexIsOld(state.index), loading: state.loading, error: state.error, load, remove };
}
