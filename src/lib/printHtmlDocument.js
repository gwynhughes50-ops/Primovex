// Printing a generated HTML document (a checklist export, a compliance
// report, a sheet of QR labels) used to open it in a new window via
// window.open() and write the HTML into that window. That's unreliable in
// the packaged desktop app: Tauri's WebView2 host doesn't reliably turn
// window.open() into a real window - it's a known, long-standing upstream
// limitation (window.open() calls are handled internally by the webview
// engine rather than becoming a Tauri-managed window, and WebView2's
// behaviour here is inconsistent) - so every print button in the app showed
// "Popup blocked" the moment it was actually clicked in the real desktop
// build, even though the exact same code worked fine in a plain browser tab.
//
// This avoids window.open() entirely: the document is written into a hidden
// iframe in the current page instead, then that iframe's own window.print()
// is called directly. Printing an iframe's content works the same way in
// every engine this app runs on - the desktop webview, the Android webview,
// and a plain browser - and never needs a new window or any popup
// permission. Callers don't need their own print-trigger script or button;
// this calls print() itself once the document has loaded.
export function printHtmlDocument(html) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(iframe);

  const remove = () => {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  };

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    console.error("Could not prepare the print document - no iframe window available.");
    remove();
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  // A short delay so any embedded image (a QR code, a logo) has a chance to
  // finish loading before the print dialog captures the page.
  window.setTimeout(() => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch (error) {
      console.error("Could not open the print dialog.", error);
    }
    // The iframe is never referenced again after this - remove it once the
    // print dialog has definitely finished reading the page, not sooner.
    window.setTimeout(remove, 5000);
  }, 300);
}
