const MEMORY_KEY = 'primovex.orb.operational-memory.v1';
const MAX_RECORDS = 250;

function safeRead() {
  try { return JSON.parse(globalThis.localStorage?.getItem(MEMORY_KEY) || '[]'); } catch { return []; }
}

export class MemoryEngine {
  record(entry) {
    if (!globalThis.localStorage) return null;
    const record = {
      id: globalThis.crypto?.randomUUID?.() || `memory-${Date.now()}`,
      type: 'orb-interaction',
      createdAt: new Date().toISOString(),
      ...entry,
    };
    try {
      const next = [record, ...safeRead()].slice(0, MAX_RECORDS);
      globalThis.localStorage.setItem(MEMORY_KEY, JSON.stringify(next));
    } catch { /* operational memory must never break Orb */ }
    return record;
  }

  recent(limit = 20) { return safeRead().slice(0, limit); }
  clear() { try { globalThis.localStorage?.removeItem(MEMORY_KEY); } catch { /* no-op */ } }
}
