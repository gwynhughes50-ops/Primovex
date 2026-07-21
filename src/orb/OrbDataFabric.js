const PERSONAL_FIELDS = new Set([
  'userId', 'uid', 'email', 'displayName', 'createdBy', 'updatedBy', 'resolvedBy',
  'lastSeenBy', 'lastCleanedBy', 'assignedTo', 'ownerName', 'history',
]);

function serialise(value) {
  if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serialise);
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialise(item)]));
  return String(value);
}

export function redactOperationalData(value, canSeeNamedAudit = false, withheld = []) {
  if (Array.isArray(value)) return value.map((item) => redactOperationalData(item, canSeeNamedAudit, withheld));
  if (!value || typeof value !== 'object') return serialise(value);
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
    if (!canSeeNamedAudit && PERSONAL_FIELDS.has(key)) {
      withheld.push(key);
      return [];
    }
    return [[key, redactOperationalData(item, canSeeNamedAudit, withheld)]];
  }));
}

export function createDataFabricResult(tool, result = {}) {
  const observedAt = result.observedAt || new Date().toISOString();
  const knownState = result.knownState || (result.data == null ? 'unknown' : 'known');
  return {
    toolId: tool.id,
    domain: result.domain || tool.id.split('.')[0],
    data: serialise(result.data ?? null),
    summary: String(result.summary || ''),
    confidence: Number.isFinite(result.confidence) ? Math.max(0, Math.min(1, result.confidence)) : (knownState === 'known' ? 0.8 : 0.4),
    sources: Array.isArray(result.sources) ? serialise(result.sources) : [],
    evidence: Array.isArray(result.evidence) ? serialise(result.evidence) : [],
    actions: Array.isArray(result.actions) ? result.actions : [],
    warnings: Array.isArray(result.warnings) ? result.warnings : [],
    freshness: result.freshness || { state: 'live', observedAt },
    observedAt,
    knownState,
    disclosureLevel: result.disclosureLevel || 'operational',
    withheld: Array.isArray(result.withheld) ? result.withheld : [],
  };
}
