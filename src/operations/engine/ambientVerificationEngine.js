import { FACT_STATUS } from './operationalFact';

const severityRank = { critical: 4, high: 3, medium: 2, low: 1 };

function questionFor(fact) {
  if (fact.metadata?.verificationQuestion) return fact.metadata.verificationQuestion;
  if (fact.key === 'door_closed') return `Is ${fact.subjectLabel} now fully closed?`;
  if (fact.key === 'stock_level') return `Does the recorded stock level for ${fact.subjectLabel} look about right?`;
  if (fact.key === 'temperature_ok') return `Can you confirm ${fact.subjectLabel} is operating normally?`;
  if (fact.key === 'cleaning_complete') return `Has ${fact.subjectLabel} been cleaned?`;
  return `Can you quickly confirm the current status of ${fact.subjectLabel}?`;
}

export function buildAmbientVerificationCandidates(facts = [], anomalies = [], context = {}) {
  const anomalyByFact = new Map(anomalies.map((item) => [item.factId, item]));
  return facts
    .filter((fact) => fact.status !== FACT_STATUS.KNOWN || anomalyByFact.has(fact.id))
    .map((fact) => {
      const anomaly = anomalyByFact.get(fact.id);
      const roleMatch = !fact.ownerRole || !context.role || String(fact.ownerRole).toLowerCase() === String(context.role).toLowerCase();
      const spaceMatch = !fact.spaceId || !context.spaceId || fact.spaceId === context.spaceId;
      const opportunityScore = (roleMatch ? 35 : 0) + (spaceMatch ? 35 : 0) + Math.round((1 - (fact.confidence || 0)) * 20) + (fact.safetyCritical ? 10 : 0);
      return {
        id: `verify:${fact.id}`,
        factId: fact.id,
        question: questionFor(fact),
        responseType: fact.metadata?.verificationResponseType || 'yes_no_unsure',
        ownerRole: fact.ownerRole,
        spaceId: fact.spaceId,
        severity: anomaly?.severity || (fact.safetyCritical ? 'high' : 'low'),
        opportunityScore,
        subtle: !fact.safetyCritical && anomaly?.severity !== 'high',
        reason: anomaly?.detail || 'A small confirmation would improve confidence.',
      };
    })
    .filter((item) => item.opportunityScore >= (context.minimumOpportunityScore ?? 35))
    .sort((a, b) => (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0) || b.opportunityScore - a.opportunityScore);
}
