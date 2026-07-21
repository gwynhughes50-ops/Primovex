import { enrichFactConfidence } from './confidenceEngine';
import { detectFactAnomalies } from './anomalyEngine';
import { buildAmbientVerificationCandidates } from './ambientVerificationEngine';

export function runOperationalIntelligence(facts = [], context = {}, options = {}) {
  const enrichedFacts = facts.map((fact) => enrichFactConfidence(fact, options));
  const anomalies = detectFactAnomalies(enrichedFacts, options);
  const verificationCandidates = buildAmbientVerificationCandidates(enrichedFacts, anomalies, context);
  const known = enrichedFacts.filter((fact) => fact.status === 'known').length;
  const conflicted = enrichedFacts.filter((fact) => fact.status === 'conflicted').length;
  const averageConfidence = enrichedFacts.length
    ? Math.round((enrichedFacts.reduce((sum, fact) => sum + fact.confidence, 0) / enrichedFacts.length) * 100)
    : null;

  return {
    generatedAt: new Date(options.now || Date.now()).toISOString(),
    facts: enrichedFacts,
    anomalies,
    verificationCandidates,
    informationHealth: {
      score: averageConfidence,
      totalFacts: enrichedFacts.length,
      knownFacts: known,
      conflictedFacts: conflicted,
      unknownFacts: enrichedFacts.filter((fact) => fact.status === 'unknown').length,
      estimatedFacts: enrichedFacts.filter((fact) => fact.status === 'estimated').length,
    },
  };
}
