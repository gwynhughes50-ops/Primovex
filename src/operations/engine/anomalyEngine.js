import { FACT_STATUS } from './operationalFact';

export function detectFactAnomalies(facts = [], options = {}) {
  const now = new Date(options.now || Date.now());
  const anomalies = [];

  facts.forEach((fact) => {
    if (fact.status === FACT_STATUS.CONFLICTED) anomalies.push({
      id: `conflict:${fact.id}`,
      factId: fact.id,
      type: 'conflicting_evidence',
      severity: fact.safetyCritical ? 'high' : 'medium',
      title: `${fact.subjectLabel} has conflicting evidence`,
      detail: fact.explanation || 'Two or more evidence sources disagree.',
      spaceId: fact.spaceId,
    });

    if (fact.validUntil && new Date(fact.validUntil).getTime() < now.getTime()) anomalies.push({
      id: `expired:${fact.id}`,
      factId: fact.id,
      type: 'stale_fact',
      severity: fact.safetyCritical ? 'high' : 'low',
      title: `${fact.subjectLabel} needs re-verification`,
      detail: 'The fact is outside its verification window.',
      spaceId: fact.spaceId,
    });

    if (fact.status === FACT_STATUS.UNKNOWN && fact.safetyCritical) anomalies.push({
      id: `unknown:${fact.id}`,
      factId: fact.id,
      type: 'safety_unknown',
      severity: 'high',
      title: `${fact.subjectLabel} cannot currently be confirmed`,
      detail: 'Safety-critical evidence is missing or insufficient.',
      spaceId: fact.spaceId,
    });
  });

  return anomalies;
}
