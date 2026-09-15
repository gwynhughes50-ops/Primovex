// Mirrors nfcService.js's native-bridge pattern (see MainActivity.kt's
// BleBridge, registered as window.PrimovexBle). BLE tags (e.g. the DX-CP35
// asset tags) can broadcast several frame types at once; a decoded
// Eddystone-URL that resolves to a recognised Primovex Sense link arrives as
// type "scanned" with the full URL, so callers can feed it straight into the
// same handling as an NFC/QR scan. "ibeacon" and "eddystone-uid" are raw
// diagnostic frames, useful while a tag hasn't been configured to broadcast a
// Primovex URL yet.
import { parsePrimovexSenseUrl } from './nfcService';

export function nativeBleAvailable() {
  return typeof window !== 'undefined' && !!window.PrimovexBle;
}

export function bleHasPermission() {
  if (!nativeBleAvailable()) return false;
  return !!window.PrimovexBle.hasPermission();
}

export function requestBlePermission() {
  if (!nativeBleAvailable()) return;
  window.PrimovexBle.requestPermission();
}

export function startBleScan() {
  if (!nativeBleAvailable()) throw new Error('BLE scanning is only available in the installed Primovex Android app.');
  window.PrimovexBle.startScan();
}

export function stopBleScan() {
  if (!nativeBleAvailable()) return;
  window.PrimovexBle.stopScan();
}

// Subscribes to the raw primovex-native-ble CustomEvent stream and returns an
// unsubscribe function. handler receives { type, value } exactly as dispatched
// by BleBridge: type is one of scanning | scanned | ibeacon | eddystone-uid |
// permission-granted | permission-denied | error.
export function onBleEvent(handler) {
  function onEvent(event) {
    if (!event.detail) return;
    handler(event.detail);
  }
  window.addEventListener('primovex-native-ble', onEvent);
  return () => window.removeEventListener('primovex-native-ble', onEvent);
}

// Convenience wrapper for the common case: a "scanned" event's value is
// already a full URL, so recognise it as a Primovex Sense tag the same way
// MobileNfcScanner does with a Web NFC read.
export function parseBleScannedUrl(value) {
  return parsePrimovexSenseUrl(value);
}

// An "ibeacon" event's value is the plain string BleBridge.dispatchBleEvent
// sends: "uuid=... major=... minor=... rssi=... addr=...". Parsed here
// rather than passed as structured data because CustomEvent detail already
// mirrors the native dispatch's {type, value} shape used for every BLE event.
export function parseIBeaconValue(value) {
  const text = String(value || '');
  const uuid = text.match(/uuid=([0-9a-f-]+)/i)?.[1] || '';
  const major = Number(text.match(/major=(\d+)/)?.[1]);
  const minor = Number(text.match(/minor=(\d+)/)?.[1]);
  const rssi = Number(text.match(/rssi=(-?\d+)/)?.[1]);
  const addr = text.match(/addr=([0-9A-F:]+)/i)?.[1] || '';
  if (!uuid || !Number.isFinite(major) || !Number.isFinite(minor)) return null;
  return { uuid: uuid.toLowerCase(), major, minor, rssi: Number.isFinite(rssi) ? rssi : null, addr };
}
