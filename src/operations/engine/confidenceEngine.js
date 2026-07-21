import { FACT_STATUS } from './operationalFact';

const HOUR = 60 * 60 * 1000;

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function ageHours(value, now) {
  if (!value) return Number.POSITIVE_INFINITY;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? Math.max(0, (now.getTime() - timestamp) / HOUR) : Number.POSITIVE_INFINITY;
}

export function freshnessMultiplier(observedAt, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const halfLifeHours = Math.max(0.25, Number(options.halfLifeHours || 24));
  const hours = ageHours(observedAt, now);
  if (!Number.isFinite(hours)) return 0;
  return Math.pow(0.5, hours / halfLifeHours);
}

export function calculateFactConfidence(fact, options = {}) {
  const evidence = Array.isArray(fact?.evidence) ? fact.evidence : [];
  if (!evidence.length) {
    return { score: 0, status: FACT_STATUS.UNKNOWN, supportingWeight: 0, contradictingWeight: 0, explanation: 'No evidence is available.' };
  }

  const halfLifeHours = options.halfLifeHours || fact?.metadata?.confidenceHalfLifeHours || (fact?.safetyCritical ? 8 : 72);
  let supportingWeight = 0;
  let contradictingWeight = 0;

  evidence.forEach((item) => {
    const weight = clamp(item.reliability ?? 0.5) * freshnessMultiplier(item.observedAt, { ...options, halfLifeHours });
    if (item.supports === false) contradictingWeight += weight;
    else supportingWeight += weight;
  });

  const total = supportingWeight + contradictingWeight;
  const agreement = total ? Math.abs(supportingWeight - contradictingWeight) / total : 0;
  const coverage = 1 - Math.exp(-total);
  const score = clamp(agreement * coverage);
  const conflictRatio = total ? Math.min(supportingWeight, contradictingWeight) / total : 0;

  let status = FACT_STATUS.ESTIMATED;
  if (conflictRatio >= (options.conflictThreshold ?? 0.28)) status = FACT_STATUS.CONFLICTED;
  else if (score >= (options.knownThreshold ?? 0.72)) status = FACT_STATUS.KNOWN;
  else if (score < (options.unknownThreshold ?? 0.18)) status = FACT_STATUS.UNKNOWN;

  return {
    score: Math.round(score * 100) / 100,
    status,
    supportingWeight: Math.round(supportingWeight * 1000) / 1000,
    contradictingWeight: Math.round(contradictingWeight * 1000) / 1000,
    explanation: status === FACT_STATUS.CONFLICTED
      ? 'Recent evidence conflicts and requires verification.'
      : status === FACT_STATUS.KNOWN
        ? 'Recent evidence is sufficiently reliable and consistent.'
        : status === FACT_STATUS.ESTIMATED
          ? 'The available evidence supports an estimate, but further confirmation would improve confidence.'
          : 'The evidence is missing or too stale to support a reliable conclusion.',
  };
}

export function enrichFactConfidence(fact, options = {}) {
  const result = calculateFactConfidence(fact, options);
  return { ...fact, confidence: result.score, status: result.status, explanation: fact.explanation || result.explanation, confidenceDetail: result };
}
