const ENTITY_LABELS = { space: 'Space', asset: 'Asset', emergencyBox: 'Emergency box', fridge: 'Fridge' };

export function buildNfcUrl(entityType, entityId) {
  return `${window.location.origin}/sense/open/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`;
}

export function isInstalledAndroidApp() {
  return typeof document !== 'undefined' && document.documentElement?.dataset?.primovexClient === 'android';
}

export function nfcSupported() {
  // Android WebView may expose NDEFReader but reject permission requests.
  // Until the native bridge is installed, use the operating-system tap-to-open flow.
  return typeof window !== 'undefined' && !isInstalledAndroidApp() && 'NDEFReader' in window;
}

export function nfcSetupStatus() {
  if (isInstalledAndroidApp()) return { mode: 'android-system', ready: true, label: 'Android tap-to-open' };
  if (nfcSupported()) return { mode: 'web-nfc', ready: true, label: 'Web NFC' };
  return { mode: 'deep-link', ready: true, label: 'Tag deep link' };
}

export async function writeNfcUrl(url) {
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
