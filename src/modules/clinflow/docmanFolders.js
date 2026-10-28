import { docmanFileName } from "./clinflowNfwf";
import { downloadBlob } from "./clinflowZipService";

// The two Docman upload folders (NFW, and Action needed). On the desktop app the person chooses each with the computer's own folder picker; the choice is kept by the app
// itself, and the app will only ever write a PDF into those two folders. Anywhere else (a browser, a phone) the PDF is downloaded with NFW or ACTION at the start of its name.
export const desktopFoldersAvailable = () => Boolean(globalThis.__TAURI_INTERNALS__);

const NONE = { nfw: "", action: "", incoming: "" };

export async function loadFolders() {
  if (!desktopFoldersAvailable()) return { ...NONE };
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const saved = await invoke("docman_folders");
    return { nfw: String(saved?.nfw || ""), action: String(saved?.action || ""), incoming: String(saved?.incoming || "") };
  } catch {
    return { ...NONE };
  }
}

// Opens the computer's own folder picker. Resolves the chosen path, or "" if the person cancelled.
export async function chooseFolder(kind) {
  const { invoke } = await import("@tauri-apps/api/core");
  const titles = { nfw: "Choose the NFW (no action needed) folder", action: "Choose the Action needed folder", incoming: "Choose the Incoming scans folder (where the scanners save letters)" };
  const path = await invoke("choose_docman_folder", { kind, title: titles[kind] || titles.action });
  return path || "";
}

// Puts the PDF where it belongs: saved into the chosen folder on the desktop app, otherwise downloaded with the folder in its name.
// Resolves { saved, path, kind }. Throws a readable message if the folder cannot be written to.
export async function deliverDocmanPdf({ blob, fileName, kind, folders = NONE }) {
  if (desktopFoldersAvailable() && folders[kind]) {
    const { invoke } = await import("@tauri-apps/api/core");
    const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
    const path = await invoke("save_docman_pdf", { kind, fileName: docmanFileName(kind, fileName), bytes });
    return { saved: true, path, kind };
  }
  downloadBlob(blob, docmanFileName(kind, fileName));
  return { saved: false, path: "", kind };
}

// The Incoming scans folder, as the background reader sees it. The page can only name a file in it, never a path (see list_incoming_scans in src-tauri/src/lib.rs).
export const incomingScans = {
  list: async () => { const { invoke } = await import("@tauri-apps/api/core"); return invoke("list_incoming_scans"); },
  read: async (name) => { const { invoke } = await import("@tauri-apps/api/core"); return new Uint8Array(await invoke("read_incoming_scan", { name })); },
  finish: async (name, outcome) => { const { invoke } = await import("@tauri-apps/api/core"); return invoke("finish_incoming_scan", { name, outcome }); },
};
