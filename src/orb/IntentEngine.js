import { routeApprovedTool } from '@/ai/tools/intentRouter';
import { getClinicalIntent } from './clinicalIntentCatalog';
import { orbIntentLearningStore } from './IntentLearningStore';
import { phraseSimilarity } from '@/ai/tools/languageEngine';

export class IntentEngine {
  classify(input, context = {}) {
    if (context.forcedIntent) {
      const forced = getClinicalIntent(context.forcedIntent);
      if (!forced) return { id: 'general.unmatched', toolId: null, input: {}, confidence: 0 };
      return { id: forced.id, toolId: forced.id, input: { mode: 'clarified' }, language: { forced: true }, confidence: 1 };
    }
    const learned = orbIntentLearningStore.list()
      .filter((record) => record.status === 'approved' && record.siteId === context.siteId && getClinicalIntent(record.selectedIntent))
      .map((record) => ({ record, score: phraseSimilarity(input, record.phrase) }))
      .sort((a, b) => b.score - a.score)[0];
    if (learned?.score >= 0.9) return { id: learned.record.selectedIntent, toolId: learned.record.selectedIntent, input: { mode: 'learned' }, language: { learnedSuggestionId: learned.record.id }, confidence: learned.score };
    const route = routeApprovedTool(input, { conversation: context.conversation });
    if (!route?.toolId) return { id: 'general.unmatched', toolId: null, input: {}, confidence: route?.language?.confidence ?? 0.45, candidates: route?.language?.candidates || [] };
    return {
      id: route.toolId,
      toolId: route.toolId,
      input: route.input || {},
      language: route.language || {},
      confidence: route.language?.confidence ?? (route.language?.followUp ? 0.9 : 0.96),
    };
  }
}
