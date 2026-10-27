// Puts text on the clipboard and says whether it worked. The browser's own clipboard can refuse (the window is not focused, the permission was
// declined), so the older route is tried before giving up, and the caller always learns the result so the screen never just sits there.
export async function copyText(value) {
  const text = String(value ?? "");
  try {
    if (globalThis.navigator?.clipboard?.writeText) { await globalThis.navigator.clipboard.writeText(text); return true; }
  } catch { /* try the older way */ }
  try {
    const doc = globalThis.document;
    if (!doc?.body) return false;
    const area = doc.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
    doc.body.appendChild(area);
    area.select();
    const done = Boolean(doc.execCommand?.("copy"));
    area.remove();
    return done;
  } catch { return false; }
}
