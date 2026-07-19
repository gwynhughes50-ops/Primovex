const LEARNING_KEY = 'primovex.orb.intent-learning.v1';
const MAX_SUGGESTIONS = 500;

function read() { try { const value = JSON.parse(globalThis.localStorage?.getItem(LEARNING_KEY) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } }
function write(records) { try { globalThis.localStorage?.setItem(LEARNING_KEY, JSON.stringify(records.slice(0, MAX_SUGGESTIONS))); globalThis.dispatchEvent?.(new CustomEvent('primovex:orb-learning-changed')); } catch { /* non-blocking */ } }

export class IntentLearningStore {
  create({ phrase, selectedIntent, userId, role, siteId, originalConfidence = null, candidates = [] }) {
    const record = { id: globalThis.crypto?.randomUUID?.() || `orb-learning-${Date.now()}`, phrase: String(phrase || '').trim(), selectedIntent, originalConfidence, candidates, status: 'pending', governance: 'manager-approval-required', suggestedBy: { userId: userId || null, role: role || 'unknown' }, siteId: siteId || 'primary', createdAt: new Date().toISOString(), reviewedAt: null, reviewedBy: null, reviewNote: null };
    write([record, ...read()]); return record;
  }
  list() { return read(); }
  review(id, { status, reviewerId, note = null }) {
    if (!['approved', 'rejected'].includes(status)) throw new Error('Invalid Orb learning review status.');
    const next = read().map((record) => record.id === id ? { ...record, status, reviewedAt: new Date().toISOString(), reviewedBy: reviewerId || null, reviewNote: note } : record);
    write(next); return next.find((record) => record.id === id) || null;
  }
}

export const orbIntentLearningStore = new IntentLearningStore();
