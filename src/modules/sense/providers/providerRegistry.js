import { mockBleProvider } from './mockBleProvider';

const providers = new Map([[mockBleProvider.id, mockBleProvider]]);

export function registerSenseProvider(provider) {
  providers.set(provider.id, provider);
}

export function getSenseProvider(id = 'mock-ble') {
  return providers.get(id) || mockBleProvider;
}

export function listSenseProviders() {
  return [...providers.values()].map(({ id, label }) => ({ id, label }));
}
