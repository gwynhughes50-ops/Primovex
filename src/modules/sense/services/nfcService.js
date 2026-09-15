const ENTITY_LABELS = { space: 'Space', asset: 'Asset', emergencyBox: 'Emergency box', fridge: 'Fridge' };
export const PRIMOVEX_APP_ORIGIN = String(import.meta.env.VITE_PUBLIC_APP_URL || 'https://app.primovex.co.uk').replace(/\/+$/, '');

export function buildNfcUrl(entityType, entityId) {
  return `${PRIMOVEX_APP_ORIGIN}/sense/open/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`;
}

export function isInstalledAndroidApp() {
  return typeof document !== 'undefined' && document.documentElement?.dataset?.primovexClient === 'android';
}

export function nfcSupported() {
  // Android WebView may expose NDEFReader but reject permission requests.
  // Until the native bridge is installed, use the operating-system tap-to-open flow.
  return typeof window !== 'undefined' && !isInstalledAndroidApp() && 'NDEFReader' in window;
}

// True once MainActivity.kt's NfcBridge has been installed into the WebView
// (see onWebViewCreate). This is a native reader-mode bridge, distinct from
// Web NFC, and is what actually powers scanning/writing on the installed
// Android app (Web NFC is deliberately disabled there, see nfcSupported()).
export function nativeNfcAvailable() {
  return typeof window !== 'undefined' && !!window.PrimovexNfc;
}

export function nfcSetupStatus() {
  if (nativeNfcAvailable()) return { mode: 'android-native', ready: true, label: 'Native NFC (Android)' };
  if (isInstalledAndroidApp()) return { mode: 'android-system', ready: true, label: 'Android tap-to-open' };
  if (nfcSupported()) return { mode: 'web-nfc', ready: true, label: 'Web NFC' };
  return { mode: 'deep-link', ready: true, label: 'Tag deep link' };
}

// Arms MainActivity's NFC reader-mode callback to write `url` to the next tag
// presented, resolving/rejecting from the primovex-native-nfc CustomEvent it
// dispatches back (see dispatchNfcEvent in MainActivity.kt).
export function writeNfcUrlNative(url, { timeoutMs = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!nativeNfcAvailable()) {
      reject(new Error('Native NFC writing is not available on this device.'));
      return;
    }
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      window.removeEventListener('primovex-native-nfc', onEvent);
      window.PrimovexNfc.cancelWrite();
      reject(new Error('No tag was presented within 30 seconds. Try again.'));
    }, timeoutMs);

    function onEvent(event) {
      const { type, value } = event.detail || {};
      if (type !== 'write-success' && type !== 'write-error') return;
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener('primovex-native-nfc', onEvent);
      if (type === 'write-success') resolve(true);
      else reject(new Error(value || 'The tag could not be written.'));
    }

    window.addEventListener('primovex-native-nfc', onEvent);
    window.PrimovexNfc.beginWrite(url);
  });
}

export async function writeNfcUrl(url) {
  if (nativeNfcAvailable()) return writeNfcUrlNative(url);
  if (!nfcSupported()) throw new Error('Web NFC is not available on this device or browser.');
  const ndef = new window.NDEFReader();
  await ndef.write({ records: [{ recordType: 'url', data: url }] });
  return true;
}

export async function scanNfcOnce({ signal } = {}) {
  if (!nfcSupported()) throw new Error('Web NFC is not available on this device or browser.');
  const ndef = new window.NDEFReader();
  await ndef.scan({ signal });
  return new Promise((resolve, reject) => {
    const onReading = (event) => {
      cleanup();
      const urlRecord = [...event.message.records].find((record) => record.recordType === 'url');
      let value = '';
      if (urlRecord) value = new TextDecoder(urlRecord.encoding || 'utf-8').decode(urlRecord.data);
      resolve({ serialNumber: event.serialNumber || '', url: value });
    };
    const onError = () => { cleanup(); reject(new Error('The NFC tag could not be read.')); };
    const cleanup = () => {
      ndef.removeEventListener('reading', onReading);
      ndef.removeEventListener('readingerror', onError);
    };
    ndef.addEventListener('reading', onReading);
    ndef.addEventListener('readingerror', onError);
  });
}

export function entityLabel(type) {
  return ENTITY_LABELS[type] || 'Item';
}

// Recognises a scanned/native-delivered URL as a Primovex Sense tag and pulls
// the entity type/id out of it. Shared by the manual Web NFC scan sheet and
// the native Android foreground-scan bridge, so both parse tags identically.
export function parsePrimovexSenseUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    const match = url.pathname.match(/^\/sense\/open\/(space|asset)\/([^/]+)\/?$/i);
    if (!match) return null;
    return {
      entityType: match[1].toLowerCase(),
      entityId: decodeURIComponent(match[2]),
      href: `${url.pathname}${url.search}${url.hash}`,
    };
  } catch {
    return null;
  }
}
