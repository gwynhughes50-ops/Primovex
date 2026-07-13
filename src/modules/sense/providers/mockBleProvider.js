import { SenseProvider } from './senseProvider';

export class MockBleProvider extends SenseProvider {
  constructor() {
    super('mock-ble', 'Mock BLE provider');
  }

  async scan(spaces = []) {
    const candidates = spaces.filter((space) => space.senseNode?.enabled);
    if (!candidates.length) return { detected: false, provider: this.id, candidates: [] };
    const selected = candidates[Math.floor(Math.random() * candidates.length)];
    return {
      detected: true,
      provider: this.id,
      spaceId: selected.id,
      confidence: 0.92,
      rssi: -54,
      candidates: candidates.map((space, index) => ({ spaceId: space.id, confidence: Math.max(0.55, 0.92 - index * 0.12) })),
    };
  }
}

export const mockBleProvider = new MockBleProvider();
