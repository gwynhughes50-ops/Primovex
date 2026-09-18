// Shared by MobileSessionShell and DesktopSessionShell — both use a locally
// stored 6-digit PIN to gate re-entry after idle, not a remote credential
// check, so this only needs to be a stable one-way digest, not a KDF.
export async function digest(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
