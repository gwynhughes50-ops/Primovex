import { getPrimovexAIProvider } from '@/ai/providers/providerFactory';
import { assertProviderResponse } from '@/ai/types/responseContract';
import { AuditEngine } from './AuditEngine';
import { ConfidenceEngine } from './ConfidenceEngine';
import { ContextEngine } from './ContextEngine';
import { FeedbackEngine } from './FeedbackEngine';
import { IntentEngine } from './IntentEngine';
import { createDefaultKnowledgeRegistry } from './KnowledgeRegistry';
import { MemoryEngine } from './MemoryEngine';
import { PermissionGateway } from './PermissionGateway';
import { createOrbRequest, createOrbResponse, ORB_CORE_VERSION } from './types';
import { approvedIntentChoices } from './clinicalIntentCatalog';

export class OrbEngine {
  constructor({ provider = getPrimovexAIProvider('mock') } = {}) {
    this.version = ORB_CORE_VERSION;
    this.provider = provider;
    this.intent = new IntentEngine();
    this.context = new ContextEngine();
    this.permissions = new PermissionGateway();
    this.confidence = new ConfidenceEngine();
    this.knowledge = createDefaultKnowledgeRegistry();
    this.memory = new MemoryEngine();
    this.feedback = new FeedbackEngine();
    this.audit = new AuditEngine();
  }

  async ask({ input, inputType, context: rawContext = {}, conversation = [] }) {
    const startedAt = Date.now();
    const context = this.context.build({ ...rawContext, conversation });
    const request = createOrbRequest({ input, inputType, context, conversation });
    if (!request.input) throw new Error('Orb requires a request.');

    const classified = this.intent.classify(request.input, context);
    if (!classified.toolId) {
      const clarification = {
        question: 'I did not understand that safely. What were you trying to do?',
        originalRequest: request.input,
        originalConfidence: classified.confidence,
        candidates: classified.candidates || [],
        choices: approvedIntentChoices(context.capabilities, (classified.candidates || []).map((item) => item.id)),
      };
      let response = createOrbResponse({
        answer: clarification.question,
        intent: 'general.clarification-required',
        confidence: classified.confidence,
        confidenceBand: this.confidence.band(classified.confidence),
        sources: [{ title: 'Orb Clinical Intent Engine', detail: 'No approved intent met the safe execution threshold', type: 'system' }],
        warnings: ['No tool was executed'],
        clarification,
      });
      response = this.permissions.filterResponse(response, context);
      const auditId = this.audit.write({ request, response, context, durationMs: Date.now() - startedAt });
      return { ...response, auditId };
    }
    const raw = await this.provider.ask({ prompt: request.input, toolContext: context, orbIntent: classified });
    const providerResponse = assertProviderResponse(raw);
    const confidence = this.confidence.normalise(providerResponse.confidence);

    let response = createOrbResponse({
      ...providerResponse,
      intent: providerResponse.intent || classified.id,
      confidence,
      confidenceBand: this.confidence.band(confidence),
      warnings: raw.warnings || [],
      evidence: raw.evidence || providerResponse.sources,
      modulesUsed: this.knowledge.modulesForIntent(providerResponse.intent || classified.id),
      explanation: raw.explanation || null,
    });

    response = this.permissions.filterResponse(response, context);
    const auditId = this.audit.write({ request, response, context, durationMs: Date.now() - startedAt });
    response = { ...response, auditId };

    this.memory.record({
      interactionId: auditId,
      userId: context.userId,
      role: context.role,
      intent: response.intent,
      modulesUsed: response.modulesUsed,
      confidence: response.confidence,
      outcome: response.warnings.length ? 'completed-with-warning' : 'completed',
    });

    return response;
  }
}

let singleton;
export function getOrbEngine() {
  if (!singleton) singleton = new OrbEngine();
  return singleton;
}
