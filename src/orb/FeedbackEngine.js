const FEEDBACK_KEY = 'primovex.orb.feedback.v1';

export const ORB_FEEDBACK_OUTCOMES = Object.freeze({
  EXACT: 'exact',
  NEARLY: 'nearly',
  CORRECTED: 'corrected',
  WRONG: 'wrong',
});

export class FeedbackEngine {
  record({ interactionId, outcome, reason = null, note = null, userId = null }) {
    const record = { id: globalThis.crypto?.randomUUID?.() || `feedback-${Date.now()}`, interactionId, outcome, reason, note, userId, createdAt: new Date().toISOString() };
    try {
      const current = JSON.parse(globalThis.localStorage?.getItem(FEEDBACK_KEY) || '[]');
      globalThis.localStorage?.setItem(FEEDBACK_KEY, JSON.stringify([record, ...current].slice(0, 500)));
    } catch { /* feedback must be non-blocking */ }
    return record;
  }
  list() { try { const value = JSON.parse(globalThis.localStorage?.getItem(FEEDBACK_KEY) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } }
}
