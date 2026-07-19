export const AI_STATES = Object.freeze({
  IDLE: 'idle',
  LISTENING: 'listening',
  SEARCHING: 'searching',
  REASONING: 'reasoning',
  RESPONDING: 'responding',
  ERROR: 'error',
});

export function createMessage({ role, content, confidence = null, confidenceBand = null, sources = [], actions = [], warnings = [], modulesUsed = [], auditId = null, error = false, intent = null, clarification = null, request = null }) {
  return {
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content,
    confidence,
    confidenceBand,
    sources,
    actions,
    warnings,
    modulesUsed,
    auditId,
    error,
    intent,
    clarification,
    request,
    createdAt: new Date().toISOString(),
  };
}

export function assertProviderResponse(response) {
  if (!response || typeof response.answer !== 'string') {
    throw new Error('Primovex AI provider returned an invalid response.');
  }

  return {
    answer: response.answer,
    confidence: Number.isFinite(response.confidence) ? response.confidence : null,
    sources: Array.isArray(response.sources) ? response.sources : [],
    actions: Array.isArray(response.actions) ? response.actions : [],
    intent: response.intent || 'general',
    warnings: Array.isArray(response.warnings) ? response.warnings : [],
    modulesUsed: Array.isArray(response.modulesUsed) ? response.modulesUsed : [],
    auditId: response.auditId || null,
    confidenceBand: response.confidenceBand || null,
    clarification: response.clarification || null,
  };
}
