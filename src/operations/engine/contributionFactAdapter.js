import { createEvidence, createOperationalFact } from './operationalFact';

export function contributionsToOperationalFacts(contributions = [], generatedAt = new Date().toISOString()) {
  return contributions
    .filter((entry) => entry.connected && Number.isFinite(entry.readiness))
    .map((entry) => createOperationalFact({
      domain: entry.id,
      subjectType: 'operational_module',
      subjectId: entry.id,
      subjectLabel: entry.label,
      key: 'readiness',
      value: entry.readiness,
      sourceModule: entry.id,
      safetyCritical: entry.id === 'temperature',
      lastObservedAt: generatedAt,
      validUntil: new Date(new Date(generatedAt).getTime() + (entry.id === 'temperature' ? 2 : 24) * 60 * 60 * 1000).toISOString(),
      evidence: [createEvidence({
        kind: 'system_event',
        source: `operations:${entry.id}`,
        observedAt: generatedAt,
        reliability: entry.id === 'temperature' ? 0.95 : 0.86,
        value: entry.readiness,
      })],
      metadata: { contributorStatus: entry.status, confidenceHalfLifeHours: entry.id === 'temperature' ? 2 : 24 },
    }));
}
