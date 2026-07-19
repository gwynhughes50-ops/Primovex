const AUDIT_KEY = 'primovex.orb.audit.v1';
function persist(entry) { try { const current = JSON.parse(globalThis.localStorage?.getItem(AUDIT_KEY) || '[]'); globalThis.localStorage?.setItem(AUDIT_KEY, JSON.stringify([entry, ...current].slice(0, 500))); } catch { /* audit persistence must not break Orb */ } }

export class AuditEngine {
  write({ request, response, context, durationMs }) {
    const id = globalThis.crypto?.randomUUID?.() || `audit-${Date.now()}`;
    const entry = {
      id,
      userId: context.userId,
      role: context.role,
      intent: response.intent,
      inputType: request.inputType,
      modulesUsed: response.modulesUsed,
      withheld: response.withheld,
      confidence: response.confidence,
      durationMs,
      createdAt: new Date().toISOString(),
    };
    persist(entry); console.info('[OrbAudit]', entry);
    return id;
  }

  writeLearning({ suggestion, context }) {
    const entry = { id: `learning-${suggestion.id}`, type: 'intent-learning-suggestion', suggestionId: suggestion.id, phrase: suggestion.phrase, selectedIntent: suggestion.selectedIntent, status: suggestion.status, userId: context.userId, role: context.role, siteId: context.siteId, createdAt: suggestion.createdAt };
    persist(entry); console.info('[OrbLearningAudit]', entry);
    return suggestion.id;
  }
}
