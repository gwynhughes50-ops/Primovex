// Shared by MobileSessionShell and DesktopSessionShell — both use a locally
// stored 6-digit PIN to gate re-entry after idle. This is a local device
// gate, not a remote credential, but a 6-digit PIN is only 1,000,000
// combinations, and a plain unsalted digest of one can be brute-forced
// offline in well under a second if someone reads it straight out of
// localStorage (devtools, or another local-access vulnerability) — the
// per-attempt throttling a lock-screen UI can enforce doesn't apply once
// they're hashing outside the app. PBKDF2 with a random per-PIN salt and a
// real iteration count closes that: a stolen digest can't be matched against
// a precomputed table (salt), and a from-scratch brute force takes real time
// (iterations) instead of a fraction of a second.
const PBKDF2_ITERATIONS = 200_000;
const LEGACY_DIGEST_PATTERN = /^[0-9a-f]{64}$/i;

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

// Pre-hardening format: plain unsalted SHA-256, kept only so a PIN set
// before this change can verify one more time and get transparently
// upgraded — see verifyPinDigest.
async function legacyDigest(value) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toHex(hash);
}

async function derivePbkdf2(value, saltBytes, iterations) {
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(value), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: saltBytes, iterations, hash: "SHA-256" }, keyMaterial, 256);
  return toHex(bits);
}

// Stored as "pbkdf2:<iterations>:<salt-hex>:<hash-hex>" so the iteration
// count and salt travel with the digest itself — a future change to
// PBKDF2_ITERATIONS doesn't invalidate PINs created under the old count.
export async function createPinDigest(value) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePbkdf2(value, salt, PBKDF2_ITERATIONS);
  return `pbkdf2:${PBKDF2_ITERATIONS}:${toHex(salt)}:${hash}`;
}

// Returns { valid, upgraded }. `upgraded` is set only when a legacy
// (pre-salt) digest just verified successfully — the caller should re-store
// it so the PIN migrates to the new format silently, without asking the
// person to set a new PIN.
export async function verifyPinDigest(value, stored) {
  if (!stored) return { valid: false };

  if (stored.startsWith("pbkdf2:")) {
    const [, iterationsRaw, saltHex, hashHex] = stored.split(":");
    const iterations = Number(iterationsRaw);
    if (!iterations || !saltHex || !hashHex) return { valid: false };
    const hash = await derivePbkdf2(value, fromHex(saltHex), iterations);
    return { valid: hash === hashHex };
  }

  if (LEGACY_DIGEST_PATTERN.test(stored)) {
    const legacy = await legacyDigest(value);
    if (legacy !== stored) return { valid: false };
    return { valid: true, upgraded: await createPinDigest(value) };
  }

  return { valid: false };
}
