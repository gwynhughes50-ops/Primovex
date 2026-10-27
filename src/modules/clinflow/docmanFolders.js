import { docmanFileName } from "./clinflowNfwf";
import { downloadBlob } from "./clinflowZipService";

// The two Docman upload folders (NFW, and Action needed). On the desktop app the person chooses each with the computer's own folder picker; the choice is kept by the app
// itself, and the app will only ever write a PDF into those two folders. Anywhere else (a browser, a phone) the PDF is downloaded with NFW or ACTION at the start of its name.
export const desktopFoldersAvailable = () => Boolean(globalThis.__TAURI_INTERNALS__);

const NONE = { nfw: "", action: "" };

export async function loadFolders() {
  if (!desktopFoldersAvailable()) return { ...NONE };
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const saved = await invoke("docman_folders");
    return { nfw: String(saved?.nfw || ""), action: String(saved?.action || "") };
  } catch {
    return { ...NONE };
  }
}

// Opens the computer's own folder picker. Resolves the chosen path, or "" if the person cancelled.
export async function chooseFolder(kind) {
  const { invoke } = await import("@tauri-apps/api/core");
  const path = await invoke("choose_docman_folder", { kind, title: kind === "nfw" ? "Choose the NFW (no action needed) folder" : "Choose the Action needed folder" });
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
