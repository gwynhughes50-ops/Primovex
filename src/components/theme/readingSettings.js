export const DEFAULT_READING = Object.freeze({ font: 'system', size: 'standard', spacing: 'standard', motion: 'system' });
export const READING_OPTIONS = { font: ['system', 'arial', 'verdana'], size: ['standard', 'large', 'extra-large'], spacing: ['standard', 'comfortable'], motion: ['system', 'reduced'] };
export function normaliseReading(value) {
  return Object.fromEntries(Object.entries(READING_OPTIONS).map(([key, choices]) => [key, choices.includes(value?.[key]) ? value[key] : DEFAULT_READING[key]]));
}
export function readingKey(uid, client) { return `primovex-reading-v1:${encodeURIComponent(uid || 'anonymous')}:${client === 'desktop' ? 'desktop' : 'mobile'}`; }
export function loadReading(storage, key) {
  try { return normaliseReading(JSON.parse(storage.getItem(key))); } catch { return { ...DEFAULT_READING }; }
}
