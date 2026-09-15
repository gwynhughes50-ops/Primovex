import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const COLLECTION = 'orb_audit_log';

// Real, cross-device Orb audit trail. Previously localStorage (500-entry cap,
// per-browser), so there was no way to see Orb usage across the practice
// from one place. write()/writeLearning() must stay synchronous (they
// return an id that's embedded straight into the response object OrbEngine
// hands back to the UI), so the id is generated client-side up front and the
// Firestore write happens fire-and-forget — audit persistence must never
// block or break an Orb answer.
function persist(id, entry) {
  setDoc(doc(db, COLLECTION, id), entry).catch(() => { /* audit persistence must not break Orb */ });
}

function forward(entry, detail = {}) {
  try {
    globalThis.dispatchEvent?.(new CustomEvent('primovex:governed-audit', { detail: {
      action: detail.action || 'orb.interaction.completed',
      module: 'orb',
      targetType: detail.targetType || 'orb_interaction',
      targetId: entry.id,
      summary: detail.summary || `Orb handled ${entry.intent || 'an operational request'}`,
      classification: 'operational',
      disclosureLevel: entry.disclosureLevel || 'operational',
      permissionDecision: entry.withheld?.length ? 'partially_withheld' : 'allowed',
      metadata: {
        intent: entry.intent,
        inputType: entry.inputType,
        modulesUsed: entry.modulesUsed || [],
        confidence: entry.confidence,
        sourceCount: entry.sourceCount,
        warningCount: entry.warningCount,
        withheldCount: entry.withheld?.length || 0,
        durationMs: entry.durationMs,
      },
    } }));
  } catch { /* cloud forwarding must not interrupt Orb */ }
}

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
      domain: response.domain || null,
      knownState: response.knownState || null,
      freshness: response.freshness || null,
      sourceCount: response.sources?.length || 0,
      warningCount: response.warnings?.length || 0,
      disclosureLevel: response.disclosureLevel || 'operational',
      durationMs,
      createdAt: new Date().toISOString(),
    };
    persist(id, entry); forward(entry); console.info('[OrbAudit]', entry);
    return id;
  }

  writeLearning({ suggestion, context }) {
    const id = `learning-${suggestion.id}`;
    const entry = { id, type: 'intent-learning-suggestion', suggestionId: suggestion.id, phrase: suggestion.phrase, selectedIntent: suggestion.selectedIntent, status: suggestion.status, userId: context.userId, role: context.role, siteId: context.siteId, createdAt: suggestion.createdAt };
    persist(id, entry); forward(entry, { action: 'orb.learning.suggestion', targetType: 'orb_learning_suggestion', summary: 'Orb language-learning suggestion recorded' }); console.info('[OrbLearningAudit]', entry);
    return suggestion.id;
  }
}
