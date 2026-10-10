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
