import { mockPrimovexProvider } from './mockProvider';

export function getPrimovexAIProvider(providerId = 'mock') {
  if (providerId === 'mock') return mockPrimovexProvider;
  throw new Error(`Unsupported Primovex AI provider: ${providerId}`);
}
