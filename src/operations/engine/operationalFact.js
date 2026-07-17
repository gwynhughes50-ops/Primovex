export const FACT_STATUS = Object.freeze({
  KNOWN: 'known',
  ESTIMATED: 'estimated',
  UNKNOWN: 'unknown',
  CONFLICTED: 'conflicted',
});

export const EVIDENCE_KIND = Object.freeze({
  SENSOR: 'sensor',
  SYSTEM_EVENT: 'system_event',
  USER_CONFIRMATION: 'user_confirmation',
  PHYSICAL_CHECK: 'physical_check',
  INFERENCE: 'inference',
  HISTORICAL_PATTERN: 'historical_pattern',
});

const DEFAULT_RELIABILITY = Object.freeze({
  physical_check: 1,
  sensor: 0.92,
  system_event: 0.88,
  user_confirmation: 0.78,
  inference: 0.58,
  historical_pattern: 0.42,
});

function normaliseDate(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

export function createEvidence(input = {}) {
  const kind = input.kind || EVIDENCE_KIND.SYSTEM_EVENT;
  return {
    id: input.id || crypto.randomUUID(),
    kind,
    source: input.source || 'primovex',
    observedAt: normaliseDate(input.observedAt, new Date().toISOString()),
    receivedAt: normaliseDate(input.receivedAt, new Date().toISOString()),
    reliability: clamp(input.reliability ?? DEFAULT_RELIABILITY[kind] ?? 0.5),
    supports: input.supports !== false,
    value: input.value ?? null,
    actorId: input.actorId || null,
    actorLabel: input.actorLabel || null,
    deviceId: input.deviceId || null,
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
  };
}

export function createOperationalFact(input = {}) {
  if (!input.domain) throw new Error('Operational facts require a domain.');
  if (!input.subjectId) throw new Error('Operational facts require a subjectId.');
  if (!input.key) throw new Error('Operational facts require a key.');

  const now = new Date().toISOString();
  return {
    id: input.id || `${input.domain}:${input.subjectId}:${input.key}`,
    schemaVersion: 1,
    domain: input.domain,
    subjectType: input.subjectType || input.domain,
    subjectId: input.subjectId,
    subjectLabel: input.subjectLabel || input.subjectId,
    spaceId: input.spaceId || null,
    key: input.key,
    value: input.value ?? null,
    status: input.status || FACT_STATUS.UNKNOWN,
    confidence: clamp(input.confidence ?? 0),
    evidence: (input.evidence || []).map(createEvidence),
    firstObservedAt: normaliseDate(input.firstObservedAt, now),
    lastObservedAt: normaliseDate(input.lastObservedAt, now),
    lastVerifiedAt: normaliseDate(input.lastVerifiedAt),
    validUntil: normaliseDate(input.validUntil),
    ownerRole: input.ownerRole || null,
    sourceModule: input.sourceModule || input.domain,
    safetyCritical: Boolean(input.safetyCritical),
    explanation: input.explanation || '',
    tags: Array.isArray(input.tags) ? [...new Set(input.tags)] : [],
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
    createdAt: normaliseDate(input.createdAt, now),
    updatedAt: now,
  };
}

export function mergeOperationalFact(existing, update = {}) {
  const combinedEvidence = [...(existing?.evidence || []), ...(update.evidence || [])];
  const deduplicated = [...new Map(combinedEvidence.map((item) => [item.id, createEvidence(item)])).values()];
  return createOperationalFact({
    ...existing,
    ...update,
    id: existing?.id || update.id,
    evidence: deduplicated,
    firstObservedAt: existing?.firstObservedAt || update.firstObservedAt,
    createdAt: existing?.createdAt || update.createdAt,
  });
}
