// Opens a document held in the practice's Firebase Storage (a COSHH safety data sheet) in the right place for where
// Primovex is running: the phone hands the link to its PDF app, the desktop app saves a copy to a temporary folder
// and opens it in the system PDF viewer (window.open is blocked in the desktop app), and a browser opens a tab.
// Returns "" when it worked, or a sentence for the person when it didn't.
export async function openDocument({ url, path, fileName = "document.pdf" }) {
  if (!url) return "There is no document to open.";
  try {
    if (typeof window !== "undefined" && window.PrimovexDocs?.openUrl) {
      return window.PrimovexDocs.openUrl(url) ? "" : "The phone couldn't open that document. Check you have an app for PDFs.";
    }
    if (globalThis.__TAURI_INTERNALS__ && url) {
      // the desktop app fetches the file itself (the page can't: the storage bucket doesn't allow it) and opens it in the PDF viewer
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("open_storage_pdf", { url, fileName });
        return "";
      } catch (error) {
        const detail = String(error?.message || error || "");
        // an older install without that command falls through to the older way below; any other problem is said in words
        if (!/not found|unknown command|not allowed|did not match/i.test(detail)) return detail || "Could not open the document. Try again, or ask the Practice Manager.";
      }
    }
    if (globalThis.__TAURI_INTERNALS__ && path) {
      const [{ getBytes, ref }, { storage }, { invoke }] = await Promise.all([
        import("firebase/storage"), import("@/lib/firebase"), import("@tauri-apps/api/core"),
      ]);
      const bytes = Array.from(new Uint8Array(await getBytes(ref(storage, path))));
      await invoke("open_clinflow_pdf", { bytes, fileName });
      return "";
    }
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    link.remove();
    return "";
  } catch (error) {
    console.error("Could not open the document", error);
    return "Could not open the document. Try again, or ask the Practice Manager.";
  }
}
